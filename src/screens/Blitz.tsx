import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowRight,
  BookOpen,
  Check,
  ChevronDown,
  Eye,
  Flame,
  Lightbulb,
  ListChecks,
  Lock,
  PencilRuler,
  Play,
  RotateCcw,
  Search,
  Sparkles,
  Target,
  Timer,
  Trophy,
  TriangleAlert,
  X,
} from 'lucide-react'
import { ALL_QUESTIONS, buildRound, comboMultiplier, prepare, scoreFor, secondsFor } from '../lib/questions'
import {
  buildMistakeRound,
  finishRound,
  isMastered,
  loadProgress,
  masteredCount,
  mistakeBankIds,
  recordAnswer,
  saveProgress,
  type Progress,
} from '../lib/storage'
import { CATEGORIES, CATEGORY_META, TYPE_LABEL, type Category, type Example, type Question, type RuntimeQuestion } from '../types'
import { setClosingConfirmation } from '../lib/telegram'
import { useBackGuard, useNav, useTutorBus } from '../nav/nav'
import { burstConfetti, Header, Sheet } from '../ui/chrome'
import { Badge, Button, Card, Chip, Counter, notify, Segmented, tap } from '../ui/kit'
import { springSoft } from '../ui/motion'
import { Tex } from '../ui/Rich'
import { GraphRenderer } from '../ui/GraphRenderer'
import { cx } from '../lib/cx'

/**
 * Блиц по формулам и ловушкам РИКЗ — первый модуль проекта, перенесённый
 * в общий дизайн. Логика раундов и прогресс (localStorage) не менялись,
 * поэтому у старых пользователей всё сохранилось.
 */

type View = { name: 'hub' } | { name: 'game'; queue: RuntimeQuestion[]; title: string; nonce: number } | { name: 'result'; summary: RoundSummary; record: boolean } | { name: 'book' }

interface RoundSummary {
  score: number
  attempts: number
  firstTryCorrect: number
  bestStreak: number
  mistakes: Question[]
}

