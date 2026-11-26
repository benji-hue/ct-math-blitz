export const CATEGORIES = [
  'trigonometry',
  'stereometry',
  'planimetry',
  'functions_graphs',
  'powers_and_logs',
  'progressions',
] as const

export type MathCategory = (typeof CATEGORIES)[number]
export type GrammarCategory = 'parts_of_speech' | 'words_in_context' | 'phrase_types'
export type Category = MathCategory | GrammarCategory
export type BlitzSubject = 'math' | 'rus'

type MathQuestionType = 'formula_choice' | 'graph_id' | 'true_false'

export type GraphType = 'parabola' | 'hyperbola' | 'linear' | 'trig'

export interface GraphView {
  xMin: number
  xMax: number
  yMin: number
  yMax: number
}

export interface GraphParams {
  /** parabola: y = ax² + bx + c */
  a?: number
  b?: number
  c?: number
  /** linear: y = kx + b · hyperbola: y = k/(x - shiftX) + shiftY · trig: y = A·fn(kx + phase) + shift */
  k?: number
  shiftX?: number
  shiftY?: number
  fn?: 'sin' | 'cos'
  A?: number
  phase?: number
  shift?: number
  view?: GraphView
}

export interface GraphSpec {
  type: GraphType
  params: GraphParams
}

export interface Learning {
  rule: string
  common_trap: string
  mnemonic: string | null
}

export interface Example {
  /** условие простой задачи на то же правило */
  task: string
  /** решение по шагам: каждый шаг — отдельная строка */
  solution: string[]
  answer: string
}

interface QuestionData {
  id: string
  question: string
  options: string[]
  correct_index: number
  graph_spec: GraphSpec | null
  learning: Learning
}

export interface MathQuestion extends QuestionData {
  category: MathCategory
  type: MathQuestionType
  example: Example
}

export interface GrammarQuestion extends QuestionData {
  category: GrammarCategory
  type: 'grammar'
}

export type Question = MathQuestion | GrammarQuestion

/** A question with its options shuffled for this particular round. */
export interface RuntimeQuestion {
  q: Question
  /** display position -> index in `q.options` */
  order: number[]
  /** display position of the correct option */
  correctPos: number
  /** true when the item is being re-tested in the mistake round */
  isReview: boolean
}

export const CATEGORY_META: Record<Category, { label: string; short: string; accent: string }> = {
  trigonometry: { label: 'Тригонометрия', short: 'Тригонометрия', accent: '#f472b6' },
  stereometry: { label: 'Стереометрия', short: 'Стереометрия', accent: '#38bdf8' },
  planimetry: { label: 'Планиметрия', short: 'Планиметрия', accent: '#34d399' },
  functions_graphs: { label: 'Функции и графики', short: 'Графики', accent: '#fbbf24' },
  powers_and_logs: { label: 'Степени и логарифмы', short: 'Логарифмы', accent: '#a78bfa' },
  progressions: { label: 'Прогрессии', short: 'Прогрессии', accent: '#fb923c' },
  parts_of_speech: { label: 'Части речи', short: 'Части речи', accent: '#38bdf8' },
  words_in_context: { label: 'Слова в контексте', short: 'Слова в контексте', accent: '#a78bfa' },
  phrase_types: { label: 'Обороты', short: 'Обороты', accent: '#34d399' },
}

export const TYPE_LABEL: Record<MathQuestionType, string> = {
  formula_choice: 'Формула',
  graph_id: 'График',
  true_false: 'Верно / Неверно',
}
