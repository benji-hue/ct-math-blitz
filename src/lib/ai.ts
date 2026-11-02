import { API_BASE } from '../config'
import type { SubjectId, Task } from '../domain/types'
import type { Reference } from './retrieval'
import type { AiMode } from './store'
import { initData } from './telegram'

/**
 * Клиент ИИ. Ключей нейросетей в приложении нет и быть не может: всё идёт
 * через наш Cloudflare Worker, который проверяет подпись Telegram, следит
 * за лимитами и сам выбирает провайдера (с запасным на случай сбоя).
 */

export interface ChatTurn {
  role: 'user' | 'assistant'
  content: string
}

export interface TaskContext {
  q: string
  options?: string[]
  correct: string
  given?: string
  explain?: string
  trap?: string
}

export interface ChatRequest {
  mode: AiMode
  subject?: SubjectId | null
  subjectTitle?: string
  topic?: string
  messages: ChatTurn[]
  refs?: Reference[]
  profile?: { grade: string; exam: string; target?: number }
  task?: TaskContext
  image?: { mime: string; data: string }
}

export type StreamEvent =
  | { type: 'delta'; text: string }
  | { type: 'meta'; provider: string; model: string }
  | { type: 'done' }
  | { type: 'error'; message: string }

export class AiError extends Error {
  status: number
  constructor(message: string, status = 0) {
    super(message)
    this.status = status
  }
}

function url(path: string): string {
  return `${API_BASE}${path}`
}

function headers(): HeadersInit {
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  const data = initData()
  if (data) h.Authorization = `tma ${data}`
  return h
}

export function describeStatus(status: number, body = ''): string {
  if (status === 401) return 'Не удалось подтвердить вход через Telegram. Откройте приложение заново из бота.'
  if (status === 403) return 'ИИ доступен только внутри Telegram. Откройте мини-апп через бота.'
  if (status === 404 || status === 405) return 'ИИ-сервер не подключён к этой версии приложения. Откройте мини-апп через бота — или включите демо-профиль, чтобы посмотреть, как работает ИИ.'
  if (status === 413) return 'Слишком большой запрос — сократите текст или уменьшите фото.'
  if (status === 429) return body || 'Дневной лимит запросов к ИИ исчерпан. Он обновится завтра — а пока можно тренироваться в банке заданий.'
  if (status === 503) return 'ИИ-сервер временно недоступен. Попробуйте через минуту.'
  if (status >= 500) return 'Сбой на сервере ИИ. Попробуйте ещё раз.'
  return `Ошибка ${status}`
}

/** Сервер ИИ не отвечает или не подключён к этой сборке (например, статика на GitHub Pages). */
/** Понятное имя модели для подписи под ответом: «Gemini 3.6 Flash», «Qwen 3.8». */
export function modelLabel(model: string | undefined, provider: string): string {
  const id = (model ?? '').toLowerCase().replace(/^models\//, '')
  const gemini = /^gemini-(\d+(?:\.\d+)?)-(flash-lite|flash|pro)/.exec(id)
  if (gemini) return `Gemini ${gemini[1]} ${gemini[2] === 'flash-lite' ? 'Flash-Lite' : gemini[2] === 'flash' ? 'Flash' : 'Pro'}`
  const qwen = /qwen(\d+(?:\.\d+)?)/.exec(id)
  if (qwen) return `Qwen ${qwen[1]}`
  if (id.includes('gpt-oss')) return `GPT-OSS ${/(\d+)b/.exec(id)?.[1] ?? ''}B`.replace(' B', '')
  if (id.includes('llama-4-scout')) return 'Llama 4 Scout'
  if (id.includes('deepseek')) return 'DeepSeek'
  return model || provider
}

export function isAiUnavailable(e: unknown): boolean {
  const status = (e as AiError | undefined)?.status
  return status === 0 || status === 404 || status === 405 || status === 501 || status === 502 || status === 503
}

async function errorFrom(res: Response): Promise<AiError> {
  let message = ''
  try {
    const body = (await res.json()) as { error?: string }
    message = body.error ?? ''
  } catch {
    // тело не JSON
  }
  return new AiError(res.status === 429 ? describeStatus(429, message) : message || describeStatus(res.status), res.status)
}

/** Потоковый ответ: текст приходит по мере генерации. */
export async function* streamChat(req: ChatRequest, signal?: AbortSignal): AsyncGenerator<StreamEvent> {
  let res: Response
  try {
    res = await fetch(url('/api/ai/chat'), { method: 'POST', headers: headers(), body: JSON.stringify(req), signal })
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e
    throw new AiError('Нет связи с сервером ИИ. Проверьте интернет.', 0)
  }
  if (!res.ok || !res.body) throw await errorFrom(res)

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let split: number
    while ((split = buffer.indexOf('\n\n')) !== -1) {
      const chunk = buffer.slice(0, split)
      buffer = buffer.slice(split + 2)
      for (const line of chunk.split('\n')) {
        if (!line.startsWith('data:')) continue
        const payload = line.slice(5).trim()
        if (!payload) continue
        try {
          yield JSON.parse(payload) as StreamEvent
        } catch {
          // битый фрагмент пропускаем
        }
      }
    }
  }
}

