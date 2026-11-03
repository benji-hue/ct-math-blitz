import type { SubjectId, Task } from '../domain/types'
import { checkInput, normalizeAnswer } from './practice'

/**
 * Самостоятельная работа «как в школе РБ»: шкалы и отметка.
 *
 * Источник — Методические указания по организации контроля и оценки результатов
 * учебной деятельности учащихся (Минобразования РБ, 15.09.2022) к Правилам
 * аттестации, утверждённым постановлением № 184 от 11.07.2022. По математике,
 * физике, химии и биологии шкалы одинаковые (таблицы 2–5 соответствующих глав):
 *  - 5 заданий — по одному на уровень, баллы 2, 4, 6, 8, 10 (всего 30);
 *  - 10 заданий — по два на уровень, баллы 1…10 (всего 55).
 * По другим предметам нормы устроены иначе (диктанты, тесты), поэтому там
 * приложение показывает баллы, но не ставит отметку.
 */

export type SelfTestSize = 5 | 10

export const OFFICIAL_SUBJECTS: ReadonlySet<SubjectId> = new Set<SubjectId>(['math', 'phys', 'chem', 'bio'])

export const POINTS: Record<SelfTestSize, number[]> = {
  5: [2, 4, 6, 8, 10],
  10: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
}

export const MAX_POINTS: Record<SelfTestSize, number> = { 5: 30, 10: 55 }

/** Нижняя граница суммы баллов для отметок 1…10 (таблицы 3 и 5). */
const THRESHOLDS: Record<SelfTestSize, number[]> = {
  5: [1, 2, 3, 6, 9, 12, 15, 19, 24, 29],
  10: [1, 2, 5, 8, 13, 19, 26, 34, 43, 53],
}

/** Таблица перевода для экрана «Как считается»: «3–5 → 3». */
export function markTable(size: SelfTestSize): { range: string; mark: number }[] {
  const t = THRESHOLDS[size]
  return t.map((min, i) => {
    const max = i + 1 < t.length ? t[i + 1] - 1 : MAX_POINTS[size]
    return { range: min === max ? String(min) : `${min}–${max}`, mark: i + 1 }
  })
}

/** Сумма баллов округляется по правилам математического округления, затем переводится в отметку. */
export function markFor(points: number, size: SelfTestSize): number {
  const total = Math.round(points)
  let mark = 0
  THRESHOLDS[size].forEach((min, i) => {
    if (total >= min) mark = i + 1
  })
  return mark
}

export const LEVEL_NAMES = ['узнавание', 'воспроизведение', 'понимание', 'применение', 'применение в новой ситуации']

export function levelOf(size: SelfTestSize, index: number): number {
  return size === 5 ? index + 1 : Math.floor(index / 2) + 1
}

// ---------- Работа и её задания ----------

export interface SelfTestTask {
  n: number
  level: number
  points: number
  q: string
  options?: string[]
  /** Индекс верного варианта или краткий ответ. */
  answer: number | string
  solution: string
  /** Какая ошибка в задании — существенная. */
  check?: string
}

export interface SelfTest {
  title: string
  size: SelfTestSize
  tasks: SelfTestTask[]
  provider?: string
  model?: string
}

/** Ответ сервера → работа. Структуру сверяем с нормами: число заданий, уровни, баллы. */
export function sanitizeSelfTest(raw: unknown, size: SelfTestSize): SelfTest | null {
  const data = raw as { title?: unknown; tasks?: unknown; provider?: unknown; model?: unknown } | null
  if (!data || !Array.isArray(data.tasks) || data.tasks.length !== size) return null
  const tasks: SelfTestTask[] = []
  for (const [i, item] of (data.tasks as Record<string, unknown>[]).entries()) {
    const q = typeof item?.q === 'string' ? item.q.trim() : ''
    const solution = typeof item?.solution === 'string' ? item.solution : ''
    if (!q || !solution) return null
    const options = Array.isArray(item.options) ? item.options.filter((o): o is string => typeof o === 'string' && o.trim().length > 0) : undefined
    let answer: number | string
    if (options && options.length >= 3) {
      answer = Number(item.answer)
      if (!Number.isInteger(answer) || answer < 0 || answer >= options.length) return null
    } else {
      answer = String(item.answer ?? '').trim()
      if (!answer) return null
    }
    tasks.push({
      n: i + 1,
      level: levelOf(size, i),
      points: POINTS[size][i],
      q,
      ...(options && options.length >= 3 ? { options } : {}),
      answer,
      solution,
      ...(typeof item.check === 'string' && item.check.trim() ? { check: item.check.trim() } : {}),
    })
  }
  return {
    title: typeof data.title === 'string' && data.title.trim() ? data.title.trim() : 'Самостоятельная работа',
    size,
    tasks,
    provider: typeof data.provider === 'string' ? data.provider : undefined,
    model: typeof data.model === 'string' ? data.model : undefined,
  }
}

