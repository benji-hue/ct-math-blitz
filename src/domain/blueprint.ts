import type { Block, SubjectId, Task } from './types'

/**
 * Чертёж варианта ЦЭ/ЦТ по спецификации РИКЗ 2026 (rikc.by/ru/specification/2026/04.pdf —
 * математика, 03.pdf — физика). В спецификации заданы:
 *  - 30 заданий: часть A — 10 (выбор одного или нескольких из пяти), часть B — 20;
 *  - сколько заданий из каждого раздела;
 *  - сколько заданий каждого уровня сложности (I–V).
 * Номера позиций РИКЗ не публикует, поэтому разделы и уровни расставлены так, как устроены
 * варианты РТ и ЦТ: часть A — уровни I–II, часть B — от II к V, самые трудные в конце.
 * Счётчики ниже совпадают со спецификацией — это проверяет тест.
 */

export interface Slot {
  /** «A1» … «B20». */
  id: string
  part: 'A' | 'B'
  block: Block
  level: Task['level']
}

export const BLOCK_TITLES: Record<Block, string> = {
  numbers: 'Числа и вычисления',
  expressions: 'Выражения и их преобразования',
  equations: 'Уравнения и неравенства',
  functions: 'Координаты и функции',
  geometry: 'Геометрия',
  mech: 'Механика',
  thermo: 'МКТ и термодинамика',
  electro: 'Электродинамика',
  optics: 'Оптика и СТО',
  quantum: 'Квантовая физика',
  nuclear: 'Атомное ядро',
}

function slots(rows: [Block, Task['level']][]): Slot[] {
  return rows.map(([block, level], i) => ({ id: i < 10 ? `A${i + 1}` : `B${i - 9}`, part: i < 10 ? 'A' : 'B', block, level }))
}

/** Математика: числа 4, выражения 4, уравнения 9, функции 5, геометрия 8; уровни 5/10/9/4/2. */
const MATH = slots([
  ['numbers', 1],
  ['geometry', 1],
  ['functions', 1],
  ['expressions', 1],
  ['equations', 1],
  ['numbers', 2],
  ['geometry', 2],
  ['functions', 2],
  ['expressions', 2],
  ['equations', 2],
  // Часть B
  ['numbers', 2],
  ['equations', 2],
  ['geometry', 2],
  ['equations', 2],
  ['functions', 2],
  ['expressions', 3],
  ['equations', 3],
  ['geometry', 3],
  ['equations', 3],
  ['numbers', 3],
  ['functions', 3],
  ['geometry', 3],
  ['equations', 3],
  ['expressions', 3],
  ['equations', 4],
  ['geometry', 4],
  ['functions', 4],
  ['geometry', 4],
  ['equations', 5],
  ['geometry', 5],
])

/** Физика: механика 10, МКТ и термодинамика 7, электродинамика 9, оптика 2, квантовая 1, ядро 1; уровни 5/10/10/4/1. */
const PHYS = slots([
  ['mech', 1],
  ['mech', 1],
  ['thermo', 1],
  ['electro', 1],
  ['optics', 1],
  ['mech', 2],
  ['thermo', 2],
  ['electro', 2],
  ['quantum', 2],
  ['nuclear', 2],
  // Часть B
  ['mech', 2],
  ['mech', 2],
  ['thermo', 2],
  ['electro', 2],
  ['optics', 2],
  ['mech', 3],
  ['mech', 3],
  ['mech', 3],
  ['thermo', 3],
  ['thermo', 3],
  ['electro', 3],
  ['electro', 3],
  ['electro', 3],
  ['mech', 3],
  ['electro', 3],
  ['mech', 4],
  ['thermo', 4],
  ['electro', 4],
  ['electro', 4],
  ['thermo', 5],
])

export const BLUEPRINTS: Partial<Record<SubjectId, Slot[]>> = { math: MATH, phys: PHYS }

/** Раздел спецификации для тем, у заданий которых он не указан явно. */
const TOPIC_BLOCK: Record<string, Block> = {
  'm.numbers': 'numbers',
  'm.word': 'numbers',
  'm.algebra': 'expressions',
  'm.powers_logs': 'expressions',
  'm.trig': 'expressions',
  'm.equations': 'equations',
  'm.inequalities': 'equations',
  'm.functions': 'functions',
  'm.progressions': 'functions',
  'm.derivative': 'functions',
  'm.planimetry': 'geometry',
  'm.stereometry': 'geometry',
  'p.kinematics': 'mech',
  'p.dynamics': 'mech',
  'p.statics': 'mech',
  'p.conservation': 'mech',
  'p.fluids': 'mech',
  'p.oscillations': 'mech',
  'p.molecular': 'thermo',
  'p.thermo': 'thermo',
  'p.electrostatics': 'electro',
  'p.dc': 'electro',
  'p.magnetism': 'electro',
  'p.induction': 'electro',
  'p.optics': 'optics',
  'p.quantum': 'quantum',
  'p.nuclear': 'nuclear',
}

export function blockOf(task: Task): Block | undefined {
  return task.block ?? TOPIC_BLOCK[task.topic]
}