export default function BlitzScreen() {
  const [progress, setProgress] = useState<Progress>(loadProgress)
  const [view, setView] = useState<View>({ name: 'hub' })
  const [size, setSize] = useState<'10' | '12' | '15'>('12')
  const [selected, setSelected] = useState<Category[]>([])

  useEffect(() => saveProgress(progress), [progress])

  // «Назад» внутри блица возвращает в его меню, а не закрывает экран.
  useBackGuard(() => {
    if (view.name === 'hub') return false
    setView({ name: 'hub' })
    return true
  })

  const start = (queue: RuntimeQuestion[], title: string) => {
    if (!queue.length) return
    setView({ name: 'game', queue, title, nonce: Date.now() })
  }

  if (view.name === 'game') {
    return (
      <Game
        key={view.nonce}
        initialQueue={view.queue}
        title={view.title}
        onAnswer={(id, ok) => setProgress((p) => recordAnswer(p, id, ok))}
        onExit={() => setView({ name: 'hub' })}
        onFinish={(s) => {
          const record = s.score > progress.bestScore && s.score > 0
          setProgress((p) => finishRound(p, s.score, s.bestStreak))
          setView({ name: 'result', summary: s, record })
        }}
      />
    )
  }

  if (view.name === 'result') {
    return (
      <Result
        summary={view.summary}
        record={view.record}
        onRestart={() => start(buildRound({ size: Number(size), categories: selected.length ? selected : null, mastered: progress.firstTry }), 'Скоростной блиц')}
        onMistakes={() => start(view.summary.mistakes.map((q) => prepare(q)), 'Работа над ошибками')}
        onHub={() => setView({ name: 'hub' })}
      />
    )
  }

  if (view.name === 'book') return <FormulaBook progress={progress} onBack={() => setView({ name: 'hub' })} />

  const mastered = masteredCount(progress)
  const mistakes = mistakeBankIds(progress).length

  return (
    <div>
      <Header close title="Блиц формул" subtitle="Математика · ловушки РИКЗ" />
      <div className="mb-4 grid grid-cols-3 gap-2.5">
        <Card className="!p-3">
          <Target size={16} className="text-accent" />
          <p className="tabular mt-1.5 text-[18px] font-bold text-fg">
            {mastered}/{ALL_QUESTIONS.length}
          </p>
          <p className="text-[11px] text-muted">освоено</p>
        </Card>
        <Card className="!p-3">
          <Trophy size={16} className="text-warn" />
          <p className="tabular mt-1.5 text-[18px] font-bold text-fg">{progress.bestScore}</p>
          <p className="text-[11px] text-muted">рекорд</p>
        </Card>
        <Card className="!p-3">
          <Flame size={16} className="text-[#ff8a3d]" />
          <p className="tabular mt-1.5 text-[18px] font-bold text-fg">×{progress.bestStreak}</p>
          <p className="text-[11px] text-muted">серия</p>
        </Card>
      </div>

      <p className="mb-2 px-1 text-[13px] text-muted">Темы · ничего не выбрано — все</p>
      <div className="mb-4 flex flex-wrap gap-2">
        {CATEGORIES.map((c) => (
          <Chip
            key={c}
            color={CATEGORY_META[c].accent}
            active={selected.includes(c)}
            onClick={() => setSelected((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]))}
          >
            {CATEGORY_META[c].short}
          </Chip>
        ))}
      </div>

      <p className="mb-2 px-1 text-[13px] text-muted">Длина раунда</p>
      <Segmented
        layoutId="blitz-size"
        value={size}
        onChange={setSize}
        options={[
          { value: '10', label: '10' },
          { value: '12', label: '12' },
          { value: '15', label: '15' },
        ]}
        className="mb-5"
      />

      <div className="space-y-2.5">
        <Button
          block
          size="lg"
          icon={<Play size={18} fill="currentColor" />}
          onClick={() => start(buildRound({ size: Number(size), categories: selected.length ? selected : null, mastered: progress.firstTry }), 'Скоростной блиц')}
        >
          Начать блиц
        </Button>
        <Button block variant="secondary" icon={<ListChecks size={18} />} disabled={!mistakes} onClick={() => start(buildMistakeRound(progress, 12), 'Работа над ошибками')}>
          Работа над ошибками {mistakes ? `· ${mistakes}` : ''}
        </Button>
        <Button block variant="secondary" icon={<BookOpen size={18} />} onClick={() => setView({ name: 'book' })}>
          Формульник
        </Button>
      </div>
      <p className="mt-4 px-1 text-[12.5px] leading-relaxed text-muted">
        15–20 секунд на вопрос, комбо до ×3. Ошибся — разбираем ловушку и выбираем верный вариант заново: активное припоминание закрепляет правило.
      </p>
    </div>
  )
}

// ---------- Раунд ----------

type AnswerState = 'idle' | 'wrong' | 'fixing' | 'correct'
const LETTERS = ['А', 'Б', 'В', 'Г', 'Д']

