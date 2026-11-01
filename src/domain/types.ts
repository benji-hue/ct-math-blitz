import type { GraphSpec } from '../types'

export const SUBJECT_IDS = [
  'math',
  'rus',
  'bel',
  'phys',
  'chem',
  'bio',
  'hist',
  'soc',
  'geo',
  'eng',
  'deu',
  'fra',
  'spa',
  'chi',
] as const

export type SubjectId = (typeof SUBJECT_IDS)[number]

export type ExamKind = 'ce' | 'ct'

/** Раздел программы вступительных испытаний (спецификации РИКЗ). */
export interface Topic {
  id: string
  subject: SubjectId
  title: string
  /** Раздел программы, к которому относится тема. */
  section: string
  /** Примерная доля темы в тесте, 1–5 (используется в прогнозе балла). */
  weight: number
  /** Коротко о главном — Markdown + LaTeX. */
  summary: string
  /** Опорные факты и формулы — то, что ИИ получает как справочный материал. */
  facts: string[]
  /** Типичные ловушки составителей и ошибки учеников. */
  traps: string[]
  /** Дополнительные слова для поиска (синонимы, термины). */
  keywords?: string[]
}

export type TaskKind = 'choice' | 'input'

/**
 * Задание в формате ЦТ/ЦЭ.
 * Часть A — выбор одного из вариантов, часть B — краткий ответ (число, слово,
 * последовательность вида «А2Б1В3»).
 */
export interface Task {
  id: string
  subject: SubjectId
  topic: string
  part: 'A' | 'B'
  /** Уровень сложности по шкале РИКЗ: I–V. */
  level: 1 | 2 | 3 | 4 | 5
  kind: TaskKind
  q: string
  options?: string[]
  /** choice: индекс верного варианта; input: список допустимых ответов. */
  answer: number | string[]
  /** Полное решение / объяснение. */
  explain: string
  /** Первая подсказка — для режима «подскажи, но не решай». */
  hint?: string
  /** Ловушка, на которую рассчитан дистрактор. */
  trap?: string
  /** График к условию (рисуется своим SVG-рендерером). */
  graph?: GraphSpec | null
  /** original — задания проекта, blitz — формулы из блица, ai — сгенерированы ИИ */
  source?: 'original' | 'blitz' | 'ai'
}

export interface SubjectContent {
  topics: Topic[]
  tasks: Task[]
}

export type ErrorType = 'knowledge' | 'misapplied' | 'calc' | 'careless' | 'misread' | 'time'

export const ERROR_TYPES: Record<ErrorType, { label: string; hint: string }> = {
  knowledge: { label: 'Не знал правило', hint: 'Пробел в теории — вернуться к конспекту темы' },
  misapplied: { label: 'Знал, но применил не так', hint: 'Разобрать условия применения правила' },
  calc: { label: 'Ошибка в вычислениях', hint: 'Проверка ответа подстановкой и оценкой' },
  careless: { label: 'Невнимательность', hint: 'Подчёркивать, что именно спрашивают' },
  misread: { label: 'Не понял условие', hint: 'Переформулировать условие своими словами' },
  time: { label: 'Не хватило времени', hint: 'Тренировать темп на пробниках' },
}
