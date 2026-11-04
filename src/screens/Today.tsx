import { motion } from 'motion/react'
import { useMemo, type ReactNode } from 'react'
import {
  BookOpen,
  Brain,
  Camera,
  ChevronRight,
  Flame,
  Lightbulb,
  Play,
  RotateCcw,
  Sparkles,
  Timer,
  Wind,
  Zap,
} from 'lucide-react'
import { useSubjects } from '../content'
import { EXAM_START_TIME, nextExam, upcomingEvents, isOngoing } from '../domain/calendar'
import { SUBJECTS } from '../domain/subjects'
import { ERROR_TYPES, type SubjectId } from '../domain/types'
import { errorBreakdown, liveStreak, streakAtRisk, todayStats, weakTopics, topicRows, levelFromXp } from '../lib/analytics'
import { dayKey, formatDay, formatRange, greeting, plural, pluralN } from '../lib/format'
import { isDue } from '../lib/srs'
import { useStore } from '../lib/store'
import { telegramUser } from '../lib/telegram'
import { useNav, useTutorBus } from '../nav/nav'
import { Badge, Card, Counter, ProgressRing, SectionTitle, Stagger, StaggerItem, tap } from '../ui/kit'
import { SubjectIcon } from '../ui/SubjectIcon'
import { cx } from '../lib/cx'

