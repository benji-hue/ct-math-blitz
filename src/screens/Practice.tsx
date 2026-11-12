import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { ArrowRight, Check, Flame, RotateCcw, Sparkles, Target, Timer, Trophy, X } from 'lucide-react'
import { topicById, useSubject } from '../content'
import { SUBJECTS } from '../domain/subjects'
import { ERROR_TYPES, type ErrorType, type SubjectId, type Task } from '../domain/types'
import { ACHIEVEMENTS } from '../lib/analytics'
import { answerText, buildQueue, expectedSeconds, givenText as describeGiven, isCorrect, prepareTask, type Given, type PreparedTask } from '../lib/practice'
import { formatDuration, pluralN } from '../lib/format'
import { gradeFromAnswer } from '../lib/srs'
import { useStore, xpFor } from '../lib/store'
import { setClosingConfirmation } from '../lib/telegram'
import { useBackGuard, useNav, useTutorBus } from '../nav/nav'
import { burstConfetti, Header, Sheet, toast } from '../ui/chrome'
import { Button, Card, Chip, Counter, Empty, notify, ProgressRing, Skeleton, tap } from '../ui/kit'
import { springSoft } from '../ui/motion'
import { Markdown, Tex } from '../ui/Rich'
import { HintButton, TaskBody, TaskMeta, type Verdict } from '../ui/TaskView'

interface Props {
  /** Ключ записи в стеке навигации — по нему сессия переживает уход в ИИ-чат и обратно. */
  routeKey: string
  subject: SubjectId
  topicIds?: string[]
  review?: boolean
  size?: number
  title?: string
  generated?: boolean
}

/**
 * Снимки сессий по ключу маршрута. Если ученик ушёл в «Разбор ИИ» (другая
 * вкладка) и вернулся, экран восстанавливается ровно с того же задания.
 */
interface Snapshot {
  queue: PreparedTask[]
  index: number
  verdict: Verdict
  usedHint: boolean
  outcomes: Outcome[]
  streak: number
  xp: number
  earned: string[]
  done: boolean
}

const sessions = new Map<string, Snapshot>()

interface Outcome {
  task: Task
  correct: boolean
  given: string
  seconds: number
}

export default function PracticeScreen({ routeKey, subject, topicIds, review, size = 10, title, generated }: Props) {
  const content = useSubject(subject)
  const progress = useStore((s) => s.progress)
  const generatedTasks = useStore((s) => s.generated)
  const meta = SUBJECTS[subject]

  const [queue, setQueue] = useState<PreparedTask[] | null>(() => sessions.get(routeKey)?.queue ?? null)
  useEffect(() => {
    if (!content || queue) return
    const extra = Object.values(generatedTasks).filter((t) => t.subject === subject)
    const built = generated
      ? extra.filter((t) => !topicIds?.length || topicIds.includes(t.topic)).slice(-size).map((t) => prepareTask(t))
      : buildQueue(content, progress, extra, { size, topicIds, reviewOnly: review })
    setQueue(built)
    // Очередь собирается один раз на сессию — дальнейшие ответы её не перестраивают.
  }, [content]) // eslint-disable-line

  if (!content || !queue) {
    return (
      <div>
        <Header close />
        <Skeleton className="mt-6 h-8 w-2/3" />
        <Skeleton className="mt-4 h-44 w-full rounded-[22px]" />
      </div>
    )
  }

  if (queue.length === 0) {
    return (
      <div>
        <Header close title={title ?? meta.short} />
        <Empty
          icon={<Check size={26} />}
          title={review ? 'Повторять пока нечего' : 'Задания закончились'}
          text={review ? 'FSRS вернёт задания, когда подойдёт срок. Загляни завтра.' : 'Сгенерируй новые задания с ИИ на экране темы.'}
        />
      </div>
    )
  }

  return <Session routeKey={routeKey} subject={subject} queue={queue} title={title ?? (review ? 'Повторение' : meta.short)} />
}

