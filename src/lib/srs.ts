import { createEmptyCard, fsrs, Rating, State, type Card, type Grade as FsrsGrade } from 'ts-fsrs'

/**
 * Интервальные повторения на алгоритме FSRS (тот же, что в Anki с 23.10).
 *
 * Каждое задание, которое ученик хоть раз решал, превращается в «карточку».
 * Алгоритм оценивает, насколько прочно ученик помнит материал, и назначает
 * следующее повторение ровно тогда, когда вероятность вспомнить падает до 90%.
 * Карточки храним в компактном виде (ISO-строки вместо Date) — так они
 * без потерь переживают JSON и синхронизацию через CloudStorage.
 */

export interface SrsCard {
  due: string
  stability: number
  difficulty: number
  scheduled_days: number
  learning_steps: number
  reps: number
  lapses: number
  state: number
  last_review?: string
}

const scheduler = fsrs({ request_retention: 0.9, maximum_interval: 365, enable_fuzz: true })

function toCard(c: SrsCard): Card {
  return {
    due: new Date(c.due),
    stability: c.stability,
    difficulty: c.difficulty,
    scheduled_days: c.scheduled_days,
    learning_steps: c.learning_steps,
    reps: c.reps,
    lapses: c.lapses,
    state: c.state as State,
    last_review: c.last_review ? new Date(c.last_review) : undefined,
  } as Card
}

function fromCard(c: Card): SrsCard {
  return {
    due: c.due.toISOString(),
    stability: Math.round(c.stability * 1000) / 1000,
    difficulty: Math.round(c.difficulty * 1000) / 1000,
    scheduled_days: c.scheduled_days,
    learning_steps: c.learning_steps,
    reps: c.reps,
    lapses: c.lapses,
    state: c.state,
    last_review: c.last_review ? c.last_review.toISOString() : undefined,
  }
}

export type Grade = 'again' | 'hard' | 'good' | 'easy'

const RATING: Record<Grade, FsrsGrade> = {
  again: Rating.Again,
  hard: Rating.Hard,
  good: Rating.Good,
  easy: Rating.Easy,
}

/**
 * Оценка ответа по поведению, без лишних вопросов ученику:
 * ошибка — «снова»; верно, но с подсказкой или очень медленно — «трудно»;
 * быстро и уверенно — «легко»; иначе — «хорошо».
 */
export function gradeFromAnswer(opts: { correct: boolean; usedHint: boolean; seconds: number; expected: number }): Grade {
  if (!opts.correct) return 'again'
  if (opts.usedHint || opts.seconds > opts.expected * 1.6) return 'hard'
  if (opts.seconds < opts.expected * 0.45) return 'easy'
  return 'good'
}

export function review(card: SrsCard | undefined, grade: Grade, now = new Date()): SrsCard {
  const base = card ? toCard(card) : createEmptyCard(now)
  const result = scheduler.next(base, now, RATING[grade])
  return fromCard(result.card)
}

export function isDue(card: SrsCard, now = new Date()): boolean {
  return new Date(card.due).getTime() <= now.getTime()
}

/** Вероятность вспомнить прямо сейчас (0..1). */
export function retrievability(card: SrsCard, now = new Date()): number {
  if (card.state === State.New) return 0
  try {
    return scheduler.retrievability(toCard(card), now)
  } catch {
    return 0
  }
}

