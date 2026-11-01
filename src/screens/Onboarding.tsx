import { AnimatePresence, motion } from 'motion/react'
import { useState, type CSSProperties, type ReactNode } from 'react'
import { ArrowRight, Brain, CalendarDays, Check, Sparkles, Target } from 'lucide-react'
import { APP_NAME, APP_TAGLINE } from '../config'
import { GROUP_LABEL, SUBJECT_LIST, SUBJECTS } from '../domain/subjects'
import type { SubjectId } from '../domain/types'
import { buildDemoState } from '../lib/demo'
import { enterDemo, useStore, type ExamTrack, type Grade11 } from '../lib/store'
import { cx } from '../lib/cx'
import { Button, Chip, notify, tap } from '../ui/kit'
import { springSoft } from '../ui/motion'
import { SubjectIcon } from '../ui/SubjectIcon'

const STEPS = ['welcome', 'exam', 'subjects', 'targets'] as const
type Step = (typeof STEPS)[number]

const GRADES: { value: Grade11; label: string }[] = [
  { value: '9', label: '9 класс' },
  { value: '10', label: '10 класс' },
  { value: '11', label: '11 класс' },
  { value: 'grad', label: 'Выпускник' },
]

const TRACKS: { value: ExamTrack; title: string; text: string }[] = [
  { value: 'ce', title: 'ЦЭ', text: 'Выпускной централизованный экзамен в 11 классе' },
  { value: 'ct', title: 'ЦТ', text: 'Централизованное тестирование для поступления' },
  { value: 'both', title: 'ЦЭ и ЦТ', text: 'Сдаю экзамен и иду на тестирование' },
]

function Feature({ icon, title, text, delay }: { icon: ReactNode; title: string; text: string; delay: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...springSoft, delay }}
      className="glass flex items-start gap-3 rounded-[20px] p-3.5"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-solid/15 text-accent">{icon}</span>
      <span>
        <span className="block text-[15px] font-semibold text-fg">{title}</span>
        <span className="mt-0.5 block text-[13px] leading-snug text-muted">{text}</span>
      </span>
    </motion.div>
  )
}

