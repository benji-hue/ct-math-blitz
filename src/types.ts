export const CATEGORIES = [
  'trigonometry',
  'stereometry',
  'planimetry',
  'functions_graphs',
  'powers_and_logs',
  'progressions',
] as const

export type Category = (typeof CATEGORIES)[number]

export type QuestionType = 'formula_choice' | 'graph_id' | 'true_false'

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

export interface Question {
  id: string
  category: Category
  type: QuestionType
  question: string
  options: string[]
  correct_index: number
  graph_spec: GraphSpec | null
  learning: Learning
}

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
}

export const TYPE_LABEL: Record<QuestionType, string> = {
  formula_choice: 'Формула',
  graph_id: 'График',
  true_false: 'Верно / Неверно',
}
