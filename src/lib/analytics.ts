import type { ErrorType, SubjectContent, SubjectId, Topic } from '../domain/types'
import { addDays, dayKey } from './format'
import type { Attempt, Progress, TopicStat } from './store'

const DAY = 86_400_000

/**
 * Освоение темы «на сегодня»: без практики знание постепенно тускнеет.
 * Чем больше было повторений, тем медленнее — как кривая забывания Эббингауза.
 */
export function currentMastery(stat: TopicStat | undefined, now = Date.now()): number {
  if (!stat) return 0
  const days = Math.max(0, (now - stat.last) / DAY)
  const tau = 7 + 4 * Math.min(stat.n, 10)
  return stat.m * (0.6 + 0.4 * Math.exp(-days / tau))
}

export interface ScoreForecast {
  /** Точечная оценка, 0–100 */
  score: number
  low: number
  high: number
  /** Доля программы (по весу тем), где есть хотя бы 2 ответа */
  coverage: number
  /** Сколько ответов легло в основу прогноза */
  basis: number
}

/**
 * Прогноз тестового балла — модель приложения, а не официальная шкала РИКЗ:
 * взвешенное по темам спецификации освоение, неизученные темы считаются
 * слабыми (0.3), интервал неопределённости сужается с покрытием программы.
 * Если были пробные тесты за последний месяц, их результат подмешивается.
 */
export function forecast(subject: SubjectId, content: SubjectContent, progress: Progress, now = Date.now()): ScoreForecast {
  let weighted = 0
  let total = 0
  let covered = 0
  let basis = 0
  for (const topic of content.topics) {
    const stat = progress.topics[topic.id]
    const m = stat && stat.n > 0 ? currentMastery(stat, now) : 0.3
    weighted += topic.weight * m
    total += topic.weight
    if (stat && stat.n >= 2) covered += topic.weight
    basis += stat?.n ?? 0
  }
  let p = total > 0 ? weighted / total : 0
  const recentMocks = progress.mocks.filter((m) => m.subject === subject && now - m.at < 30 * DAY)
  if (recentMocks.length) {
    const mockAvg = recentMocks.reduce((s, m) => s + m.correct / Math.max(1, m.total), 0) / recentMocks.length
    p = 0.6 * p + 0.4 * mockAvg
  }
  const coverage = total > 0 ? covered / total : 0
  const score = Math.round(Math.min(100, Math.max(0, p * 100)))
  const spread = Math.round(4 + 18 * (1 - coverage))
  return {
    score,
    low: Math.max(0, score - spread),
    high: Math.min(100, score + spread),
    coverage,
    basis,
  }
}

export interface TopicRow {
  topic: Topic
  mastery: number
  n: number
  accuracy: number
}

export function topicRows(content: SubjectContent, progress: Progress, now = Date.now()): TopicRow[] {
  return content.topics.map((topic) => {
    const stat = progress.topics[topic.id]
    return {
      topic,
      mastery: currentMastery(stat, now),
      n: stat?.n ?? 0,
      accuracy: stat && stat.n ? stat.ok / stat.n : 0,
    }
  })
}

/** Слабые темы: есть ответы, освоение ниже порога — сначала самые важные. */
export function weakTopics(rows: TopicRow[], limit = 3): TopicRow[] {
  return rows
    .filter((r) => r.n >= 2 && r.mastery < 0.6)
    .sort((a, b) => a.mastery * (6 - a.topic.weight) - b.mastery * (6 - b.topic.weight))
    .slice(0, limit)
}

export function subjectMastery(content: SubjectContent, progress: Progress, now = Date.now()): number {
  let w = 0
  let t = 0
  for (const topic of content.topics) {
    w += topic.weight * currentMastery(progress.topics[topic.id], now)
    t += topic.weight
  }
  return t ? w / t : 0
}

// ---------- Ошибки ----------

export function errorBreakdown(attempts: Attempt[], subject?: SubjectId, days = 60, now = Date.now()): Record<ErrorType, number> {
  const out: Record<ErrorType, number> = { knowledge: 0, misapplied: 0, calc: 0, careless: 0, misread: 0, time: 0 }
  for (const a of attempts) {
    if (!a.err || a.ok) continue
    if (subject && a.s !== subject) continue
    if (now - a.at > days * DAY) continue
    out[a.err]++
  }
  return out
}

