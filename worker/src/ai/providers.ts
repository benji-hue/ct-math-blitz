import { list, type Env } from '../env'
import { createThinkFilter, extractDelta, readSse } from './sse'

/**
 * Провайдеры нейросетей с автоматическим переключением.
 *
 * Моделей две (docs/ВЫБОР-МОДЕЛИ.md): Gemini 3.5 Flash-Lite — основная, если есть
 * ключ GEMINI_API_KEY; Qwen 3.8 на Cloudflare Workers AI — запасная. Qwen не требует
 * внешних ключей и не зависит от страны ученика, поэтому отвечает, когда у Gemini
 * кончилась квота, перегрузка или Google не обслуживает регион (Беларусь).
 * Обе понимают фото решений. Порядок можно поменять переменной AI_PROVIDERS.
 */

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface ChatInput {
  system: string
  messages: ChatMessage[]
  image?: { mime: string; data: string }
  maxTokens: number
  temperature: number
  json?: boolean
  /** Скрытые рассуждения модели: дольше, но точнее. */
  reasoning?: 'none' | 'low'
}

export interface OpenedStream {
  provider: string
  model: string
  chunks: AsyncGenerator<string>
  /** Модели, которые отказали до первого фрагмента, с причиной — для диагностики. */
  skipped: string[]
}

/** Конкретная модель вместо цепочки (служебная проверка ИИ). */
export interface ForcedModel {
  provider: string
  model: string
}

export class ProviderError extends Error {
  status: number
  constructor(message: string, status = 0) {
    super(message)
    this.status = status
  }
}

/**
 * Gemini 3.5 Flash-Lite: ответ за 1–3 с, хорошо читает фото, бесплатная квота заметно
 * больше, чем у Gemini 3.6 Flash: та умнее, но в наших прогонах её дневная квота на
 * бесплатном ключе кончалась примерно за 20 запросов.
 * Qwen 3.8 — лучшая модель бесплатного тарифа Workers AI (текст и фото).
 */
export const DEFAULT_GEMINI_MODELS = ['gemini-3.5-flash-lite']
export const DEFAULT_WORKERS_MODELS = ['@cf/qwen/qwen3.8-27b']
export const DEFAULT_VISION_MODELS = ['@cf/qwen/qwen3.8-27b']
/** Порядок по умолчанию: Gemini, а без её ключа (или при отказе) — Workers AI. */
export const DEFAULT_PROVIDERS = ['gemini', 'workers-ai']

/** Запас токенов на скрытые рассуждения Gemini — сверх лимита на сам ответ. */
const GEMINI_THINKING_ALLOWANCE = 2048

/**
 * Уровень рассуждений Gemini: по умолчанию модель «думает» долго (первый токен через
 * 5–7 с). Для обычных ответов — минимум, для проверки решений — немного.
 */
export function geminiThinking(model: string, input: Pick<ChatInput, 'reasoning'>): Record<string, unknown> | null {
  if (/^gemini-([3-9]|\d{2})/.test(model)) return { thinkingLevel: input.reasoning === 'low' ? 'low' : 'minimal' }
  if (/^gemini-2\.5-flash/.test(model)) return { thinkingBudget: input.reasoning === 'low' ? 1024 : 0 }
  return null
}

type Opener = (env: Env, model: string, input: ChatInput, signal?: AbortSignal) => Promise<AsyncGenerator<string>>

interface Provider {
  id: string
  models: (env: Env, input: ChatInput) => string[]
  available: (env: Env) => boolean
  open: Opener
}

function withImage(messages: ChatMessage[], image: ChatInput['image']): unknown[] {
  if (!image) return messages
  const lastUser = messages.map((m) => m.role).lastIndexOf('user')
  return messages.map((m, i) =>
    i === lastUser
      ? {
          role: 'user',
          content: [
            { type: 'text', text: m.content },
            { type: 'image_url', image_url: { url: `data:${image.mime};base64,${image.data}` } },
          ],
        }
      : m,
  )
}

async function* mapSse(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const filter = createThinkFilter()
  for await (const data of readSse(body)) {
    if (data === '[DONE]') return
    let payload: unknown
    try {
      payload = JSON.parse(data)
    } catch {
      continue
    }
    const error = (payload as { error?: { message?: string } }).error
    if (error) throw new ProviderError(error.message ?? 'Ошибка провайдера')
    const text = filter(extractDelta(payload))
    if (text) yield text
  }
}

// ---------- Cloudflare Workers AI ----------

interface LooseAi {
  run: (model: string, inputs: Record<string, unknown>, options?: Record<string, unknown>) => Promise<unknown>
}

function modelOptions(model: string, input: ChatInput): Record<string, unknown> {
  if (model.includes('deepseek-v4')) return { reasoning_effort: input.reasoning ?? 'none' }
  // В JSON-ответах (задания, их перепроверка) Qwen с рассуждениями тратил весь лимит
  // токенов на «мысли» и возвращал пустой ответ — там она отвечает без них.
  if (/qwen3|glm-|kimi/.test(model)) return { chat_template_kwargs: { enable_thinking: input.reasoning === 'low' && !input.json } }
  if (model.includes('gpt-oss')) return { reasoning_effort: 'low' }
  return {}
}

