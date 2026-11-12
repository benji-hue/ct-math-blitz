import { blockOf, type Slot } from '../domain/blueprint'
import type { SubjectContent, Task } from '../domain/types'
import { isDue, type SrsCard } from './srs'
import type { Progress } from './store'

// ---------- Проверка ответа ----------

/** Латиница, похожая на кириллицу, — частая причина «неверных» верных ответов. */
const LOOKALIKE: Record<string, string> = {
  a: 'а',
  b: 'в',
  c: 'с',
  e: 'е',
  h: 'н',
  k: 'к',
  m: 'м',
  o: 'о',
  p: 'р',
  t: 'т',
  x: 'х',
  y: 'у',
}

export function normalizeAnswer(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[\s ]+/g, '')
    .replace(/[«»"'`]/g, '')
    .replace(/,/g, '.')
    .replace(/[−–—]/g, '-')
    .replace(/\.$/, '')
}

/** Для ответов вида «А1Б3В2» буквы приводим к кириллице, порядок пар не важен. */
function normalizePairs(s: string): string | null {
  const cyr = s.replace(/[abcehkmoptxy]/g, (ch) => LOOKALIKE[ch] ?? ch)
  const pairs = cyr.match(/[а-я]\d+/g)
  if (!pairs || pairs.join('') !== cyr) return null
  return pairs.sort().join('')
}

function asNumber(s: string): number | null {
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

export function checkInput(given: string, accepted: string[]): boolean {
  const g = normalizeAnswer(given)
  if (!g) return false
  for (const a of accepted) {
    const n = normalizeAnswer(a)
    if (g === n) return true
    const gn = asNumber(g)
    const an = asNumber(n)
    if (gn !== null && an !== null && Math.abs(gn - an) < 1e-9) return true
    const gp = normalizePairs(g)
    const ap = normalizePairs(n)
    if (gp && ap && gp === ap) return true
  }
  return false
}

/** Ответ ученика: вариант, несколько вариантов (часть A с несколькими верными) или текст. */
export type Given = number | number[] | string

/** В части A несколько верных вариантов — нужно отметить все и только их. */
export function isMulti(task: Task): boolean {
  return task.kind === 'choice' && Array.isArray(task.answer)
}

/** Индексы верных вариантов задания части A. */
export function correctOptions(task: Task): number[] {
  if (task.kind !== 'choice') return []
  return typeof task.answer === 'number' ? [task.answer] : (task.answer as number[])
}

export function isCorrect(task: Task, given: Given): boolean {
  if (task.kind === 'choice') {
    const right = correctOptions(task)
    const picked = typeof given === 'number' ? [given] : Array.isArray(given) ? given : []
    return picked.length === right.length && right.every((i) => picked.includes(i))
  }
  return typeof given === 'string' && Array.isArray(task.answer) && checkInput(given, task.answer as string[])
}

/** Текст ответа ученика — для истории и разбора ошибок. */
export function givenText(task: Task, given: Given | null | undefined): string {
  if (given === null || given === undefined) return ''
  if (typeof given === 'string') return given
  const list = typeof given === 'number' ? [given] : given
  return list.map((i) => task.options?.[i] ?? '').join('; ')
}

export function answerText(task: Task): string {
  if (task.kind === 'choice') return correctOptions(task).map((i) => task.options?.[i] ?? '').join('; ')
  return Array.isArray(task.answer) ? String(task.answer[0]) : ''
}

/** Ожидаемое время на задание (с) — для оценки «быстро/медленно» и темпа. */
export function expectedSeconds(task: Task, examMinutes: number, examTasks: number): number {
  const avg = (examMinutes * 60) / examTasks
  const byPart = task.part === 'A' ? 0.7 : 1.2
  const byLevel = 0.6 + task.level * 0.2
  return Math.round(avg * byPart * byLevel)
}

// ---------- Перемешивание ----------

export function shuffle<T>(items: readonly T[], random = Math.random): T[] {
  const out = items.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/** Задание с перемешанными вариантами для показа. */
export interface PreparedTask {
  task: Task
  /** позиция на экране → индекс варианта в task.options */
  order: number[]
  isReview: boolean
  /** Позиция в варианте по спецификации — «A3», «B17» (только в пробнике). */
  slot?: string
}

export function prepareTask(task: Task, isReview = false): PreparedTask {
  const n = task.options?.length ?? 0
  const keepOrder = task.options?.every((o) => /^(верно|неверно|да|нет|true|false)$/i.test(o.trim()))
  const positions = Array.from({ length: n }, (_, i) => i)
  return { task, order: keepOrder ? positions : shuffle(positions), isReview }
}

// ---------- Очередь практики ----------

export interface QueueOptions {
  size: number
  topicIds?: string[]
  /** только повторение */
  reviewOnly?: boolean
  now?: Date
}

/**
 * Собирает тренировку:
 *  1) задания, у которых подошёл срок повторения (FSRS), — самые просроченные первыми;
 *  2) новые задания из самых слабых тем;
 *  3) остальное — случайно.
 * Затем перемешивает так, чтобы одна тема не шла подряд (эффект чередования).
 */
export function buildQueue(
  content: SubjectContent,
  progress: Pick<Progress, 'srs' | 'topics'>,
  extra: Task[],
  opts: QueueOptions,
): PreparedTask[] {
  const now = opts.now ?? new Date()
  const pool = [...content.tasks, ...extra].filter((t) => !opts.topicIds?.length || opts.topicIds.includes(t.topic))
  const srs = progress.srs as Record<string, SrsCard | undefined>

  const due = pool
    .filter((t) => srs[t.id] && isDue(srs[t.id]!, now))
    .sort((a, b) => new Date(srs[a.id]!.due).getTime() - new Date(srs[b.id]!.due).getTime())

  if (opts.reviewOnly) return interleave(due.slice(0, opts.size)).map((t) => prepareTask(t, true))

  const mastery = (topicId: string) => progress.topics[topicId]?.m ?? 0.35
  // Задания в формате ЦТ идут раньше формул из блица; внутри — от слабых тем к сильным.
  const blitzLast = (t: Task) => (t.source === 'blitz' ? 1 : 0)
  const fresh = shuffle(pool.filter((t) => !srs[t.id])).sort(
    (a, b) => blitzLast(a) - blitzLast(b) || mastery(a.topic) - mastery(b.topic),
  )
  const seen = shuffle(pool.filter((t) => srs[t.id] && !isDue(srs[t.id]!, now)))

  const picked: { t: Task; review: boolean }[] = []
  const used = new Set<string>()
  const take = (list: Task[], review: boolean, limit: number) => {
    for (const t of list) {
      if (picked.length >= limit) break
      if (used.has(t.id)) continue
      used.add(t.id)
      picked.push({ t, review })
    }
  }
  // Не больше 60% тренировки — повторение, чтобы оставалось место новому.
  take(due, true, Math.ceil(opts.size * 0.6))
  take(fresh, false, opts.size)
  take(seen, false, opts.size)

  const reviewIds = new Set(picked.filter((p) => p.review).map((p) => p.t.id))
  return interleave(picked.map((p) => p.t)).map((t) => prepareTask(t, reviewIds.has(t.id)))
}

/** Переставляет так, чтобы соседние задания по возможности были из разных тем. */
export function interleave(tasks: Task[]): Task[] {
  const buckets = new Map<string, Task[]>()
  for (const t of tasks) {
    const b = buckets.get(t.topic)
    if (b) b.push(t)
    else buckets.set(t.topic, [t])
  }
  const out: Task[] = []
  let last: string | null = null
  while (out.length < tasks.length) {
    const candidates = [...buckets.entries()].filter(([, list]) => list.length > 0).sort((a, b) => b[1].length - a[1].length)
    const pick = candidates.find(([topic]) => topic !== last) ?? candidates[0]
    if (!pick) break
    out.push(pick[1].shift()!)
    last = pick[0]
  }
  return out
}

/** Какие позиции варианта взять в укороченный пробник: равномерно от A1 до последней. */
export function pickSlots(blueprint: Slot[], size: number): Slot[] {
  if (size >= blueprint.length) return blueprint
  if (size <= 1) return blueprint.slice(0, 1)
  const idx = new Set(Array.from({ length: size }, (_, i) => Math.round((i * (blueprint.length - 1)) / (size - 1))))
  return blueprint.filter((_, i) => idx.has(i))
}

/**
 * Вариант по спецификации: на каждую позицию — задание того же раздела, части и уровня.
 * Нет такого — того же раздела и части с ближайшим уровнем, затем той же части. Задания,
 * которые ученик ещё не решал (seen), идут первыми.
 */
export function buildBlueprintMock(content: SubjectContent, blueprint: Slot[], size: number, seen: ReadonlySet<string> = new Set()): PreparedTask[] {
  const pool = shuffle(content.tasks.filter((t) => t.source !== 'blitz'))
  const used = new Set<string>()
  const out: PreparedTask[] = []
  const fresh = (t: Task) => (seen.has(t.id) ? 1 : 0)
  for (const slot of pickSlots(blueprint, size)) {
    const free = pool.filter((t) => !used.has(t.id) && t.part === slot.part)
    const ranked = free
      .map((t) => ({ t, score: (blockOf(t) === slot.block ? 0 : 100) + Math.abs(t.level - slot.level) * 10 + fresh(t) }))
      .sort((x, y) => x.score - y.score)
    const pick = ranked[0]?.t
    if (!pick) continue
    used.add(pick.id)
    out.push({ ...prepareTask(pick), slot: slot.id })
  }
  return out
}

/** Пробный тест: пропорция частей A/B как в спецификации, сложность растёт к концу. */
export function buildMock(content: SubjectContent, size: number, partShareA: number): PreparedTask[] {
  // Формулы из блица — тренажёр, а не экзаменационный формат: в пробник не берём.
  const exam = content.tasks.filter((t) => t.source !== 'blitz')
  const wantA = Math.round(size * partShareA)
  const a = shuffle(exam.filter((t) => t.part === 'A')).slice(0, wantA)
  const b = shuffle(exam.filter((t) => t.part === 'B')).slice(0, size - a.length)
  const fill = shuffle(exam.filter((t) => !a.includes(t) && !b.includes(t))).slice(0, size - a.length - b.length)
  const byLevel = (x: Task, y: Task) => x.level - y.level
  return [...a.sort(byLevel), ...[...b, ...fill].sort(byLevel)].map((t) => prepareTask(t))
}

export function dueCount(progress: Pick<Progress, 'srs'>, now = new Date()): number {
  return Object.values(progress.srs).filter((c) => isDue(c, now)).length
}
