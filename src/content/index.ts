import { useEffect, useState } from 'react'
import type { SubjectContent, SubjectId, Task, Topic } from '../domain/types'

/**
 * Контент грузится по предметам отдельными чанками: в первый экран попадает
 * только то, что ученик выбрал, остальное подтягивается при открытии.
 */
const LOADERS: Record<SubjectId, () => Promise<{ default: SubjectContent }>> = {
  math: () => import('./math'),
  rus: () => import('./rus'),
  bel: () => import('./bel'),
  phys: () => import('./phys'),
  chem: () => import('./chem'),
  bio: () => import('./bio'),
  hist: () => import('./hist'),
  soc: () => import('./soc'),
  geo: () => import('./geo'),
  eng: () => import('./eng'),
  deu: () => import('./deu'),
  fra: () => import('./fra'),
  spa: () => import('./spa'),
  chi: () => import('./chi'),
}

const cache = new Map<SubjectId, SubjectContent>()
const pending = new Map<SubjectId, Promise<SubjectContent>>()

export function loadSubject(id: SubjectId): Promise<SubjectContent> {
  const ready = cache.get(id)
  if (ready) return Promise.resolve(ready)
  let p = pending.get(id)
  if (!p) {
    p = LOADERS[id]().then((m) => {
      cache.set(id, m.default)
      pending.delete(id)
      return m.default
    })
    pending.set(id, p)
  }
  return p
}

export function cachedSubject(id: SubjectId): SubjectContent | undefined {
  return cache.get(id)
}

export function preloadSubjects(ids: SubjectId[]): void {
  for (const id of ids) loadSubject(id).catch(() => {})
}

export function useSubject(id: SubjectId | null | undefined): SubjectContent | null {
  const [content, setContent] = useState<SubjectContent | null>(() => (id ? (cache.get(id) ?? null) : null))
  const [loadedId, setLoadedId] = useState(id)
  if (loadedId !== id) {
    setLoadedId(id)
    setContent(id ? (cache.get(id) ?? null) : null)
  }
  useEffect(() => {
    if (!id || cache.has(id)) return
    let alive = true
    loadSubject(id).then((c) => alive && setContent(c))
    return () => {
      alive = false
    }
  }, [id])
  return content
}

/** Несколько предметов сразу (для главной и прогресса). */
export function useSubjects(ids: SubjectId[]): Partial<Record<SubjectId, SubjectContent>> {
  const key = ids.join(',')
  const [map, setMap] = useState<Partial<Record<SubjectId, SubjectContent>>>(() =>
    Object.fromEntries(ids.filter((i) => cache.has(i)).map((i) => [i, cache.get(i)!])),
  )
  useEffect(() => {
    let alive = true
    const list = key ? (key.split(',') as SubjectId[]) : []
    Promise.all(list.map((i) => loadSubject(i).then((c) => [i, c] as const))).then((entries) => {
      if (alive) setMap(Object.fromEntries(entries))
    })
    return () => {
      alive = false
    }
  }, [key])
  return map
}

export function topicById(content: SubjectContent | null | undefined, topicId: string): Topic | undefined {
  return content?.topics.find((t) => t.id === topicId)
}

export function tasksOfTopic(content: SubjectContent, topicId: string): Task[] {
  return content.tasks.filter((t) => t.topic === topicId)
}
