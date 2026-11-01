import { loadSubject } from '../content'
import type { SubjectId } from '../domain/types'
import { addDays, dayKey } from './format'
import { gradeFromAnswer } from './srs'
import {
  applyAttempt,
  DEFAULT_SETTINGS,
  EMPTY_CHAT,
  EMPTY_PROGRESS,
  type Attempt,
  type PersistedState,
  type Progress,
} from './store'

/**
 * Демо-профиль для показа на защите: «живая» история ученицы за ~7 недель,
 * чтобы аналитика, прогноз и повторения выглядели как у реального пользователя.
 * Детерминированный генератор — на каждом показе одна и та же картинка.
 */

function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Насколько «хорошо» демо-ученица знает тему: часть тем — явные пробелы. */
const SKILL: Record<string, number> = {
  'm.equations': 0.86,
  'm.numbers': 0.9,
  'm.algebra': 0.78,
  'm.functions': 0.7,
  'm.progressions': 0.74,
  'm.powers_logs': 0.42,
  'm.trig': 0.52,
  'm.planimetry': 0.6,
  'm.stereometry': 0.48,
  'm.word': 0.66,
  'm.inequalities': 0.62,
  'r.nn': 0.44,
  'r.ne': 0.58,
  'r.prefixes': 0.8,
  'r.punct_complex': 0.55,
  'r.punct_simple': 0.68,
  'r.orthoepy': 0.72,
  'p.kinematics': 0.84,
  'p.dynamics': 0.7,
  'p.optics': 0.38,
  'p.electrostatics': 0.5,
  'p.dc': 0.62,
}

const ERRORS: Attempt['err'][] = ['careless', 'knowledge', 'misapplied', 'calc', 'careless', 'misread']

export async function buildDemoState(now = new Date()): Promise<PersistedState> {
  const subjects: SubjectId[] = ['math', 'rus', 'phys']
  const contents = await Promise.all(subjects.map((s) => loadSubject(s)))
  const random = rng(20270527)
  let progress: Progress = { ...EMPTY_PROGRESS }
  const days = 46

  for (let d = days; d >= 0; d--) {
    // Пара пропусков в начале — серия идёт последние 23 дня, как у живого человека.
    if (d > 23 && random() < 0.28) continue
    const date = addDays(now, -d)
    const sessions = d === 0 ? 1 : 1 + Math.floor(random() * 2)
    for (let s = 0; s < sessions; s++) {
      const content = contents[Math.floor(random() * contents.length)]
      const count = 6 + Math.floor(random() * 9)
      for (let i = 0; i < count; i++) {
        const task = content.tasks[Math.floor(random() * content.tasks.length)]
        // Знания растут со временем — к концу периода точность выше.
        const growth = 0.12 * (1 - d / days)
        const skill = Math.min(0.95, (SKILL[task.topic] ?? 0.65) + growth)
        const ok = random() < skill
        const at = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 16 + s * 2, 5 + i * 2, Math.floor(random() * 50)).getTime()
        const sec = Math.round(25 + random() * 120)
        const attempt: Attempt = {
          id: task.id,
          s: task.subject,
          t: task.topic,
          ok,
          at,
          sec,
          lvl: task.level,
          mode: random() < 0.2 ? 'review' : 'practice',
          err: ok ? undefined : ERRORS[Math.floor(random() * ERRORS.length)],
        }
        progress = applyAttempt(progress, attempt, gradeFromAnswer({ correct: ok, usedHint: false, seconds: sec, expected: 70 }))
      }
    }
  }

  progress = {
    ...progress,
    mocks: [
      { id: 'demo-mock-1', subject: 'math', at: addDays(now, -12).getTime(), total: 12, correct: 7, seconds: 2880, estimate: 58 },
      { id: 'demo-mock-2', subject: 'math', at: addDays(now, -3).getTime(), total: 12, correct: 9, seconds: 2640, estimate: 71 },
      { id: 'demo-mock-3', subject: 'rus', at: addDays(now, -5).getTime(), total: 14, correct: 9, seconds: 1500, estimate: 63 },
    ],
    achievements: [...new Set([...progress.achievements, 'mock-1'])],
  }
  // Для красоты демо: сегодня уже сделано несколько заданий, серия «живая».
  progress.streak = { ...progress.streak, last: dayKey(now) }

  // Живой ученик повторял вовремя: к показу «созрело» около 18 карточек, остальные — позже.
  const due = Object.entries(progress.srs)
    .filter(([, c]) => new Date(c.due).getTime() <= now.getTime())
    .sort((a, b) => new Date(a[1].due).getTime() - new Date(b[1].due).getTime())
  const srs = { ...progress.srs }
  due.slice(18).forEach(([id, card], i) => {
    srs[id] = { ...card, due: addDays(now, 1 + (i % 9)).toISOString() }
  })
  progress.srs = srs

  return {
    version: 1,
    updatedAt: Date.now(),
    profile: {
      name: 'Аня',
      grade: '11',
      exam: 'both',
      subjects,
      targets: { math: 85, rus: 90, phys: 75 },
      dailyGoal: 20,
      onboarded: true,
    },
    settings: { ...DEFAULT_SETTINGS },
    progress,
    chat: {
      ...EMPTY_CHAT,
      subject: 'math',
      messages: [
        {
          id: 'demo-u1',
          role: 'user',
          content: 'Почему $\\log_2 8 + \\log_2 4$ не равно $\\log_2 12$?',
          at: addDays(now, -1).getTime(),
        },
        {
          id: 'demo-a1',
          role: 'assistant',
          content:
            'Хороший вопрос — это классическая ловушка ЦТ.\n\nСумма логарифмов с одинаковым основанием — это логарифм **произведения**, а не суммы:\n\n$$\\log_a x + \\log_a y = \\log_a (xy)$$\n\nПоэтому $\\log_2 8 + \\log_2 4 = \\log_2 32 = 5$. Проверим по-другому: $\\log_2 8 = 3$, $\\log_2 4 = 2$, а $3 + 2 = 5$ ✔️\n\nА $\\log_2 12 \\approx 3{,}58$ — совсем другое число.\n\n**Мини-проверка:** чему равно $\\log_3 18 - \\log_3 2$?',
          at: addDays(now, -1).getTime() + 20000,
          provider: 'demo',
        },
      ],
    },
    generated: {},
    demo: true,
  }
}
