import { useState } from 'react'
import { ChevronDown, PencilRuler } from 'lucide-react'
import type { Example } from '../types'
import { cx } from '../lib/cx'
import { Tex } from './Tex'

/**
 * «Разбор на числах» — та же формула, но применённая к простой задаче.
 * По умолчанию свёрнут, чтобы не отвлекать от самого правила.
 */
export function WorkedExample({
  example,
  defaultOpen = false,
  className,
}: {
  example: Example
  defaultOpen?: boolean
  className?: string
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className={cx('overflow-hidden rounded-2xl border border-sky-400/25 bg-sky-400/8', className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 px-3.5 py-3 text-left transition hover:bg-white/3"
      >
        <PencilRuler size={16} className="shrink-0 text-sky-300" />
        <span className="flex-1 text-[13px] font-bold tracking-wider text-sky-300 uppercase">
          Пример с решением
        </span>
        <ChevronDown
          size={16}
          className={cx('shrink-0 text-sky-300/70 transition-transform', open && 'rotate-180')}
        />
      </button>

      {open && (
        <div className="anim-fade border-t border-sky-400/20 px-3.5 py-3">
          <p className="mb-3 text-[14px] leading-relaxed text-slate-100">
            <Tex>{example.task}</Tex>
          </p>

          <ol className="mb-3 space-y-1.5">
            {example.solution.map((step, i) => (
              <li key={i} className="flex gap-2.5">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-sky-400/15 text-[10px] font-bold text-sky-300">
                  {i + 1}
                </span>
                <span className="flex-1 text-[14px] leading-relaxed text-slate-200">
                  <Tex>{step}</Tex>
                </span>
              </li>
            ))}
          </ol>

          <div className="flex items-center gap-2 rounded-xl bg-emerald-400/12 px-3 py-2">
            <span className="text-[11px] font-bold tracking-wider text-emerald-300 uppercase">
              Ответ
            </span>
            <span className="text-[15px] font-semibold text-emerald-50">
              <Tex>{example.answer}</Tex>
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
