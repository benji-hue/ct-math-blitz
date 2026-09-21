import { useEffect, useRef } from 'react'
import { ArrowRight, Check, Lightbulb, Timer, TriangleAlert } from 'lucide-react'
import type { RuntimeQuestion } from '../types'
import { Tex } from './Tex'
import { WorkedExample } from './WorkedExample'

/**
 * «Разбей ловушку» — the active-recall overlay. It freezes the round, names
 * the trap the player fell into, and hands back control only once they are
 * ready to re-pick the right formula.
 */
export function ExplanationModal({
  item,
  chosenPos,
  timedOut,
  onContinue,
}: {
  item: RuntimeQuestion
  chosenPos: number | null
  timedOut: boolean
  onContinue: () => void
}) {
  const buttonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    buttonRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === 'Escape' || e.key === ' ') {
        e.preventDefault()
        onContinue()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onContinue])

  const correctText = item.q.options[item.q.correct_index]
  const chosenText = chosenPos === null ? null : item.q.options[item.order[chosenPos]]
  const { rule, common_trap, mnemonic } = item.q.learning

  return (
    <div
      className="anim-fade fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Разбор ошибки"
    >
      <div className="anim-sheet safe-bottom max-h-[88dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-rose-500/25 bg-panel px-4 pt-5 shadow-2xl sm:rounded-3xl sm:px-5 sm:pb-5">
        <header className="mb-4 flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-500/18 text-rose-300">
            {timedOut ? <Timer size={18} /> : <TriangleAlert size={18} />}
          </span>
          <div>
            <h3 className="text-base font-bold text-rose-200">
              {timedOut ? 'Время вышло' : 'Попались в ловушку'}
            </h3>
            <p className="text-xs text-muted">Разберём и закрепим — это и есть главный смысл блица</p>
          </div>
        </header>

        <div className="mb-3 rounded-2xl border border-emerald-400/30 bg-emerald-400/10 p-3.5">
          <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold tracking-wider text-emerald-300 uppercase">
            <Check size={13} /> Правильный ответ
          </p>
          <p className="text-[15px] text-emerald-50">
            <Tex>{correctText}</Tex>
          </p>
        </div>

        <div className="mb-3 rounded-2xl border border-edge bg-panel-2/70 p-3.5">
          <p className="mb-1.5 text-[11px] font-bold tracking-wider text-sky-300 uppercase">Правило</p>
          <p className="text-[15px] leading-relaxed text-slate-100">
            <Tex>{rule}</Tex>
          </p>
        </div>

        {chosenText && (
          <div className="mb-3 rounded-2xl border border-rose-500/25 bg-rose-500/8 p-3.5">
            <p className="mb-1.5 text-[11px] font-bold tracking-wider text-rose-300 uppercase">
              Ваш вариант
            </p>
            <p className="mb-2 text-[15px] text-rose-100/90 line-through decoration-rose-400/50">
              <Tex>{chosenText}</Tex>
            </p>
          </div>
        )}

        <div className="mb-3 rounded-2xl border border-amber-400/25 bg-amber-400/8 p-3.5">
          <p className="mb-1.5 text-[11px] font-bold tracking-wider text-amber-300 uppercase">
            Ловушка РИКЗ
          </p>
          <p className="text-[14px] leading-relaxed text-amber-50/90">
            <Tex>{common_trap}</Tex>
          </p>
        </div>

        {mnemonic && (
          <div className="mb-4 flex gap-2.5 rounded-2xl border border-violet-400/25 bg-violet-400/10 p-3.5">
            <Lightbulb size={17} className="mt-0.5 shrink-0 text-violet-300" />
            <p className="text-[14px] leading-relaxed text-violet-50/90">
              <Tex>{mnemonic}</Tex>
            </p>
          </div>
        )}

        <WorkedExample example={item.q.example} defaultOpen className="mb-4" />

        <button
          ref={buttonRef}
          type="button"
          onClick={onContinue}
          className="mb-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-white px-4 py-3.5 text-[15px] font-bold text-slate-900 transition active:scale-[0.99] hover:bg-slate-100"
        >
          Понятно — выбрать верный вариант
          <ArrowRight size={17} />
        </button>
      </div>
    </div>
  )
}
