import { motion } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, Flag, Timer, X } from 'lucide-react'
import { topicById, useSubject } from '../content'
import { SUBJECTS } from '../domain/subjects'
import type { SubjectId } from '../domain/types'
import { BLOCK_TITLES, BLUEPRINTS, blockOf } from '../domain/blueprint'
import { answerText, buildBlueprintMock, buildMock, givenText, isCorrect, isMulti, type Given, type PreparedTask } from '../lib/practice'
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
import { ReportTask } from '../ui/ReportTask'
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
  const blueprint = BLUEPRINTS[subject]
  // По спецификации: полный вариант (30 заданий, 210 минут) или короткий — каждое третье задание.
  const [full, setFull] = useState(false)
  const examTasks = content?.tasks.filter((t) => t.source !== 'blitz').length ?? 0
  const size = blueprint ? (full ? blueprint.length : 10) : Math.min(12, examTasks)
  const minutes = Math.max(10, Math.round((meta.format.minutes * size) / meta.format.tasks))

  if (!content) {
    return (
      <div>
        <Header close />
        <Skeleton className="mt-6 h-40 w-full rounded-[22px]" />
      </div>
    )
  }
  if (blueprint ? examTasks < 10 : size < 4) {
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
        {blueprint && (
          <div className="mb-3 grid grid-cols-2 gap-2">
            {[false, true].map((f) => (
              <button
                key={String(f)}
                type="button"
                onClick={() => setFull(f)}
                className={cx('glass rounded-[18px] p-3 text-left', full === f && '!border-accent/70 !bg-accent-solid/12')}
              >
                <p className="text-[15px] font-bold text-fg">{f ? 'Полный вариант' : 'Короткий'}</p>
                <p className="text-[12.5px] text-muted">{f ? `${blueprint.length} заданий · ${meta.format.minutes} мин` : `10 заданий · ${Math.round((meta.format.minutes * 10) / meta.format.tasks)} мин`}</p>
              </button>
            ))}
          </div>
        )}
        <Card glow={meta.color} className="mb-4">
          <p className="eyebrow mb-1">Формат</p>
          <p className="text-[28px] leading-tight font-extrabold text-fg">
            {pluralN(size, ['задание', 'задания', 'заданий'])} · {minutes} мин
          </p>
          <p className="mt-2 text-[14px] leading-relaxed text-fg-2">
            {blueprint
              ? `Как настоящий вариант по спецификации РИКЗ: часть A — ${meta.format.partA}, часть B — ${meta.format.partB}, разделы и уровни I–V в тех же долях, сложность растёт к концу. В части A бывает несколько верных вариантов. Ответы проверим в конце.`
              : `Пропорция частей A и B и темп — как на ЦТ (${meta.format.tasks} заданий за ${meta.format.minutes} минут). Ответы проверим в конце, к любому заданию можно вернуться.`}
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
  const seen = useStore((s) => s.progress.srs)
  const tasks = useMemo<PreparedTask[]>(() => {
    const blueprint = BLUEPRINTS[subject]
    return blueprint ? buildBlueprintMock(content, blueprint, size, new Set(Object.keys(seen))) : buildMock(content, size, meta.format.partA / meta.format.tasks)
    // Вариант собирается один раз на запуск: прогресс меняется в конце и не должен его пересобрать.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, size, meta, subject])
  const [index, setIndex] = useState(0)
  const [answers, setAnswers] = useState<(Given | null)[]>(() => tasks.map(() => null))
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
          given: givenText(p.task, given),
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
        {BLUEPRINTS[subject] && <BlockBreakdown results={results.map((r) => ({ block: blockOf(r.p.task), ok: r.ok }))} />}
        <div className="mb-4 grid grid-cols-6 gap-2">
          {results.map((r, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setReview(i)}
              className={cx('flex h-11 items-center justify-center rounded-xl text-[14px] font-bold', r.ok ? 'bg-good/15 text-good' : 'bg-bad/12 text-bad')}
            >
              {r.p.slot ?? i + 1}
            </button>
          ))}
        </div>
        <Button block size="lg" onClick={pop}>
          Готово
        </Button>
        <Sheet open={review !== null} onClose={() => setReview(null)} title={review !== null ? `Задание ${results[review].p.slot ?? review + 1}` : ''}>
          {review !== null && (
            <div className="space-y-3">
              <div className="text-[15px] leading-relaxed text-fg">
                <Tex>{results[review].p.task.q}</Tex>
              </div>
              <p className="text-[14px] text-fg-2">
                Твой ответ:{' '}
                <span className={results[review].ok ? 'text-good' : 'text-bad'}>
                  {results[review].given === null ? '—' : <Tex>{givenText(results[review].p.task, results[review].given)}</Tex>}
                </span>
                <br />
                Верно: <b className="text-fg"><Tex>{answerText(results[review].p.task)}</Tex></b>
              </p>
              <Markdown className="text-[14px] leading-relaxed text-fg-2">{results[review].p.task.explain}</Markdown>
              <ReportTask key={results[review].p.task.id} taskId={results[review].p.task.id} />
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
        title={`${current.slot ?? `Задание ${index + 1}`} · ${index + 1}/${tasks.length}`}
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
            {tasks[i].slot ?? i + 1}
          </button>
        ))}
      </div>
      <motion.div key={index} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={springSoft}>
        <TaskMeta task={current.task} topicTitle={topic?.title} color={meta.color} slot={current.slot} />
        <TaskBody
          prepared={current}
          verdict={null}
          reveal={false}
          selected={typeof answers[index] === 'number' || Array.isArray(answers[index]) ? (answers[index] as number | number[]) : null}
          onSelect={(opt) =>
            setAnswers((a) =>
              a.map((v, i) => {
                if (i !== index) return v
                if (!isMulti(current.task)) return opt
                const marks = Array.isArray(v) ? v : []
                const next = marks.includes(opt) ? marks.filter((x) => x !== opt) : [...marks, opt].sort((x, y) => x - y)
                return next.length ? next : null
              }),
            )
          }
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

/** Итог по разделам спецификации: где теряются баллы. */
function BlockBreakdown({ results }: { results: { block: keyof typeof BLOCK_TITLES | undefined; ok: boolean }[] }) {
  const rows = new Map<string, { ok: number; total: number }>()
  for (const r of results) {
    if (!r.block) continue
    const row = rows.get(r.block) ?? { ok: 0, total: 0 }
    row.total++
    if (r.ok) row.ok++
    rows.set(r.block, row)
  }
  return (
    <Card className="mb-4 space-y-2.5">
      <p className="eyebrow">По разделам</p>
      {[...rows.entries()].map(([block, row]) => (
        <div key={block}>
          <div className="mb-1 flex justify-between text-[13.5px]">
            <span className="text-fg-2">{BLOCK_TITLES[block as keyof typeof BLOCK_TITLES]}</span>
            <span className="tabular font-semibold text-fg">
              {row.ok}/{row.total}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-line-strong">
            <div className={cx('h-full rounded-full', row.ok / row.total >= 0.7 ? 'bg-good' : row.ok / row.total >= 0.4 ? 'bg-warn' : 'bg-bad')} style={{ width: `${(row.ok / row.total) * 100}%` }} />
          </div>
        </div>
      ))}
    </Card>
  )
}
