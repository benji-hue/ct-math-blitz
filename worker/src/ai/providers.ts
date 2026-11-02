import { list, type Env } from '../env'
import { createThinkFilter, extractDelta, readSse } from './sse'

/**
 * Провайдеры нейросетей с автоматическим переключением.
 *
 * Порядок задаёт AI_PROVIDERS. Если провайдер отказал ДО первого фрагмента
 * ответа (нет ключа, лимит, регион не поддерживается, модель снята), берём
 * следующий — ученик этого даже не заметит. По умолчанию работает
 * Cloudflare Workers AI: он не требует внешних ключей и не зависит от того,
 * в какой стране находится пользователь.
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
 * Модели Workers AI, доступные на бесплатном тарифе, в порядке качества по итогам
 * пробного варианта (docs/ПРОБНЫЙ-ВАРИАНТ.md). Qwen 3.8 понимает и фото решений.
 */
export const DEFAULT_WORKERS_MODELS = ['@cf/qwen/qwen3.8-27b', '@cf/openai/gpt-oss-120b', '@cf/meta/llama-4-scout-17b-16e-instruct']
export const DEFAULT_VISION_MODELS = ['@cf/qwen/qwen3.8-27b', '@cf/meta/llama-4-scout-17b-16e-instruct']
export const DEFAULT_GEMINI_MODELS = ['gemini-3.6-flash', 'gemini-3.5-flash-lite']

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
  if (/qwen3|glm-|kimi/.test(model)) return { chat_template_kwargs: { enable_thinking: input.reasoning === 'low' } }
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
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY ?? '' },
      signal,
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: input.system }] },
        contents,
        generationConfig: {
          temperature: input.temperature,
          maxOutputTokens: input.maxTokens,
          ...(input.json ? { responseMimeType: 'application/json' } : {}),
        },
      }),
    })
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

/** Провайдеры, для которых на сервере есть всё нужное (ключи, привязка AI). */
export function availableProviders(env: Env): string[] {
  return Object.values(PROVIDERS)
    .filter((p) => p.available(env))
    .map((p) => p.id)
}

export function providerChain(env: Env): Provider[] {
  const order = list(env.AI_PROVIDERS, ['workers-ai'])
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
export async function openStream(env: Env, input: ChatInput, signal?: AbortSignal, force?: ForcedModel): Promise<OpenedStream> {
  const errors: string[] = []
  let chain = providerChain(env)
  if (force) {
    const provider = PROVIDERS[force.provider]
    if (!provider || !provider.available(env)) throw new ProviderError(`Провайдер ${force.provider} не настроен на сервере`, 503)
    chain = [provider]
  }
  for (const provider of chain) {
    for (const model of force ? [force.model] : provider.models(env, input)) {
      if (!model) continue
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

export async function complete(
  env: Env,
  input: ChatInput,
  signal?: AbortSignal,
  force?: ForcedModel,
): Promise<{ text: string; provider: string; model: string; skipped: string[] }> {
  const stream = await openStream(env, input, signal, force)
  let text = ''
  for await (const chunk of stream.chunks) text += chunk
  return { text, provider: stream.provider, model: stream.model, skipped: stream.skipped }
}
