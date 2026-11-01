/**
 * Разбор потоков разных провайдеров в единый поток текстовых фрагментов.
 * Провайдеры отдают SSE в своих форматах:
 *  - Workers AI (старые модели): data: {"response":"…"}
 *  - OpenAI-совместимые (и новые модели Workers AI): data: {"choices":[{"delta":{"content":"…"}}]}
 *  - Gemini: data: {"candidates":[{"content":{"parts":[{"text":"…"}]}}]}
 */

export async function* readSse(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let index: number
      while ((index = buffer.search(/\r?\n\r?\n/)) !== -1) {
        const event = buffer.slice(0, index)
        buffer = buffer.slice(index).replace(/^\r?\n\r?\n/, '')
        const data = event
          .split(/\r?\n/)
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).trimStart())
          .join('\n')
        if (data) yield data
      }
    }
    const tail = buffer.trim()
    if (tail.startsWith('data:')) yield tail.slice(5).trimStart()
  } finally {
    reader.releaseLock()
  }
}

/** Достаёт текстовый фрагмент из события любого из известных форматов. */
export function extractDelta(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return ''
  const p = payload as {
    response?: unknown
    choices?: { delta?: { content?: unknown }; message?: { content?: unknown }; text?: unknown }[]
    candidates?: { content?: { parts?: { text?: unknown; thought?: boolean }[] } }[]
  }
  if (typeof p.response === 'string') return p.response
  const choice = p.choices?.[0]
  if (choice) {
    const content = choice.delta?.content ?? choice.message?.content ?? choice.text
    return typeof content === 'string' ? content : ''
  }
  const parts = p.candidates?.[0]?.content?.parts
  if (parts) return parts.filter((part) => !part.thought && typeof part.text === 'string').map((part) => part.text as string).join('')
  return ''
}

/**
 * Некоторые открытые модели (Qwen, DeepSeek-R1) пишут рассуждения внутри
 * <think>…</think>. Ученику они не нужны — вырезаем на лету, учитывая,
 * что тег может быть разрезан между фрагментами потока.
 */
export function createThinkFilter(): (chunk: string) => string {
  let inside = false
  let carry = ''
  return (chunk: string) => {
    let text = carry + chunk
    carry = ''
    let out = ''
    while (text) {
      if (inside) {
        const end = text.indexOf('</think>')
        if (end === -1) {
          carry = text.slice(-8)
          return out
        }
        text = text.slice(end + 8)
        inside = false
        continue
      }
      const start = text.indexOf('<think>')
      if (start === -1) {
        // хвост может оказаться началом тега: «<thi»
        const partial = text.lastIndexOf('<')
        if (partial !== -1 && '<think>'.startsWith(text.slice(partial))) {
          out += text.slice(0, partial)
          carry = text.slice(partial)
        } else {
          out += text
        }
        return out
      }
      out += text.slice(0, start)
      text = text.slice(start + 7)
      inside = true
    }
    return out
  }
}

/** JSON из ответа модели: снимает ```json-обёртку и берёт первый объект. */
export function parseJsonLoose(text: string): unknown {
  const cleaned = text
    .replace(/<think>[\s\S]*?<\/think>/g, '')
    .replace(/```(?:json)?/gi, '')
    .trim()
  try {
    return JSON.parse(cleaned)
  } catch {
    const start = cleaned.indexOf('{')
    const end = cleaned.lastIndexOf('}')
    if (start !== -1 && end > start) return JSON.parse(cleaned.slice(start, end + 1))
    throw new Error('Модель вернула не JSON')
  }
}