function Game({
  initialQueue,
  title,
  onAnswer,
  onFinish,
  onExit,
}: {
  initialQueue: RuntimeQuestion[]
  title: string
  onAnswer: (id: string, ok: boolean) => void
  onFinish: (s: RoundSummary) => void
  onExit: () => void
}) {
  const [queue, setQueue] = useState(initialQueue)
  const [idx, setIdx] = useState(0)
  const [phase, setPhase] = useState<'main' | 'review'>('main')
  const [state, setState] = useState<AnswerState>('idle')
  const [wrongPicks, setWrongPicks] = useState<number[]>([])
  const [modal, setModal] = useState(false)
  const [timedOut, setTimedOut] = useState(false)
  const [pickedPos, setPickedPos] = useState<number | null>(null)
  const [score, setScore] = useState(0)
  const [gained, setGained] = useState<{ points: number; nonce: number } | null>(null)
  const [streak, setStreak] = useState(0)
  const [bestStreak, setBestStreak] = useState(0)
  const [attempts, setAttempts] = useState(0)
  const [firstTry, setFirstTry] = useState(0)
  const [mistakes, setMistakes] = useState<RuntimeQuestion[]>([])
  const [shake, setShake] = useState(0)

  const current = queue[idx] as RuntimeQuestion | undefined
  const duration = current ? secondsFor(current.q) : 0
  const key = `${phase}:${idx}`
  const [clock, setClock] = useState({ key: 'main:0', left: initialQueue[0] ? secondsFor(initialQueue[0].q) : 0 })
  const timeLeft = clock.key === key ? clock.left : duration

  const live = useRef({ idx, queue, phase, mistakes, score, attempts, firstTry, bestStreak })
  useEffect(() => {
    live.current = { idx, queue, phase, mistakes, score, attempts, firstTry, bestStreak }
  })
  const advance = useRef<number | null>(null)
  useEffect(() => () => void (advance.current && window.clearTimeout(advance.current)), [])
  useEffect(() => {
    setClosingConfirmation(true)
    return () => setClosingConfirmation(false)
  }, [])

  const [rendered, setRendered] = useState(key)
  if (rendered !== key) {
    setRendered(key)
    setClock({ key, left: duration })
    setState('idle')
    setWrongPicks([])
    setPickedPos(null)
    setTimedOut(false)
    setModal(false)
  }

  useEffect(() => {
    if (!current || state !== 'idle' || modal) return
    const id = window.setInterval(() => {
      setClock((c) => (c.key === key ? { ...c, left: Math.max(0, Math.round((c.left - 0.1) * 10) / 10) } : c))
    }, 100)
    return () => window.clearInterval(id)
  }, [current, state, modal, key])

  function finish() {
    const s = live.current
    onFinish({ score: s.score, attempts: s.attempts, firstTryCorrect: s.firstTry, bestStreak: s.bestStreak, mistakes: s.mistakes.map((m) => m.q) })
  }

  function goNext() {
    const s = live.current
    if (s.idx + 1 < s.queue.length) return setIdx(s.idx + 1)
    if (s.phase === 'main' && s.mistakes.length) {
      setQueue(s.mistakes.map((m) => prepare(m.q, true)))
      setIdx(0)
      setPhase('review')
      return
    }
    finish()
  }

  function scheduleNext(ms: number) {
    if (advance.current) window.clearTimeout(advance.current)
    advance.current = window.setTimeout(() => {
      advance.current = null
      goNext()
    }, ms)
  }

  function miss(item: RuntimeQuestion) {
    setStreak(0)
    setAttempts((a) => a + 1)
    setMistakes((m) => (m.some((x) => x.q.id === item.q.id) ? m : [...m, item]))
    onAnswer(item.q.id, false)
    notify('error')
  }

  const timeoutRef = useRef<() => void>(() => {})
  timeoutRef.current = () => {
    if (!current) return
    setState('wrong')
    setTimedOut(true)
    setModal(true)
    miss(current)
  }
  useEffect(() => {
    if (current && state === 'idle' && !modal && timeLeft <= 0) timeoutRef.current()
  }, [current, state, modal, timeLeft])

  function select(pos: number) {
    if (!current || state === 'correct' || modal) return
    setPickedPos(pos)
    if (state === 'idle') {
      if (pos === current.correctPos) {
        const next = streak + 1
        const points = scoreFor(timeLeft, duration, next, current.isReview)
        setScore((v) => v + points)
        setGained({ points, nonce: Date.now() })
        setStreak(next)
        setBestStreak((b) => Math.max(b, next))
        setAttempts((a) => a + 1)
        setFirstTry((c) => c + 1)
        setState('correct')
        onAnswer(current.q.id, true)
        notify('success')
        scheduleNext(760)
      } else {
        setWrongPicks([pos])
        setState('wrong')
        setModal(true)
        miss(current)
      }
      return
    }
    if (state === 'fixing') {
      if (pos === current.correctPos) {
        setState('correct')
        notify('success')
        scheduleNext(620)
      } else {
        setWrongPicks((w) => (w.includes(pos) ? w : [...w, pos]))
        setShake((k) => k + 1)
        notify('error')
      }
    }
  }

  if (!current) return null
  const ratio = duration ? Math.max(0, Math.min(1, timeLeft / duration)) : 0
  const meta = CATEGORY_META[current.q.category]
  const mult = comboMultiplier(streak)

  return (
    <div>
      <Header
        close
        onBack={onExit}
        title={title}
        subtitle={phase === 'review' ? 'Работа над ошибками' : `Вопрос ${idx + 1} из ${queue.length}`}
        right={
          <div className="relative text-right">
            <p className="tabular text-[20px] leading-none font-bold text-fg">{score}</p>
            <p className="text-[10px] tracking-wide text-muted uppercase">очки</p>
            <AnimatePresence>
              {gained && (
                <motion.span key={gained.nonce} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: -14 }} exit={{ opacity: 0 }} className="absolute -top-2 right-0 text-[13px] font-bold text-good">
                  +{gained.points}
                </motion.span>
              )}
            </AnimatePresence>
          </div>
        }
      />
      <div className="mb-4 flex items-center gap-2.5">
        <Timer size={15} className={ratio < 0.25 ? 'text-bad' : 'text-muted'} />
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-line-strong">
          <div
            className="h-full rounded-full transition-[width] duration-100 ease-linear"
            style={{ width: `${ratio * 100}%`, background: ratio > 0.5 ? 'var(--c-good)' : ratio > 0.25 ? 'var(--c-warn)' : 'var(--c-bad)' }}
          />
        </div>
        <span className={cx('tabular w-9 text-right text-[13px] font-semibold', ratio < 0.25 ? 'text-bad' : 'text-muted')}>{Math.ceil(timeLeft)}с</span>
        {mult > 1 && (
          <span className="flex items-center gap-1 rounded-full bg-[#ff8a3d]/18 px-2 py-0.5 text-[12px] font-bold text-[#ff8a3d]">
            <Flame size={12} />×{mult}
          </span>
        )}
      </div>

      <motion.section key={key} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} transition={springSoft}>
        <div className="mb-3 flex flex-wrap gap-1.5">
          <Badge color={meta.accent}>{meta.label}</Badge>
          <Badge color="var(--c-muted)">{TYPE_LABEL[current.q.type]}</Badge>
          {current.isReview && (
            <Badge color="var(--c-warn)">
              <RotateCcw size={11} /> повтор
            </Badge>
          )}
        </div>
        {current.q.graph_spec && <GraphRenderer spec={current.q.graph_spec} accent={meta.accent} className="mb-4" />}
        <h2 className="mb-5 text-[17px] leading-relaxed text-fg">
          <Tex>{current.q.question}</Tex>
        </h2>
        <ul className="flex flex-col gap-2.5">
          {current.order.map((optionIndex, pos) => {
            const isWrong = wrongPicks.includes(pos)
            const isRight = state === 'correct' && pos === current.correctPos
            return (
              <li key={optionIndex}>
                <motion.button
                  type="button"
                  disabled={state === 'correct'}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => {
                    tap('light')
                    select(pos)
                  }}
                  key={isWrong && pickedPos === pos ? `${pos}-${shake}` : pos}
                  className={cx(
                    'glass flex w-full items-center gap-3 rounded-[18px] px-3.5 py-3 text-left transition-colors',
                    isRight && '!border-good/60 !bg-good/14',
                    isWrong && '!border-bad/55 !bg-bad/10',
                    isWrong && pickedPos === pos && 'anim-shake',
                  )}
                >
                  <span className={cx('flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-[13px] font-bold', isRight ? 'bg-good text-white' : isWrong ? 'bg-bad text-white' : 'bg-surface-2 text-muted')}>
                    {isRight ? <Check size={15} /> : isWrong ? <X size={15} /> : LETTERS[pos]}
                  </span>
                  <span className={cx('flex-1 text-[15.5px] text-fg', isWrong && 'line-through decoration-bad/60')}>
                    <Tex>{current.q.options[optionIndex]}</Tex>
                  </span>
                </motion.button>
              </li>
            )
          })}
        </ul>
        {state === 'fixing' && <p className="mt-4 rounded-2xl bg-warn/12 px-3.5 py-2.5 text-[13.5px] text-fg-2">Закрепим: выбери правильный вариант, чтобы двигаться дальше.</p>}
      </motion.section>

      <Sheet
        open={modal}
        dismissible={false}
        onClose={() => {
          setModal(false)
          setState('fixing')
        }}
        title={
          <span className="flex items-center gap-2 text-bad">
            {timedOut ? <Timer size={20} /> : <TriangleAlert size={20} />} {timedOut ? 'Время вышло' : 'Попались в ловушку'}
          </span>
        }
      >
        <Explanation item={current} chosen={timedOut || pickedPos === null ? null : current.q.options[current.order[pickedPos]]} />
        <Button
          block
          size="lg"
          className="mt-4"
          trailing={<ArrowRight size={18} />}
          onClick={() => {
            setModal(false)
            setState('fixing')
          }}
        >
          Понятно — выбрать верный
        </Button>
      </Sheet>
    </div>
  )
}