/**
 * Допустимые записи краткого ответа: ключ модели может прийти в LaTeX («$2{,}5$»),
 * с переменной («x = 3»), с единицами («12 см») или дробью («5/2»).
 */
export function acceptedAnswers(key: string): string[] {
  const out = new Set<string>()
  const raw = key.trim()
  if (raw) out.add(raw)
  const plain = raw
    .replace(/\$/g, '')
    .replace(/\{,\}/g, ',')
    .replace(/\\[,;!:]/g, '')
    .replace(/\\[dt]?frac\{([^{}]+)\}\{([^{}]+)\}/g, '$1/$2')
    .replace(/\\cdot/g, '·')
    .replace(/[{}]/g, '')
    .trim()
  if (plain) out.add(plain)
  const value = plain.replace(/^[a-zа-я]\s*=\s*/i, '')
  if (value) out.add(value)
  const withUnit = /^(-?\d+(?:[.,]\d+)?)\s*[a-zа-яё°%/²³·.\s]*$/i.exec(value)
  if (withUnit) out.add(withUnit[1])
  const fraction = /^(-?\d+)\s*\/\s*(\d+)$/.exec(value)
  if (fraction && Number(fraction[2]) !== 0) {
    const v = Number(fraction[1]) / Number(fraction[2])
    if (Number.isFinite(v) && Math.abs(v * 1e6 - Math.round(v * 1e6)) < 1e-6) out.add(String(v))
  }
  return [...out]
}

/** Ответ ученика без единиц: «12 см» → «12». */
function stripUnit(given: string): string {
  const m = /^\s*(-?\d+(?:[.,]\d+)?)\s*[a-zа-яё°%/²³·.\s]*$/i.exec(given)
  return m ? m[1] : given
}

export function checkSelfTestAnswer(task: SelfTestTask, given: number | string | null | undefined): boolean {
  if (given === null || given === undefined || given === '') return false
  if (task.options) return typeof given === 'number' && given === task.answer
  if (typeof given !== 'string' || !normalizeAnswer(given)) return false
  const accepted = acceptedAnswers(String(task.answer))
  return checkInput(given, accepted) || checkInput(stripUnit(given), accepted)
}

/** Задание самостоятельной в формате карточки приложения (TaskBody). */
export function toTask(task: SelfTestTask, subject: SubjectId, topicId: string, salt: string): Task {
  return {
    id: `st_${salt}_${task.n}`,
    subject,
    topic: topicId,
    part: task.options ? 'A' : 'B',
    level: Math.min(5, Math.max(1, task.level)) as Task['level'],
    kind: task.options ? 'choice' : 'input',
    q: task.q,
    ...(task.options ? { options: task.options } : {}),
    answer: task.options ? (task.answer as number) : acceptedAnswers(String(task.answer)),
    explain: task.solution,
    source: 'ai',
  }
}

// ---------- Итог ----------

export interface GradedTask {
  n: number
  seen: boolean
  points: number
  errors: { kind: 'существенная' | 'несущественная' | 'оформление'; text: string }[]
  comment: string
}

export interface GradeResult {
  tasks: GradedTask[]
  summary: string
}

export interface TaskScore {
  n: number
  max: number
  points: number
  /** answers — по ответу в приложении, photo — по проверке тетради. */
  source: 'answers' | 'photo'
}

/**
 * Баллы работы: по ответам — полный балл за верный ответ; если есть проверка
 * тетради по фото — для видимых на фото заданий её баллы (с частичным снижением).
 */
export function scoreSelfTest(test: SelfTest, correct: boolean[], photo?: GradeResult | null): { tasks: TaskScore[]; points: number; max: number; mark: number } {
  const byN = new Map((photo?.tasks ?? []).map((t) => [t.n, t]))
  const tasks = test.tasks.map((task, i) => {
    const graded = byN.get(task.n)
    if (graded?.seen) return { n: task.n, max: task.points, points: Math.min(task.points, Math.max(0, graded.points)), source: 'photo' as const }
    return { n: task.n, max: task.points, points: correct[i] ? task.points : 0, source: 'answers' as const }
  })
  const points = tasks.reduce((sum, t) => sum + t.points, 0)
  return { tasks, points, max: MAX_POINTS[test.size], mark: markFor(points, test.size) }
}

/** Уровни, на которых работа выполнена полностью: что уже получается. */
export function levelsDone(test: SelfTest, scores: TaskScore[]): number[] {
  const done: number[] = []
  for (let level = 1; level <= 5; level++) {
    const items = test.tasks.map((t, i) => ({ t, s: scores[i] })).filter((x) => x.t.level === level)
    if (items.length && items.every((x) => x.s.points >= x.s.max)) done.push(level)
  }
  return done
}
