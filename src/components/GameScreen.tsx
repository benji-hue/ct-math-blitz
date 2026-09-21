import { useEffect, useRef, useState } from 'react'
import { Flame, Timer, X } from 'lucide-react'
import type { Question, RuntimeQuestion } from '../types'
import { comboMultiplier, prepare, scoreFor, secondsFor } from '../lib/questions'
import { cx } from '../lib/cx'
import { QuestionCard, type AnswerState } from './QuestionCard'
import { ExplanationModal } from './ExplanationModal'

export interface RoundSummary {
  score: number
  attempts: number
  firstTryCorrect: number
  bestStreak: number
  mistakes: Question[]
}

type Phase = 'main' | 'review'

export function GameScreen({
  initialQueue,
  title,
  onAnswer,
  onFinish,
  onExit,
}: {
  initialQueue: RuntimeQuestion[]
  title: string
  onAnswer: (id: string, firstTryCorrect: boolean) => void
  onFinish: (summary: RoundSummary) => void
  onExit: () => void
}) {
  const [queue, setQueue] = useState<RuntimeQuestion[]>(initialQueue)
  const [idx, setIdx] = useState(0)
  const [phase, setPhase] = useState<Phase>('main')

  const [state, setState] = useState<AnswerState>('idle')
  const [wrongPicks, setWrongPicks] = useState<number[]>([])
  const [selectedPos, setSelectedPos] = useState<number | null>(null)
  const [shakeKey, setShakeKey] = useState(0)
  const [showModal, setShowModal] = useState(false)
  const [timedOut, setTimedOut] = useState(false)

  const [score, setScore] = useState(0)
  const [gained, setGained] = useState<{ points: number; nonce: number } | null>(null)
  const [streak, setStreak] = useState(0)
  const [bestStreak, setBestStreak] = useState(0)
  const [attempts, setAttempts] = useState(0)
  const [firstTryCorrect, setFirstTryCorrect] = useState(0)
  const [mistakes, setMistakes] = useState<RuntimeQuestion[]>([])

  const current = queue[idx] as RuntimeQuestion | undefined
  const duration = current ? secondsFor(current.q) : 0

  // The clock is keyed to the question it belongs to, so a stale tick from the
  // previous item can never be read as "time is up" on the next one.
  const questionKey = `${phase}:${idx}`
  const [clock, setClock] = useState(() => ({
    key: 'main:0',
    left: initialQueue[0] ? secondsFor(initialQueue[0].q) : 0,
  }))
  const timeLeft = clock.key === questionKey ? clock.left : duration

  /** Latest values for callbacks that fire from timeouts. */
  const live = useRef({ idx, queue, phase, mistakes, score, attempts, firstTryCorrect, bestStreak })
  useEffect(() => {
    live.current = { idx, queue, phase, mistakes, score, attempts, firstTryCorrect, bestStreak }
  })

  const advanceTimer = useRef<number | null>(null)
  useEffect(
    () => () => {
      if (advanceTimer.current) window.clearTimeout(advanceTimer.current)
    },
    [],
  )

  // Re-arm everything the moment the question changes. Adjusting state during
  // render is the documented React pattern for this and costs one less commit
  // than doing it from an effect.
  const [renderedKey, setRenderedKey] = useState(questionKey)
  if (renderedKey !== questionKey) {
    setRenderedKey(questionKey)
    setClock({ key: questionKey, left: duration })
    setState('idle')
    setWrongPicks([])
    setSelectedPos(null)
    setTimedOut(false)
    setShowModal(false)
  }

  // Countdown — paused while the trap overlay is open or the answer is locked in.
  useEffect(() => {
    if (!current || state !== 'idle' || showModal) return
    const id = window.setInterval(() => {
      setClock((c) => (c.key === questionKey ? { ...c, left: Math.max(0, Math.round((c.left - 0.1) * 10) / 10) } : c))
    }, 100)
    return () => window.clearInterval(id)
  }, [current, state, showModal, questionKey])

  function finish() {
    const s = live.current
    onFinish({
      score: s.score,
      attempts: s.attempts,
      firstTryCorrect: s.firstTryCorrect,
      bestStreak: s.bestStreak,
      mistakes: s.mistakes.map((m) => m.q),
    })
  }

  function goNext() {
    const s = live.current
    if (s.idx + 1 < s.queue.length) {
      setIdx(s.idx + 1)
      return
    }
    // Main queue done — re-test everything that went wrong, once.
    if (s.phase === 'main' && s.mistakes.length > 0) {
      setQueue(s.mistakes.map((m) => prepare(m.q, true)))
      setIdx(0)
      setPhase('review')
      return
    }
    finish()
  }

  function scheduleAdvance(ms: number) {
    if (advanceTimer.current) window.clearTimeout(advanceTimer.current)
    advanceTimer.current = window.setTimeout(() => {
      advanceTimer.current = null
      goNext()
    }, ms)
  }

  function registerMiss(item: RuntimeQuestion) {
    setStreak(0)
    setAttempts((a) => a + 1)
    setMistakes((m) => (m.some((x) => x.q.id === item.q.id) ? m : [...m, item]))
    onAnswer(item.q.id, false)
  }

  function handleTimeout() {
    if (!current) return
    setState('wrong')
    setTimedOut(true)
    setShowModal(true)
    registerMiss(current)
  }

  const timeoutRef = useRef(handleTimeout)
  useEffect(() => {
    timeoutRef.current = handleTimeout
  })

  useEffect(() => {
    if (!current || state !== 'idle' || showModal) return
    if (timeLeft > 0) return
    timeoutRef.current()
  }, [current, state, showModal, timeLeft])

  function handleSelect(pos: number) {
    if (!current || state === 'correct' || showModal) return

    if (state === 'idle') {
      setSelectedPos(pos)
      if (pos === current.correctPos) {
        const nextStreak = streak + 1
        const points = scoreFor(timeLeft, duration, nextStreak, current.isReview)
        setScore((v) => v + points)
        setGained({ points, nonce: Date.now() })
        setStreak(nextStreak)
        setBestStreak((b) => Math.max(b, nextStreak))
        setAttempts((a) => a + 1)
        setFirstTryCorrect((c) => c + 1)
        setState('correct')
        onAnswer(current.q.id, true)
        scheduleAdvance(760)
      } else {
        setWrongPicks([pos])
        setState('wrong')
        setShowModal(true)
        registerMiss(current)
      }
      return
    }

    // Active recall: the player has read the explanation and must now re-pick.
    if (state === 'fixing') {
      setSelectedPos(pos)
      if (pos === current.correctPos) {
        setState('correct')
        scheduleAdvance(620)
      } else {
        setWrongPicks((w) => (w.includes(pos) ? w : [...w, pos]))
        setShakeKey((k) => k + 1)
      }
    }
  }

  // Desktop shortcut: answer with the number keys.
  useEffect(() => {
    if (showModal) return
    const onKey = (e: KeyboardEvent) => {
      const n = Number(e.key)
      if (!Number.isInteger(n) || n < 1 || n > (current?.order.length ?? 0)) return
      handleSelect(n - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (!current) return null

  const ratio = duration > 0 ? Math.max(0, Math.min(1, timeLeft / duration)) : 0
  const multiplier = comboMultiplier(streak)
  const total = queue.length

  return (
    <div className="mx-auto screen-min-h flex w-full max-w-lg flex-col px-4 pt-4">
      <header className="mb-3">
        <div className="mb-3 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onExit}
            aria-label="Выйти из раунда"
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-edge bg-panel-2/70 text-muted transition hover:text-white"
          >
            <X size={17} />
          </button>

          <div className="min-w-0 flex-1 text-center">
            <p className="truncate text-[13px] font-semibold text-slate-200">{title}</p>
            <p className="text-[11px] text-muted">
              {phase === 'review' ? 'Работа над ошибками' : `Вопрос ${idx + 1} из ${total}`}
            </p>
          </div>

          <div className="relative text-right">
            <p className="tabular text-lg leading-none font-bold text-white">{score}</p>
            <p className="text-[10px] tracking-wide text-muted uppercase">очки</p>
            {gained && (
              <span
                key={gained.nonce}
                className="anim-pop absolute -top-4 right-0 text-[13px] font-bold text-emerald-400"
              >
                +{gained.points}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <Timer size={15} className={cx('shrink-0', ratio < 0.25 ? 'text-rose-400' : 'text-muted')} />
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/8">
            <div
              className={cx(
                'h-full rounded-full transition-[width] duration-100 ease-linear',
                ratio > 0.5 ? 'bg-emerald-400' : ratio > 0.25 ? 'bg-amber-400' : 'bg-rose-500',
              )}
              style={{ width: `${ratio * 100}%` }}
            />
          </div>
          <span
            className={cx(
              'tabular w-9 text-right text-[13px] font-semibold',
              ratio < 0.25 ? 'text-rose-400' : 'text-muted',
            )}
          >
            {Math.ceil(timeLeft)}с
          </span>
          {multiplier > 1 && (
            <span className="anim-pop flex items-center gap-1 rounded-full bg-orange-500/18 px-2 py-0.5 text-[12px] font-bold text-orange-300">
              <Flame size={12} />×{multiplier}
            </span>
          )}
        </div>

        <div className="mt-3 flex gap-1">
          {queue.map((_, i) => (
            <span
              key={i}
              className={cx(
                'h-1 flex-1 rounded-full transition',
                i < idx ? 'bg-sky-400/70' : i === idx ? 'bg-white' : 'bg-white/10',
              )}
            />
          ))}
        </div>
      </header>

      <main className="safe-bottom flex-1 pt-2">
        <QuestionCard
          key={questionKey}
          item={current}
          state={state}
          wrongPicks={wrongPicks}
          selectedPos={selectedPos}
          shakeKey={shakeKey}
          onSelect={handleSelect}
        />
      </main>

      {showModal && (
        <ExplanationModal
          item={current}
          chosenPos={timedOut ? null : (selectedPos ?? null)}
          timedOut={timedOut}
          onContinue={() => {
            setShowModal(false)
            setState('fixing')
          }}
        />
      )}
    </div>
  )
}