function Explanation({ item, chosen }: { item: RuntimeQuestion; chosen: string | null }) {
  const { rule, common_trap, mnemonic } = item.q.learning
  return (
    <div className="space-y-2.5">
      <Card className="!border-good/35">
        <p className="eyebrow mb-1 !text-good">Правильный ответ</p>
        <p className="text-[15.5px] text-fg">
          <Tex>{item.q.options[item.q.correct_index]}</Tex>
        </p>
      </Card>
      <Card>
        <p className="eyebrow mb-1">Правило</p>
        <p className="text-[15px] leading-relaxed text-fg">
          <Tex>{rule}</Tex>
        </p>
      </Card>
      {chosen && (
        <Card className="!border-bad/30">
          <p className="eyebrow mb-1 !text-bad">Твой вариант</p>
          <p className="text-[15px] text-fg-2 line-through decoration-bad/50">
            <Tex>{chosen}</Tex>
          </p>
        </Card>
      )}
      <Card className="!border-warn/30">
        <p className="eyebrow mb-1 !text-warn">Ловушка РИКЗ</p>
        <p className="text-[14px] leading-relaxed text-fg-2">
          <Tex>{common_trap}</Tex>
        </p>
      </Card>
      {mnemonic && (
        <Card className="flex gap-2.5">
          <Lightbulb size={17} className="mt-0.5 shrink-0 text-accent" />
          <p className="text-[14px] leading-relaxed text-fg-2">
            <Tex>{mnemonic}</Tex>
          </p>
        </Card>
      )}
      <WorkedExample example={item.q.example} defaultOpen />
    </div>
  )
}

