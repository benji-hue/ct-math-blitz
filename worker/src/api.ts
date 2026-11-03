import { describeProviders, streamWithFailover, complete, ProviderError, type ChatMessage, type ForcedModel } from './ai/providers'
import { buildAnalyzePrompt, buildGeneratePrompt, buildSystemPrompt, MODES, type Mode, type Reference, type TaskContext } from './ai/prompts'
import { parseJsonLoose } from './ai/sse'
import { pickFacts } from './ai/facts'
import { assemble, buildGradePrompt, buildSelfTestPrompt, parseSelfTest, POINTS, sanitizeGrade, toDraft, type GradeTask, type SelfTestSize, type SelfTestTask } from './ai/selftest'
import { screenTask, verifyTasks } from './ai/verify'
import { minskDay, num, VERSION, type Env } from './env'
import { consume, limitFor, track, usage, type Kind } from './limits'
import { deriveSecret, safeEqual, validateInitData, type TgUser } from './telegram'

/**
 * HTTP API мини-аппа. Каждый запрос к ИИ:
 *  1) проверяет подпись Telegram (или пускает анонимно, если так настроено);
 *  2) списывает дневной лимит;
 *  3) собирает системный промпт на сервере из проверенных полей;
 *  4) стримит ответ провайдера в едином формате SSE.
 */

const MAX_BODY = 2_500_000

interface Caller {
  key: string
  anonymous: boolean
  user?: TgUser
  /**
   * Служебная проверка ИИ (scripts/ai-eval.mjs): без дневных лимитов, с выбором
   * модели и причинами переключения на запасную. Нужен заголовок X-Krok-Eval —
   * секрет, выведенный из токена бота, поэтому обычный клиент так не умеет.
   */
  eval?: boolean
}

export function json(data: unknown, status = 200, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers } })
}

function fail(status: number, error: string): Response {
  return json({ error }, status)
}

async function identify(req: Request, env: Env): Promise<Caller | Response> {
  const auth = req.headers.get('Authorization') ?? ''
  if (auth.startsWith('tma ')) {
    if (!env.BOT_TOKEN) return fail(500, 'На сервере не задан BOT_TOKEN')
    const result = await validateInitData(auth.slice(4), env.BOT_TOKEN, num(env.INIT_DATA_TTL, 86400))
    if (!result.ok) return fail(401, 'Подпись Telegram недействительна или устарела')
    const evalKey = req.headers.get('X-Krok-Eval')
    const isEval = Boolean(evalKey) && safeEqual(evalKey ?? '', await deriveSecret(env.BOT_TOKEN, 'krok-eval'))
    return { key: `tg:${result.user.id}`, anonymous: false, user: result.user, eval: isEval }
  }
  if (env.ALLOW_ANONYMOUS === 'true') {
    return { key: `ip:${req.headers.get('CF-Connecting-IP') ?? 'local'}`, anonymous: true }
  }
  return fail(403, 'ИИ доступен только из мини-приложения в Telegram')
}

async function readBody(req: Request): Promise<Record<string, unknown> | Response> {
  const length = Number(req.headers.get('Content-Length') ?? 0)
  if (length > MAX_BODY) return fail(413, 'Слишком большой запрос')
  const text = await req.text()
  if (text.length > MAX_BODY) return fail(413, 'Слишком большой запрос')
  try {
    const body = JSON.parse(text)
    return body && typeof body === 'object' ? (body as Record<string, unknown>) : fail(400, 'Ожидался JSON-объект')
  } catch {
    return fail(400, 'Некорректный JSON')
  }
}

async function spend(env: Env, caller: Caller, kind: Kind): Promise<Response | null> {
  if (caller.eval) return null
  const used = await consume(env, caller.key, kind)
  const limit = limitFor(env, kind, caller.anonymous)
  if (used > limit) {
    return fail(429, `Дневной лимит (${limit}) исчерпан. Он обновится в полночь по Минску — а пока можно тренироваться в банке заданий.`)
  }
  return null
}