async function postJson<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  let res: Response
  try {
    res = await fetch(url(path), { method: 'POST', headers: headers(), body: JSON.stringify(body), signal })
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e
    throw new AiError('Нет связи с сервером ИИ. Проверьте интернет.', 0)
  }
  if (!res.ok) throw await errorFrom(res)
  return (await res.json()) as T
}

// ---------- Генерация заданий ----------

export interface GenerateRequest {
  subject: SubjectId
  subjectTitle: string
  topic: string
  topicFacts: string[]
  count: number
  part: 'A' | 'B' | 'mixed'
}

interface RawTask {
  q: string
  part: 'A' | 'B'
  level: number
  options?: string[]
  answer: number | string | string[]
  explain: string
  hint?: string
  trap?: string
}

/** Проверяем каждое задание от модели: битые отбрасываем, а не показываем. */
export function sanitizeTasks(raw: unknown, subject: SubjectId, topicId: string): Task[] {
  const list = (raw as { tasks?: unknown })?.tasks
  if (!Array.isArray(list)) return []
  const out: Task[] = []
  for (const item of list as RawTask[]) {
    if (!item || typeof item.q !== 'string' || !item.q.trim() || typeof item.explain !== 'string') continue
    const level = Math.min(5, Math.max(1, Math.round(Number(item.level) || 2))) as Task['level']
    const id = `ai_${subject}_${Date.now().toString(36)}_${out.length}_${Math.random().toString(36).slice(2, 6)}`
    if (Array.isArray(item.options) && item.options.length >= 3) {
      const options = item.options.filter((o) => typeof o === 'string' && o.trim()).slice(0, 5)
      const answer = Number(item.answer)
      if (options.length < 3 || !Number.isInteger(answer) || answer < 0 || answer >= options.length) continue
      out.push({ id, subject, topic: topicId, part: 'A', level, kind: 'choice', q: item.q, options, answer, explain: item.explain, hint: item.hint, trap: item.trap, source: 'ai' })
    } else {
      const answers = (Array.isArray(item.answer) ? item.answer : [item.answer]).map(String).filter((a) => a.trim())
      if (!answers.length) continue
      out.push({ id, subject, topic: topicId, part: 'B', level, kind: 'input', q: item.q, answer: answers, explain: item.explain, hint: item.hint, trap: item.trap, source: 'ai' })
    }
  }
  return out
}

export async function generateTasks(req: GenerateRequest, topicId: string, signal?: AbortSignal): Promise<Task[]> {
  const raw = await postJson<unknown>('/api/ai/generate', req, signal)
  const tasks = sanitizeTasks(raw, req.subject, topicId)
  if (!tasks.length) throw new AiError('ИИ вернул задания в неверном формате. Попробуйте ещё раз.')
  return tasks
}

