import raw from '../data/ct_questions.json'
import type { Category, Question, RuntimeQuestion } from '../types'

export const ALL_QUESTIONS = raw as unknown as Question[]

export const QUESTIONS_BY_ID: Record<string, Question> = Object.fromEntries(
  ALL_QUESTIONS.map((q) => [q.id, q]),
)

/** Fisher–Yates, non-mutating. */
export function shuffle<T>(items: readonly T[]): T[] {
  const out = items.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/**
 * Shuffles the answer options. `true_false` items keep their natural
 * «Верно / Неверно» order — reordering them only confuses the reader.
 */
export function prepare(q: Question, isReview = false): RuntimeQuestion {
  const positions = q.options.map((_, i) => i)
  const order = q.type === 'true_false' ? positions : shuffle(positions)
  return {
    q,
    order,
    correctPos: order.indexOf(q.correct_index),
    isReview,
  }
}

export interface RoundOptions {
  size: number
  categories: Category[] | null
  /** ids the player has already mastered — deprioritised, not excluded */
  mastered?: Record<string, number>
}

/**
 * Builds a blitz round: questions are drawn evenly across the selected
 * categories, and items the player has not yet mastered come first.
 */
export function buildRound({ size, categories, mastered = {} }: RoundOptions): RuntimeQuestion[] {
  const pool = categories?.length
    ? ALL_QUESTIONS.filter((q) => categories.includes(q.category))
    : ALL_QUESTIONS

  const fresh = shuffle(pool.filter((q) => (mastered[q.id] ?? 0) < 2))
  const known = shuffle(pool.filter((q) => (mastered[q.id] ?? 0) >= 2))
  const ranked = [...fresh, ...known]

  // Round-robin over categories so one topic cannot dominate the round.
  const buckets = new Map<Category, Question[]>()
  for (const q of ranked) {
    const bucket = buckets.get(q.category)
    if (bucket) bucket.push(q)
    else buckets.set(q.category, [q])
  }

  const picked: Question[] = []
  const keys = shuffle([...buckets.keys()])
  while (picked.length < size) {
    let took = 0
    for (const key of keys) {
      if (picked.length >= size) break
      const bucket = buckets.get(key)
      const next = bucket?.shift()
      if (next) {
        picked.push(next)
        took++
      }
    }
    if (took === 0) break
  }

  return shuffle(picked).map((q) => prepare(q))
}

/** Seconds on the clock for a given question. */
export function secondsFor(q: Question): number {
  if (q.type === 'true_false') return 15
  if (q.type === 'graph_id') return 20
  return 18
}

export function comboMultiplier(streak: number): number {
  if (streak >= 8) return 3
  if (streak >= 5) return 2.5
  if (streak >= 3) return 2
  if (streak >= 2) return 1.5
  return 1
}

/**
 * Points for a correct first-try answer: base 100, scaled by the combo
 * multiplier and by how much of the clock is left. Review items are worth half.
 */
export function scoreFor(timeLeft: number, total: number, streak: number, isReview: boolean): number {
  const speed = 0.5 + 0.5 * Math.max(0, Math.min(1, timeLeft / total))
  const value = 100 * speed * comboMultiplier(streak)
  return Math.round((isReview ? value / 2 : value) / 5) * 5
}