const str = (v: unknown, max: number): string | undefined => (typeof v === 'string' && v.trim() ? v.slice(0, max) : undefined)

function sanitizeMessages(raw: unknown): ChatMessage[] {
  if (!Array.isArray(raw)) return []
  const out: ChatMessage[] = []
  let budget = 24_000
  for (const m of raw.slice(-12).reverse()) {
    const role = (m as ChatMessage)?.role
    const content = str((m as ChatMessage)?.content, 4000)
    if ((role !== 'user' && role !== 'assistant') || !content) continue
    if (content.length > budget) break
    budget -= content.length
    out.unshift({ role, content })
  }
  // Диалог должен начинаться и заканчиваться репликой ученика.
  while (out.length && out[0].role !== 'user') out.shift()
  return out
}

function sanitizeRefs(raw: unknown): Reference[] {
  if (!Array.isArray(raw)) return []
  return raw
    .slice(0, 4)
    .map((r) => ({ title: str((r as Reference)?.title, 160) ?? '', text: str((r as Reference)?.text, 1600) ?? '' }))
    .filter((r) => r.title && r.text)
}

function sanitizeTask(raw: unknown): TaskContext | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const t = raw as TaskContext
  const q = str(t.q, 2000)
  const correct = str(t.correct, 400)
  if (!q || !correct) return undefined
  return {
    q,
    correct,
    options: Array.isArray(t.options) ? t.options.slice(0, 6).map((o) => String(o).slice(0, 300)) : undefined,
    given: str(t.given, 400),
    explain: str(t.explain, 2000),
    trap: str(t.trap, 500),
  }
}

function sanitizeImage(raw: unknown): { mime: string; data: string } | undefined {
  const img = raw as { mime?: unknown; data?: unknown } | undefined
  if (!img || typeof img.data !== 'string' || typeof img.mime !== 'string') return undefined
  if (!/^image\/(jpeg|png|webp)$/.test(img.mime)) return undefined
  if (img.data.length > 2_000_000 || !/^[A-Za-z0-9+/=]+$/.test(img.data.slice(0, 200))) return undefined
  return { mime: img.mime, data: img.data }
}

/**
 * Обезличенные счётчики маршрута ИИ: какая модель ответила, из какой страны пришёл
 * запрос и через какой дата-центр Cloudflare. Нужны, чтобы видеть, доходят ли запросы
 * учеников до Gemini (Google не обслуживает часть стран) и не кончаются ли квоты.
 * Никаких идентификаторов — только код страны и код дата-центра.
 */
export function routeEvents(r: { image: boolean; provider: string; skipped: string[]; country?: string; colo?: string }): string[] {
  const where = `${(r.country || '??').slice(0, 2)}/${(r.colo || '???').slice(0, 4)}`
  const events = [`route:${r.image ? 'photo' : 'text'}:${r.provider}:${where}`]
  if (r.skipped.some((s) => /location is not supported/i.test(s))) events.push(`gemini:region-refused:${where}`)
  if (r.skipped.some((s) => s.startsWith('gemini') && /\b429\b/.test(s))) events.push(`gemini:quota:${where}`)
  return events
}

/** Выбор конкретной модели — только в служебной проверке: «@cf/…», «gemini:…» или «openai:…». */
function forcedModel(caller: Caller, raw: unknown): ForcedModel | undefined | Response {
  if (!caller.eval || typeof raw !== 'string' || !raw.trim()) return undefined
  const value = raw.trim().slice(0, 200)
  if (value.startsWith('@cf/')) return { provider: 'workers-ai', model: value }
  const match = /^(gemini|openai):(.+)$/.exec(value)
  if (match) return { provider: match[1], model: match[2] }
  return fail(400, 'Неизвестная модель: ожидается «@cf/…», «gemini:…» или «openai:…»')
}

// ---------- /api/ai/chat — потоковый ответ ----------

