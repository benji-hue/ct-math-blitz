import { Check, RotateCcw, X } from 'lucide-react'
import { CATEGORY_META, TYPE_LABEL, type RuntimeQuestion } from '../types'
import { cx } from '../lib/cx'
import { Tex } from './Tex'
import { GraphRenderer } from './GraphRenderer'

export type AnswerState = 'idle' | 'wrong' | 'fixing' | 'correct'

const LETTERS = ['А', 'Б', 'В', 'Г', 'Д']

export function QuestionCard({
  item,
  state,
  wrongPicks,
  selectedPos,
  shakeKey,
  onSelect,
}: {
  item: RuntimeQuestion
  state: AnswerState
  wrongPicks: number[]
  selectedPos: number | null
  shakeKey: number
  onSelect: (pos: number) => void
}) {
  const meta = CATEGORY_META[item.q.category]
  const locked = state === 'correct'

  return (
    <section className="anim-pop">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span
          className="rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-wide"
          style={{ background: `${meta.accent}1f`, color: meta.accent }}
        >
          {meta.label}
        </span>
        <span className="rounded-full bg-white/5 px-2.5 py-1 text-[11px] text-muted">
          {TYPE_LABEL[item.q.type]}
        </span>
        {item.isReview && (
          <span className="flex items-center gap-1 rounded-full bg-amber-400/15 px-2.5 py-1 text-[11px] font-semibold text-amber-300">
            <RotateCcw size={11} />
            Работа над ошибками
          </span>
        )}
      </div>

      {item.q.graph_spec && (
        <GraphRenderer spec={item.q.graph_spec} accent={meta.accent} className="mb-4" />
      )}

      <h2 className="mb-5 text-[17px] leading-relaxed text-slate-100 sm:text-lg">
        <Tex>{item.q.question}</Tex>
      </h2>

      <ul className="flex flex-col gap-2.5">
        {item.order.map((optionIndex, pos) => {
          const isWrong = wrongPicks.includes(pos)
          const isRight = state === 'correct' && pos === item.correctPos
          const justPicked = selectedPos === pos

          return (
            <li key={optionIndex}>
              <button
                type="button"
                disabled={locked}
                onClick={() => onSelect(pos)}
                aria-pressed={justPicked}
                className={cx(
                  'flex w-full items-center gap-3 rounded-2xl border px-3.5 py-3 text-left transition',
                  'active:scale-[0.99] disabled:cursor-default',
                  isRight
                    ? 'border-emerald-400/70 bg-emerald-400/15 text-emerald-50 shadow-[0_0_0_3px_rgba(52,211,153,0.12)]'
                    : isWrong
                      ? 'border-rose-500/60 bg-rose-500/10 text-rose-100/80'
                      : 'border-edge bg-panel-2/80 text-slate-100 hover:border-slate-500 hover:bg-panel-2',
                  isWrong && justPicked && 'anim-shake',
                )}
                // Re-triggers the shake animation on every repeated wrong tap.
                key={isWrong && justPicked ? `${pos}-${shakeKey}` : pos}
              >
                <span
                  className={cx(
                    'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold',
                    isRight
                      ? 'bg-emerald-400 text-emerald-950'
                      : isWrong
                        ? 'bg-rose-500 text-white'
                        : 'bg-white/8 text-muted',
                  )}
                >
                  {isRight ? <Check size={15} /> : isWrong ? <X size={15} /> : LETTERS[pos]}
                </span>
                <span className={cx('flex-1 text-[15px]', isWrong && 'line-through decoration-rose-400/60')}>
                  <Tex>{item.q.options[optionIndex]}</Tex>
                </span>
              </button>
            </li>
          )
        })}
      </ul>

      {state === 'fixing' && (
        <p className="anim-fade mt-4 rounded-xl border border-amber-400/30 bg-amber-400/10 px-3.5 py-2.5 text-[13px] text-amber-200">
          Закрепим: выберите правильный вариант, чтобы двигаться дальше.
        </p>
      )}
    </section>
  )
}