function Session({ routeKey, subject, queue: initial, title }: { routeKey: string; subject: SubjectId; queue: PreparedTask[]; title: string }) {
  const saved = sessions.get(routeKey)
  const meta = SUBJECTS[subject]
  const content = useSubject(subject)
  const recordAttempt = useStore((s) => s.recordAttempt)
  const classifyLast = useStore((s) => s.classifyLast)
  const pop = useNav((s) => s.pop)
  const openTutor = useTutorBus((s) => s.open)

  const [queue, setQueue] = useState(saved?.queue ?? initial)
  const [index, setIndex] = useState(saved?.index ?? 0)
  const [verdict, setVerdict] = useState<Verdict>(saved?.verdict ?? null)
  const [usedHint, setUsedHint] = useState(saved?.usedHint ?? false)
  const [outcomes, setOutcomes] = useState<Outcome[]>(saved?.outcomes ?? [])
  const [errorTag, setErrorTag] = useState<ErrorType | null>(null)
  const [streak, setStreak] = useState(saved?.streak ?? 0)
  const [xp, setXp] = useState(saved?.xp ?? 0)
  const [earned, setEarned] = useState<string[]>(saved?.earned ?? [])
  const [confirmExit, setConfirmExit] = useState(false)
  const [done, setDone] = useState(saved?.done ?? false)
  const startedAt = useRef(Date.now())
  const sessionStart = useRef(Date.now())

  const current = queue[index]
  const topic = topicById(content, current?.task.topic ?? '')

  useEffect(() => {
    setClosingConfirmation(!done)
    return () => setClosingConfirmation(false)
  }, [done])

  useEffect(() => {
    startedAt.current = Date.now()
  }, [index])

  useEffect(() => {
    sessions.set(routeKey, { queue, index, verdict, usedHint, outcomes, streak, xp, earned, done })
  }, [routeKey, queue, index, verdict, usedHint, outcomes, streak, xp, earned, done])

  const finishAndClose = () => {
    sessions.delete(routeKey)
    pop()
  }

  // Системная «Назад» посреди тренировки — сначала спросить, а не терять сессию.
  useBackGuard(() => {
    if (done || outcomes.length === 0) return false
    setConfirmExit(true)
    return true
  })

  function answer(given: Given) {
    if (!current || verdict) return
    const task = current.task
    const correct = isCorrect(task, given)
    const seconds = Math.round((Date.now() - startedAt.current) / 1000)
    const expected = expectedSeconds(task, meta.format.minutes, meta.format.tasks)
    const grade = gradeFromAnswer({ correct, usedHint, seconds, expected })
    const givenText = describeGiven(task, given)
    const newly = recordAttempt(
      { id: task.id, s: task.subject, t: task.topic, ok: correct, sec: seconds, lvl: task.level, hint: usedHint, mode: current.isReview ? 'review' : 'practice', given: givenText },
      grade,
    )
    if (newly.length) {
      setEarned((e) => [...e, ...newly])
      for (const a of newly) toast(`Достижение: ${ACHIEVEMENTS[a]?.title ?? a}`, 'success', <Trophy size={16} className="text-warn" />)
    }
    setVerdict({ correct, given })
    setOutcomes((o) => [...o, { task, correct, given: givenText, seconds }])
    setErrorTag(null)
    if (correct) {
      notify('success')
      setStreak((s) => s + 1)
      setXp((x) => x + xpFor(true, task.level))
    } else {
      notify('error')
      setStreak(0)
      setXp((x) => x + xpFor(false, task.level))
    }
  }

  function next() {
    tap('medium')
    if (index + 1 < queue.length) {
      setIndex(index + 1)
      setVerdict(null)
      setUsedHint(false)
      return
    }
    setDone(true)
    const right = outcomes.filter((o) => o.correct).length
    if (outcomes.length && right / outcomes.length >= 0.8) burstConfetti()
  }

  function retryMistakes() {
    const wrong = outcomes.filter((o) => !o.correct).map((o) => prepareTask(o.task, true))
    if (!wrong.length) return
    setQueue(wrong)
    setIndex(0)
    setVerdict(null)
    setUsedHint(false)
    setOutcomes([])
    setDone(false)
    sessionStart.current = Date.now()
  }

  if (done) {
    const right = outcomes.filter((o) => o.correct).length
    const total = outcomes.length
    const seconds = Math.round((Date.now() - sessionStart.current) / 1000)
    const mistakes = outcomes.filter((o) => !o.correct)
    return (
      <div>
        <Header close title="Итоги" />
        <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={springSoft} className="flex flex-col items-center pt-2 pb-6 text-center">
          <ProgressRing value={total ? right / total : 0} size={132} stroke={11} color={right / Math.max(1, total) >= 0.7 ? 'var(--c-good)' : meta.color}>
            <div>
              <Counter value={total ? Math.round((right / total) * 100) : 0} suffix="%" className="text-[34px] font-extrabold text-fg" />
              <p className="text-[12px] text-muted">
                {right} из {total}
              </p>
            </div>
          </ProgressRing>
          <p className="mt-4 text-[22px] font-bold text-fg">{right === total ? 'Чисто!' : right / Math.max(1, total) >= 0.7 ? 'Отличная работа' : 'Есть над чем поработать'}</p>
          <p className="mt-1 text-[14px] text-muted">
            +{xp} XP · {formatDuration(seconds)} · {title}
          </p>
        </motion.div>

        {earned.length > 0 && (
          <Card className="mb-3 flex items-center gap-3">
            <Trophy size={22} className="text-warn" />
            <p className="text-[14px] text-fg-2">Новые достижения: {earned.map((a) => ACHIEVEMENTS[a]?.title ?? a).join(', ')}</p>
          </Card>
        )}

        {mistakes.length > 0 && (
          <Card padded={false} className="mb-4 divide-y divide-line px-4">
            <p className="pt-3.5 pb-2 text-[14px] font-semibold text-fg">Ошибки — вернутся на повторение</p>
            {mistakes.map((m, i) => (
              <div key={i} className="py-3">
                <div className="line-clamp-2 text-[14px] text-fg-2">
                  <Tex>{m.task.q}</Tex>
                </div>
                <p className="mt-1 text-[12.5px] text-muted">
                  Твой ответ: <span className="text-bad">{m.given ? <Tex>{m.given}</Tex> : '—'}</span> · верно: <span className="text-good"><Tex>{answerText(m.task)}</Tex></span>
                </p>
              </div>
            ))}
          </Card>
        )}

        <div className="space-y-2.5">
          {mistakes.length > 0 && (
            <Button block size="lg" icon={<RotateCcw size={18} />} onClick={retryMistakes}>
              Прорешать ошибки ещё раз
            </Button>
          )}
          <Button block variant={mistakes.length ? 'secondary' : 'primary'} size="lg" onClick={finishAndClose}>
            Готово
          </Button>
        </div>
      </div>
    )
  }

  const progressShare = (index + (verdict ? 1 : 0)) / queue.length

  return (
    <div>
      <Header
        close
        onBack={() => (outcomes.length && !done ? setConfirmExit(true) : pop())}
        title={title}
        subtitle={`${index + 1} из ${queue.length}`}
        right={
          <AnimatePresence>
            {streak >= 2 && (
              <motion.span initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.6, opacity: 0 }} className="glass flex h-9 items-center gap-1 rounded-full px-3 text-[14px] font-bold text-[#ff8a3d]">
                <Flame size={16} fill="currentColor" /> {streak}
              </motion.span>
            )}
          </AnimatePresence>
        }
      />
      <div className="mb-5 h-1.5 overflow-hidden rounded-full bg-line-strong">
        <motion.div className="h-full rounded-full" style={{ background: meta.color }} animate={{ width: `${progressShare * 100}%` }} transition={springSoft} />
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={`${index}-${current.task.id}`} initial={{ opacity: 0, x: 28 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -28 }} transition={springSoft}>
          <TaskMeta task={current.task} isReview={current.isReview} topicTitle={topic?.title} color={meta.color} />
          <TaskBody prepared={current} verdict={verdict} onAnswer={answer} />
          {!verdict && <HintButton hint={current.task.hint} used={usedHint} onUse={() => setUsedHint(true)} />}
        </motion.div>
      </AnimatePresence>

      <AnimatePresence>
        {verdict && (
          <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={springSoft} className="mt-5 space-y-3">
            <Card className={verdict.correct ? '!border-good/40' : '!border-bad/40'}>
              <p className={`mb-2 flex items-center gap-2 text-[16px] font-bold ${verdict.correct ? 'text-good' : 'text-bad'}`}>
                {verdict.correct ? <Check size={19} /> : <X size={19} />}
                {verdict.correct ? `Верно! +${xpFor(true, current.task.level)} XP` : 'Не совсем'}
              </p>
              {!verdict.correct && (
                <p className="mb-2 text-[14.5px] text-fg-2">
                  Правильный ответ: <b className="text-fg"><Tex>{answerText(current.task)}</Tex></b>
                </p>
              )}
              <Markdown className="text-[14.5px] leading-relaxed text-fg-2">{current.task.explain}</Markdown>
              {!verdict.correct && current.task.trap && (
                <p className="mt-3 rounded-xl bg-warn/10 px-3 py-2 text-[13.5px] leading-relaxed text-fg-2">
                  <b className="text-warn">Ловушка: </b>
                  <Tex>{current.task.trap}</Tex>
                </p>
              )}
            </Card>

            {!verdict.correct && (
              <Card>
                <p className="mb-2.5 text-[14px] font-semibold text-fg">Почему ошибся? Это поможет ИИ подобрать тренировку</p>
                <div className="flex flex-wrap gap-2">
                  {(Object.keys(ERROR_TYPES) as ErrorType[]).map((e) => (
                    <Chip
                      key={e}
                      active={errorTag === e}
                      onClick={() => {
                        setErrorTag(e)
                        classifyLast(current.task.id, e)
                      }}
                    >
                      {ERROR_TYPES[e].label}
                    </Chip>
                  ))}
                </div>
              </Card>
            )}

            <div className="flex gap-2.5">
              {!verdict.correct && (
                <Button
                  variant="secondary"
                  icon={<Sparkles size={17} />}
                  onClick={() =>
                    openTutor({
                      mode: 'mistake',
                      subject,
                      topicId: current.task.topic,
                      task: {
                        q: current.task.q,
                        options: current.task.options,
                        correct: answerText(current.task),
                        given: describeGiven(current.task, verdict.given),
                        explain: current.task.explain,
                        trap: current.task.trap,
                      },
                      prompt: (() => {
                        const q = current.task.q.length > 220 ? `${current.task.q.slice(0, 220)}…` : current.task.q
                        const given = describeGiven(current.task, verdict.given)
                        return `Разбери мою ошибку в задании: ${q}\nМой ответ: ${given || '—'}`
                      })(),
                    })
                  }
                >
                  Разбор ИИ
                </Button>
              )}
              <Button block size="md" onClick={next} trailing={<ArrowRight size={18} />}>
                {index + 1 < queue.length ? 'Дальше' : 'Итоги'}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <Sheet open={confirmExit} onClose={() => setConfirmExit(false)} title="Закончить тренировку?">
        <p className="mb-4 text-[14.5px] text-fg-2">
          Ответы уже сохранены: {pluralN(outcomes.length, ['задание', 'задания', 'заданий'])} попадут в статистику и повторение.
        </p>
        <div className="space-y-2">
          <Button block onClick={() => setConfirmExit(false)} icon={<Target size={17} />}>
            Продолжить
          </Button>
          <Button block variant="secondary" onClick={() => setDone(true)} icon={<Timer size={17} />}>
            Показать итоги
          </Button>
        </div>
      </Sheet>
    </div>
  )
}