const SSE_HEADERS = { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no' }

async function chat(req: Request, env: Env, ctx: ExecutionContext, caller: Caller): Promise<Response> {
  const body = await readBody(req)
  if (body instanceof Response) return body
  const mode = (MODES.includes(body.mode as Mode) ? body.mode : 'tutor') as Mode
  const messages = sanitizeMessages(body.messages)
  if (!messages.length) return fail(400, 'Пустой вопрос')
  const image = sanitizeImage(body.image)
  const force = forcedModel(caller, body.model)
  if (force instanceof Response) return force
  const limited = await spend(env, caller, image ? 'vision' : 'chat')
  if (limited) return limited

  const profile = body.profile as { grade?: unknown; exam?: unknown; target?: unknown } | undefined
  const topic = str(body.topic, 160)
  // Урок: проверенные истории по теме (бета). Выбор зависит от первой реплики урока —
  // на всех шагах одного урока модель видит одни и те же факты.
  const facts =
    mode === 'lesson' && body.history !== false
      ? pickFacts(str(body.subject, 10), `${topic ?? ''} ${messages[0].content} ${messages[messages.length - 1].content}`, 2, seeded(messages[0].content))
      : []
  const system = buildSystemPrompt({
    mode,
    subjectTitle: str(body.subjectTitle, 100),
    topic,
    profile: profile ? { grade: str(profile.grade, 10), exam: str(profile.exam, 10), target: Number(profile.target) || undefined } : undefined,
    refs: sanitizeRefs(body.refs),
    task: sanitizeTask(body.task),
    hasImage: Boolean(image),
    facts,
  })

  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>()
  const writer = writable.getWriter()
  const encoder = new TextEncoder()
  const send = (event: Record<string, unknown>) => writer.write(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))

  const cf = (req as unknown as { cf?: { country?: string; colo?: string } }).cf
  const trackRoute = (provider: string, skipped: string[]) => {
    if (caller.eval) return
    const names = routeEvents({ image: Boolean(image), provider, skipped, country: cf?.country, colo: cf?.colo })
    ctx.waitUntil(Promise.all(names.map((name) => track(env, name))).catch(() => {}))
  }

  const pump = async () => {
    let route: { provider: string; skipped: string[] } | null = null
    try {
      const input = {
        system,
        messages,
        image,
        // Объяснение темы — пять частей с примером: на 1000 токенах ответ обрывался.
        maxTokens: mode === 'plan' || mode === 'explain' || mode === 'lesson' ? 1600 : 1000,
        temperature: mode === 'calm' ? 0.7 : mode === 'lesson' ? 0.5 : 0.4,
        // Скрытые рассуждения — только при проверке решения без эталона. В разборе ошибки
        // эталонное решение уже в промпте, а рассуждения задерживали первый токен до 70 с.
        // В служебной проверке уровень можно задать явно — для экспериментов.
        // Фото — без рассуждений: Qwen без них проверила фото за 8 с вместо 11–52 с и так же точно.
        reasoning: caller.eval && (body.reasoning === 'none' || body.reasoning === 'low') ? (body.reasoning as 'none' | 'low') : mode === 'check' && !image ? ('low' as const) : ('none' as const),
      }
      // История диалога и системный промпт одни и те же для любой модели: если ответ перешёл
      // на запасную модель (кончился лимит, обрыв посреди ответа), она знает весь разговор.
      for await (const part of streamWithFailover(env, input, req.signal, force)) {
        if (part.type === 'meta') {
          route = { provider: part.provider, skipped: part.skipped }
          await send({ type: 'meta', provider: part.provider, model: part.model, ...(caller.eval ? { skipped: part.skipped } : {}) })
        } else if (part.type === 'delta') {
          await send({ type: 'delta', text: part.text })
        } else {
          await send({ type: 'reset', ...(caller.eval ? { reason: part.reason } : {}) })
          ctx.waitUntil(track(env, `failover:${route?.provider ?? '?'}`).catch(() => {}))
        }
      }
      await send({ type: 'done' })
      if (route) trackRoute(route.provider, route.skipped)
      ctx.waitUntil(track(env, `ai_${mode}`).catch(() => {}))
    } catch (e) {
      const message = e instanceof ProviderError && e.status === 503 ? 'Все модели ИИ сейчас недоступны. Попробуйте через минуту.' : 'Ответ прервался. Попробуйте ещё раз.'
      console.error('chat failed', (e as Error).message)
      if (e instanceof ProviderError && e.status === 503) trackRoute('failed', [(e as Error).message])
      await send({ type: 'error', message, ...(caller.eval ? { detail: (e as Error).message.slice(0, 1500) } : {}) }).catch(() => {})
    } finally {
      await writer.close().catch(() => {})
    }
  }
  ctx.waitUntil(pump())
  return new Response(readable, { headers: SSE_HEADERS })
}

