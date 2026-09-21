import { ALL_QUESTIONS, prepare, shuffle } from './questions'
import type { RuntimeQuestion } from '../types'

const KEY = 'ct-math-blitz:progress:v1'

export interface Progress {
  version: 1
  /** how many times the item has been shown */
  seen: Record<string, number>
  /** how many times it was answered correctly on the FIRST attempt */
  firstTry: Record<string, number>
  /** how many times it was missed (wrong answer or timeout) */
  missed: Record<string, number>
  bestScore: number
  bestStreak: number
  rounds: number
  totalAnswered: number
  totalFirstTryCorrect: number
}

export const EMPTY_PROGRESS: Progress = {
  version: 1,
  seen: {},
  firstTry: {},
  missed: {},
  bestScore: 0,
  bestStreak: 0,
  rounds: 0,
  totalAnswered: 0,
  totalFirstTryCorrect: 0,
}

/** Two clean first-try answers promote a formula to «Освоено». */
export const MASTERY_THRESHOLD = 2

export function loadProgress(): Progress {
  try {
    const stored = localStorage.getItem(KEY)
    if (!stored) return EMPTY_PROGRESS
    const parsed = JSON.parse(stored) as Partial<Progress>
    if (parsed.version !== 1) return EMPTY_PROGRESS
    return { ...EMPTY_PROGRESS, ...parsed }
  } catch {
    // Private mode, blocked storage, corrupted JSON — start fresh.
    return EMPTY_PROGRESS
  }
}

export function saveProgress(progress: Progress): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(progress))
  } catch {
    // Nothing to do: progress simply will not survive a reload.
  }
}

export function clearProgress(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // ignore
  }
}

function bump(map: Record<string, number>, id: string, by = 1): Record<string, number> {
  return { ...map, [id]: (map[id] ?? 0) + by }
}

export function recordAnswer(progress: Progress, id: string, firstTryCorrect: boolean): Progress {
  return {
    ...progress,
    seen: bump(progress.seen, id),
    firstTry: firstTryCorrect ? bump(progress.firstTry, id) : progress.firstTry,
    missed: firstTryCorrect ? progress.missed : bump(progress.missed, id),
    totalAnswered: progress.totalAnswered + 1,
    totalFirstTryCorrect: progress.totalFirstTryCorrect + (firstTryCorrect ? 1 : 0),
  }
}

export function finishRound(progress: Progress, score: number, bestStreak: number): Progress {
  return {
    ...progress,
    rounds: progress.rounds + 1,
    bestScore: Math.max(progress.bestScore, score),
    bestStreak: Math.max(progress.bestStreak, bestStreak),
  }
}

export function isMastered(progress: Progress, id: string): boolean {
  return (progress.firstTry[id] ?? 0) >= MASTERY_THRESHOLD
}

export function masteredCount(progress: Progress): number {
  return ALL_QUESTIONS.filter((q) => isMastered(progress, q.id)).length
}

export function unlockedCount(progress: Progress): number {
  return ALL_QUESTIONS.filter((q) => (progress.seen[q.id] ?? 0) > 0).length
}

/** Ids the player keeps getting wrong, worst first. */
export function mistakeBankIds(progress: Progress): string[] {
  return Object.entries(progress.missed)
    .filter(([id, count]) => count > 0 && !isMastered(progress, id))
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => id)
}

/** A round assembled purely from the player's own mistake bank. */
export function buildMistakeRound(progress: Progress, size: number): RuntimeQuestion[] {
  const ranked = mistakeBankIds(progress)
  const picked = ranked
    .map((id) => ALL_QUESTIONS.find((q) => q.id === id))
    .filter((q): q is NonNullable<typeof q> => Boolean(q))
    .slice(0, size)
  return shuffle(picked).map((q) => prepare(q))
}
