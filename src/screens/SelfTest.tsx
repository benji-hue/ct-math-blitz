import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { BookOpen, Camera, Check, ClipboardCheck, Info, RefreshCw, TriangleAlert, WandSparkles, X } from 'lucide-react'
import { topicById, useSubject } from '../content'
import { SUBJECTS } from '../domain/subjects'
import type { SubjectId } from '../domain/types'
import { AiError, compressImage, generateSelfTest, gradeSelfTest } from '../lib/ai'
import { cx } from '../lib/cx'
import { formatDuration, pluralN } from '../lib/format'
import { prepareTask, type PreparedTask } from '../lib/practice'
import {
  checkSelfTestAnswer,
  LEVEL_NAMES,
  levelsDone,
  MAX_POINTS,
  markTable,
  OFFICIAL_SUBJECTS,
  scoreSelfTest,
  toTask,
  type GradeResult,
  type SelfTest,
  type SelfTestSize,
} from '../lib/selftest'
import { useStore } from '../lib/store'
import { setClosingConfirmation } from '../lib/telegram'
import { useBackGuard, useLessonBus, useNav, useTutorBus } from '../nav/nav'
import { Header, Sheet, burstConfetti, toast, useNow } from '../ui/chrome'
import { Badge, Button, Card, Segmented, Skeleton, notify, tap } from '../ui/kit'
import { springSoft } from '../ui/motion'
import { Markdown, Tex } from '../ui/Rich'
import { LETTERS, TaskBody } from '../ui/TaskView'

/**
 * Самостоятельная работа «как в школе РБ»: задания по пяти уровням учебной
 * деятельности, баллы и отметка — по нормам Минобразования (методические
 * указания к постановлению № 184 от 11.07.2022). Можно проверить решения по
 * фото тетради: тогда, как у учителя, учитывается не только ответ, но и ход
 * решения (за существенную ошибку −50 %, за несущественную −10 %).
 */

const GRADE_LABEL: Record<string, string> = { '9': '9 класс', '10': '10 класс', '11': '11 класс', grad: 'выпускник школы' }
const MINUTES: Record<SelfTestSize, number> = { 5: 20, 10: 40 }
const SOURCE = 'Методические указания Минобразования РБ от 15.09.2022 к постановлению № 184 от 11.07.2022'