// ---------- /api/ai/generate — новые задания ----------

async function generate(req: Request, env: Env, caller: Caller): Promise<Response> {
  const body = await readBody(req)
  if (body instanceof Response) return body
  const subjectTitle = str(body.subjectTitle, 100)
  const topic = str(body.topic, 160)
  if (!subjectTitle || !topic) return fail(400, 'Не указаны предмет и тема')
  const force = forcedModel(caller, body.model)
  if (force instanceof Response) return force
  const limited = await spend(env, caller, 'generate')
  if (limited) return limited
  const count = Math.min(8, Math.max(3, Number(body.count) || 5))
  const part = body.part === 'A' || body.part === 'B' ? body.part : 'mixed'
  const facts = Array.isArray(body.topicFacts) ? body.topicFacts.filter((f): f is string => typeof f === 'string').slice(0, 8) : []
  try {
    const { text, provider, model, skipped } = await complete(
      env,
      {
        system: buildGeneratePrompt({ subjectTitle, topic, topicFacts: facts, count, part }),
        messages: [{ role: 'user', content: `Составь ${count} заданий по теме «${topic}».` }],
        maxTokens: 3000,
        temperature: 0.8,
        json: true,
        // Gemini составляет задания с короткими рассуждениями — так ключи точнее. Qwen
        // в JSON-ответах рассуждает без них: иначе тратит весь лимит и отвечает пустотой.
        reasoning: 'low',
      },
      undefined,
      force,
    )
    const data = parseJsonLoose(text) as { tasks?: unknown }
    if (!Array.isArray(data.tasks)) return json({ error: 'ИИ вернул задания в неверном формате', ...(caller.eval ? { raw: text.slice(0, 3000), provider, model } : {}) }, 502)

    // Ученику отдаём только задания, ключ которых независимо подтвердила вторая модель пары.
    const drafts = data.tasks.slice(0, count)
    const screened = drafts.map(screenTask).filter((t): t is NonNullable<typeof t> => t !== null)
    const verdict = screened.length ? await verifyTasks(env, screened, subjectTitle, { provider, model }) : null
    const tasks = verdict ? screened.filter((_, i) => verdict.ok[i]) : []
    const audit = caller.eval ? { skipped, drafts: drafts.length, screened: screened.length, verifier: verdict?.model ?? null, rejected: drafts.filter((d) => !tasks.includes(d as never)) } : {}
    if (!screened.length) return json({ error: 'ИИ составил задания с ошибками. Попробуйте ещё раз.', ...audit }, 502)
    if (!verdict) return json({ error: 'Не удалось перепроверить задания. Попробуйте ещё раз.', ...audit }, 503)
    if (!tasks.length) return json({ error: 'Перепроверка не подтвердила ни одного задания. Попробуйте ещё раз.', ...audit }, 502)
    return json({ tasks, provider, model, ...audit })
  } catch (e) {
    console.error('generate failed', (e as Error).message)
    const status = e instanceof ProviderError && e.status === 503 ? 503 : 502
    return json({ error: 'Не удалось сгенерировать задания. Попробуйте ещё раз.', ...(caller.eval ? { detail: (e as Error).message.slice(0, 1500) } : {}) }, status)
  }
}