export function recentMistakes(attempts: Attempt[], subject?: SubjectId, limit = 8): Attempt[] {
  const out: Attempt[] = []
  const seen = new Set<string>()
  for (let i = attempts.length - 1; i >= 0 && out.length < limit; i--) {
    const a = attempts[i]
    if (a.ok || seen.has(a.id) || (subject && a.s !== subject)) continue
    seen.add(a.id)
    out.push(a)
  }
  return out
}

// ---------- Динамика ----------

export interface WeekPoint {
  label: string
  accuracy: number | null
  tasks: number
}

export function weeklyAccuracy(progress: Progress, weeks = 8, now = new Date()): WeekPoint[] {
  const out: WeekPoint[] = []
  for (let w = weeks - 1; w >= 0; w--) {
    let tasks = 0
    let ok = 0
    for (let d = 0; d < 7; d++) {
      const key = dayKey(addDays(now, -(w * 7 + d)))
      const day = progress.days[key]
      if (day) {
        tasks += day.tasks
        ok += day.ok
      }
    }
    const start = addDays(now, -(w * 7 + 6))
    out.push({
      label: `${start.getDate()}.${String(start.getMonth() + 1).padStart(2, '0')}`,
      accuracy: tasks ? ok / tasks : null,
      tasks,
    })
  }
  return out
}

export interface HeatCell {
  key: string
  tasks: number
  level: 0 | 1 | 2 | 3 | 4
  future: boolean
}

/** Тепловая карта активности: колонки — недели (пн–вс), как на GitHub. */
export function heatmap(progress: Progress, weeks = 16, now = new Date()): HeatCell[][] {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const mondayOffset = (today.getDay() + 6) % 7
  const start = addDays(today, -mondayOffset - (weeks - 1) * 7)
  const cols: HeatCell[][] = []
  for (let w = 0; w < weeks; w++) {
    const col: HeatCell[] = []
    for (let d = 0; d < 7; d++) {
      const date = addDays(start, w * 7 + d)
      const key = dayKey(date)
      const tasks = progress.days[key]?.tasks ?? 0
      const level = tasks === 0 ? 0 : tasks < 5 ? 1 : tasks < 15 ? 2 : tasks < 30 ? 3 : 4
      col.push({ key, tasks, level, future: date.getTime() > today.getTime() })
    }
    cols.push(col)
  }
  return cols
}

export function todayStats(progress: Progress, now = new Date()) {
  return progress.days[dayKey(now)] ?? { tasks: 0, ok: 0, xp: 0, sec: 0 }
}

/** Серия под угрозой: вчера занимались, сегодня — ещё нет. */
export function streakAtRisk(progress: Progress, now = new Date()): boolean {
  const today = dayKey(now)
  const yesterday = dayKey(addDays(now, -1))
  return progress.streak.last === yesterday && progress.streak.current > 0 && progress.streak.last !== today
}

export function liveStreak(progress: Progress, now = new Date()): number {
  const today = dayKey(now)
  const yesterday = dayKey(addDays(now, -1))
  return progress.streak.last === today || progress.streak.last === yesterday ? progress.streak.current : 0
}

// ---------- Уровни ----------

export function levelFromXp(xp: number): { level: number; into: number; need: number } {
  let level = 1
  let need = 120
  let rest = xp
  while (rest >= need) {
    rest -= need
    level++
    need = Math.round(need * 1.18)
  }
  return { level, into: rest, need }
}

export const ACHIEVEMENTS: Record<string, { title: string; description: string }> = {
  'first-step': { title: 'Первый крок', description: 'Решено первое задание' },
  'tasks-50': { title: 'Разгон', description: '50 заданий' },
  'tasks-300': { title: 'Марафонец', description: '300 заданий' },
  'streak-3': { title: 'Три дня подряд', description: 'Серия из 3 дней' },
  'streak-7': { title: 'Неделя без пропусков', description: 'Серия из 7 дней' },
  'streak-30': { title: 'Железная дисциплина', description: 'Серия из 30 дней' },
  'mock-1': { title: 'Генеральная репетиция', description: 'Пройден первый пробный тест' },
  comeback: { title: 'Работа над ошибками', description: 'Исправлена ошибка на повторении' },
}
