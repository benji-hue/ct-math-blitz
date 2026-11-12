import type { Block, SubjectId, Task } from './types'

type Level = Task['level']

/**
 * Чертежи вариантов ЦЭ/ЦТ по спецификациям РИКЗ 2026 (rikc.by/ru/specification/2026/NN.pdf:
 * 01 русский, 02 белорусский, 03 физика, 04 математика, 05 химия, 06 биология,
 * 07–10 и 14 иностранные языки, 11 история, 12 обществоведение, 13 география).
 * В каждой спецификации заданы:
 *  - число заданий в частях A и B;
 *  - сколько заданий из каждого раздела программы;
 *  - сколько заданий каждого уровня сложности (I–V).
 * Номера позиций РИКЗ не публикует, поэтому разделы и уровни расставлены так, как устроены
 * варианты РТ и ЦТ: простые задания — в части A, трудные — в конце части B.
 * Счётчики совпадают со спецификациями — это проверяет тест.
 */

export interface Slot {
  /** «A1» … «B20». */
  id: string
  part: 'A' | 'B'
  block: Block
  level: Task['level']
  /** В задании несколько верных вариантов (часть A): русский и белорусский — все, химия — A1–A2. */
  multi?: boolean
}

export const BLOCK_TITLES: Record<string, string> = {
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

// ---------- Остальные предметы: чертёж строится из чисел спецификации ----------

interface Section {
  /** Раздел спецификации: id вида «ch.inorg». */
  block: Block
  title: string
  /** Заданий в варианте; для иностранных языков — отдельно по частям. */
  count: number
  a?: number
  /** Темы приложения, относящиеся к разделу. */
  topics: string[]
}

export interface Spec {
  partA: number
  partB: number
  /** Сколько заданий уровней I…V. */
  levels: [number, number, number, number, number]
  sections: Section[]
  /**
   * Часть A с несколькими верными вариантами: 'all' — все задания (русский и белорусский
   * языки), число — первые N позиций (химия: A1–A2), нет — как правило, один верный.
   */
  multiA?: 'all' | number
}

/** Делит n мест между разделами пропорционально их весу (метод наибольших остатков). */
function allot(weights: number[], n: number): number[] {
  const total = weights.reduce((x, y) => x + y, 0)
  const exact = weights.map((w) => (w * n) / total)
  const out = exact.map(Math.floor)
  const rest = exact.map((e, i) => ({ i, frac: e - out[i] })).sort((x, y) => y.frac - x.frac || x.i - y.i)
  for (let k = 0; out.reduce((x, y) => x + y, 0) < n; k++) out[rest[k % rest.length].i]++
  return out
}

/** Разделы по кругу — так в варианте они чередуются, а не идут блоками. */
function spread(blocks: Block[], counts: number[]): Block[] {
  const left = counts.slice()
  const out: Block[] = []
  while (left.some((c) => c > 0)) for (let i = 0; i < blocks.length; i++) if (left[i] > 0) (out.push(blocks[i]), left[i]--)
  return out
}

export function buildSlots(spec: Spec): Slot[] {
  const blocks = spec.sections.map((s) => s.block)
  const inA = spec.sections.some((s) => s.a !== undefined) ? spec.sections.map((s) => s.a ?? 0) : allot(spec.sections.map((s) => s.count), spec.partA)
  const inB = spec.sections.map((s, i) => s.count - inA[i])
  const order = [...spread(blocks, inA), ...spread(blocks, inB)]
  const levels = spec.levels.flatMap((n, i) => Array.from({ length: n }, () => (i + 1) as Level))
  const multi = (i: number) => i < spec.partA && (spec.multiA === 'all' || (typeof spec.multiA === 'number' && i < spec.multiA))
  return order.map((block, i) => ({
    id: i < spec.partA ? `A${i + 1}` : `B${i - spec.partA + 1}`,
    part: i < spec.partA ? 'A' : 'B',
    block,
    level: levels[i],
    ...(multi(i) ? { multi: true } : {}),
  }))
}

const LANG_LEVELS: Spec['levels'] = [2, 12, 12, 10, 4]

/** Иностранные языки: одна структура на все пять (спецификации 07–10, 14). */
function language(prefix: string, grammar: string[], culture: string, reading: string): Spec {
  return {
    partA: 18,
    partB: 22,
    levels: LANG_LEVELS,
    sections: [
      { block: `${prefix}.lexgram`, title: 'Лексика и грамматика', count: 34, a: 12, topics: grammar },
      { block: `${prefix}.culture`, title: 'Социокультурная компетенция', count: 2, a: 2, topics: [culture] },
      { block: `${prefix}.reading`, title: 'Чтение', count: 4, a: 4, topics: [reading] },
    ],
  }
}

export const SPECS: Partial<Record<SubjectId, Spec>> = {
  // Химия: 38 заданий; в спецификации два раздела без чисел — доля органики (около трети)
  // взята по вариантам РТ и ЦТ. В A1–A2 — два и более верных варианта.
  chem: {
    partA: 16,
    partB: 22,
    levels: [2, 10, 15, 9, 2],
    multiA: 2,
    sections: [
      { block: 'ch.inorg', title: 'Общая и неорганическая химия', count: 26, topics: ['c.basics', 'c.atom', 'c.bonding', 'c.reactions', 'c.solutions', 'c.redox', 'c.inorganic', 'c.metals', 'c.nonmetals'] },
      { block: 'ch.org', title: 'Органическая химия', count: 12, topics: ['c.hydrocarbons', 'c.organic_o', 'c.organic_n'] },
    ],
  },
  bio: {
    partA: 16,
    partB: 22,
    levels: [2, 12, 16, 7, 1],
    sections: [
      { block: 'bi.general', title: 'Общая биология', count: 22, topics: ['bi.cell', 'bi.metabolism', 'bi.division', 'bi.genetics', 'bi.evolution', 'bi.ecology'] },
      { block: 'bi.diversity', title: 'Многообразие органического мира', count: 10, topics: ['bi.plants', 'bi.animals', 'bi.microbes'] },
      { block: 'bi.man', title: 'Человек', count: 6, topics: ['bi.human'] },
    ],
  },
  rus: {
    partA: 18,
    partB: 22,
    levels: [4, 10, 16, 6, 4],
    multiA: 'all',
    sections: [
      { block: 'ru.orth', title: 'Орфография', count: 13, topics: ['r.vowels', 'r.prefixes', 'r.nn', 'r.ne', 'r.hyphen'] },
      { block: 'ru.punct', title: 'Пунктуация', count: 9, topics: ['r.punct_simple', 'r.punct_complex'] },
      { block: 'ru.lexis', title: 'Лексика', count: 2, topics: ['r.lexis'] },
      { block: 'ru.norms', title: 'Культура речи', count: 3, topics: ['r.orthoepy', 'r.norms'] },
      { block: 'ru.phon', title: 'Фонетика', count: 1, topics: ['r.phonetics'] },
      { block: 'ru.wordform', title: 'Состав слова. Образование слов', count: 2, topics: ['r.wordform'] },
      { block: 'ru.morph', title: 'Морфология', count: 4, topics: ['r.morph'] },
      { block: 'ru.syntax', title: 'Синтаксис', count: 3, topics: ['r.syntax'] },
      { block: 'ru.text', title: 'Текст. Стили речи', count: 3, topics: ['r.text'] },
    ],
  },
  bel: {
    partA: 18,
    partB: 22,
    levels: [4, 10, 16, 6, 4],
    multiA: 'all',
    sections: [
      { block: 'be.text', title: 'Маўленне. Тэкст. Стылістыка', count: 3, topics: ['b.text'] },
      { block: 'be.orth', title: 'Фанетыка і арфаэпія. Арфаграфія', count: 8, topics: ['b.akanne', 'b.u', 'b.doubling', 'b.soft', 'b.prefixes'] },
      { block: 'be.lexis', title: 'Лексіка. Фразеалогія', count: 2, topics: ['b.lexis'] },
      { block: 'be.wordform', title: 'Марфемная будова слова. Словаўтварэнне', count: 2, topics: ['b.wordform'] },
      { block: 'be.morph', title: 'Марфалогія і арфаграфія', count: 12, topics: ['b.endings', 'b.morph'] },
      { block: 'be.syntax', title: 'Сінтаксіс і пунктуацыя', count: 13, topics: ['b.punct', 'b.syntax'] },
    ],
  },
  hist: {
    partA: 16,
    partB: 22,
    levels: [2, 10, 16, 8, 2],
    sections: [
      { block: 'hi.s1', title: 'Древнейшие цивилизации. Догосударственный период', count: 2, topics: ['h.prehistory'] },
      { block: 'hi.s2', title: 'Раннее и Высокое средневековье. Первые государства', count: 4, topics: ['h.ancient'] },
      { block: 'hi.s3', title: 'Позднее средневековье. Беларусь в ВКЛ', count: 5, topics: ['h.gdl'] },
      { block: 'hi.s4', title: 'Раннее Новое время', count: 6, topics: ['h.renaissance', 'h.rp'] },
      { block: 'hi.s5', title: 'XIX — начало XX в.', count: 6, topics: ['h.empire'] },
      { block: 'hi.s6', title: '1917–1945 гг.', count: 5, topics: ['h.revolution', 'h.interwar', 'h.war'] },
      { block: 'hi.s7', title: 'Вторая половина 40-х — начало 90-х гг. XX в.', count: 2, topics: ['h.postwar'] },
      { block: 'hi.s8', title: 'Конец XX — первая четверть XXI в.', count: 4, topics: ['h.independence'] },
      { block: 'hi.all', title: 'Обобщающие задания', count: 4, topics: ['h.world'] },
    ],
  },
  soc: {
    partA: 16,
    partB: 22,
    levels: [2, 10, 16, 8, 2],
    sections: [
      { block: 'so.man', title: 'Человек. Общество. Культура', count: 7, topics: ['s.society', 's.person'] },
      { block: 'so.social', title: 'Социальная сфера', count: 5, topics: ['s.social'] },
      { block: 'so.spirit', title: 'Духовная сфера', count: 5, topics: ['s.culture'] },
      { block: 'so.econ', title: 'Экономическая сфера', count: 7, topics: ['s.economy'] },
      { block: 'so.polit', title: 'Политическая сфера', count: 5, topics: ['s.politics', 's.state_rb'] },
      { block: 'so.law', title: 'Право', count: 9, topics: ['s.law'] },
    ],
  },
  geo: {
    partA: 16,
    partB: 22,
    levels: [2, 12, 16, 7, 1],
    sections: [
      { block: 'ge.phys', title: 'Физическая география', count: 15, topics: ['g.maps', 'g.time', 'g.atmosphere', 'g.hydro', 'g.litho'] },
      { block: 'ge.world', title: 'Социально-экономическая и политическая география мира', count: 15, topics: ['g.population', 'g.world', 'g.economy'] },
      { block: 'ge.by', title: 'География Беларуси', count: 8, topics: ['g.belarus_nature', 'g.belarus_economy'] },
    ],
  },
  eng: language('en', ['e.tenses', 'e.passive', 'e.conditionals', 'e.modals', 'e.articles', 'e.prepositions', 'e.word_formation', 'e.gerund_inf', 'e.reported'], 'e.culture', 'e.reading'),
  deu: language('de', ['d.cases', 'd.verbs', 'd.word_order', 'd.adjectives'], 'd.culture', 'd.reading'),
  fra: language('fr', ['f.articles', 'f.tenses', 'f.pronouns', 'f.agreement'], 'f.culture', 'f.reading'),
  spa: language('es', ['sp.ser_estar', 'sp.past', 'sp.subjuntivo', 'sp.articles'], 'sp.culture', 'sp.reading'),
  chi: language('zh', ['zh.measure', 'zh.particles', 'zh.de', 'zh.basics'], 'zh.culture', 'zh.reading'),
}

for (const spec of Object.values(SPECS)) for (const s of spec.sections) BLOCK_TITLES[s.block] = s.title

/**
 * Предметы с готовым банком на каждую позицию варианта — у них пробник собирается по
 * спецификации. Предмет добавляется сюда, когда его банк закрывает весь чертёж (тест).
 */
export const BLUEPRINT_READY: SubjectId[] = ['math', 'phys', 'chem', 'bio', 'rus']

const ALL_BLUEPRINTS: Partial<Record<SubjectId, Slot[]>> = {
  math: MATH,
  phys: PHYS,
  ...Object.fromEntries(Object.entries(SPECS).map(([id, spec]) => [id, buildSlots(spec)])),
}

/** Чертежи всех предметов — для тестов и для подсказок ИИ. */
export const SPEC_BLUEPRINTS = ALL_BLUEPRINTS

export const BLUEPRINTS: Partial<Record<SubjectId, Slot[]>> = Object.fromEntries(BLUEPRINT_READY.map((id) => [id, ALL_BLUEPRINTS[id]!]))

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

for (const spec of Object.values(SPECS)) for (const s of spec.sections) for (const topic of s.topics) TOPIC_BLOCK[topic] = s.block

export function blockOf(task: Task): Block | undefined {
  return task.block ?? TOPIC_BLOCK[task.topic]
}
