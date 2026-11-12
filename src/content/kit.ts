import type { SubjectId, Task, Topic } from '../domain/types'

type Level = Task['level']
type Extra = Partial<Pick<Task, 'hint' | 'trap' | 'graph' | 'block'>>

/** LaTeX без двойного экранирования: r`$\frac{a}{b}$`. */
export const r = String.raw

/**
 * Фабрики контента. В заданиях части A верный вариант пишется ПЕРВЫМ
 * (answer: 0) — так проще проверять банк глазами; на экране варианты
 * всё равно перемешиваются.
 */
export function kit(subject: SubjectId) {
  return {
    topic: (t: Omit<Topic, 'subject'>): Topic => ({ ...t, subject }),
    a: (id: string, topic: string, level: Level, q: string, options: string[], explain: string, extra: Extra = {}): Task => ({
      id: `${subject}.${id}`,
      subject,
      topic,
      part: 'A',
      level,
      kind: 'choice',
      q,
      options,
      answer: 0,
      explain,
      source: 'original',
      ...extra,
    }),
    /** Часть A с несколькими верными вариантами: correct — их индексы. */
    am: (id: string, topic: string, level: Level, q: string, options: string[], correct: number[], explain: string, extra: Extra = {}): Task => ({
      id: `${subject}.${id}`,
      subject,
      topic,
      part: 'A',
      level,
      kind: 'choice',
      q,
      options,
      answer: correct.slice().sort((x, y) => x - y),
      explain,
      source: 'original',
      ...extra,
    }),
    b: (id: string, topic: string, level: Level, q: string, answer: string[], explain: string, extra: Extra = {}): Task => ({
      id: `${subject}.${id}`,
      subject,
      topic,
      part: 'B',
      level,
      kind: 'input',
      q,
      answer,
      explain,
      source: 'original',
      ...extra,
    }),
  }
}
