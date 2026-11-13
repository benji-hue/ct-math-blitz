import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { Check, HeartHandshake, NotebookPen, Pause, Phone, Play, MessagesSquare, Wind } from 'lucide-react'
import { haptic } from '../lib/telegram'
import { useTutorBus } from '../nav/nav'
import { Header } from '../ui/chrome'
import { Button, Card, SectionTitle, Stagger, StaggerItem, tap } from '../ui/kit'
import { springSoft } from '../ui/motion'
import { cx } from '../lib/cx'

/**
 * Антистресс — только техники с доказанной пользой:
 *  - дыхание с удлинённым выдохом снижает физиологическое возбуждение
 *    (систематический обзор Zaccaro et al., 2018);
 *  - переоценка волнения как ресурса улучшала результат GRE (Jamieson et al., 2010);
 *  - 10 минут письма о тревогах перед экзаменом повышали баллы (Ramirez & Beilock, Science, 2011).
 */

const PHASES = [
  { label: 'Вдох', seconds: 4, scale: 1 },
  { label: 'Выдох', seconds: 6, scale: 0.55 },
] as const

const CHECKLIST_KEY = 'krok:exam-checklist'

const CHECKLIST = [
  'Паспорт или ID-карта',
  'Пропуск на ЦЭ/ЦТ',
  'Чёрная гелевая или капиллярная ручка — лучше две',
  'Калькулятор только на физику и химию — проверь требования в памятке РИКЗ',
  'Адрес пункта и номер аудитории',
  'Вода и лёгкий перекус до начала',
  'Выйти с запасом — опоздавших не допускают',
  'Лечь спать вовремя: сон закрепляет выученное',
]

function Breathing() {
  const [running, setRunning] = useState(false)
  const [phase, setPhase] = useState(0)
  const [cycles, setCycles] = useState(0)
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => {
    if (!running) return
    haptic.impact('soft')
    timer.current = window.setTimeout(() => {
      setPhase((p) => {
        const next = (p + 1) % PHASES.length
        if (next === 0) setCycles((c) => c + 1)
        return next
      })
    }, PHASES[phase].seconds * 1000)
    return () => window.clearTimeout(timer.current)
  }, [running, phase])

  const current = PHASES[phase]

  return (
    <Card className="flex flex-col items-center py-7">
      <div className="relative mb-6 flex h-52 w-52 items-center justify-center">
        <motion.span
          className="absolute inset-0 rounded-full"
          style={{ background: 'radial-gradient(circle, color-mix(in oklab, var(--c-good) 45%, transparent) 0%, transparent 70%)' }}
          animate={{ scale: running ? current.scale * 1.15 : 0.7, opacity: running ? 1 : 0.5 }}
          transition={{ duration: running ? current.seconds : 0.6, ease: 'easeInOut' }}
        />
        <motion.span
          className="absolute h-40 w-40 rounded-full border-2 border-good/40 bg-good/10"
          animate={{ scale: running ? current.scale : 0.8 }}
          transition={{ duration: running ? current.seconds : 0.6, ease: 'easeInOut' }}
        />
        <div className="relative text-center">
          <AnimatePresence mode="wait">
            <motion.p key={running ? current.label : 'idle'} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className="text-[24px] font-bold text-fg">
              {running ? current.label : 'Готов?'}
            </motion.p>
          </AnimatePresence>
        </div>
      </div>
      <p className="-mt-2 mb-4 text-[13px] text-muted">{running ? `${current.seconds} секунд` : 'вдох 4 секунды · выдох 6 секунд'}</p>
      <Button
        icon={running ? <Pause size={18} /> : <Play size={18} />}
        variant={running ? 'secondary' : 'primary'}
        onClick={() => {
          setRunning((r) => !r)
          setPhase(0)
        }}
      >
        {running ? 'Пауза' : 'Начать дыхание'}
      </Button>
      <p className="mt-3 text-[12.5px] text-muted">{cycles > 0 ? `Циклов: ${cycles}. Обычно хватает пяти-шести.` : 'Длинный выдох включает «тормоз» нервной системы.'}</p>
    </Card>
  )
}

