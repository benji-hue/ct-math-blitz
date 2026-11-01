import { describe, expect, it } from 'vitest'
import { loadSubject } from '../content'
import { SUBJECTS } from '../domain/subjects'
import { SOURCES } from '../domain/sources'
import { CALENDAR } from '../domain/calendar'
import { SUBJECT_IDS, type SubjectContent } from '../domain/types'

/**
 * Проверка всего банка заданий — то, что ловит опечатки до того,
 * как их увидит ученик (или жюри).
 */

const all: [string, SubjectContent][] = await Promise.all(SUBJECT_IDS.map(async (id) => [id, await loadSubject(id)] as [string, SubjectContent]))

function balancedDollars(text: string): boolean {
  return (text.replace(/\\\$/g, '').match(/\$/g)?.length ?? 0) % 2 === 0
}

describe('контент предметов', () => {
  it('у каждого из 14 предметов есть темы и задания', () => {
    expect(all).toHaveLength(14)
    for (const [id, c] of all) {
      expect(c.topics.length, id).toBeGreaterThanOrEqual(4)
      expect(c.tasks.length, id).toBeGreaterThanOrEqual(6)
    }
  })

  it('id заданий и тем уникальны глобально', () => {
    const taskIds = all.flatMap(([, c]) => c.tasks.map((t) => t.id))
    const topicIds = all.flatMap(([, c]) => c.topics.map((t) => t.id))
    expect(new Set(taskIds).size).toBe(taskIds.length)
    expect(new Set(topicIds).size).toBe(topicIds.length)
  })

  for (const [id, content] of all) {
    describe(SUBJECTS[id as keyof typeof SUBJECTS].short, () => {
      const topicIds = new Set(content.topics.map((t) => t.id))

      it('темы заполнены', () => {
        for (const t of content.topics) {
          expect(t.subject, t.id).toBe(id)
          expect(t.weight, t.id).toBeGreaterThanOrEqual(1)
          expect(t.weight, t.id).toBeLessThanOrEqual(5)
          expect(t.summary.length, t.id).toBeGreaterThan(20)
          expect(t.facts.length, t.id).toBeGreaterThanOrEqual(2)
          for (const text of [t.summary, ...t.facts, ...t.traps]) expect(balancedDollars(text), `${t.id}: ${text}`).toBe(true)
          // Управляющие символы — признак потерянного экранирования (\f, \t в LaTeX).
          for (const text of [t.summary, ...t.facts, ...t.traps]) expect(/[\f\t\v\b]/.test(text), `${t.id}: ${JSON.stringify(text)}`).toBe(false)
        }
      })

      it('задания корректны', () => {
        for (const task of content.tasks) {
          expect(task.subject, task.id).toBe(id)
          expect(topicIds.has(task.topic), `${task.id} → ${task.topic}`).toBe(true)
          expect(task.q.trim().length, task.id).toBeGreaterThan(3)
          expect(task.explain.trim().length, task.id).toBeGreaterThan(3)
          for (const text of [task.q, task.explain, task.hint ?? '', task.trap ?? '', ...(task.options ?? [])]) {
            expect(balancedDollars(text), `${task.id}: ${text}`).toBe(true)
            expect(/[\f\v\b]/.test(text), `${task.id}: ${JSON.stringify(text)}`).toBe(false)
          }
          if (task.kind === 'choice') {
            expect(Array.isArray(task.options), task.id).toBe(true)
            expect(task.options!.length, task.id).toBeGreaterThanOrEqual(2)
            expect(typeof task.answer, task.id).toBe('number')
            expect(task.answer as number, task.id).toBeLessThan(task.options!.length)
            expect(new Set(task.options).size, `${task.id}: повторяющиеся варианты`).toBe(task.options!.length)
          } else {
            expect(Array.isArray(task.answer) && task.answer.length > 0, task.id).toBe(true)
          }
        }
      })
    })
  }

  it('у собственных заданий части A верный вариант стоит первым (так проверяется банк)', () => {
    for (const [, c] of all) for (const t of c.tasks) if (t.source === 'original' && t.kind === 'choice') expect(t.answer, t.id).toBe(0)
  })

  it('демо-профиль ссылается на существующие темы', async () => {
    const { buildDemoState } = await import('../lib/demo')
    const state = await buildDemoState(new Date('2026-11-01T12:00:00'))
    const topics = new Set(all.flatMap(([, c]) => c.topics.map((t) => t.id)))
    for (const key of Object.keys(state.progress.topics)) expect(topics.has(key), key).toBe(true)
    expect(state.progress.attempts.length).toBeGreaterThan(200)
  })
})

describe('справочники', () => {
  it('у каждого предмета правдоподобный формат теста', () => {
    for (const s of Object.values(SUBJECTS)) {
      expect(s.format.partA + s.format.partB, s.id).toBe(s.format.tasks)
      expect(s.format.minutes, s.id).toBeGreaterThanOrEqual(90)
      expect(s.dates.ct[0] >= '2027-05-27', s.id).toBe(true)
    }
  })

  it('источники — только https и без дублей', () => {
    for (const s of SOURCES) expect(s.url.startsWith('https://'), s.id).toBe(true)
    expect(new Set(SOURCES.map((s) => s.id)).size).toBe(SOURCES.length)
  })

  it('календарь упорядочен по датам', () => {
    const starts = CALENDAR.map((e) => e.start)
    expect([...starts].sort()).toEqual(starts)
  })
})
