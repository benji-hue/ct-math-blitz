import { motion } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, Flag, Timer, X } from 'lucide-react'
import { topicById, useSubject } from '../content'
import { SUBJECTS } from '../domain/subjects'
import type { SubjectId } from '../domain/types'
import { answerText, buildMock, isCorrect, type PreparedTask } from '../lib/practice'
import { formatDuration, pluralN } from '../lib/format'
import { gradeFromAnswer } from '../lib/srs'
import { useStore } from '../lib/store'
import { setClosingConfirmation } from '../lib/telegram'
import { useBackGuard, useNav } from '../nav/nav'
import { burstConfetti, Header, Sheet, useNow } from '../ui/chrome'
import { Button, Card, Counter, Empty, notify, ProgressRing, Skeleton } from '../ui/kit'
import { springSoft } from '../ui/motion'
import { Markdown, Tex } from '../ui/Rich'
import { TaskBody, TaskMeta } from '../ui/TaskView'
import { cx } from '../lib/cx'

/**
 * Пробник: мини-вариант в формате ЦТ. Время пропорционально настоящему
 * экзамену, ответы не подсвечиваются до конца, можно возвращаться к заданиям —
 * как на реальном тестировании с бланком ответов.
 */
export default function MockScreen({ subject }: { subject: SubjectId }) {
  const content = useSubject(subject)
  const meta = SUBJECTS[subject]
  const [started, setStarted] = useState(false)

  const size = Math.min(12, content?.tasks.filter((t) => t.source !== 'blitz').length ?? 0)
  const minutes = Math.max(10, Math.round((meta.format.minutes * size) / meta.format.tasks))

  if (!content) {
    return (
      <div>
        <Header close />
        <Skeleton className="mt-6 h-40 w-full rounded-[22px]" />
      </div>
    )
  }
  if (size < 4) {
    return (
      <div>
        <Header close title="Пробник" />
        <Empty icon={<Flag size={24} />} title="Мало заданий для пробника" text="Сгенерируйте задания с ИИ на экране темы или потренируйтесь в банке." />
      </div>
    )
  }

  if (!started) {
    return (
      <div>
        <Header close title="Пробник" subtitle={meta.title} />
        <Card glow={meta.color} className="mb-4">
          <p className="eyebrow mb-1">Формат</p>
          <p className="text-[28px] leading-tight font-extrabold text-fg">
            {pluralN(size, ['задание', 'задания', 'заданий'])} · {minutes} мин
          </p>
          <p className="mt-2 text-[14px] leading-relaxed text-fg-2">
            Пропорция частей A и B и темп — как на ЦТ ({meta.format.tasks} заданий за {meta.format.minutes} минут). Ответы проверим в конце, к любому заданию можно вернуться.
          </p>
        </Card>
        <Card className="mb-5 space-y-2 text-[14px] leading-relaxed text-fg-2">
          <p>
            <b className="text-fg">Стратегия ЦТ:</b> сначала пройди всё и реши то, что знаешь. Трудные пропусти и вернись к ним во втором круге.
          </p>
          <p>Последние 5 минут оставь на проверку: перенос ответов в бланк — частая причина потерянных баллов.</p>
        </Card>
        <Button block size="lg" icon={<Timer size={19} />} onClick={() => setStarted(true)}>
          Начать — время пошло
        </Button>
      </div>
    )
  }

  return <MockRun subject={subject} size={size} minutes={minutes} />
}