export default function SelfTestScreen({ subject, topic, topicId }: { subject: SubjectId | null; topic: string; topicId: string | null }) {
  const meta = subject ? SUBJECTS[subject] : null
  const content = useSubject(subject)
  const topicObj = topicById(content, topicId ?? '')
  const grade = useStore((s) => s.profile.grade)
  const lesson = useLessonBus((s) => s.context)
  const [size, setSize] = useState<'5' | '10'>('5')
  const [usePhoto, setUsePhoto] = useState(Boolean(lesson?.image))
  const [phase, setPhase] = useState<'setup' | 'loading' | 'run'>('setup')
  const [test, setTest] = useState<SelfTest | null>(null)
  const [error, setError] = useState<string | null>(null)
  const abort = useRef<AbortController | null>(null)
  const official = subject ? OFFICIAL_SUBJECTS.has(subject) : false
  const n = Number(size) as SelfTestSize

  useEffect(() => () => abort.current?.abort(), [])

  async function run() {
    setError(null)
    setPhase('loading')
    abort.current?.abort()
    const controller = new AbortController()
    abort.current = controller
    try {
      const result = await generateSelfTest(
        {
          subject,
          subjectTitle: meta?.title ?? 'Школьный предмет',
          topic,
          size: n,
          grade: GRADE_LABEL[grade],
          image: usePhoto && lesson?.image ? { mime: lesson.image.mime, data: lesson.image.data } : undefined,
          lesson: lesson?.lesson || undefined,
          topicFacts: topicObj?.facts,
        },
        controller.signal,
      )
      setTest(result)
      setPhase('run')
      notify('success')
    } catch (e) {
      if ((e as Error).name === 'AbortError') return
      setError((e as Error).message)
      setPhase('setup')
      notify('error')
    }
  }

  if (phase === 'run' && test) {
    return <SelfTestRun key={test.title + test.tasks[0]?.q} test={test} subject={subject} topic={topic} topicId={topicId} official={official} onAgain={() => setPhase('setup')} />
  }

  return (
    <div>
      <Header close title="Самостоятельная" subtitle={meta ? `${meta.short} · ${topic}` : topic} />

      {phase === 'setup' && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={springSoft} className="space-y-4">
          <Card glow={meta?.color}>
            <p className="eyebrow mb-1">Как в школе</p>
            <p className="text-[14.5px] leading-relaxed text-fg-2">
              Задания по пяти уровням — от узнавания до применения в новой ситуации, каждое следующее дороже.{' '}
              {official ? 'Баллы и отметка — по нормам оценки Минобразования РБ.' : 'По этому предмету в школе свои нормы оценки — покажу баллы, но без отметки.'}
            </p>
          </Card>

          <div>
            <p className="mb-2 px-1 text-[13px] text-muted">Объём</p>
            <Segmented
              layoutId="st-size"
              value={size}
              onChange={setSize}
              options={[
                { value: '5', label: '5 заданий' },
                { value: '10', label: '10 заданий' },
              ]}
            />
            <p className="mt-2 px-1 text-[12.5px] text-muted">
              ≈ {MINUTES[n]} минут · максимум {MAX_POINTS[n]} баллов{n === 10 ? ' · по два задания на уровень' : ' · по одному заданию на уровень'}
            </p>
          </div>

          {lesson?.image && (
            <button
              type="button"
              onClick={() => {
                tap()
                setUsePhoto((v) => !v)
              }}
              className={cx('glass flex w-full items-center gap-3 rounded-2xl p-2.5 text-left', usePhoto && 'ring-2 ring-accent')}
            >
              <img src={lesson.image.preview} alt="" className="h-12 w-12 rounded-xl object-cover" />
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-semibold text-fg">По фото параграфа</span>
                <span className="block text-[12.5px] text-muted">Задания — в объёме этой страницы учебника</span>
              </span>
              <span className={cx('flex h-6 w-6 items-center justify-center rounded-full', usePhoto ? 'bg-accent-solid text-on-accent' : 'bg-surface-2')}>
                {usePhoto && <Check size={14} strokeWidth={3} />}
              </span>
            </button>
          )}

          {error && (
            <Card className="flex gap-2.5 !border-bad/40">
              <TriangleAlert size={18} className="mt-0.5 shrink-0 text-bad" />
              <p className="text-[14px] text-fg-2">{error}</p>
            </Card>
          )}

          <Button block size="lg" icon={<WandSparkles size={19} />} onClick={run}>
            Составить работу
          </Button>
          <p className="px-1 text-center text-[12px] leading-relaxed text-muted">Ответы к заданиям перепроверяет вторая модель. Если задание кажется неверным — спроси репетитора.</p>
        </motion.div>
      )}

      {phase === 'loading' && (
        <div className="space-y-3 pt-2">
          <p className="mb-3 text-center text-[14px] text-muted">Составляю и перепроверяю задания… обычно до минуты</p>
          {Array.from({ length: 3 }, (_, i) => (
            <Card key={i}>
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="mt-3 h-4 w-full" />
              <Skeleton className="mt-2 h-4 w-4/5" />
            </Card>
          ))}
          <Button
            block
            variant="ghost"
            onClick={() => {
              abort.current?.abort()
              setPhase('setup')
            }}
          >
            Отменить
          </Button>
        </div>
      )}
    </div>
  )
}

