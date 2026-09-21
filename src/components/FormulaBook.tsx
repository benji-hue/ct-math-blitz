import { useMemo, useState } from 'react'
import { ChevronDown, Eye, Lightbulb, Lock, Search, Trophy, TriangleAlert, X } from 'lucide-react'
import { ALL_QUESTIONS } from '../lib/questions'
import { isMastered, type Progress } from '../lib/storage'
import { CATEGORIES, CATEGORY_META, type Category, type Question } from '../types'
import { cx } from '../lib/cx'
import { Tex } from './Tex'
import { WorkedExample } from './WorkedExample'

function plain(text: string): string {
  return text.replace(/[$\\{}]/g, ' ').toLowerCase()
}

function EntryCard({
  q,
  mastered,
  seen,
  revealed,
}: {
  q: Question
  mastered: boolean
  seen: boolean
  revealed: boolean
}) {
  const [open, setOpen] = useState(false)
  const locked = !seen && !revealed

  if (locked) {
    return (
      <li className="flex items-center gap-2.5 rounded-2xl border border-edge/60 bg-panel-2/40 px-3.5 py-3 text-muted">
        <Lock size={14} className="shrink-0" />
        <span className="text-[13px]">Откроется после встречи в блице</span>
      </li>
    )
  }

  return (
    <li className="overflow-hidden rounded-2xl border border-edge bg-panel-2/70">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-start gap-3 px-3.5 py-3 text-left transition hover:bg-white/3"
      >
        <span
          className={cx(
            'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold',
            mastered ? 'bg-amber-400 text-amber-950' : 'bg-sky-400/20 text-sky-300',
          )}
          title={mastered ? 'Освоено' : 'Изучается'}
        >
          {mastered ? <Trophy size={12} /> : <Eye size={12} />}
        </span>
        <span className="min-w-0 flex-1 text-[15px] text-slate-100">
          <Tex>{q.learning.rule}</Tex>
        </span>
        <ChevronDown
          size={16}
          className={cx('mt-1 shrink-0 text-muted transition-transform', open && 'rotate-180')}
        />
      </button>

      {open && (
        <div className="anim-fade space-y-2.5 border-t border-edge/70 px-3.5 py-3">
          <p className="text-[12px] text-muted">
            <Tex>{q.question}</Tex>
          </p>
          <div className="flex gap-2.5 rounded-xl border border-amber-400/20 bg-amber-400/8 p-3">
            <TriangleAlert size={15} className="mt-0.5 shrink-0 text-amber-300" />
            <p className="text-[13px] leading-relaxed text-amber-50/85">
              <Tex>{q.learning.common_trap}</Tex>
            </p>
          </div>
          <WorkedExample example={q.example} />
          {q.learning.mnemonic && (
            <div className="flex gap-2.5 rounded-xl border border-violet-400/20 bg-violet-400/8 p-3">
              <Lightbulb size={15} className="mt-0.5 shrink-0 text-violet-300" />
              <p className="text-[13px] leading-relaxed text-violet-50/85">
                <Tex>{q.learning.mnemonic}</Tex>
              </p>
            </div>
          )}
        </div>
      )}
    </li>
  )
}

export function FormulaBook({ progress, onBack }: { progress: Progress; onBack: () => void }) {
  const [query, setQuery] = useState('')
  const [revealAll, setRevealAll] = useState(false)
  const [openCategory, setOpenCategory] = useState<Category | null>(CATEGORIES[0])

  const needle = plain(query.trim())

  const grouped = useMemo(() => {
    const map = new Map<Category, Question[]>()
    for (const category of CATEGORIES) {
      const items = ALL_QUESTIONS.filter(
        (q) =>
          q.category === category &&
          (needle === '' ||
            plain(q.learning.rule).includes(needle) ||
            plain(q.question).includes(needle) ||
            plain(q.learning.common_trap).includes(needle)),
      )
      map.set(category, items)
    }
    return map
  }, [needle])

  return (
    <div className="mx-auto w-full max-w-lg px-4 pt-4">
      <header className="mb-4 flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          aria-label="Назад"
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-edge bg-panel-2/70 text-muted transition hover:text-white"
        >
          <X size={17} />
        </button>
        <div>
          <h1 className="text-lg font-bold text-white">Формульник</h1>
          <p className="text-[12px] text-muted">
            Освоено {ALL_QUESTIONS.filter((q) => isMastered(progress, q.id)).length} из {ALL_QUESTIONS.length}
          </p>
        </div>
      </header>

      <div className="mb-4 flex items-center gap-2">
        <div className="flex flex-1 items-center gap-2 rounded-xl border border-edge bg-panel-2/70 px-3 py-2">
          <Search size={15} className="shrink-0 text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск: синус, конус, логарифм…"
            className="w-full bg-transparent text-[14px] text-slate-100 outline-none placeholder:text-muted/70"
          />
        </div>
        <button
          type="button"
          onClick={() => setRevealAll((v) => !v)}
          className={cx(
            'flex h-[38px] items-center gap-1.5 rounded-xl border px-3 text-[12px] font-semibold transition',
            revealAll
              ? 'border-sky-400/50 bg-sky-400/15 text-sky-200'
              : 'border-edge bg-panel-2/70 text-muted hover:text-white',
          )}
        >
          <Lock size={13} />
          {revealAll ? 'Всё открыто' : 'Открыть всё'}
        </button>
      </div>

      <div className="safe-bottom space-y-3">
        {CATEGORIES.map((category) => {
          const items = grouped.get(category) ?? []
          if (items.length === 0) return null
          const meta = CATEGORY_META[category]
          const mastered = items.filter((q) => isMastered(progress, q.id)).length
          const open = openCategory === category || needle !== ''

          return (
            <section key={category} className="overflow-hidden rounded-2xl border border-edge bg-panel/70">
              <button
                type="button"
                onClick={() => setOpenCategory(open && needle === '' ? null : category)}
                aria-expanded={open}
                className="flex w-full items-center gap-3 px-4 py-3 text-left"
              >
                <span className="h-8 w-1 rounded-full" style={{ background: meta.accent }} />
                <span className="flex-1">
                  <span className="block text-[15px] font-semibold text-white">{meta.label}</span>
                  <span className="block text-[11px] text-muted">
                    {mastered} / {items.length} освоено
                  </span>
                </span>
                <span className="h-1.5 w-16 overflow-hidden rounded-full bg-white/8">
                  <span
                    className="block h-full rounded-full"
                    style={{
                      width: `${items.length ? (mastered / items.length) * 100 : 0}%`,
                      background: meta.accent,
                    }}
                  />
                </span>
                <ChevronDown
                  size={16}
                  className={cx('shrink-0 text-muted transition-transform', open && 'rotate-180')}
                />
              </button>

              {open && (
                <ul className="space-y-2 px-3 pb-3">
                  {items.map((q) => (
                    <EntryCard
                      key={q.id}
                      q={q}
                      mastered={isMastered(progress, q.id)}
                      seen={(progress.seen[q.id] ?? 0) > 0}
                      revealed={revealAll}
                    />
                  ))}
                </ul>
              )}
            </section>
          )
        })}

        {CATEGORIES.every((c) => (grouped.get(c) ?? []).length === 0) && (
          <p className="rounded-2xl border border-edge bg-panel/70 px-4 py-6 text-center text-[14px] text-muted">
            Ничего не нашлось. Попробуйте другое слово.
          </p>
        )}
      </div>
    </div>
  )
}
