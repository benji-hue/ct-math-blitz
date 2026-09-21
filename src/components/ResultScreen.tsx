import { BookOpen, Flame, House, ListChecks, RotateCcw, Sparkles, Target, Trophy } from 'lucide-react'
import { CATEGORY_META } from '../types'
import { cx } from '../lib/cx'
import { Tex } from './Tex'
import type { RoundSummary } from './GameScreen'

function verdict(accuracy: number): { title: string; note: string; tone: string } {
  if (accuracy >= 90)
    return {
      title: 'Снайпер ЦТ',
      note: 'Формулы держатся крепко. Добавьте темы посложнее и сократите время.',
      tone: 'text-emerald-300',
    }
  if (accuracy >= 70)
    return {
      title: 'Хороший темп',
      note: 'База есть. Прогоните ошибки ещё раз — и этот блок закроется.',
      tone: 'text-sky-300',
    }
  if (accuracy >= 45)
    return {
      title: 'Есть над чем поработать',
      note: 'Ловушки ещё срабатывают. Загляните в формульник перед следующим раундом.',
      tone: 'text-amber-300',
    }
  return {
    title: 'Разбираем с нуля',
    note: 'Начните с одной темы за раунд — так формулы закрепляются быстрее.',
    tone: 'text-rose-300',
  }
}

export function ResultScreen({
  summary,
  isRecord,
  onRestart,
  onReviewMistakes,
  onOpenBook,
  onHome,
}: {
  summary: RoundSummary
  isRecord: boolean
  onRestart: () => void
  onReviewMistakes: () => void
  onOpenBook: () => void
  onHome: () => void
}) {
  const accuracy =
    summary.attempts > 0 ? Math.round((summary.firstTryCorrect / summary.attempts) * 100) : 0
  const v = verdict(accuracy)

  return (
    <div className="mx-auto w-full max-w-lg px-4 pt-6">
      <header className="anim-pop mb-5 text-center">
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl border border-edge bg-panel">
          <Trophy size={24} className={v.tone} />
        </div>
        <h1 className={cx('text-xl font-black', v.tone)}>{v.title}</h1>
        <p className="mx-auto mt-1.5 max-w-xs text-[13px] leading-relaxed text-muted">{v.note}</p>
      </header>

      <div className="mb-3 rounded-3xl border border-edge bg-panel/80 p-5 text-center">
        <p className="text-[11px] tracking-[0.15em] text-muted uppercase">очки за раунд</p>
        <p className="tabular text-5xl leading-none font-black text-white">{summary.score}</p>
        {isRecord && (
          <p className="anim-pop mt-2 inline-flex items-center gap-1.5 rounded-full bg-amber-400/15 px-3 py-1 text-[12px] font-bold text-amber-300">
            <Sparkles size={13} />
            Новый рекорд
          </p>
        )}
      </div>

      <div className="mb-4 grid grid-cols-3 gap-2.5">
        <div className="rounded-2xl border border-edge bg-panel/70 px-3 py-3">
          <Target size={15} className="mb-1.5 text-muted" />
          <p className="tabular text-lg leading-none font-bold text-white">{accuracy}%</p>
          <p className="mt-1 text-[11px] text-muted">с первой попытки</p>
        </div>
        <div className="rounded-2xl border border-edge bg-panel/70 px-3 py-3">
          <Flame size={15} className="mb-1.5 text-muted" />
          <p className="tabular text-lg leading-none font-bold text-white">×{summary.bestStreak}</p>
          <p className="mt-1 text-[11px] text-muted">лучшая серия</p>
        </div>
        <div className="rounded-2xl border border-edge bg-panel/70 px-3 py-3">
          <ListChecks size={15} className="mb-1.5 text-muted" />
          <p className="tabular text-lg leading-none font-bold text-white">
            {summary.firstTryCorrect}/{summary.attempts}
          </p>
          <p className="mt-1 text-[11px] text-muted">верных ответов</p>
        </div>
      </div>

      {summary.mistakes.length > 0 && (
        <section className="mb-4">
          <h2 className="mb-2 text-[13px] font-semibold text-slate-200">
            Ловушки этого раунда <span className="text-muted">({summary.mistakes.length})</span>
          </h2>
          <ul className="space-y-2">
            {summary.mistakes.map((q) => {
              const meta = CATEGORY_META[q.category]
              return (
                <li key={q.id} className="rounded-2xl border border-edge bg-panel-2/60 px-3.5 py-3">
                  <p
                    className="mb-1.5 text-[11px] font-semibold tracking-wide"
                    style={{ color: meta.accent }}
                  >
                    {meta.label}
                  </p>
                  <p className="text-[14px] text-slate-100">
                    <Tex>{q.learning.rule}</Tex>
                  </p>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      <div className="safe-bottom space-y-2.5">
        <button
          type="button"
          onClick={onRestart}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-sky-400 to-indigo-500 px-4 py-4 text-[16px] font-bold text-slate-950 shadow-lg shadow-sky-500/20 transition active:scale-[0.99]"
        >
          <RotateCcw size={17} />
          Ещё раунд
        </button>

        {summary.mistakes.length > 0 && (
          <button
            type="button"
            onClick={onReviewMistakes}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-amber-400/40 bg-amber-400/12 px-4 py-3.5 text-[15px] font-semibold text-amber-200 transition active:scale-[0.99]"
          >
            <ListChecks size={17} />
            Прогнать ошибки ещё раз
          </button>
        )}

        <div className="flex gap-2.5">
          <button
            type="button"
            onClick={onOpenBook}
            className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-edge bg-panel-2/60 px-4 py-3.5 text-[15px] font-semibold text-slate-200 transition active:scale-[0.99]"
          >
            <BookOpen size={17} />
            Формульник
          </button>
          <button
            type="button"
            onClick={onHome}
            className="flex items-center justify-center gap-2 rounded-2xl border border-edge bg-panel-2/60 px-5 py-3.5 text-[15px] font-semibold text-slate-200 transition active:scale-[0.99]"
          >
            <House size={17} />
          </button>
        </div>
      </div>
    </div>
  )
}