export function Onboarding() {
  const [step, setStep] = useState<Step>('welcome')
  const [dir, setDir] = useState(1)
  const [grade, setGrade] = useState<Grade11>('11')
  const [exam, setExam] = useState<ExamTrack>('both')
  const [subjects, setSubjects] = useState<SubjectId[]>(['math', 'rus'])
  const [targets, setTargets] = useState<Partial<Record<SubjectId, number>>>({})
  const complete = useStore((s) => s.completeOnboarding)

  const index = STEPS.indexOf(step)
  const go = (next: Step) => {
    setDir(STEPS.indexOf(next) > index ? 1 : -1)
    setStep(next)
  }

  const toggle = (id: SubjectId) => {
    tap('light')
    setSubjects((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]))
  }

  const finish = () => {
    notify('success')
    complete({ grade, exam, subjects, targets, dailyGoal: 15 })
  }

  return (
    <div className="relative z-10 flex min-h-dvh flex-col px-5" style={{ paddingTop: 'calc(var(--app-top) + 20px)', paddingBottom: 'calc(var(--app-bottom) + 20px)' }}>
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col">
        {step !== 'welcome' && (
          <div className="mb-6 flex gap-1.5">
            {STEPS.slice(1).map((s, i) => (
              <span key={s} className="h-1 flex-1 overflow-hidden rounded-full bg-line-strong">
                <motion.span
                  className="block h-full rounded-full bg-accent"
                  initial={false}
                  animate={{ width: i < index ? '100%' : '0%' }}
                  transition={springSoft}
                />
              </span>
            ))}
          </div>
        )}

        <AnimatePresence mode="wait" custom={dir} initial={false}>
          <motion.div
            key={step}
            custom={dir}
            initial={{ opacity: 0, x: dir * 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: dir * -40 }}
            transition={springSoft}
            className="flex flex-1 flex-col"
          >
            {step === 'welcome' && (
              <>
                <div className="flex flex-1 flex-col justify-center py-6">
                  <motion.div
                    initial={{ scale: 0.6, opacity: 0, rotate: -12 }}
                    animate={{ scale: 1, opacity: 1, rotate: 0 }}
                    transition={{ type: 'spring', stiffness: 200, damping: 16 }}
                    className="relative mb-6 h-20 w-20"
                  >
                    <span className="orb absolute inset-0 rounded-[28px] opacity-80 blur-md" />
                    <span className="absolute inset-0 flex items-center justify-center rounded-[28px] bg-solid text-accent shadow-xl">
                      <Steps />
                    </span>
                  </motion.div>
                  <p className="eyebrow mb-2">ЦЭ · ЦТ · РТ — Беларусь</p>
                  <h1 className="text-[40px] leading-[1.05] font-extrabold tracking-[-0.03em] text-fg">
                    {APP_NAME}
                    <span className="gradient-text">.</span>
                  </h1>
                  <p className="mt-3 text-[17px] leading-relaxed text-fg-2">{APP_TAGLINE}. Персональный ИИ-репетитор по всем 14 предметам ЦЭ и ЦТ.</p>
                  <div className="mt-7 space-y-2.5">
                    <Feature delay={0.1} icon={<Target size={20} />} title="Задания по спецификации РИКЗ" text="Части А и В, уровни сложности, разбор ловушек" />
                    <Feature delay={0.18} icon={<Brain size={20} />} title="Повторение по науке" text="Алгоритм FSRS напомнит тему ровно перед тем, как она забудется" />
                    <Feature delay={0.26} icon={<Sparkles size={20} />} title="ИИ разбирает ошибки" text="Объясняет, почему ошибся, а не просто даёт ответ" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Button block size="lg" onClick={() => go('exam')} trailing={<ArrowRight size={18} />}>
                    Начать
                  </Button>
                  <Button
                    block
                    variant="ghost"
                    size="md"
                    onClick={() => {
                      buildDemoState().then((state) => {
                        enterDemo(state)
                        notify('success')
                      })
                    }}
                  >
                    Посмотреть демо-профиль
                  </Button>
                </div>
              </>
            )}

            {step === 'exam' && (
              <>
                <h2 className="text-[28px] leading-tight font-bold tracking-[-0.02em] text-fg">Что сдаёшь?</h2>
                <p className="mt-1.5 mb-5 text-[15px] text-muted">Подстроим план и обратный отсчёт.</p>
                <div className="mb-5 flex flex-wrap gap-2">
                  {GRADES.map((g) => (
                    <Chip key={g.value} active={grade === g.value} onClick={() => setGrade(g.value)}>
                      {g.label}
                    </Chip>
                  ))}
                </div>
                <div className="space-y-2.5">
                  {TRACKS.map((t) => (
                    <motion.button
                      key={t.value}
                      type="button"
                      whileTap={{ scale: 0.98 }}
                      onClick={() => {
                        tap('light')
                        setExam(t.value)
                      }}
                      className={cx(
                        'glass flex w-full items-center gap-3 rounded-[20px] p-4 text-left transition-colors',
                        exam === t.value && 'ring-2 ring-accent',
                      )}
                    >
                      <span className="flex h-11 min-w-11 items-center justify-center rounded-xl bg-accent-solid/15 px-2 text-[14px] font-bold text-accent">{t.title}</span>
                      <span className="flex-1 text-[14px] leading-snug text-fg-2">{t.text}</span>
                      <span className={cx('flex h-6 w-6 items-center justify-center rounded-full border', exam === t.value ? 'border-accent bg-accent-solid text-white' : 'border-line-strong')}>
                        {exam === t.value && <Check size={14} />}
                      </span>
                    </motion.button>
                  ))}
                </div>
                <p className="mt-4 flex items-center gap-2 text-[12.5px] text-muted">
                  <CalendarDays size={14} /> ЦЭ и ЦТ-2027 стартуют 27 мая.
                </p>
                <div className="mt-auto flex gap-2 pt-6">
                  <Button variant="secondary" onClick={() => go('welcome')}>
                    Назад
                  </Button>
                  <Button block onClick={() => go('subjects')} trailing={<ArrowRight size={18} />}>
                    Дальше
                  </Button>
                </div>
              </>
            )}

            {step === 'subjects' && (
              <>
                <h2 className="text-[28px] leading-tight font-bold tracking-[-0.02em] text-fg">Твои предметы</h2>
                <p className="mt-1.5 mb-4 text-[15px] text-muted">Выбери всё, что сдаёшь. Поменять можно в профиле.</p>
                <div className="-mx-1 flex-1 space-y-4 overflow-y-auto px-1 pb-2">
                  {(['core', 'stem', 'humanities', 'foreign'] as const).map((group) => (
                    <div key={group}>
                      <p className="eyebrow mb-2">{GROUP_LABEL[group]}</p>
                      <div className="grid grid-cols-2 gap-2">
                        {SUBJECT_LIST.filter((s) => s.group === group).map((s) => {
                          const active = subjects.includes(s.id)
                          return (
                            <motion.button
                              key={s.id}
                              type="button"
                              whileTap={{ scale: 0.96 }}
                              onClick={() => toggle(s.id)}
                              className={cx('glass flex items-center gap-2.5 rounded-[18px] p-2.5 text-left', active && 'ring-2')}
                              style={active ? ({ '--tw-ring-color': s.color } as CSSProperties) : undefined}
                            >
                              <SubjectIcon id={s.id} size={34} />
                              <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-fg">{s.short}</span>
                            </motion.button>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2 pt-4">
                  <Button variant="secondary" onClick={() => go('exam')}>
                    Назад
                  </Button>
                  <Button block disabled={subjects.length === 0} onClick={() => go('targets')} trailing={<ArrowRight size={18} />}>
                    Выбрано: {subjects.length}
                  </Button>
                </div>
              </>
            )}

            {step === 'targets' && (
              <>
                <h2 className="text-[28px] leading-tight font-bold tracking-[-0.02em] text-fg">Цели в баллах</h2>
                <p className="mt-1.5 mb-5 text-[15px] text-muted">Не знаешь — оставь 80. Прогресс покажет, сколько осталось.</p>
                <div className="flex-1 space-y-2.5 overflow-y-auto">
                  {subjects.map((id) => {
                    const value = targets[id] ?? 80
                    return (
                      <div key={id} className="glass rounded-[20px] p-3.5">
                        <div className="mb-2 flex items-center gap-2.5">
                          <SubjectIcon id={id} size={30} />
                          <span className="flex-1 text-[14.5px] font-semibold text-fg">{SUBJECTS[id].short}</span>
                          <span className="tabular text-[20px] font-bold text-fg">{value}</span>
                        </div>
                        <input
                          type="range"
                          min={30}
                          max={100}
                          step={5}
                          value={value}
                          onChange={(e) => {
                            tap('soft')
                            setTargets((t) => ({ ...t, [id]: Number(e.target.value) }))
                          }}
                          className="w-full"
                          style={{ accentColor: SUBJECTS[id].color }}
                          aria-label={`Цель по предмету ${SUBJECTS[id].short}`}
                        />
                      </div>
                    )
                  })}
                </div>
                <div className="flex gap-2 pt-4">
                  <Button variant="secondary" onClick={() => go('subjects')}>
                    Назад
                  </Button>
                  <Button block onClick={finish} trailing={<Check size={18} />}>
                    Поехали
                  </Button>
                </div>
              </>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}

/** Логотип: три ступени — «крок» по-белорусски «шаг». */
export function Steps({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden>
      <rect x="3" y="19" width="7" height="9" rx="2.2" fill="currentColor" opacity="0.45" />
      <rect x="12.5" y="12" width="7" height="16" rx="2.2" fill="currentColor" opacity="0.72" />
      <rect x="22" y="4" width="7" height="24" rx="2.2" fill="currentColor" />
    </svg>
  )
}
