import { create } from 'zustand'
import { STORAGE_KEY } from '../config'
import type { ErrorType, SubjectId, Task } from '../domain/types'
import { addDays, dayKey, uid } from './format'
import { review, type Grade, type SrsCard } from './srs'

// ---------- Типы состояния ----------

export type ExamTrack = 'ce' | 'ct' | 'both'
export type Grade11 = '9' | '10' | '11' | 'grad'

export interface Profile {
  name: string
  grade: Grade11
  exam: ExamTrack
  subjects: SubjectId[]
  targets: Partial<Record<SubjectId, number>>
  /** Цель на день — сколько заданий. */
  dailyGoal: number
  onboarded: boolean
}

export interface Settings {
  theme: 'auto' | 'light' | 'dark'
  lite: 'auto' | 'on' | 'off'
  haptics: boolean
  reminders: boolean
  remindHour: number
}

export type AttemptMode = 'practice' | 'review' | 'mock' | 'ai'

export interface Attempt {
  /** id задания */
  id: string
  s: SubjectId
  /** id темы */
  t: string
  ok: boolean
  /** время ответа, epoch ms */
  at: number
  /** секунд на задание */
  sec: number
  lvl: number
  hint?: boolean
  err?: ErrorType
  mode: AttemptMode
  /** что ответил ученик — нужно для разбора ошибки ИИ */
  given?: string
}

export interface TopicStat {
  n: number
  ok: number
  /** освоение 0..1 (экспоненциальное среднее с учётом сложности) */
  m: number
  last: number
}

export interface DayStat {
  tasks: number
  ok: number
  xp: number
  sec: number
}

export interface MockResult {
  id: string
  subject: SubjectId
  at: number
  total: number
  correct: number
  seconds: number
  /** оценка в тестовых баллах по модели приложения */
  estimate: number
}

export type AiMode = 'tutor' | 'explain' | 'socratic' | 'check' | 'mistake' | 'plan' | 'calm'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  at: number
  /** Небольшое превью приложенного фото (data URL) */
  image?: string
  error?: boolean
  provider?: string
}

export interface ChatState {
  mode: AiMode
  subject: SubjectId | null
  topicId: string | null
  messages: ChatMessage[]
}

export interface Progress {
  attempts: Attempt[]
  srs: Record<string, SrsCard>
  topics: Record<string, TopicStat>
  days: Record<string, DayStat>
  xp: number
  streak: { current: number; best: number; last: string | null }
  mocks: MockResult[]
  achievements: string[]
}

export interface PersistedState {
  version: 1
  updatedAt: number
  profile: Profile
  settings: Settings
  progress: Progress
  chat: ChatState
  /** Задания, сгенерированные ИИ (их можно повторять наравне с банком). */
  generated: Record<string, Task>
  demo: boolean
}

// ---------- Значения по умолчанию ----------

export const DEFAULT_PROFILE: Profile = {
  name: '',
  grade: '11',
  exam: 'both',
  subjects: [],
  targets: {},
  dailyGoal: 15,
  onboarded: false,
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'auto',
  lite: 'auto',
  haptics: true,
  reminders: true,
  remindHour: 18,
}

export const EMPTY_PROGRESS: Progress = {
  attempts: [],
  srs: {},
  topics: {},
  days: {},
  xp: 0,
  streak: { current: 0, best: 0, last: null },
  mocks: [],
  achievements: [],
}

export const EMPTY_CHAT: ChatState = { mode: 'tutor', subject: null, topicId: null, messages: [] }

export function emptyState(): PersistedState {
  return {
    version: 1,
    updatedAt: 0,
    profile: DEFAULT_PROFILE,
    settings: DEFAULT_SETTINGS,
    progress: EMPTY_PROGRESS,
    chat: EMPTY_CHAT,
    generated: {},
    demo: false,
  }
}

const MAX_ATTEMPTS = 3000
const MAX_CHAT = 80
const MAX_GENERATED = 300

// ---------- Загрузка / сохранение ----------

/** Приводит произвольный JSON (старая версия, ручная правка) к ожидаемой форме. */
export function normalizeState(raw: unknown): PersistedState {
  const base = emptyState()
  if (!raw || typeof raw !== 'object') return base
  const s = raw as Partial<PersistedState>
  return {
    version: 1,
    updatedAt: typeof s.updatedAt === 'number' ? s.updatedAt : 0,
    profile: { ...base.profile, ...(s.profile ?? {}) },
    settings: { ...base.settings, ...(s.settings ?? {}) },
    progress: {
      ...base.progress,
      ...(s.progress ?? {}),
      streak: { ...base.progress.streak, ...(s.progress?.streak ?? {}) },
    },
    chat: { ...base.chat, ...(s.chat ?? {}) },
    generated: s.generated && typeof s.generated === 'object' ? s.generated : {},
    demo: Boolean(s.demo),
  }
}

