import { useState, type ReactNode } from 'react'
import { BookOpen, Flame, ListChecks, Play, RotateCcw, Target, Trophy } from 'lucide-react'
import { ALL_QUESTIONS } from '../lib/questions'
import { masteredCount, type Progress } from '../lib/storage'
import { CATEGORIES, CATEGORY_META, type Category } from '../types'
import { cx } from '../lib/cx'

const SIZES = [10, 12, 15]

function Stat({
  icon,
  value,
  label,
}: {
  icon: ReactNode
  value: string
  label: string
}) {
  return (
    <div className="rounded-2xl border border-edge bg-panel/70 px-3 py-3">
      <div className="mb-1.5 text-muted">{icon}</div>
      <p className="tabular text-lg leading-none font-bold text-white">{value}</p>
      <p className="mt-1 text-[11px] text-muted">{label}</p>
    </div>
  )
}

export function HomeScreen({
  progress,
  mistakeCount,
  onStart,
  onStartMistakes,
  onOpenBook,
  onReset,
}: {
  progress: Progress
  mistakeCount: number
  onStart: (size: number, categories: Category[]) => void
  onStartMistakes: () => void
  onOpenBook: () => void
  onReset: () => void
}) {
  const [size, setSize] = useState(12)
  const [selected, setSelected] = useState<Category[]>([])
  const [confirmReset, setConfirmReset] = useState(false)

  const mastered = masteredCount(progress)
  const accuracy =
    progress.totalAnswered > 0
      ? Math.round((progress.totalFirstTryCorrect / progress.totalAnswered) * 100)
      : 0

  function toggle(category: Category) {
    setSelected((prev) =>
      prev.includes(category) ? prev.filter((c) => c !== category) : [...prev, category],
    )
  }

  return (
    <div className="mx-auto w-full max-w-lg px-4 pt-6">
      <header className="mb-5">
        <p className="mb-1 text-[11px] font-bold tracking-[0.2em] text-sky-400 uppercase">
          ЦТ · ЦЭ · Математика
        </p>
        <h1 className="text-[26px] leading-tight font-black text-white">
          Блиц по формулам
          <br />и ловушкам РИКЗ
        </h1>
        <p className="mt-2 text-[14px] leading-relaxed text-muted">
          {ALL_QUESTIONS.length} микрозаданий по спецификации ЦТ: тригонометрия, стереометрия,
          планиметрия, графики, логарифмы и прогрессии. Ошиблись — разбираем ловушку и закрепляем
          сразу.
        </p>
      </header>

      <div className="mb-5 grid grid-cols-3 gap-2.5">
        <Stat
          icon={<Target size={16} />}
          value={`${mastered}/${ALL_QUESTIONS.length}`}
          label="освоено формул"
        />
        <Stat icon={<Trophy size={16} />} value={String(progress.bestScore)} label="рекорд очков" />
        <Stat icon={<Flame size={16} />} value={`×${progress.bestStreak}`} label="лучшая серия" />
      </div>

      <section className="mb-4">
        <h2 className="mb-2 text-[13px] font-semibold text-slate-200">
          Темы <span className="font-normal text-muted">· ничего не выбрано = все темы</span>
        </h2>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((category) => {
            const meta = CATEGORY_META[category]
            const active = selected.includes(category)
            return (
              <button
                key={category}
                type="button"
                onClick={() => toggle(category)}
                aria-pressed={active}
                className={cx(
                  'rounded-full border px-3 py-1.5 text-[13px] font-medium transition active:scale-[0.98]',
                  active ? 'text-slate-950' : 'border-edge bg-panel-2/60 text-slate-300',
                )}
                style={active ? { background: meta.accent, borderColor: meta.accent } : undefined}
              >
                {meta.short}
              </button>
            )
          })}
        </div>
      </section>

      <section className="mb-5">
        <h2 className="mb-2 text-[13px] font-semibold text-slate-200">Длина раунда</h2>
        <div className="flex gap-2">
          {SIZES.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setSize(n)}
              aria-pressed={size === n}
              className={cx(
                'flex-1 rounded-xl border py-2.5 text-[14px] font-semibold transition active:scale-[0.98]',
                size === n
                  ? 'border-sky-400/60 bg-sky-400/15 text-sky-200'
                  : 'border-edge bg-panel-2/60 text-muted',
              )}
            >
              {n} вопросов
            </button>
          ))}
        </div>
      </section>

      <div className="safe-bottom space-y-2.5">
        <button
          type="button"
          onClick={() => onStart(size, selected)}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-sky-400 to-indigo-500 px-4 py-4 text-[16px] font-bold text-slate-950 shadow-lg shadow-sky-500/20 transition active:scale-[0.99]"
        >
          <Play size={18} fill="currentColor" />
          Начать блиц
        </button>

        <button
          type="button"
          onClick={onStartMistakes}
          disabled={mistakeCount === 0}
          className={cx(
            'flex w-full items-center justify-center gap-2 rounded-2xl border px-4 py-3.5 text-[15px] font-semibold transition active:scale-[0.99]',
            mistakeCount > 0
              ? 'border-amber-400/40 bg-amber-400/12 text-amber-200'
              : 'border-edge bg-panel-2/40 text-muted/60',
          )}
        >
          <ListChecks size={17} />
          Работа над ошибками
          {mistakeCount > 0 && (
            <span className="rounded-full bg-amber-400 px-2 py-0.5 text-[12px] font-bold text-amber-950">
              {mistakeCount}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={onOpenBook}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-edge bg-panel-2/60 px-4 py-3.5 text-[15px] font-semibold text-slate-200 transition active:scale-[0.99]"
        >
          <BookOpen size={17} />
          Формульник
        </button>

        <div className="flex items-center justify-between px-1 pt-2 text-[12px] text-muted">
          <span>
            Точность с первой попытки: <span className="tabular text-slate-300">{accuracy}%</span> ·
            раундов: <span className="tabular text-slate-300">{progress.rounds}</span>
          </span>
          <button
            type="button"
            onClick={() => {
              if (confirmReset) {
                onReset()
                setConfirmReset(false)
              } else {
                setConfirmReset(true)
              }
            }}
            onBlur={() => setConfirmReset(false)}
            className={cx(
              'flex items-center gap-1 transition',
              confirmReset ? 'font-semibold text-rose-400' : 'hover:text-slate-300',
            )}
          >
            <RotateCcw size={12} />
            {confirmReset ? 'Точно сбросить?' : 'Сброс'}
          </button>
        </div>
      </div>
    </div>
  )
}
