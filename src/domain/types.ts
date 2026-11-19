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

/** Точка чертежа [x, y]; y растёт вверх, как на координатной плоскости. */
export type FigPoint = [number, number]

/** Подпись ставится с этой стороны от точки: n — сверху, se — снизу справа, c — по центру. */
export type FigPos = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw' | 'c'

/** Элемент чертежа. */
export type FigShape =
  /** Отрезок; ticks — штрихи равных отрезков. */
  | { line: [FigPoint, FigPoint]; dash?: boolean; bold?: boolean; ticks?: 1 | 2 }
  /** Ломаная или многоугольник; fill — закрашенная (штрихованная на бумаге) фигура. */
  | { poly: FigPoint[]; closed?: boolean; dash?: boolean; bold?: boolean; fill?: boolean }
  | { circle: FigPoint; r: number }
  | { dot: FigPoint }
  | { text: string; at: FigPoint; pos?: FigPos }
  /** Сектор круговой диаграммы: углы в градусах против часовой стрелки от оси x. */
  | { sector: FigPoint; r: number; from: number; to: number; text?: string }
  /** Ось или вектор со стрелкой на конце. */
  | { arrow: [FigPoint, FigPoint] }

/** Чертёж к заданию. Рисуется своим SVG-рендерером и подстраивается под тему оформления. */
export interface Figure {
  /** Видимая область: [xMin, yMin, xMax, yMax]. */
  view: [number, number, number, number]
  /** Клетчатый фон с шагом dx × dy (по умолчанию 1 × 1); area — где рисовать клетки (по умолчанию везде). */
  grid?: { dx?: number; dy?: number; area?: [number, number, number, number] }
  shapes: FigShape[]
  /** Что изображено — словами: для экранного диктора и для ИИ-репетитора, который рисунка не видит. */
  alt: string
}

/**
 * Раздел спецификации РИКЗ — по нему пробник собирается так же, как настоящий вариант.
 * Математика: numbers, expressions, equations, functions, geometry. Физика: mech, thermo,
 * electro, optics, quantum, nuclear. Остальные предметы — id вида «ch.inorg» (domain/blueprint.ts).
 */
export type Block = string

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
  /**
   * choice: индекс верного варианта или, если верных несколько (так бывает в части A
   * с 2026 года), — список индексов; input: список допустимых ответов.
   */
  answer: number | number[] | string[]
  /** Раздел спецификации; не задан — берётся по теме (domain/blueprint.ts). */
  block?: Block
  /** Полное решение / объяснение. */
  explain: string
  /** Первая подсказка — для режима «подскажи, но не решай». */
  hint?: string
  /** Ловушка, на которую рассчитан дистрактор. */
  trap?: string
  /** График к условию (рисуется своим SVG-рендерером). */
  graph?: GraphSpec | null
  /** Чертёж к условию: пирамида, развёртка, параллельные прямые, клетчатая плоскость. */
  figure?: Figure
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
