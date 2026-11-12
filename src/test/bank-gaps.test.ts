import { expect, it } from 'vitest'
import { loadSubject } from '../content'
import { blockOf, SPEC_BLUEPRINTS } from '../domain/blueprint'
import type { SubjectId } from '../domain/types'

/**
 * Отчёт: чего не хватает банку до полного варианта по спецификации.
 *   VITE_GAPS=chem,bio npx vitest run src/test/bank-gaps.test.ts   (или VITE_GAPS=all)
 * По каждой комбинации «часть · раздел · уровень» — сколько есть заданий и сколько позиций
 * в варианте. Отчёт печатается как «упавшая» проверка; без переменной тест пропускается.
 */
const which = (import.meta.env.VITE_GAPS as string | undefined) ?? ''

it.skipIf(!which)('отчёт: чего не хватает банку до полного варианта', async () => {
  const ids = (which === 'all' ? Object.keys(SPEC_BLUEPRINTS).join(',') : which).split(',') as SubjectId[]
  const report: string[] = []
  for (const id of ids) {
    const bp = SPEC_BLUEPRINTS[id]!
    const content = await loadSubject(id)
    const need = new Map<string, number>()
    for (const s of bp) need.set(`${s.part} ${s.block} L${s.level}`, (need.get(`${s.part} ${s.block} L${s.level}`) ?? 0) + 1)
    const have = new Map<string, number>()
    for (const t of content.tasks) if (t.source === 'original') have.set(`${t.part} ${blockOf(t)} L${t.level}`, (have.get(`${t.part} ${blockOf(t)} L${t.level}`) ?? 0) + 1)
    let missing = 0
    const rows = [...need.entries()].sort().map(([k, n]) => {
      const h = have.get(k) ?? 0
      if (h < n) missing += n - h
      return `${k}: ${h}/${n}${h < n ? '  <- ' + (n - h) : ''}`
    })
    const extra = [...have.entries()].filter(([k]) => !need.has(k)).map(([k, n]) => `${k}:${n}`)
    report.push(`=== ${id}: позиций ${bp.length}, не хватает ${missing}`, ...rows, `вне чертежа: ${extra.join(', ') || '—'}`, `позиции: ${bp.map((s) => `${s.id}:${s.block.split('.')[1]}${s.level}${s.multi ? '*' : ''}`).join(' ')}`, '')
  }
  expect(report.join('\n')).toBe('')
})