function load(): PersistedState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? normalizeState(JSON.parse(raw)) : emptyState()
  } catch {
    return emptyState()
  }
}

let saveTimer: number | undefined

function scheduleSave(state: PersistedState): void {
  if (typeof window === 'undefined') return
  window.clearTimeout(saveTimer)
  saveTimer = window.setTimeout(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch {
      // приватный режим / переполнение — прогресс живёт до перезагрузки
    }
  }, 300)
}

// ---------- Чистые функции обновления прогресса ----------

export function xpFor(ok: boolean, level: number): number {
  return ok ? 10 + 5 * (level - 1) : 2
}

/** Освоение темы: ранние ответы двигают оценку сильнее, сложные задания весят больше. */
export function updateMastery(stat: TopicStat | undefined, ok: boolean, level: number, at: number): TopicStat {
  const prev = stat ?? { n: 0, ok: 0, m: 0.35, last: at }
  const alpha = Math.min(0.5, Math.max(0.12, 0.5 / Math.sqrt(prev.n + 1))) * (0.8 + 0.1 * level)
  const target = ok ? 1 : 0
  const m = Math.min(1, Math.max(0, prev.m + Math.min(0.9, alpha) * (target - prev.m)))
  return { n: prev.n + 1, ok: prev.ok + (ok ? 1 : 0), m: Math.round(m * 1000) / 1000, last: at }
}

export function updateStreak(streak: Progress['streak'], today: string): Progress['streak'] {
  if (streak.last === today) return streak
  const yesterday = dayKey(addDays(new Date(`${today}T12:00:00`), -1))
  const current = streak.last === yesterday ? streak.current + 1 : 1
  return { current, best: Math.max(streak.best, current), last: today }
}

const ACHIEVEMENT_RULES: { id: string; test: (p: Progress) => boolean }[] = [
  { id: 'first-step', test: (p) => p.attempts.length >= 1 },
  { id: 'tasks-50', test: (p) => p.attempts.length >= 50 },
  { id: 'tasks-300', test: (p) => p.attempts.length >= 300 },
  { id: 'streak-3', test: (p) => p.streak.best >= 3 },
  { id: 'streak-7', test: (p) => p.streak.best >= 7 },
  { id: 'streak-30', test: (p) => p.streak.best >= 30 },
  { id: 'mock-1', test: (p) => p.mocks.length >= 1 },
  { id: 'comeback', test: (p) => p.attempts.some((a) => a.mode === 'review' && a.ok) },
]

export function newAchievements(p: Progress): string[] {
  return ACHIEVEMENT_RULES.filter((r) => !p.achievements.includes(r.id) && r.test(p)).map((r) => r.id)
}

export function applyAttempt(progress: Progress, attempt: Attempt, grade: Grade): Progress {
  const today = dayKey(new Date(attempt.at))
  const day = progress.days[today] ?? { tasks: 0, ok: 0, xp: 0, sec: 0 }
  const gained = xpFor(attempt.ok, attempt.lvl)
  const attempts = [...progress.attempts, attempt]
  const next: Progress = {
    ...progress,
    attempts: attempts.length > MAX_ATTEMPTS ? attempts.slice(-MAX_ATTEMPTS) : attempts,
    srs: { ...progress.srs, [attempt.id]: review(progress.srs[attempt.id], grade, new Date(attempt.at)) },
    topics: { ...progress.topics, [attempt.t]: updateMastery(progress.topics[attempt.t], attempt.ok, attempt.lvl, attempt.at) },
    days: {
      ...progress.days,
      [today]: {
        tasks: day.tasks + 1,
        ok: day.ok + (attempt.ok ? 1 : 0),
        xp: day.xp + gained,
        sec: day.sec + Math.min(attempt.sec, 600),
      },
    },
    xp: progress.xp + gained,
    streak: updateStreak(progress.streak, today),
  }
  const earned = newAchievements(next)
  return earned.length ? { ...next, achievements: [...next.achievements, ...earned] } : next
}

// ---------- Стор ----------

