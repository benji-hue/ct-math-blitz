import type { ChatMessage } from './store'

/** Текущий урок «Объясни мне это» — сообщения с конца чата, заданные в этом режиме. */
export function lessonSegment(messages: ChatMessage[]): ChatMessage[] {
  let start = messages.length
  while (start > 0 && messages[start - 1].mode === 'lesson') start--
  return messages.slice(start)
}