function WorkedExample({ example, defaultOpen = false }: { example: Example; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <Card padded={false} className="overflow-hidden">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-center gap-2.5 px-4 py-3 text-left">
        <PencilRuler size={16} className="text-info" />
        <span className="flex-1 text-[13px] font-bold tracking-wider text-info uppercase">Пример с решением</span>
        <ChevronDown size={16} className={cx('text-muted transition-transform', open && 'rotate-180')} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={springSoft} className="overflow-hidden">
            <div className="border-t border-line px-4 py-3">
              <p className="mb-3 text-[14px] leading-relaxed text-fg">
                <Tex>{example.task}</Tex>
              </p>
              <ol className="mb-3 space-y-1.5">
                {example.solution.map((step, i) => (
                  <li key={i} className="flex gap-2.5">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-info/15 text-[10px] font-bold text-info">{i + 1}</span>
                    <span className="flex-1 text-[14px] leading-relaxed text-fg-2">
                      <Tex>{step}</Tex>
                    </span>
                  </li>
                ))}
              </ol>
              <p className="rounded-xl bg-good/12 px-3 py-2 text-[14.5px] text-fg">
                <span className="mr-2 text-[11px] font-bold tracking-wider text-good uppercase">Ответ</span>
                <Tex>{example.answer}</Tex>
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  )
}

// ---------- Итоги ----------

function Result({ summary, record, onRestart, onMistakes, onHub }: { summary: RoundSummary; record: boolean; onRestart: () => void; onMistakes: () => void; onHub: () => void }) {
  const accuracy = summary.attempts ? Math.round((summary.firstTryCorrect / summary.attempts) * 100) : 0
  useEffect(() => {
    if (record || accuracy >= 80) burstConfetti()
  }, [record, accuracy])
  return (
    <div>
      <Header close onBack={onHub} title="Итоги блица" />
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={springSoft} className="mb-5 text-center">
        {record && <Badge color="var(--c-warn)">Новый рекорд!</Badge>}
        <Counter value={summary.score} className="mt-2 block text-[56px] leading-none font-extrabold tracking-[-0.04em] text-fg" />
        <p className="mt-1 text-[14px] text-muted">
          очков · точность {accuracy}% · лучшая серия ×{summary.bestStreak}
        </p>
      </motion.div>
      <div className="space-y-2.5">
        <Button block size="lg" icon={<Play size={18} fill="currentColor" />} onClick={onRestart}>
          Ещё раунд
        </Button>
        {summary.mistakes.length > 0 && (
          <Button block variant="secondary" icon={<RotateCcw size={18} />} onClick={onMistakes}>
            Прорешать ошибки · {summary.mistakes.length}
          </Button>
        )}
        <Button block variant="ghost" onClick={onHub}>
          В меню блица
        </Button>
      </div>
    </div>
  )
}

