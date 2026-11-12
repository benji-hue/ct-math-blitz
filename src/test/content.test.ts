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

const BLUEPRINT_READY_IDS: string[] = (await import('../domain/blueprint')).BLUEPRINT_READY

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
            const right = typeof task.answer === 'number' ? [task.answer] : (task.answer as number[])
            expect(right.length, task.id).toBeGreaterThan(0)
            for (const i of right) expect(Number.isInteger(i) && i >= 0 && i < task.options!.length, task.id).toBe(true)
            expect(new Set(right).size, task.id).toBe(right.length)
            expect(new Set(task.options).size, `${task.id}: повторяющиеся варианты`).toBe(task.options!.length)
          } else {
            expect(Array.isArray(task.answer) && task.answer.length > 0, task.id).toBe(true)
          }
        }
      })
    })
  }

  it('у собственных заданий части A верный вариант стоит первым (так проверяется банк)', () => {
    for (const [, c] of all) for (const t of c.tasks) if (t.source === 'original' && t.kind === 'choice' && !Array.isArray(t.answer)) expect(t.answer, t.id).toBe(0)
  })

  it('готовые предметы — как на ЦТ: в части A пять вариантов; в физике и математике часть B — целое число', () => {
    for (const [id, c] of all) {
      if (!BLUEPRINT_READY_IDS.includes(id)) continue
      for (const t of c.tasks) {
        if (t.source !== 'original') continue
        if (t.kind === 'choice') {
          // Иностранные языки: по спецификации в части A пять или четыре варианта.
          if (SUBJECTS[id as keyof typeof SUBJECTS].group === 'foreign') expect([4, 5], t.id).toContain(t.options!.length)
          else expect(t.options!.length, t.id).toBe(5)
          continue
        }
        if (id !== 'phys' && id !== 'math') continue
        // Математика допускает ответы-соответствия «А1Б3В2»; физика — только целое число.
        expect((t.answer as string[]).some((x) => /^-?\d+$/.test(x) || (id === 'math' && /^([А-Я]\d)+$/.test(x))), `${t.id}: ${String(t.answer)}`).toBe(true)
      }
    }
  })

  it('чертежи вариантов совпадают со спецификациями РИКЗ 2026', async () => {
    const { SPEC_BLUEPRINTS, SPECS } = await import('../domain/blueprint')
    const count = <T,>(xs: T[]) => xs.reduce<Record<string, number>>((m, x) => ({ ...m, [String(x)]: (m[String(x)] ?? 0) + 1 }), {})
    const math = SPEC_BLUEPRINTS.math!
    expect(math).toHaveLength(30)
    expect(count(math.map((s) => s.part))).toEqual({ A: 10, B: 20 })
    expect(count(math.map((s) => s.block))).toEqual({ numbers: 4, expressions: 4, equations: 9, functions: 5, geometry: 8 })
    expect(count(math.map((s) => s.level))).toEqual({ 1: 5, 2: 10, 3: 9, 4: 4, 5: 2 })
    const phys = SPEC_BLUEPRINTS.phys!
    expect(phys).toHaveLength(30)
    expect(count(phys.map((s) => s.part))).toEqual({ A: 10, B: 20 })
    expect(count(phys.map((s) => s.block))).toEqual({ mech: 10, thermo: 7, electro: 9, optics: 2, quantum: 1, nuclear: 1 })
    expect(count(phys.map((s) => s.level))).toEqual({ 1: 5, 2: 10, 3: 10, 4: 4, 5: 1 })
    // Остальные 12 предметов: чертёж построен из чисел спецификации и должен их сохранять.
    expect(Object.keys(SPEC_BLUEPRINTS)).toHaveLength(14)
    for (const [id, spec] of Object.entries(SPECS)) {
      const bp = SPEC_BLUEPRINTS[id as keyof typeof SPEC_BLUEPRINTS]!
      const meta = SUBJECTS[id as keyof typeof SUBJECTS]
      expect(bp.length, id).toBe(meta.format.tasks)
      expect(count(bp.map((s) => s.part)), id).toEqual({ A: meta.format.partA, B: meta.format.partB })
      expect(count(bp.map((s) => s.block)), id).toEqual(Object.fromEntries(spec.sections.map((s) => [s.block, s.count])))
      expect(count(bp.map((s) => s.level)), id).toEqual(Object.fromEntries(spec.levels.map((n, i) => [i + 1, n])))
      // Темы разделов существуют в содержании предмета — кроме ещё не заведённых (банк в работе).
      const topics = new Set(all.find(([s]) => s === id)![1].topics.map((t) => t.id))
      for (const s of spec.sections) expect(s.topics.some((t) => topics.has(t)) || !BLUEPRINT_READY_IDS.includes(id), `${id} ${s.block}`).toBe(true)
    }
  })

  it('у готовых предметов банк закрывает каждую позицию варианта без подмены уровня', async () => {
    const { SPEC_BLUEPRINTS, BLUEPRINT_READY, blockOf } = await import('../domain/blueprint')
    for (const id of BLUEPRINT_READY) {
      const content = all.find(([s]) => s === id)![1]
      const need = new Map<string, number>()
      for (const s of SPEC_BLUEPRINTS[id]!) need.set(`${s.part} ${s.block} ${s.level}`, (need.get(`${s.part} ${s.block} ${s.level}`) ?? 0) + 1)
      for (const [key, n] of need) {
        const have = content.tasks.filter((t) => t.source === 'original' && `${t.part} ${blockOf(t)} ${t.level}` === key).length
        expect(have, `${id}: ${key}`).toBeGreaterThanOrEqual(n)
      }
      // Позиции с несколькими верными вариантами есть чем заполнить.
      const multi = new Map<string, number>()
      for (const s of SPEC_BLUEPRINTS[id]!.filter((x) => x.multi)) multi.set(`${s.block} ${s.level}`, (multi.get(`${s.block} ${s.level}`) ?? 0) + 1)
      for (const [key, n] of multi) {
        const fit = content.tasks.filter((t) => t.source === 'original' && t.part === 'A' && `${blockOf(t)} ${t.level}` === key && Array.isArray(t.answer))
        expect(fit.length, `${id} ${key}: несколько верных`).toBeGreaterThanOrEqual(n)
      }
    }
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