const workersAi: Provider = {
  id: 'workers-ai',
  available: (env) => Boolean(env.AI),
  models: (env, input) =>
    input.image ? list(env.WORKERS_AI_VISION_MODELS, DEFAULT_VISION_MODELS) : list(env.WORKERS_AI_MODELS, DEFAULT_WORKERS_MODELS),
  open: async (env, model, input) => {
    const ai = env.AI as unknown as LooseAi
    const inputs: Record<string, unknown> = {
      messages: [{ role: 'system', content: input.system }, ...withImage(input.messages, input.image)],
      stream: true,
      max_tokens: input.maxTokens,
      temperature: input.temperature,
      ...modelOptions(model, input),
    }
    if (input.json) inputs.response_format = { type: 'json_object' }
    let result: unknown
    try {
      result = await ai.run(model, inputs)
    } catch (e) {
      throw new ProviderError(`Workers AI (${model}): ${(e as Error).message}`, 502)
    }
    if (result instanceof ReadableStream) return mapSse(result as ReadableStream<Uint8Array>)
    // Модель проигнорировала stream: отдаём ответ одним куском.
    const text = extractDelta(result)
    return (async function* () {
      if (text) yield text
    })()
  },
}

// ---------- Google Gemini ----------

const gemini: Provider = {
  id: 'gemini',
  available: (env) => Boolean(env.GEMINI_API_KEY),
  // Через запятую: если у первой модели кончилась бесплатная квота, берётся следующая.
  models: (env) => list(env.GEMINI_MODEL, DEFAULT_GEMINI_MODELS),
  open: async (env, model, input, signal) => {
    const contents = input.messages.map((m, i) => {
      const parts: Record<string, unknown>[] = [{ text: m.content }]
      if (input.image && i === input.messages.length - 1 && m.role === 'user') parts.push({ inlineData: { mimeType: input.image.mime, data: input.image.data } })
      return { role: m.role === 'assistant' ? 'model' : 'user', parts }
    })
    const send = (thinking: Record<string, unknown> | null) =>
      fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY ?? '' },
        signal,
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: input.system }] },
          contents,
          generationConfig: {
            temperature: input.temperature,
            // Скрытые рассуждения Gemini тратят тот же лимит, что и ответ: без запаса
            // пробный вариант получал ответы, оборванные на полуслове.
            maxOutputTokens: input.maxTokens + GEMINI_THINKING_ALLOWANCE,
            ...(input.json ? { responseMimeType: 'application/json' } : {}),
            ...(thinking ? { thinkingConfig: thinking } : {}),
          },
        }),
      })
    const thinking = geminiThinking(model, input)
    let res = await send(thinking)
    if (res.status === 400 && thinking) {
      // Модель не поддерживает такой уровень рассуждений — повторяем без настройки.
      const detail = await res.text().catch(() => '')
      if (!/thinking/i.test(detail)) throw new ProviderError(`Gemini 400: ${detail.slice(0, 200)}`, 400)
      res = await send(null)
    }
    if (!res.ok || !res.body) throw new ProviderError(`Gemini ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`, res.status)
    return mapSse(res.body)
  },
}

// ---------- Любой OpenAI-совместимый API ----------

const openaiCompatible: Provider = {
  id: 'openai',
  available: (env) => Boolean(env.OPENAI_API_KEY && env.OPENAI_BASE_URL && env.OPENAI_MODEL),
  models: (env) => list(env.OPENAI_MODEL, []),
  open: async (env, model, input, signal) => {
    const res = await fetch(`${env.OPENAI_BASE_URL!.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.OPENAI_API_KEY}` },
      signal,
      body: JSON.stringify({
        model,
        messages: [{ role: 'system', content: input.system }, ...withImage(input.messages, input.image)],
        stream: true,
        max_tokens: input.maxTokens,
        temperature: input.temperature,
        ...(input.json ? { response_format: { type: 'json_object' } } : {}),
      }),
    })
    if (!res.ok || !res.body) throw new ProviderError(`OpenAI-compatible ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`, res.status)
    return mapSse(res.body)
  },
}

// ---------- Заглушка для локальной разработки ----------

const mock: Provider = {
  id: 'mock',
  available: (env) => env.ALLOW_MOCK_AI === 'true',
  models: () => ['mock-tutor'],
  open: async (_env, _model, input) => {
    const text = input.json
      ? JSON.stringify({ summary: 'Тестовый ответ заглушки.', strengths: [], gaps: [], week: [], tip: '', tasks: [] })
      : 'Это тестовый ответ локальной заглушки ИИ. Подключите Workers AI или ключ провайдера, чтобы получить настоящий разбор.'
    return (async function* () {
      for (const word of text.match(/\S+\s*/g) ?? [text]) yield word
    })()
  },
}

const PROVIDERS: Record<string, Provider> = { 'workers-ai': workersAi, gemini, openai: openaiCompatible, mock }

/**
 * Цепочка провайдеров: только те, для которых есть ключ или привязка. Для фото
 * можно задать отдельный порядок (AI_VISION_PROVIDERS), по умолчанию он общий.
 */