// ---------- Формульник ----------

const plain = (t: string) => t.replace(/[$\\{}]/g, ' ').toLowerCase()

function FormulaBook({ progress, onBack }: { progress: Progress; onBack: () => void }) {
  const [query, setQuery] = useState('')
  const [revealAll, setRevealAll] = useState(false)
  const [open, setOpen] = useState<string | null>(null)
  const openTutor = useTutorBus((s) => s.open)
  const pop = useNav((s) => s.pop)
  const needle = plain(query.trim())
  const grouped = useMemo(
    () =>
      CATEGORIES.map((c) => ({
        c,
        items: ALL_QUESTIONS.filter((q) => q.category === c && (!needle || plain(`${q.learning.rule} ${q.question} ${q.learning.common_trap}`).includes(needle))),
      })).filter((g) => g.items.length),
    [needle],
  )

  return (
    <div>
      <Header close onBack={onBack} title="Формульник" subtitle={`Освоено ${masteredCount(progress)} из ${ALL_QUESTIONS.length}`} />
      <div className="glass mb-3 flex items-center gap-2 rounded-2xl px-3.5 py-2.5">
        <Search size={16} className="text-muted" />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Синус, конус, логарифм…" className="w-full bg-transparent text-[15px] text-fg outline-none placeholder:text-faint" />
      </div>
      <button type="button" onClick={() => setRevealAll((v) => !v)} className="mb-4 flex items-center gap-1.5 px-1 text-[13px] font-semibold text-accent">
        <Eye size={15} /> {revealAll ? 'Скрыть неоткрытые' : 'Показать все формулы'}
      </button>
      <div className="space-y-5">
        {grouped.map(({ c, items }) => (
          <div key={c}>
            <p className="eyebrow mb-2 px-1" style={{ color: CATEGORY_META[c].accent }}>
              {CATEGORY_META[c].label}
            </p>
            <div className="space-y-2">
              {items.map((q) => {
                const seen = (progress.seen[q.id] ?? 0) > 0
                const mastered = isMastered(progress, q.id)
                if (!seen && !revealAll)
                  return (
                    <div key={q.id} className="glass flex items-center gap-2.5 rounded-2xl px-4 py-3 text-[13px] text-muted opacity-60">
                      <Lock size={14} /> Откроется после встречи в блице
                    </div>
                  )
                const isOpen = open === q.id
                return (
                  <Card key={q.id} padded={false} className="overflow-hidden">
                    <button type="button" onClick={() => setOpen(isOpen ? null : q.id)} className="flex w-full items-start gap-3 px-4 py-3 text-left">
                      <span className={cx('mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg', mastered ? 'bg-warn text-white' : 'bg-info/15 text-info')}>
                        {mastered ? <Trophy size={12} /> : <Eye size={12} />}
                      </span>
                      <span className="min-w-0 flex-1 text-[15px] text-fg">
                        <Tex>{q.learning.rule}</Tex>
                      </span>
                      <ChevronDown size={16} className={cx('mt-1 shrink-0 text-muted transition-transform', isOpen && 'rotate-180')} />
                    </button>
                    <AnimatePresence initial={false}>
                      {isOpen && (
                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={springSoft} className="overflow-hidden">
                          <div className="space-y-2.5 border-t border-line px-4 py-3">
                            <p className="flex gap-2 rounded-xl bg-warn/10 p-3 text-[13.5px] leading-relaxed text-fg-2">
                              <TriangleAlert size={15} className="mt-0.5 shrink-0 text-warn" />
                              <span>
                                <Tex>{q.learning.common_trap}</Tex>
                              </span>
                            </p>
                            <WorkedExample example={q.example} />
                            <Button
                              block
                              size="sm"
                              variant="secondary"
                              icon={<Sparkles size={14} />}
                              onClick={() => {
                                pop()
                                openTutor({ mode: 'explain', subject: 'math', prompt: `Объясни формулу ${q.learning.rule} и дай 3 задания на неё по возрастанию сложности (ответы спрячь в конце).` })
                              }}
                            >
                              Разобрать формулу с ИИ
                            </Button>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </Card>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