function Worries() {
  const [text, setText] = useState('')
  const [released, setReleased] = useState(false)
  return (
    <Card>
      <p className="mb-1 flex items-center gap-2 text-[15px] font-semibold text-fg">
        <NotebookPen size={17} className="text-accent" /> Выпиши тревогу
      </p>
      <p className="mb-3 text-[13px] leading-relaxed text-muted">
        10 минут перед экзаменом: что именно пугает и почему. Тревога перестаёт занимать рабочую память. Текст никуда не отправляется и не сохраняется.
      </p>
      <AnimatePresence mode="wait">
        {released ? (
          <motion.p key="done" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={springSoft} className="py-6 text-center text-[15px] text-fg-2">
            Отпущено. Ты сделал всё, что мог, — теперь просто иди шаг за шагом.
          </motion.p>
        ) : (
          <motion.div key="form" exit={{ opacity: 0, y: -30, filter: 'blur(6px)' }} transition={{ duration: 0.6 }}>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={5}
              placeholder="Я волнуюсь, что…"
              className="glass w-full resize-none rounded-2xl p-3 text-[15px] text-fg outline-none placeholder:text-faint"
            />
            <Button
              className="mt-2"
              variant="secondary"
              disabled={text.trim().length < 10}
              onClick={() => {
                tap('soft')
                setReleased(true)
                setText('')
              }}
            >
              Отпустить
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  )
}

function Checklist() {
  const [done, setDone] = useState<number[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(CHECKLIST_KEY) ?? '[]') as number[]
    } catch {
      return []
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem(CHECKLIST_KEY, JSON.stringify(done))
    } catch {
      // ignore
    }
  }, [done])
  return (
    <Card padded={false} className="divide-y divide-line px-4">
      {CHECKLIST.map((item, i) => {
        const on = done.includes(i)
        return (
          <button
            key={i}
            type="button"
            onClick={() => {
              tap('light')
              setDone((d) => (on ? d.filter((x) => x !== i) : [...d, i]))
            }}
            className="flex w-full items-center gap-3 py-3 text-left"
          >
            <motion.span
              animate={{ scale: on ? [1, 1.2, 1] : 1 }}
              className={cx('flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border-2 transition-colors', on ? 'border-good bg-good text-white' : 'border-line-strong')}
            >
              {on && <Check size={14} strokeWidth={3} />}
            </motion.span>
            <span className={cx('flex-1 text-[14.5px] transition-colors', on ? 'text-muted line-through' : 'text-fg')}>{item}</span>
          </button>
        )
      })}
    </Card>
  )
}

export default function CalmScreen() {
  const openTutor = useTutorBus((s) => s.open)
  return (
    <div>
      <Header close title="Антистресс" subtitle="Техники с доказанной пользой" />
      <Stagger className="space-y-4">
        <StaggerItem>
          <Breathing />
        </StaggerItem>

        <StaggerItem>
          <Card glow="#a497ff">
            <p className="mb-1 flex items-center gap-2 text-[15px] font-semibold text-fg">
              <MessagesSquare size={17} className="text-accent" /> Волнение — это топливо
            </p>
            <p className="text-[14px] leading-relaxed text-fg-2">
              Колотится сердце? Это организм мобилизуется. Скажи себе: <b className="text-fg">«Я взволнован, и это поможет мне собраться»</b>. В экспериментах такая переоценка повышала результаты на экзаменах — в отличие от попыток «успокоиться».
            </p>
          </Card>
        </StaggerItem>

        <StaggerItem>
          <Worries />
        </StaggerItem>

        <StaggerItem>
          <SectionTitle>Чек-лист дня экзамена</SectionTitle>
          <Checklist />
        </StaggerItem>

        <StaggerItem>
          <Button block variant="secondary" icon={<Wind size={18} />} onClick={() => openTutor({ mode: 'calm', prompt: 'Я волнуюсь перед экзаменом. Помоги собраться.' })}>
            Поговорить с ИИ
          </Button>
        </StaggerItem>

        <StaggerItem>
          <Card className="flex gap-3">
            <HeartHandshake size={22} className="mt-0.5 shrink-0 text-bad" />
            <div className="text-[13.5px] leading-relaxed text-fg-2">
              <p className="font-semibold text-fg">Если очень тяжело</p>
              <p className="mt-0.5">
                Республиканская детская линия: <a href="tel:88011001611" className="font-semibold text-accent">8-801-100-16-11</a> — бесплатно, анонимно, круглосуточно. Экстренно — <a href="tel:103" className="font-semibold text-accent">103</a> или <a href="tel:112" className="font-semibold text-accent">112</a>.
              </p>
              <p className="mt-1 flex items-center gap-1 text-[12px] text-muted">
                <Phone size={12} /> Звонок с мобильного по Беларуси
              </p>
            </div>
          </Card>
        </StaggerItem>
      </Stagger>
    </div>
  )
}