function SelfTestRun({
  test,
  subject,
  topic,
  topicId,
  official,
  onAgain,
}: {
  test: SelfTest
  subject: SubjectId | null
  topic: string
  topicId: string | null
  official: boolean
  onAgain: () => void
}) {
  const meta = subject ? SUBJECTS[subject] : null
  const grade = useStore((s) => s.profile.grade)
  const openTutor = useTutorBus((s) => s.open)
  const pop = useNav((s) => s.pop)
  const [salt] = useState(() => Date.now().toString(36))
  const prepared = useMemo<PreparedTask[]>(() => test.tasks.map((t) => prepareTask(toTask(t, subject ?? 'math', topicId ?? 'selftest', salt))), [test, subject, topicId, salt])
  const [answers, setAnswers] = useState<(number | string | null)[]>(() => test.tasks.map(() => null))
  const [inputs, setInputs] = useState<string[]>(() => test.tasks.map(() => ''))
  const [finished, setFinished] = useState<null | { seconds: number }>(null)
  const [confirm, setConfirm] = useState(false)
  const [howSheet, setHowSheet] = useState(false)
  const [open, setOpen] = useState<Record<number, boolean>>({})
  const [photo, setPhoto] = useState<GradeResult | null>(null)
  const [grading, setGrading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const [startedAt] = useState(() => Date.now())
  const now = useNow(1000)
  const elapsed = Math.round(((finished ? startedAt + finished.seconds * 1000 : now) - startedAt) / 1000)

  useEffect(() => {
    setClosingConfirmation(!finished)
    return () => setClosingConfirmation(false)
  }, [finished])

  useBackGuard(() => {
    if (finished) return false
    setConfirm(true)
    return true
  })

  const correct = useMemo(() => test.tasks.map((t, i) => checkSelfTestAnswer(t, answers[i])), [test, answers])
  const score = useMemo(() => scoreSelfTest(test, correct, photo), [test, correct, photo])
  const done = levelsDone(test, score.tasks)
  const answered = answers.filter((a) => a !== null && a !== '').length

  function finish() {
    setConfirm(false)
    setFinished({ seconds: Math.round((Date.now() - startedAt) / 1000) })
    tap('heavy')
    const result = scoreSelfTest(test, test.tasks.map((t, i) => checkSelfTestAnswer(t, answers[i])), null)
    if (result.points >= result.max * 0.8) {
      notify('success')
      burstConfetti()
    } else notify('warning')
    window.scrollTo?.({ top: 0 })
    document.querySelector('[data-screen]')?.scrollTo?.({ top: 0, behavior: 'smooth' })
  }

  async function gradePhoto(file: File | undefined) {
    if (!file) return
    setGrading(true)
    try {
      const image = await compressImage(file, 1600, 0.85)
      const result = await gradeSelfTest({
        subject,
        subjectTitle: meta?.title ?? 'Школьный предмет',
        grade: GRADE_LABEL[grade],
        image: { mime: image.mime, data: image.data },
        tasks: test.tasks.map((t, i) => {
          const order = prepared[i].order
          const variants = t.options ? `\nВарианты: ${order.map((oi, pos) => `${LETTERS[pos]}) ${t.options![oi]}`).join('; ')}` : ''
          const answer = t.options ? `${LETTERS[order.indexOf(t.answer as number)]}) ${t.options[t.answer as number]}` : String(t.answer)
          return { n: t.n, level: t.level, max: t.points, q: `${t.q}${variants}`, answer, solution: t.solution }
        }),
      })
      setPhoto(result)
      notify('success')
      toast('Тетрадь проверена', 'success')
    } catch (e) {
      notify('error')
      toast((e as AiError).message || 'Не удалось проверить фото', 'error')
    } finally {
      setGrading(false)
    }
  }

  function explainMistake(i: number) {
    const t = test.tasks[i]
    const p = prepared[i]
    const given = answers[i]
    openTutor({
      mode: 'mistake',
      subject,
      topicId,
      prompt: `Разбери моё задание ${t.n} из самостоятельной по теме «${topic}».`,
      task: {
        q: t.q,
        options: t.options ? p.order.map((oi) => t.options![oi]) : undefined,
        correct: t.options ? t.options[t.answer as number] : String(t.answer),
        given: given === null ? undefined : typeof given === 'number' && t.options ? t.options[given] : String(given),
        explain: t.solution,
        trap: t.check,
      },
    })
  }

  return (
    <div>
      <Header
        close
        onBack={() => (finished ? pop() : setConfirm(true))}
        title={finished ? 'Результат' : test.title}
        subtitle={`${pluralN(test.size, ['задание', 'задания', 'заданий'])} · максимум ${score.max} баллов`}
        right={<span className="rounded-full bg-surface-2 px-2.5 py-1 font-mono text-[13px] text-fg-2 tabular-nums">{formatDuration(elapsed)}</span>}
      />

      {finished && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={springSoft} className="mb-4 space-y-3">
          <Card glow={meta?.color} className="text-center">
            <p className="eyebrow mb-1">{official ? 'Отметка' : 'Баллы'}</p>
            {official ? (
              <p className="text-[56px] leading-none font-extrabold tracking-[-0.03em] text-fg">
                {score.mark}
                <span className="text-[22px] font-bold text-muted"> / 10</span>
              </p>
            ) : (
              <p className="text-[44px] leading-none font-extrabold text-fg">{Math.round(score.points)}</p>
            )}
            <p className="mt-2 text-[14px] text-fg-2">
              {Math.round(score.points * 10) / 10} из {score.max} баллов · {formatDuration(finished.seconds)}
            </p>
            <p className="mt-1 text-[12.5px] text-muted">{photo ? 'с учётом проверки тетради по фото' : 'по ответам — учитель смотрит и на решение, проверь тетрадь по фото'}</p>
            <div className="mt-3 flex justify-center gap-1.5">
              {[1, 2, 3, 4, 5].map((level) => (
                <span
                  key={level}
                  title={LEVEL_NAMES[level - 1]}
                  className={cx('flex h-8 w-8 items-center justify-center rounded-xl text-[13px] font-bold', done.includes(level) ? 'bg-good text-white' : 'bg-surface-2 text-muted')}
                >
                  {level}
                </span>
              ))}
            </div>
            <p className="mt-1.5 text-[12px] text-muted">освоенные уровни: {done.length ? done.map((l) => LEVEL_NAMES[l - 1]).join(', ') : 'пока ни одного полностью'}</p>
            <button type="button" onClick={() => setHowSheet(true)} className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-accent">
              <Info size={14} /> Как считается
            </button>
          </Card>

          {!photo ? (
            <Card>
              <div className="flex gap-3">
                <ClipboardCheck size={20} className="mt-0.5 shrink-0 text-accent" />
                <div className="min-w-0">
                  <p className="text-[14.5px] font-semibold text-fg">Проверить по фото тетради</p>
                  <p className="mt-0.5 text-[13px] leading-relaxed text-fg-2">Как учитель: за существенную ошибку балл за задание снижается на 50 %, за несущественную — на 10 %. Подпиши номера заданий.</p>
                </div>
              </div>
              <Button block className="mt-3" variant="secondary" icon={grading ? undefined : <Camera size={18} />} disabled={grading} onClick={() => fileRef.current?.click()}>
                {grading ? 'Проверяю… до минуты' : 'Сфоткать тетрадь'}
              </Button>
              <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => gradePhoto(e.target.files?.[0])} />
            </Card>
          ) : (
            photo.summary && (
              <Card>
                <p className="eyebrow mb-1">Проверка тетради</p>
                <p className="text-[14px] leading-relaxed text-fg-2">
                  <Tex>{photo.summary}</Tex>
                </p>
              </Card>
            )
          )}
        </motion.div>
      )}

      <div className="space-y-3 pb-6">
        {test.tasks.map((t, i) => {
          const p = prepared[i]
          const s = score.tasks[i]
          const graded = photo?.tasks.find((g) => g.n === t.n && g.seen)
          const ok = finished ? s.points >= s.max : false
          return (
            <Card key={t.n} className={cx(finished && (ok ? '!border-good/40' : '!border-bad/30'))}>
              <div className="mb-3 flex flex-wrap items-center gap-1.5">
                <span className="text-[14px] font-bold text-fg">Задание {t.n}</span>
                <Badge color={meta?.color ?? 'var(--c-accent)'}>уровень {t.level} · {LEVEL_NAMES[t.level - 1]}</Badge>
                <Badge color="var(--c-muted)">
                  {finished ? `${Math.round(s.points * 10) / 10} из ${t.points}` : pluralN(t.points, ['балл', 'балла', 'баллов'])}
                </Badge>
              </div>
              <TaskBody
                prepared={p}
                verdict={finished ? { correct: correct[i], given: answers[i] ?? '' } : null}
                reveal={Boolean(finished)}
                selected={typeof answers[i] === 'number' ? (answers[i] as number) : null}
                onSelect={(opt) => setAnswers((a) => a.map((v, k) => (k === i ? opt : v)))}
                inputValue={inputs[i]}
                onInput={(v) => {
                  setInputs((x) => x.map((y, k) => (k === i ? v : y)))
                  setAnswers((a) => a.map((y, k) => (k === i ? (v.trim() ? v : null) : y)))
                }}
              />
              {finished && (
                <div className="mt-3 space-y-2">
                  {!t.options && !correct[i] && (
                    <p className="text-[13.5px] text-fg-2">
                      Ответ: <b className="text-fg"><Tex>{String(t.answer)}</Tex></b>
                    </p>
                  )}
                  {graded && (
                    <div className="rounded-2xl bg-surface-2 p-3 text-[13px] leading-relaxed text-fg-2">
                      <p className="mb-1 font-semibold text-fg">По фото: {graded.points} из {t.points}</p>
                      {graded.errors.map((e, k) => (
                        <p key={k}>
                          <span className={cx('font-semibold', e.kind === 'существенная' ? 'text-bad' : e.kind === 'несущественная' ? 'text-warn' : 'text-muted')}>{e.kind}:</span> <Tex>{e.text}</Tex>
                        </p>
                      ))}
                      {graded.comment && <p className="mt-1"><Tex>{graded.comment}</Tex></p>}
                    </div>
                  )}
                  <div className="flex flex-wrap gap-3 text-[13.5px] font-semibold">
                    <button type="button" className="flex items-center gap-1.5 text-accent" onClick={() => setOpen((o) => ({ ...o, [t.n]: !o[t.n] }))}>
                      <BookOpen size={15} /> {open[t.n] ? 'Скрыть решение' : 'Решение'}
                    </button>
                    {!ok && (
                      <button type="button" className="flex items-center gap-1.5 text-accent" onClick={() => explainMistake(i)}>
                        <WandSparkles size={15} /> Разобрать с ИИ
                      </button>
                    )}
                  </div>
                  <AnimatePresence initial={false}>
                    {open[t.n] && (
                      <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                        <div className="rounded-2xl bg-surface-2 p-3 text-[14px]">
                          <Markdown>{t.solution}</Markdown>
                          {t.check && <p className="mt-2 text-[12.5px] text-muted">Существенная ошибка здесь: {t.check}</p>}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}
            </Card>
          )
        })}
      </div>

      {!finished ? (
        <div className="pb-8">
          <Button block size="lg" icon={<Check size={19} />} onClick={() => (answered < test.tasks.length ? setConfirm(true) : finish())}>
            Сдать работу
          </Button>
          <p className="mt-2 text-center text-[12.5px] text-muted">
            Отвечено {answered} из {test.tasks.length} · рекомендуемое время {MINUTES[test.size]} минут
          </p>
        </div>
      ) : (
        <div className="space-y-2.5 pb-8">
          <Button block size="lg" icon={<RefreshCw size={18} />} onClick={onAgain}>
            Ещё вариант
          </Button>
          <Button block variant="secondary" onClick={pop}>
            Готово
          </Button>
        </div>
      )}

      <Sheet open={confirm} onClose={() => setConfirm(false)} title="Сдать работу?">
        <p className="mb-4 text-[14.5px] leading-relaxed text-fg-2">
          {answered < test.tasks.length ? `Без ответа: ${test.tasks.length - answered}. Их засчитаем как невыполненные.` : 'Все задания с ответами.'} Выйти без сдачи — работа не сохранится.
        </p>
        <div className="space-y-2.5">
          <Button block size="lg" onClick={finish}>
            Сдать
          </Button>
          <Button block variant="secondary" onClick={() => setConfirm(false)}>
            Продолжить решать
          </Button>
          <Button
            block
            variant="ghost"
            icon={<X size={17} />}
            onClick={() => {
              setConfirm(false)
              setClosingConfirmation(false)
              pop()
            }}
          >
            Выйти без сдачи
          </Button>
        </div>
      </Sheet>

      <Sheet open={howSheet} onClose={() => setHowSheet(false)} title="Как считается отметка">
        <div className="space-y-3 pb-2 text-[14px] leading-relaxed text-fg-2">
          <p>
            Работа из {test.size} заданий: {test.size === 5 ? 'по одному' : 'по два'} на каждый из пяти уровней. Баллы за задания: {test.tasks.map((t) => t.points).join(', ')} — всего {score.max}.
          </p>
          {official ? (
            <>
              <div className="grid grid-cols-5 gap-1.5 text-center text-[12.5px]">
                {markTable(test.size).map((row) => (
                  <div key={row.mark} className={cx('rounded-xl bg-surface-2 px-1 py-1.5', row.mark === score.mark && 'ring-2 ring-accent')}>
                    <p className="font-bold text-fg">{row.mark}</p>
                    <p className="text-muted">{row.range}</p>
                  </div>
                ))}
              </div>
              <p className="text-[12.5px] text-muted">Сверху — отметка, снизу — сумма баллов.</p>
            </>
          ) : (
            <p>По этому предмету в школе свои нормы оценки, поэтому отметку не ставлю — только баллы.</p>
          )}
          <p>При проверке решения балл за задание снижается не менее чем на 50 % за существенную ошибку, на 10 % — за несущественную, на 5 % — за нерациональный способ или небрежную запись. Сумма округляется до целого.</p>
          <p className="text-[12.5px] text-muted">Источник: {SOURCE}. Отметка в приложении ориентировочная — в классе её ставит учитель.</p>
        </div>
      </Sheet>
    </div>
  )
}
