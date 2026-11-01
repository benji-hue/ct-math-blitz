import { describeProviders, openStream, complete, ProviderError, type ChatMessage } from './ai/providers'
import { buildAnalyzePrompt, buildGeneratePrompt, buildSystemPrompt, MODES, type Mode, type Reference, type TaskContext } from './ai/prompts'
import { parseJsonLoose } from './ai/sse'
import { minskDay, num, VERSION, type Env } from './env'
import { consume, limitFor, track, usage, type Kind } from './limits'
import { validateInitData, type TgUser } from './telegram'

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
    return { key: `tg:${result.user.id}`, anonymous: false, user: result.user }
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

// ---------- /api/ai/chat — потоковый ответ ----------

const SSE_HEADERS = { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no' }

async function chat(req: Request, env: Env, ctx: ExecutionContext, caller: Caller): Promise<Response> {
  const body = await readBody(req)
  if (body instanceof Response) return body
  const mode = (MODES.includes(body.mode as Mode) ? body.mode : 'tutor') as Mode
  const messages = sanitizeMessages(body.messages)
  if (!messages.length) return fail(400, 'Пустой вопрос')
  const image = sanitizeImage(body.image)
  const limited = await spend(env, caller, image ? 'vision' : 'chat')
  if (limited) return limited

  const profile = body.profile as { grade?: unknown; exam?: unknown; target?: unknown } | undefined
  const system = buildSystemPrompt({
    mode,
    subjectTitle: str(body.subjectTitle, 100),
    topic: str(body.topic, 160),
    profile: profile ? { grade: str(profile.grade, 10), exam: str(profile.exam, 10), target: Number(profile.target) || undefined } : undefined,
    refs: sanitizeRefs(body.refs),
    task: sanitizeTask(body.task),
    hasImage: Boolean(image),
  })

  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>()
  const writer = writable.getWriter()
  const encoder = new TextEncoder()
  const send = (event: Record<string, unknown>) => writer.write(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))

  const pump = async () => {
    try {
      const stream = await openStream(
        env,
        {
          system,
          messages,
          image,
          maxTokens: mode === 'plan' ? 1400 : 1000,
          temperature: mode === 'calm' ? 0.7 : 0.4,
          reasoning: mode === 'check' || mode === 'mistake' ? 'low' : 'none',
        },
        req.signal,
      )
      await send({ type: 'meta', provider: stream.provider, model: stream.model })
      for await (const text of stream.chunks) await send({ type: 'delta', text })
      await send({ type: 'done' })
      ctx.waitUntil(track(env, `ai_${mode}`).catch(() => {}))
    } catch (e) {
      const message = e instanceof ProviderError && e.status === 503 ? 'Все модели ИИ сейчас недоступны. Попробуйте через минуту.' : 'Ответ прервался. Попробуйте ещё раз.'
      console.error('chat failed', (e as Error).message)
      await send({ type: 'error', message }).catch(() => {})
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
  const limited = await spend(env, caller, 'generate')
  if (limited) return limited
  const count = Math.min(8, Math.max(3, Number(body.count) || 5))
  const part = body.part === 'A' || body.part === 'B' ? body.part : 'mixed'
  const facts = Array.isArray(body.topicFacts) ? body.topicFacts.filter((f): f is string => typeof f === 'string').slice(0, 8) : []
  try {
    const { text, provider, model } = await complete(env, {
      system: buildGeneratePrompt({ subjectTitle, topic, topicFacts: facts, count, part }),
      messages: [{ role: 'user', content: `Составь ${count} заданий по теме «${topic}».` }],
      maxTokens: 3000,
      temperature: 0.8,
      json: true,
      reasoning: 'low',
    })
    const data = parseJsonLoose(text) as { tasks?: unknown }
    if (!Array.isArray(data.tasks)) return fail(502, 'ИИ вернул задания в неверном формате')
    return json({ tasks: data.tasks.slice(0, count), provider, model })
  } catch (e) {
    console.error('generate failed', (e as Error).message)
    return fail(e instanceof ProviderError && e.status === 503 ? 503 : 502, 'Не удалось сгенерировать задания. Попробуйте ещё раз.')
  }
}

// ---------- /api/ai/analyze — разбор прогресса ----------

async function analyze(req: Request, env: Env, caller: Caller): Promise<Response> {
  const body = await readBody(req)
  if (body instanceof Response) return body
  const limited = await spend(env, caller, 'analyze')
  if (limited) return limited
  // Клиент присылает только агрегаты; сериализуем их компактно и с ограничением размера.
  const summary = JSON.stringify({ profile: body.profile, streak: body.streak, daysToExam: body.daysToExam, subjects: body.subjects }).slice(0, 12_000)
  try {
    const { text } = await complete(env, {
      system: buildAnalyzePrompt(),
      messages: [{ role: 'user', content: `<student>\n${summary}\n</student>` }],
      maxTokens: 1600,
      temperature: 0.4,
      json: true,
    })
    return json(parseJsonLoose(text))
  } catch (e) {
    console.error('analyze failed', (e as Error).message)
    return fail(502, 'Не удалось подготовить разбор. Попробуйте ещё раз.')
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
  if (caller instanceof Response) return caller
  if (req.method !== 'POST') return fail(405, 'Метод не поддерживается')

  switch (path) {
    case '/api/ai/chat':
      return chat(req, env, ctx, caller)
    case '/api/ai/generate':
      return generate(req, env, caller)
    case '/api/ai/analyze':
      return analyze(req, env, caller)
    case '/api/me':
      return me(req, env, caller)
    default:
      return fail(404, 'Не найдено')
  }
}