interface Actions {
  completeOnboarding: (profile: Partial<Profile>) => void
  updateProfile: (patch: Partial<Profile>) => void
  updateSettings: (patch: Partial<Settings>) => void
  recordAttempt: (attempt: Omit<Attempt, 'at'> & { at?: number }, grade: Grade) => string[]
  classifyLast: (taskId: string, err: ErrorType) => void
  saveMock: (result: Omit<MockResult, 'id'>) => void
  setChat: (patch: Partial<ChatState>) => void
  pushMessage: (message: Omit<ChatMessage, 'id' | 'at'>) => string
  patchMessage: (id: string, patch: Partial<ChatMessage>) => void
  clearChat: () => void
  addGenerated: (tasks: Task[]) => void
  replaceState: (state: PersistedState) => void
  resetAll: () => void
}

export type Store = PersistedState & Actions

const DEMO_BACKUP_KEY = `${STORAGE_KEY}:backup`

export const useStore = create<Store>()((set, get) => {
  const touch = (patch: Partial<PersistedState>) => set({ ...patch, updatedAt: Date.now() })

  return {
    ...load(),

    completeOnboarding: (profile) =>
      touch({ profile: { ...get().profile, ...profile, onboarded: true } }),

    updateProfile: (patch) => touch({ profile: { ...get().profile, ...patch } }),

    updateSettings: (patch) => touch({ settings: { ...get().settings, ...patch } }),

    recordAttempt: (input, grade) => {
      const attempt: Attempt = { ...input, at: input.at ?? Date.now() }
      const before = get().progress.achievements
      const progress = applyAttempt(get().progress, attempt, grade)
      touch({ progress })
      return progress.achievements.filter((a) => !before.includes(a))
    },

    classifyLast: (taskId, err) => {
      const attempts = get().progress.attempts.slice()
      for (let i = attempts.length - 1; i >= 0; i--) {
        if (attempts[i].id === taskId) {
          attempts[i] = { ...attempts[i], err }
          break
        }
      }
      touch({ progress: { ...get().progress, attempts } })
    },

    saveMock: (result) => {
      const progress = get().progress
      const mocks = [...progress.mocks, { ...result, id: uid() }].slice(-50)
      const next = { ...progress, mocks }
      const earned = newAchievements(next)
      touch({ progress: earned.length ? { ...next, achievements: [...next.achievements, ...earned] } : next })
    },

    setChat: (patch) => touch({ chat: { ...get().chat, ...patch } }),

    pushMessage: (message) => {
      const id = uid()
      const messages = [...get().chat.messages, { ...message, id, at: Date.now() }].slice(-MAX_CHAT)
      touch({ chat: { ...get().chat, messages } })
      return id
    },

    patchMessage: (id, patch) => {
      const messages = get().chat.messages.map((m) => (m.id === id ? { ...m, ...patch } : m))
      // Во время стрима это вызывается на каждый фрагмент — не трогаем updatedAt.
      set({ chat: { ...get().chat, messages } })
    },

    clearChat: () => touch({ chat: { ...get().chat, messages: [] } }),

    addGenerated: (tasks) => {
      const generated = { ...get().generated }
      for (const t of tasks) generated[t.id] = t
      const ids = Object.keys(generated)
      if (ids.length > MAX_GENERATED) for (const id of ids.slice(0, ids.length - MAX_GENERATED)) delete generated[id]
      touch({ generated })
    },

    replaceState: (state) => set({ ...normalizeState(state), updatedAt: Date.now() }),

    resetAll: () => {
      try {
        localStorage.removeItem(DEMO_BACKUP_KEY)
      } catch {
        // ignore
      }
      set({ ...emptyState(), updatedAt: Date.now() })
    },
  }
})

/** Снимок только данных — без функций. */
export function snapshot(state: Store = useStore.getState()): PersistedState {
  const { version, updatedAt, profile, settings, progress, chat, generated, demo } = state
  return { version, updatedAt, profile, settings, progress, chat, generated, demo }
}

useStore.subscribe((state) => scheduleSave(snapshot(state)))

// ---------- Демо-режим для показа ----------

export function enterDemo(demoState: PersistedState): void {
  const current = snapshot()
  if (!current.demo) {
    try {
      localStorage.setItem(DEMO_BACKUP_KEY, JSON.stringify(current))
    } catch {
      // ignore
    }
  }
  useStore.getState().replaceState({ ...demoState, demo: true })
}

export function exitDemo(): void {
  let restored = emptyState()
  try {
    const raw = localStorage.getItem(DEMO_BACKUP_KEY)
    if (raw) restored = normalizeState(JSON.parse(raw))
    localStorage.removeItem(DEMO_BACKUP_KEY)
  } catch {
    // ignore
  }
  useStore.getState().replaceState({ ...restored, demo: false })
}