function MockRun({ subject, size, minutes }: { subject: SubjectId; size: number; minutes: number }) {
  const meta = SUBJECTS[subject]
  const content = useSubject(subject)!
  const recordAttempt = useStore((s) => s.recordAttempt)
  const saveMock = useStore((s) => s.saveMock)
  const pop = useNav((s) => s.pop)
  const tasks = useMemo<PreparedTask[]>(() => buildMock(content, size, meta.format.partA / meta.format.tasks), [content, size, meta])
  const [index, setIndex] = useState(0)
  const [answers, setAnswers] = useState<(number | string | null)[]>(() => tasks.map(() => null))
  const [inputs, setInputs] = useState<string[]>(() => tasks.map(() => ''))
  const [finished, setFinished] = useState<null | { seconds: number }>(null)
  const [confirm, setConfirm] = useState(false)
  const [review, setReview] = useState<number | null>(null)
  const startedAt = useRef(Date.now())
  const now = useNow(1000)
  const left = Math.max(0, minutes * 60 - Math.round((now - startedAt.current) / 1000))

  useEffect(() => {
    setClosingConfirmation(!finished)
    return () => setClosingConfirmation(false)
  }, [finished])

  useBackGuard(() => {
    if (finished) return false
    setConfirm(true)
    return true
  })

  const finish = () => {
    if (finished) return
    const seconds = Math.round((Date.now() - startedAt.current) / 1000)
    let correct = 0
    tasks.forEach((p, i) => {
      const given = answers[i]
      const ok = given !== null && isCorrect(p.task, given)
      if (ok) correct++
      recordAttempt(
        {
          id: p.task.id,
          s: p.task.subject,
          t: p.task.topic,
          ok,
          sec: Math.round(seconds / tasks.length),
          lvl: p.task.level,
          mode: 'mock',
          given: typeof given === 'number' ? p.task.options?.[given] : (given ?? ''),
        },
        gradeFromAnswer({ correct: ok, usedHint: false, seconds: 60, expected: 60 }),
      )
    })
    const estimate = Math.round((correct / tasks.length) * 100)
    saveMock({ subject, at: Date.now(), total: tasks.length, correct, seconds, estimate })
    setFinished({ seconds })
    notify(correct / tasks.length >= 0.6 ? 'success' : 'warning')
    if (correct / tasks.length >= 0.8) burstConfetti()
  }

  useEffect(() => {
    if (left === 0 && !finished) finish()
  })

  if (finished) {
    const results = tasks.map((p, i) => ({ p, given: answers[i], ok: answers[i] !== null && isCorrect(p.task, answers[i]!) }))
    const correct = results.filter((r) => r.ok).length
    return (
      <div>
        <Header close title="Результат пробника" />
        <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={springSoft} className="flex flex-col items-center pb-5 text-center">
          <ProgressRing value={correct / tasks.length} size={128} stroke={11} color={meta.color}>
            <div>
              <Counter value={correct} className="text-[36px] font-extrabold text-fg" />
              <p className="text-[12px] text-muted">из {tasks.length}</p>
            </div>
          </ProgressRing>
          <p className="mt-3 text-[15px] text-fg-2">
            {Math.round((correct / tasks.length) * 100)}% · время {formatDuration(finished.seconds)} из {minutes}:00
          </p>
          <p className="mt-1 max-w-xs text-[12.5px] text-muted">Пересчёт в тестовый балл РИКЗ нелинейный — ориентируйтесь на динамику от пробника к пробнику.</p>
        </motion.div>
        <div className="mb-4 grid grid-cols-6 gap-2">
          {results.map((r, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setReview(i)}
              className={cx('flex h-11 items-center justify-center rounded-xl text-[14px] font-bold', r.ok ? 'bg-good/15 text-good' : 'bg-bad/12 text-bad')}
            >
              {i + 1}
            </button>
          ))}
        </div>
        <Button block size="lg" onClick={pop}>
          Готово
        </Button>
        <Sheet open={review !== null} onClose={() => setReview(null)} title={review !== null ? `Задание ${review + 1}` : ''}>
          {review !== null && (
            <div className="space-y-3">
              <div className="text-[15px] leading-relaxed text-fg">
                <Tex>{results[review].p.task.q}</Tex>
              </div>
              <p className="text-[14px] text-fg-2">
                Твой ответ:{' '}
                <span className={results[review].ok ? 'text-good' : 'text-bad'}>
                  {results[review].given === null ? '—' : <Tex>{typeof results[review].given === 'number' ? (results[review].p.task.options?.[results[review].given as number] ?? '') : String(results[review].given)}</Tex>}
                </span>
                <br />
                Верно: <b className="text-fg"><Tex>{answerText(results[review].p.task)}</Tex></b>
              </p>
              <Markdown className="text-[14px] leading-relaxed text-fg-2">{results[review].p.task.explain}</Markdown>
            </div>
          )}
        </Sheet>
      </div>
    )
  }

  const current = tasks[index]
  const topic = topicById(content, current.task.topic)
  const answered = answers.filter((a) => a !== null).length
  const low = left < 120

  return (
    <div>
      <Header
        close
        onBack={() => setConfirm(true)}
        title={`Задание ${index + 1}/${tasks.length}`}
        right={
          <span className={cx('glass tabular flex h-9 items-center gap-1.5 rounded-full px-3 text-[14px] font-bold', low ? 'text-bad' : 'text-fg')}>
            <Timer size={15} /> {formatDuration(left)}
          </span>
        }
      />
      <div className="no-scrollbar -mx-4 mb-4 flex gap-1.5 overflow-x-auto px-4">
        {tasks.map((_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setIndex(i)}
            className={cx(
              'h-8 min-w-8 rounded-lg text-[12.5px] font-bold transition-colors',
              i === index ? 'bg-accent-solid text-on-accent' : answers[i] !== null ? 'bg-surface-2 text-fg' : 'glass text-muted',
            )}
          >
            {i + 1}
          </button>
        ))}
      </div>
      <motion.div key={index} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={springSoft}>
        <TaskMeta task={current.task} topicTitle={topic?.title} color={meta.color} />
        <TaskBody
          prepared={current}
          verdict={null}
          reveal={false}
          selected={typeof answers[index] === 'number' ? (answers[index] as number) : null}
          onSelect={(opt) => setAnswers((a) => a.map((v, i) => (i === index ? opt : v)))}
          inputValue={inputs[index]}
          onInput={(v) => {
            setInputs((s) => s.map((x, i) => (i === index ? v : x)))
            setAnswers((a) => a.map((x, i) => (i === index ? (v.trim() ? v : null) : x)))
          }}
        />
      </motion.div>
      <div className="mt-6 flex gap-2.5">
        <Button variant="secondary" disabled={index === 0} onClick={() => setIndex((i) => i - 1)} icon={<ArrowLeft size={18} />} />
        {index + 1 < tasks.length ? (
          <Button block onClick={() => setIndex((i) => i + 1)} trailing={<ArrowRight size={18} />}>
            Следующее
          </Button>
        ) : (
          <Button block variant="success" onClick={() => setConfirm(true)} icon={<Check size={18} />}>
            Сдать работу
          </Button>
        )}
      </div>
      <p className="mt-3 text-center text-[12.5px] text-muted">
        Отвечено {answered} из {tasks.length}
      </p>

      <Sheet open={confirm} onClose={() => setConfirm(false)} title="Сдать работу?">
        <p className="mb-4 text-[14.5px] text-fg-2">
          {answered < tasks.length ? `Без ответа: ${tasks.length - answered}. ` : ''}Осталось {formatDuration(left)}. После сдачи покажем разбор каждого задания.
        </p>
        <div className="space-y-2">
          <Button block variant="success" icon={<Check size={18} />} onClick={() => { setConfirm(false); finish() }}>
            Сдать
          </Button>
          <Button block variant="secondary" onClick={() => setConfirm(false)}>
            Вернуться к заданиям
          </Button>
          <Button block variant="ghost" icon={<X size={17} />} onClick={pop}>
            Выйти без сохранения
          </Button>
        </div>
      </Sheet>
    </div>
  )
}