// ---------- Аналитика прогресса ----------

export interface AnalyzeRequest {
  profile: { grade: string; exam: string; dailyGoal: number }
  streak: number
  daysToExam: number | null
  subjects: {
    id: SubjectId
    title: string
    forecast: number
    coverage: number
    target?: number
    weak: { title: string; mastery: number; n: number }[]
    strong: { title: string; mastery: number }[]
    errors: Record<string, number>
  }[]
}

export interface Analysis {
  summary: string
  strengths: string[]
  gaps: { topic: string; reason: string; action: string }[]
  week: { day: string; focus: string; minutes: number }[]
  tip: string
}

export function sanitizeAnalysis(raw: unknown): Analysis | null {
  const a = raw as Partial<Analysis>
  if (!a || typeof a.summary !== 'string') return null
  const str = (v: unknown) => (typeof v === 'string' ? v : '')
  return {
    summary: a.summary,
    strengths: Array.isArray(a.strengths) ? a.strengths.map(str).filter(Boolean).slice(0, 5) : [],
    gaps: Array.isArray(a.gaps)
      ? a.gaps
          .map((g) => ({ topic: str(g?.topic), reason: str(g?.reason), action: str(g?.action) }))
          .filter((g) => g.topic)
          .slice(0, 5)
      : [],
    week: Array.isArray(a.week)
      ? a.week
          .map((d) => ({ day: str(d?.day), focus: str(d?.focus), minutes: Math.max(0, Math.min(240, Number(d?.minutes) || 0)) }))
          .filter((d) => d.day && d.focus)
          .slice(0, 7)
      : [],
    tip: str(a.tip),
  }
}

export async function analyzeProgress(req: AnalyzeRequest, signal?: AbortSignal): Promise<Analysis> {
  const raw = await postJson<unknown>('/api/ai/analyze', req, signal)
  const analysis = sanitizeAnalysis(raw)
  if (!analysis) throw new AiError('Не удалось разобрать ответ ИИ. Попробуйте ещё раз.')
  return analysis
}

// ---------- Статус и напоминания ----------

export interface AiStatus {
  ok: boolean
  providers: { id: string; model: string }[]
  limits?: Record<string, { used: number; limit: number }>
}

export async function fetchStatus(signal?: AbortSignal): Promise<AiStatus | null> {
  try {
    const res = await fetch(url('/api/ai/status'), { headers: headers(), signal })
    if (!res.ok) return null
    return (await res.json()) as AiStatus
  } catch {
    return null
  }
}

export interface ReminderSync {
  reminders: boolean
  remindHour: number
  tz: string
  streak: number
  due: number
  studiedToday: boolean
  canMessage?: boolean
}

export async function syncReminders(body: ReminderSync): Promise<boolean> {
  if (!initData()) return false
  try {
    // keepalive: запрос долетит, даже если ученик уже свернул мини-апп.
    const res = await fetch(url('/api/me'), { method: 'POST', headers: headers(), body: JSON.stringify(body), keepalive: true })
    return res.ok
  } catch {
    return false
  }
}

/** Сжимает фото решения перед отправкой: длинная сторона ≤ 1280 px, JPEG. */
export async function compressImage(file: File, maxSide = 1280, quality = 0.82): Promise<{ mime: string; data: string; preview: string }> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  const dataUrl = canvas.toDataURL('image/jpeg', quality)
  const thumb = document.createElement('canvas')
  const ts = Math.min(1, 240 / Math.max(canvas.width, canvas.height))
  thumb.width = Math.round(canvas.width * ts)
  thumb.height = Math.round(canvas.height * ts)
  thumb.getContext('2d')!.drawImage(canvas, 0, 0, thumb.width, thumb.height)
  return { mime: 'image/jpeg', data: dataUrl.split(',')[1], preview: thumb.toDataURL('image/jpeg', 0.7) }
}
