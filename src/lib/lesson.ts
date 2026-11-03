import type { ChatMessage } from './store'

/** Текущий урок «Объясни мне это» — сообщения с конца чата, заданные в этом режиме. */
export function lessonSegment(messages: ChatMessage[]): ChatMessage[] {
  let start = messages.length
  while (start > 0 && messages[start - 1].mode === 'lesson') start--
  return messages.slice(start)
}

/** Частые темы-существительные женского рода на -у в винительном падеже: «теорему» → «теорема». */
const NOUN_STEMS = /^(теорем|формул|систем|задач|сил|работ|масс|таблиц|схем|величин|клетк|молекул|температур|точк|прям|фигур|призм|пирамид|окружност|последовательност)[уы]$/i

/**
 * Тема в вопросе стоит в винительном падеже («объясни квадратичную функцию»), а в заголовке
 * нужен именительный. Меняем только начало фразы: прилагательные на -ую/-юю и существительное
 * за ними (или первое существительное на -ию либо из частых); дальше — родительный падеж
 * («теорему синусов» → «теорема синусов»), его не трогаем.
 */
function nominative(phrase: string): string {
  const words = phrase.split(' ')
  let i = 0
  while (i < words.length && /[а-яё]{2,}(ую|юю)$/i.test(words[i])) {
    words[i] = words[i].replace(/ую$/i, 'ая').replace(/юю$/i, 'яя')
    i++
  }
  const noun = words[i]
  if (noun && /[а-яё]ию$/i.test(noun)) words[i] = noun.replace(/ию$/i, 'ия')
  else if (noun && (i > 0 || NOUN_STEMS.test(noun))) words[i] = noun.replace(/у$/i, 'а').replace(/ю$/i, 'я')
  return words.join(' ')
}

/** Тема самостоятельной из первой реплики урока: «Объясни мне квадратичную функцию?» → «Квадратичная функция». */
export function topicFromQuestion(text: string): string {
  const topic = nominative(
    text
      .replace(/^\s*(пожалуйста,?\s*)?(объясни(те)?|расскажи|что такое)[,:]?\s+(мне\s+)?(про\s+)?(тему\s+|параграф\s+)?/i, '')
      .replace(/[«»"]/g, '')
      .replace(/[?.!\s]+$/, '')
      .trim(),
  ).slice(0, 120)
  return topic.charAt(0).toUpperCase() + topic.slice(1)
}