export function providerChain(env: Env, input?: Pick<ChatInput, 'image'>): Provider[] {
  // Копия: list() может вернуть сам DEFAULT_PROVIDERS, а ниже в порядок дописывается заглушка.
  const order = [...(input?.image ? list(env.AI_VISION_PROVIDERS, list(env.AI_PROVIDERS, DEFAULT_PROVIDERS)) : list(env.AI_PROVIDERS, DEFAULT_PROVIDERS))]
  if (env.ALLOW_MOCK_AI === 'true' && !order.includes('mock')) order.push('mock')
  return order.map((id) => PROVIDERS[id]).filter((p): p is Provider => Boolean(p) && p.available(env))
}

export function describeProviders(env: Env): { id: string; model: string }[] {
  return providerChain(env).map((p) => ({ id: p.id, model: p.models(env, { system: '', messages: [], maxTokens: 0, temperature: 0 })[0] ?? '' }))
}

/**
 * Открывает поток у первого провайдера, который реально начал отвечать.
 * Ошибки до первого фрагмента — повод попробовать следующую модель.
 */
export async function openStream(env: Env, input: ChatInput, signal?: AbortSignal, force?: ForcedModel, exclude: ReadonlySet<string> = new Set()): Promise<OpenedStream> {
  const errors: string[] = []
  let chain = providerChain(env, input)
  if (force) {
    const provider = PROVIDERS[force.provider]
    if (!provider || !provider.available(env)) throw new ProviderError(`Провайдер ${force.provider} не настроен на сервере`, 503)
    chain = [provider]
  }
  for (const provider of chain) {
    for (const model of force ? [force.model] : provider.models(env, input)) {
      if (!model || exclude.has(`${provider.id}/${model}`)) continue
      try {
        const chunks = await provider.open(env, model, input, signal)
        const first = await chunks.next()
        if (first.done) {
          errors.push(`${provider.id}/${model}: пустой ответ`)
          continue
        }
        return {
          provider: provider.id,
          model,
          skipped: errors,
          chunks: (async function* () {
            yield first.value
            yield* chunks
          })(),
        }
      } catch (e) {
        if ((e as Error).name === 'AbortError') throw e
        errors.push(`${provider.id}/${model}: ${(e as Error).message}`)
      }
    }
  }
  throw new ProviderError(errors.length ? `Все модели недоступны: ${errors.join(' | ')}` : 'Не настроен ни один провайдер ИИ', 503)
}

export type StreamPart =
  | { type: 'meta'; provider: string; model: string; skipped: string[] }
  | { type: 'delta'; text: string }
  /** Модель оборвалась посреди ответа: недописанный текст надо стереть, дальше отвечает другая. */
  | { type: 'reset'; reason: string }

/** Сколько раз за один ответ можно сменить модель, если она оборвалась уже после первого фрагмента. */
const MAX_SWITCHES = 3

/**
 * Потоковый ответ с запасным вариантом «на лету».
 *
 * openStream переключается на следующую модель, если та отказала ДО первого фрагмента
 * (квота, регион, 503). Но бывает и хуже: Gemini начинает отвечать и обрывается
 * посреди ответа («высокая нагрузка»). Тогда берём следующую модель с самого начала —
 * ей уходит тот же системный промпт и та же история диалога, поэтому контекст не
 * теряется, — а клиент получает reset и стирает недописанный текст.
 * Если замены нет, пробрасываем исходную ошибку.
 */
export async function* streamWithFailover(env: Env, input: ChatInput, signal?: AbortSignal, force?: ForcedModel): AsyncGenerator<StreamPart> {
  const failed = new Set<string>()
  let stream = await openStream(env, input, signal, force, failed)
  for (let switches = 0; ; switches++) {
    yield { type: 'meta', provider: stream.provider, model: stream.model, skipped: stream.skipped }
    try {
      for await (const text of stream.chunks) yield { type: 'delta', text }
      return
    } catch (e) {
      if ((e as Error).name === 'AbortError') throw e
      const name = `${stream.provider}/${stream.model}`
      failed.add(name)
      if (force || switches >= MAX_SWITCHES) throw e
      try {
        stream = await openStream(env, input, signal, undefined, failed)
      } catch {
        throw e
      }
      yield { type: 'reset', reason: `${name}: ${(e as Error).message}`.slice(0, 400) }
    }
  }
}

/** Ответ целиком (задания, разбор прогресса, проверка ключей): с тем же переключением «на лету». */
export async function complete(
  env: Env,
  input: ChatInput,
  signal?: AbortSignal,
  force?: ForcedModel,
): Promise<{ text: string; provider: string; model: string; skipped: string[] }> {
  let text = ''
  let provider = ''
  let model = ''
  let skipped: string[] = []
  for await (const part of streamWithFailover(env, input, signal, force)) {
    if (part.type === 'meta') {
      provider = part.provider
      model = part.model
      skipped = part.skipped
      text = ''
    } else if (part.type === 'delta') text += part.text
    else text = ''
  }
  return { text, provider, model, skipped }
}