// ---------- /api/ai/analyze — разбор прогресса ----------

async function analyze(req: Request, env: Env, caller: Caller): Promise<Response> {
  const body = await readBody(req)
  if (body instanceof Response) return body
  const force = forcedModel(caller, body.model)
  if (force instanceof Response) return force
  const limited = await spend(env, caller, 'analyze')
  if (limited) return limited
  // Клиент присылает только агрегаты; сериализуем их компактно и с ограничением размера.
  const summary = JSON.stringify({ profile: body.profile, streak: body.streak, daysToExam: body.daysToExam, subjects: body.subjects }).slice(0, 12_000)
  try {
    const { text, provider, model, skipped } = await complete(
      env,
      {
        system: buildAnalyzePrompt(),
        messages: [{ role: 'user', content: `<student>\n${summary}\n</student>` }],
        maxTokens: 1600,
        temperature: 0.4,
        json: true,
      },
      undefined,
      force,
    )
    const data = parseJsonLoose(text) as Record<string, unknown>
    return json(caller.eval ? { ...data, _eval: { provider, model, skipped } } : data)
  } catch (e) {
    console.error('analyze failed', (e as Error).message)
    return json({ error: 'Не удалось подготовить разбор. Попробуйте ещё раз.', ...(caller.eval ? { detail: (e as Error).message.slice(0, 1500) } : {}) }, 502)
  }
}

// ---------- /api/ai/selftest — самостоятельная работа «как в школе РБ» ----------

/** Детерминированный «случай» от строки: на всех шагах урока — одни и те же факты. */
function seeded(text: string): () => number {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619)
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507)
    h = Math.imul(h ^ (h >>> 13), 3266489909)
    return ((h ^= h >>> 16) >>> 0) / 4294967296
  }
}

async function selftest(req: Request, env: Env, caller: Caller): Promise<Response> {
  const body = await readBody(req)
  if (body instanceof Response) return body
  const subjectTitle = str(body.subjectTitle, 100)
  const topic = str(body.topic, 200)
  if (!subjectTitle || !topic) return fail(400, 'Не указаны предмет и тема')
  const size: SelfTestSize = Number(body.size) === 10 ? 10 : 5
  const image = sanitizeImage(body.image)
  const force = forcedModel(caller, body.model)
  if (force instanceof Response) return force
  const limited = await spend(env, caller, image ? 'vision' : 'generate')
  if (limited) return limited
  const need = size === 5 ? 1 : 2
  const base = {
    subjectTitle,
    grade: str(body.grade, 20),
    topic,
    size,
    hasImage: Boolean(image),
    lesson: str(body.lesson, 3000),
    topicFacts: Array.isArray(body.topicFacts) ? body.topicFacts.filter((f): f is string => typeof f === 'string').slice(0, 8) : [],
  }

  // Кандидатов больше, чем нужно: задания с неверным ключом отсеет перепроверка.
  const round = async (levels: number[]) => {
    const { text, provider, model } = await complete(
      env,
      {
        system: buildSelfTestPrompt({ ...base, perLevel: need + 1, levels }),
        messages: [{ role: 'user', content: `Составь задания по теме «${topic}».` }],
        image,
        maxTokens: size === 10 ? 6000 : 4000,
        temperature: 0.6,
        json: true,
        // Gemini составляет с короткими рассуждениями; Qwen в JSON-ответах — без них.
        reasoning: 'low',
      },
      undefined,
      force,
    )
    const draft = parseSelfTest(text)
    const tasks = draft.tasks.filter((t) => levels.includes(t.level))
    // Заглушка для локальной разработки не умеет перепроверять — её задания верны по построению.
    if (provider === 'mock') return { title: draft.title, provider, model, verifier: null, verified: tasks, drafts: tasks.length }
    const verdict = tasks.length ? await verifyTasks(env, tasks.map(toDraft), subjectTitle, { provider, model }) : null
    if (!verdict) throw new ProviderError('Не удалось перепроверить задания', 503)
    return { title: draft.title, provider, model, verifier: verdict.model, verified: tasks.filter((_, i) => verdict.ok[i]), drafts: tasks.length }
  }

  try {
    const first = await round([1, 2, 3, 4, 5])
    let verified: SelfTestTask[] = first.verified
    let built = assemble(size, verified)
    let drafts = first.drafts
    if (built.missing.length) {
      // Повторная попытка только для уровней, где не хватило подтверждённых заданий.
      const second = await round(built.missing)
      verified = [...verified, ...second.verified]
      drafts += second.drafts
      built = assemble(size, verified)
    }
    const audit = caller.eval ? { drafts, verified: verified.length, missing: built.missing } : {}
    if (built.missing.length) return json({ error: 'Не удалось составить полную работу: часть заданий не прошла перепроверку. Попробуйте ещё раз.', ...audit }, 502)
    return json({
      title: first.title || `Самостоятельная работа: ${topic}`,
      size,
      tasks: built.tasks.map((t, i) => ({ ...t, n: i + 1, points: POINTS[size][i] })),
      provider: first.provider,
      model: first.model,
      verifier: first.verifier,
      ...audit,
    })
  } catch (e) {
    console.error('selftest failed', (e as Error).message)
    const status = e instanceof ProviderError && e.status === 503 ? 503 : 502
    return json({ error: 'Не удалось составить самостоятельную. Попробуйте ещё раз.', ...(caller.eval ? { detail: (e as Error).message.slice(0, 1500) } : {}) }, status)
  }
}