function Avatar({ name }: { name: string }) {
  const photo = telegramUser()?.photo_url
  if (photo) return <img src={photo} alt="" className="h-11 w-11 rounded-full object-cover ring-2 ring-line-strong" />
  return (
    <span className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-[#7c6cff] to-[#3dd6f5] text-[17px] font-bold text-white">
      {(name || 'Я').slice(0, 1).toUpperCase()}
    </span>
  )
}

export function TodayScreen() {
  const profile = useStore((s) => s.profile)
  const progress = useStore((s) => s.progress)
  const generated = useStore((s) => s.generated)
  const demo = useStore((s) => s.demo)
  const push = useNav((s) => s.push)
  const openTutor = useTutorBus((s) => s.open)
  const contents = useSubjects(profile.subjects)

  const now = new Date()
  const exam = nextExam(profile.subjects, profile.exam, now)
  const today = todayStats(progress, now)
  const streak = liveStreak(progress, now)
  const risk = streakAtRisk(progress, now)
  const goal = Math.max(5, profile.dailyGoal)
  const level = levelFromXp(progress.xp)

  // Пересчёт при смене дня: если приложение открыто через полночь, к повторению прибавляются задания.
  const day = dayKey(now)
  const dueBySubject = useMemo(() => {
    const at = new Date()
    const out: Partial<Record<SubjectId, number>> = {}
    for (const id of profile.subjects) {
      const tasks = [...(contents[id]?.tasks ?? []), ...Object.values(generated).filter((t) => t.subject === id)]
      out[id] = tasks.filter((t) => progress.srs[t.id] && isDue(progress.srs[t.id], at)).length
    }
    return out
    // day — намеренная зависимость: пересчитать, когда наступили новые сутки.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contents, progress.srs, generated, profile.subjects, day])
  const dueTotal = Object.values(dueBySubject).reduce<number>((s, n) => s + (n ?? 0), 0)
  const dueSubject = (Object.entries(dueBySubject) as [SubjectId, number][]).sort((a, b) => b[1] - a[1])[0]?.[0]

  const weakest = useMemo(() => {
    const all = profile.subjects.flatMap((id) => {
      const c = contents[id]
      return c ? weakTopics(topicRows(c, progress), 2).map((r) => ({ ...r, subject: id })) : []
    })
    return all.sort((a, b) => a.mastery - b.mastery)[0]
  }, [contents, progress, profile.subjects])

  const errors = errorBreakdown(progress.attempts)
  const topError = (Object.entries(errors) as [keyof typeof ERROR_TYPES, number][]).sort((a, b) => b[1] - a[1])[0]
  const totalErrors = Object.values(errors).reduce((a, b) => a + b, 0)

  const events = upcomingEvents(now, 3)
  const name = profile.name || telegramUser()?.first_name || ''

  return (
    <Stagger className="space-y-4 pt-2">
      <StaggerItem className="flex items-center gap-3">
        <Avatar name={name} />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] text-muted">{greeting(now)}</p>
          <h1 className="truncate text-[22px] leading-tight font-bold tracking-[-0.02em] text-fg">{name || 'Готов к шагу?'}</h1>
        </div>
        {demo && <Badge color="var(--c-warn)">демо</Badge>}
        <motion.button
          type="button"
          whileTap={{ scale: 0.92 }}
          onClick={() => {
            tap()
            push({ name: 'achievements' })
          }}
          className={cx('glass flex h-10 items-center gap-1.5 rounded-full px-3 text-[15px] font-bold', risk ? 'text-warn' : streak ? 'text-[#ff8a3d]' : 'text-muted')}
          aria-label={`Серия ${streak} дней`}
        >
          <Flame size={18} fill={streak ? 'currentColor' : 'none'} />
          <span className="tabular">{streak}</span>
        </motion.button>
      </StaggerItem>

      {exam && (
        <StaggerItem>
          <Card glow={SUBJECTS[exam.subject].color} interactive onClick={() => push({ name: 'calendar' })} className="overflow-hidden">
            <div className="flex items-center gap-4">
              <div className="min-w-0 flex-1">
                <p className="eyebrow mb-1">До {exam.kind === 'ce' ? 'ЦЭ' : 'ЦТ'} · {SUBJECTS[exam.subject].short}</p>
                <div className="flex items-baseline gap-2">
                  <Counter value={exam.days} className="text-[52px] leading-none font-extrabold tracking-[-0.04em] text-fg" />
                  <span className="text-[17px] font-semibold text-fg-2">{plural(exam.days, ['день', 'дня', 'дней'])}</span>
                </div>
                <p className="mt-1.5 text-[13px] text-muted">
                  {formatDay(exam.date, true)}, начало в {EXAM_START_TIME}
                </p>
              </div>
              <SubjectIcon id={exam.subject} size={58} />
            </div>
            <div className="mt-4 flex items-center gap-3 border-t border-line pt-3 text-[12.5px] text-muted">
              <span className="flex items-center gap-1.5">
                <Timer size={14} /> {SUBJECTS[exam.subject].format.minutes} мин
              </span>
              <span>·</span>
              <span>{pluralN(SUBJECTS[exam.subject].format.tasks, ['задание', 'задания', 'заданий'])}</span>
              <span className="ml-auto flex items-center gap-0.5 font-semibold text-accent">
                Календарь <ChevronRight size={15} />
              </span>
            </div>
          </Card>
        </StaggerItem>
      )}

      <StaggerItem>
        <Card>
          <div className="mb-3 flex items-center gap-4">
            <ProgressRing value={today.tasks / goal} size={64} stroke={7} color="var(--c-good)">
              <span className="tabular text-[15px] font-bold text-fg">{Math.min(99, Math.round((today.tasks / goal) * 100))}%</span>
            </ProgressRing>
            <div className="min-w-0 flex-1">
              <p className="text-[17px] font-bold text-fg">План на сегодня</p>
              <p className="text-[13px] text-muted">
                {today.tasks >= goal
                  ? 'Цель дня выполнена — дальше только бонус'
                  : `${today.tasks} из ${goal} заданий · уровень ${level.level}`}
              </p>
            </div>
          </div>

          <div className="divide-y divide-line">
            <PlanRow
              icon={<RotateCcw size={18} />}
              color="#3dd6f5"
              title={dueTotal ? `Повторение: ${pluralN(dueTotal, ['карточка', 'карточки', 'карточек'])}` : 'Повторение на сегодня закрыто'}
              text={dueTotal ? 'Пик забывания — лучшее время вспомнить' : 'FSRS вернёт задания, когда подойдёт срок'}
              disabled={!dueTotal || !dueSubject}
              onClick={() => dueSubject && push({ name: 'practice', subject: dueSubject, review: true, size: Math.min(15, dueBySubject[dueSubject] ?? 10), title: 'Повторение' })}
            />
            {weakest ? (
              <PlanRow
                icon={<Zap size={18} />}
                color="#ffc857"
                title={`Подтянуть: ${weakest.topic.title}`}
                text={`${SUBJECTS[weakest.subject].short} · освоено ${Math.round(weakest.mastery * 100)}%`}
                onClick={() => push({ name: 'practice', subject: weakest.subject, topicIds: [weakest.topic.id], size: 8, title: weakest.topic.title })}
              />
            ) : (
              profile.subjects[0] && (
                <PlanRow
                  icon={<Zap size={18} />}
                  color="#ffc857"
                  title={`Тренировка: ${SUBJECTS[profile.subjects[0]].short}`}
                  text="10 заданий вперемешку — найдём слабые места"
                  onClick={() => push({ name: 'practice', subject: profile.subjects[0], size: 10 })}
                />
              )
            )}
            {exam && (
              <PlanRow
                icon={<Timer size={18} />}
                color="#a497ff"
                title={`Пробник: ${SUBJECTS[exam.subject].short}`}
                text="Мини-вариант на время, как на ЦТ"
                onClick={() => push({ name: 'mock', subject: exam.subject })}
              />
            )}
          </div>
        </Card>
      </StaggerItem>

      {(weakest || totalErrors > 0 || risk) && (
        <StaggerItem>
          <Card glow="#ffc857" className="flex gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-warn/15 text-warn">
              <Lightbulb size={20} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-semibold text-fg">
                {risk
                  ? `Серия ${streak} ${plural(streak, ['день', 'дня', 'дней'])} под угрозой`
                  : weakest
                    ? `Пробел: «${weakest.topic.title}»`
                    : 'Инсайт по ошибкам'}
              </p>
              <p className="mt-0.5 text-[13.5px] leading-snug text-fg-2">
                {risk
                  ? 'Хватит пяти заданий, чтобы её сохранить. Регулярность важнее длинных сессий.'
                  : weakest
                    ? `Верно ${weakest.n ? Math.round(weakest.accuracy * 100) : 0}% ответов. Разберём тему с ИИ: объяснение займёт 3 минуты.`
                    : topError && topError[1] > 0
                      ? `Чаще всего — «${ERROR_TYPES[topError[0]].label.toLowerCase()}» (${Math.round((topError[1] / totalErrors) * 100)}%). ${ERROR_TYPES[topError[0]].hint}.`
                      : ''}
              </p>
              {weakest && !risk && (
                <button
                  type="button"
                  onClick={() => {
                    tap()
                    openTutor({ mode: 'explain', subject: weakest.subject, topicId: weakest.topic.id, prompt: `Объясни тему «${weakest.topic.title}» простыми словами и покажи типичную ловушку ЦТ.` })
                  }}
                  className="mt-2 flex items-center gap-1 text-[13.5px] font-semibold text-accent"
                >
                  <Sparkles size={15} /> Разобрать с ИИ
                </button>
              )}
            </div>
          </Card>
        </StaggerItem>
      )}

      <StaggerItem>
        <div className="no-scrollbar -mx-4 flex gap-2.5 overflow-x-auto px-4 pb-1">
          <Quick icon={<Sparkles size={20} />} color="#a497ff" label="Спросить ИИ" onClick={() => openTutor({ mode: 'tutor' })} />
          <Quick icon={<Camera size={20} />} color="#3dd6f5" label="Фото решения" onClick={() => openTutor({ mode: 'check', photo: true })} />
          <Quick icon={<Brain size={20} />} color="#ff7ad9" label="Блиц формул" onClick={() => push({ name: 'blitz' })} />
          <Quick icon={<Wind size={20} />} color="#3ee0a1" label="Антистресс" onClick={() => push({ name: 'calm' })} />
          <Quick icon={<BookOpen size={20} />} color="#ffc857" label="Библиотека" onClick={() => push({ name: 'library' })} />
        </div>
      </StaggerItem>

      <StaggerItem>
        <SectionTitle
          action={
            <button type="button" className="text-[13px] font-semibold text-accent" onClick={() => push({ name: 'calendar' })}>
              Все даты
            </button>
          }
        >
          Ближайшее
        </SectionTitle>
        <Card padded={false} className="divide-y divide-line px-4">
          {events.map((e) => (
            <div key={e.id} className="flex items-center gap-3 py-3">
              <span
                className={cx(
                  'h-2.5 w-2.5 shrink-0 rounded-full',
                  isOngoing(e, now) ? 'bg-good shadow-[0_0_0_4px_color-mix(in_oklab,var(--c-good)_25%,transparent)]' : 'bg-line-strong',
                )}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14.5px] font-medium text-fg">{e.title}</p>
                <p className="text-[12.5px] text-muted">
                  {formatRange(e.start, e.end)}
                  {e.tentative ? ' · ориентировочно' : ''}
                  {isOngoing(e, now) ? ' · идёт сейчас' : ''}
                </p>
              </div>
            </div>
          ))}
        </Card>
      </StaggerItem>

      {profile.subjects.length > 0 && (
        <StaggerItem>
          <SectionTitle>Мои предметы</SectionTitle>
          <div className="grid grid-cols-2 gap-2.5">
            {profile.subjects.map((id) => (
              <Card key={id} interactive onClick={() => push({ name: 'subject', id })} className="flex items-center gap-3 !p-3">
                <SubjectIcon id={id} size={38} />
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-semibold text-fg">{SUBJECTS[id].short}</p>
                  <p className="text-[12px] text-muted">
                    {dueBySubject[id] ? `${dueBySubject[id]} к повторению` : 'открыть'}
                  </p>
                </div>
              </Card>
            ))}
          </div>
        </StaggerItem>
      )}
    </Stagger>
  )
}

function PlanRow({
  icon,
  color,
  title,
  text,
  onClick,
  disabled,
}: {
  icon: ReactNode
  color: string
  title: string
  text: string
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <motion.button
      type="button"
      disabled={disabled}
      whileTap={disabled ? undefined : { scale: 0.98 }}
      onClick={() => {
        tap()
        onClick()
      }}
      className={cx('flex w-full items-center gap-3 py-3 text-left', disabled && 'opacity-55')}
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: `color-mix(in oklab, ${color} 16%, transparent)`, color }}>
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14.5px] font-semibold text-fg">{title}</span>
        <span className="block truncate text-[12.5px] text-muted">{text}</span>
      </span>
      {!disabled && (
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-solid text-on-accent">
          <Play size={14} fill="currentColor" />
        </span>
      )}
    </motion.button>
  )
}

function Quick({ icon, color, label, onClick }: { icon: ReactNode; color: string; label: string; onClick: () => void }) {
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.94 }}
      onClick={() => {
        tap()
        onClick()
      }}
      className="glass flex w-[92px] shrink-0 flex-col items-center gap-2 rounded-[20px] px-2 py-3"
    >
      <span className="flex h-11 w-11 items-center justify-center rounded-2xl" style={{ background: `color-mix(in oklab, ${color} 18%, transparent)`, color }}>
        {icon}
      </span>
      <span className="text-center text-[11.5px] leading-tight font-semibold text-fg-2">{label}</span>
    </motion.button>
  )
}
