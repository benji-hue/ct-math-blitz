import { useEffect, useRef } from 'react'
import { create } from 'zustand'
import type { SubjectId } from '../domain/types'
import type { AiMode } from '../lib/store'
import type { TaskContext } from '../lib/ai'

export type Tab = 'today' | 'subjects' | 'tutor' | 'progress' | 'profile'

export type Route =
  | { name: 'today' }
  | { name: 'subjects' }
  | { name: 'tutor' }
  | { name: 'progress' }
  | { name: 'profile' }
  | { name: 'subject'; id: SubjectId }
  | { name: 'topic'; subject: SubjectId; topicId: string }
  | { name: 'practice'; subject: SubjectId; topicIds?: string[]; review?: boolean; size?: number; title?: string; generated?: boolean }
  | { name: 'mock'; subject: SubjectId }
  | { name: 'library'; subject?: SubjectId }
  | { name: 'calendar' }
  | { name: 'calm' }
  | { name: 'blitz' }
  | { name: 'generate'; subject: SubjectId; topicId: string }
  | { name: 'selftest'; subject: SubjectId | null; topic: string; topicId?: string | null }
  | { name: 'analysis' }
  | { name: 'achievements' }

export type RouteName = Route['name']

/** Экраны, на которых таб-бар прячется — полноэкранные сценарии. */
export const IMMERSIVE: ReadonlySet<RouteName> = new Set(['practice', 'mock', 'blitz', 'calm', 'generate', 'selftest'])

export interface StackEntry {
  key: string
  route: Route
}

interface NavState {
  /** Перехват «Назад» (системная кнопка Telegram, Android back): true — экран обработал сам. */
  guard: (() => boolean) | null
  setGuard: (guard: (() => boolean) | null) => void
  back: () => void
  tab: Tab
  stacks: Record<Tab, StackEntry[]>
  /** 1 — вглубь, -1 — назад, 0 — смена вкладки */
  direction: 1 | -1 | 0
  push: (route: Route) => void
  pop: () => void
  replace: (route: Route) => void
  switchTab: (tab: Tab) => void
  popToRoot: () => void
}

let counter = 0
const entry = (route: Route): StackEntry => ({ key: `${route.name}-${++counter}`, route })

const ROOTS: Record<Tab, StackEntry[]> = {
  today: [entry({ name: 'today' })],
  subjects: [entry({ name: 'subjects' })],
  tutor: [entry({ name: 'tutor' })],
  progress: [entry({ name: 'progress' })],
  profile: [entry({ name: 'profile' })],
}

export const useNav = create<NavState>()((set, get) => ({
  guard: null,
  setGuard: (guard) => set({ guard }),
  back: () => {
    const guard = get().guard
    if (guard && guard()) return
    get().pop()
  },
  tab: 'today',
  stacks: ROOTS,
  direction: 0,
  push: (route) => {
    const { tab, stacks } = get()
    set({ stacks: { ...stacks, [tab]: [...stacks[tab], entry(route)] }, direction: 1 })
  },
  pop: () => {
    const { tab, stacks } = get()
    if (stacks[tab].length <= 1) return
    set({ stacks: { ...stacks, [tab]: stacks[tab].slice(0, -1) }, direction: -1, guard: null })
  },
  replace: (route) => {
    const { tab, stacks } = get()
    set({ stacks: { ...stacks, [tab]: [...stacks[tab].slice(0, -1), entry(route)] }, direction: 1 })
  },
  switchTab: (tab) => {
    const { tab: current, stacks } = get()
    if (tab === current) {
      if (stacks[tab].length > 1) set({ stacks: { ...stacks, [tab]: stacks[tab].slice(0, 1) }, direction: -1 })
      return
    }
    set({ tab, direction: 0 })
  },
  popToRoot: () => {
    const { tab, stacks } = get()
    set({ stacks: { ...stacks, [tab]: stacks[tab].slice(0, 1) }, direction: -1 })
  },
}))

export function currentEntry(state: NavState = useNav.getState()): StackEntry {
  const stack = state.stacks[state.tab]
  return stack[stack.length - 1]
}

// ---------- Переход в ИИ-репетитора из любого места ----------

export interface TutorIntent {
  mode: AiMode
  subject?: SubjectId | null
  topicId?: string | null
  /** Сообщение, которое сразу отправится от имени ученика. */
  prompt?: string
  /** Задание, по которому нужен разбор. */
  task?: TaskContext
  /** Открыть выбор фото. */
  photo?: boolean
}

interface TutorBus {
  intent: TutorIntent | null
  /** Вкладка, откуда пришли «Разобрать с ИИ», — чтобы вернуться к заданию. */
  returnTo: Tab | null
  clearReturn: () => void
  open: (intent: TutorIntent) => void
  consume: () => TutorIntent | null
}

export const useTutorBus = create<TutorBus>()((set, get) => ({
  intent: null,
  returnTo: null,
  clearReturn: () => set({ returnTo: null }),
  open: (intent) => {
    const from = useNav.getState().tab
    set({ intent, returnTo: from !== 'tutor' && intent.task ? from : null })
    useNav.getState().switchTab('tutor')
    const nav = useNav.getState()
    if (nav.stacks.tutor.length > 1) nav.popToRoot()
  },
  consume: () => {
    const intent = get().intent
    if (intent) set({ intent: null })
    return intent
  },
}))

/** Экран регистрирует свой обработчик «Назад» на время жизни. */
// ---------- Урок «Объясни мне это» → самостоятельная ----------

/**
 * Что передать в самостоятельную из урока: фото параграфа (полное, а не превью)
 * и что объяснял ИИ. Живёт только в памяти: фото не сохраняется на устройстве.
 */
export interface LessonContext {
  image: { mime: string; data: string; preview: string } | null
  lesson: string
}

export const useLessonBus = create<{ context: LessonContext | null; set: (context: LessonContext | null) => void }>()((set) => ({
  context: null,
  set: (context) => set({ context }),
}))

export function useBackGuard(guard: () => boolean): void {
  const ref = useRef(guard)
  useEffect(() => {
    ref.current = guard
  })
  useEffect(() => {
    const handler = () => ref.current()
    useNav.getState().setGuard(handler)
    return () => {
      if (useNav.getState().guard === handler) useNav.getState().setGuard(null)
    }
  }, [])
}