// ---------- /api/ai/grade — проверка самостоятельной по фото тетради ----------

function sanitizeGradeTasks(raw: unknown): GradeTask[] {
  if (!Array.isArray(raw)) return []
  return raw
    .slice(0, 10)
    .map((t, i) => {
      const item = t as Record<string, unknown>
      return {
        n: Math.round(Number(item?.n)) || i + 1,
        level: Math.min(5, Math.max(1, Math.round(Number(item?.level)) || 1)),
        max: Math.min(10, Math.max(1, Math.round(Number(item?.max)) || 1)),
        q: str(item?.q, 1500) ?? '',
        answer: str(item?.answer, 200) ?? '',
        solution: str(item?.solution, 1500) ?? '',
      }
    })
    .filter((t) => t.q && t.answer)
}

async function grade(req: Request, env: Env, caller: Caller): Promise<Response> {
  const body = await readBody(req)
  if (body instanceof Response) return body
  const subjectTitle = str(body.subjectTitle, 100)
  const tasks = sanitizeGradeTasks(body.tasks)
  const image = sanitizeImage(body.image)
  if (!subjectTitle || !tasks.length) return fail(400, 'Нет заданий для проверки')
  if (!image) return fail(400, 'Нужно фото тетради с решениями')
  const force = forcedModel(caller, body.model)
  if (force instanceof Response) return force
  const limited = await spend(env, caller, 'vision')
  if (limited) return limited
  try {
    const { text, provider, model } = await complete(
      env,
      {
        system: buildGradePrompt({ subject: str(body.subject, 10), subjectTitle, grade: str(body.grade, 20), tasks }),
        messages: [{ role: 'user', content: 'Проверь мою самостоятельную работу на фото.' }],
        image,
        maxTokens: 2500,
        temperature: 0.2,
        json: true,
        reasoning: 'low',
      },
      undefined,
      force,
    )
    const result = sanitizeGrade(parseJsonLoose(text), tasks)
    if (!result) return json({ error: 'Не удалось разобрать проверку. Попробуйте ещё раз или переснимите тетрадь.', ...(caller.eval ? { raw: text.slice(0, 2000) } : {}) }, 502)
    return json({ ...result, provider, model })
  } catch (e) {
    console.error('grade failed', (e as Error).message)
    const status = e instanceof ProviderError && e.status === 503 ? 503 : 502
    return json({ error: 'Не удалось проверить фото. Попробуйте ещё раз.', ...(caller.eval ? { detail: (e as Error).message.slice(0, 1500) } : {}) }, status)
  }
}

// ---------- /api/me — настройки напоминаний ----------

async function me(req: Request, env: Env, caller: Caller): Promise<Response> {
  if (!caller.user || !env.DB) return json({ ok: false })
  const body = await readBody(req)
  if (body instanceof Response) return body
  const now = Date.now()
  const hour = Math.min(23, Math.max(0, Math.round(Number(body.remindHour) || 18)))
  const tz = str(body.tz, 64) ?? 'Europe/Minsk'
  await env.DB.prepare(
    `INSERT INTO users (id, first_name, username, can_message, reminders, remind_hour, tz, streak, due, last_study_day, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?11)
     ON CONFLICT(id) DO UPDATE SET
       first_name = excluded.first_name, username = excluded.username,
       can_message = MAX(users.can_message, excluded.can_message),
       reminders = excluded.reminders, remind_hour = excluded.remind_hour, tz = excluded.tz,
       streak = excluded.streak, due = excluded.due,
       last_study_day = COALESCE(excluded.last_study_day, users.last_study_day),
       updated_at = excluded.updated_at`,
  )
    .bind(
      caller.user.id,
      caller.user.first_name ?? '',
      caller.user.username ?? null,
      body.canMessage === true ? 1 : 0,
      body.reminders === false ? 0 : 1,
      hour,
      tz,
      Math.max(0, Math.round(Number(body.streak) || 0)),
      Math.max(0, Math.round(Number(body.due) || 0)),
      body.studiedToday === true ? minskDay(now) : null,
      now,
    )
    .run()
  if (body.studiedToday === true) await track(env, 'active_user').catch(() => {})
  return json({ ok: true })
}

async function status(env: Env, caller: Caller | null): Promise<Response> {
  const used = caller ? await usage(env, caller.key).catch(() => ({})) : {}
  const kinds: Kind[] = ['chat', 'generate', 'analyze', 'vision']
  return json({
    ok: true,
    version: VERSION,
    providers: describeProviders(env),
    limits: caller ? Object.fromEntries(kinds.map((k) => [k, { used: (used as Record<string, number>)[k] ?? 0, limit: limitFor(env, k, caller.anonymous) }])) : undefined,
  })
}

export async function handleApi(req: Request, env: Env, ctx: ExecutionContext, path: string): Promise<Response> {
  if (path === '/api/health') return json({ ok: true, version: VERSION })

  const caller = await identify(req, env)
  if (path === '/api/ai/status' && req.method === 'GET') return status(env, caller instanceof Response ? null : caller)
  if (path === '/api/admin/stats' && req.method === 'GET') {
    if (caller instanceof Response || !caller.eval) return fail(403, 'Нет доступа')
    if (!env.DB) return json({ events: [] })
    const since = minskDay(Date.now() - 7 * 86_400_000)
    const rows = await env.DB.prepare('SELECT day, name, count FROM events WHERE day >= ?1 ORDER BY day DESC, count DESC LIMIT 500').bind(since).all()
    return json({ events: rows.results ?? [] })
  }
  if (caller instanceof Response) return caller
  if (req.method !== 'POST') return fail(405, 'Метод не поддерживается')

  switch (path) {
    case '/api/ai/chat':
      return chat(req, env, ctx, caller)
    case '/api/ai/generate':
      return generate(req, env, caller)
    case '/api/ai/selftest':
      return selftest(req, env, caller)
    case '/api/ai/grade':
      return grade(req, env, caller)
    case '/api/ai/analyze':
      return analyze(req, env, caller)
    case '/api/me':
      return me(req, env, caller)
    default:
      return fail(404, 'Не найдено')
  }
}
