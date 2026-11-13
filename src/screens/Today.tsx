import { motion } from 'motion/react'
import { useMemo } from 'react'
import { ChevronRight, Flame } from 'lucide-react'
import { useSubjects } from '../content'
import { nextExam, upcomingEvents, isOngoing } from '../domain/calendar'
import { SUBJECTS } from '../domain/subjects'
import type { SubjectId } from '../domain/types'
import { forecast, liveStreak, streakAtRisk, todayStats, weakTopics, topicRows } from '../lib/analytics'
import { dayKey, formatDay, formatRange, plural, pluralN } from '../lib/format'
import { isDue } from '../lib/srs'
import { useStore } from '../lib/store'
import { telegramUser } from '../lib/telegram'
import { useNav, useTutorBus } from '../nav/nav'
import { Badge, Button, Card, Counter, Row, Stagger, StaggerItem, tap } from '../ui/kit'
import { cx } from '../lib/cx'

function Avatar({ name, onClick }: { name: string; onClick: () => void }) {
  const photo = telegramUser()?.photo_url
  return (
    <motion.button type="button" whileTap={{ scale: 0.92 }} onClick={onClick} aria-label="Профиль и настройки" className="shrink-0 rounded-full">
      {photo ? (
        <img src={photo} alt="" className="h-10 w-10 rounded-full object-cover" />
      ) : (
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-2 text-[16px] font-bold text-fg">{(name || 'Я').slice(0, 1).toUpperCase()}</span>
      )}
    </motion.button>
  )
}

/**
 * «Сегодня»: одно главное действие. Сверху — сколько сделано из плана дня и кнопка,
 * которая сама выбирает следующий шаг (повторение → слабая тема → тренировка).
 * Ниже — короткий список остального: слабая тема, полный вариант, прогноз, календарь.
 */
export function TodayScreen() {
  const profile = useStore((s) => s.profile)
  const progress = useStore((s) => s.progress)
  const generated = useStore((s) => s.generated)
  const demo = useStore((s) => s.demo)
  const push = useNav((s) => s.push)
  const switchTab = useNav((s) => s.switchTab)
  const openTutor = useTutorBus((s) => s.open)
  const contents = useSubjects(profile.subjects)

  const now = new Date()
  const exam = nextExam(profile.subjects, profile.exam, now)
  const today = todayStats(progress, now)
  const streak = liveStreak(progress, now)
  const risk = streakAtRisk(progress, now)
  const goal = Math.max(5, profile.dailyGoal)

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

  const event = upcomingEvents(now, 1)[0]
  const name = profile.name || telegramUser()?.first_name || ''
  const first = profile.subjects[0]

  // Следующий шаг для главной кнопки.
  const review = dueTotal > 0 && dueSubject ? dueSubject : null
  const next: { label: string; subject: SubjectId; go: () => void } | null = review
    ? {
        label: `Повторение · ${pluralN(dueTotal, ['задание', 'задания', 'заданий'])}`,
        subject: review,
        go: () => push({ name: 'practice', subject: review, review: true, size: Math.min(15, dueBySubject[review] ?? 10), title: 'Повторение' }),
      }
    : weakest
      ? {
          label: weakest.topic.title,
          subject: weakest.subject,
          go: () => push({ name: 'practice', subject: weakest.subject, topicIds: [weakest.topic.id], size: 8, title: weakest.topic.title }),
        }
      : first
        ? { label: SUBJECTS[first].short, subject: first, go: () => push({ name: 'practice', subject: first, size: 10 }) }
        : null

  const forecastSubject = exam?.subject ?? first
  const forecastContent = forecastSubject ? contents[forecastSubject] : null
  const score = forecastSubject && forecastContent && progress.attempts.some((a) => a.s === forecastSubject) ? forecast(forecastSubject, forecastContent, progress).score : null
  const target = forecastSubject ? profile.targets[forecastSubject] : undefined
  const done = Math.min(today.tasks, goal)

  return (
    <Stagger className="space-y-4 pt-2">
      <StaggerItem className="flex items-end gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[13px] text-muted">{formatDay(day, true)}</p>
          <h1 className="truncate text-[30px] leading-tight font-extrabold tracking-[-0.03em] text-fg">Сегодня</h1>
        </div>
        {demo && <Badge color="var(--c-warn)">демо</Badge>}
        <motion.button
          type="button"
          whileTap={{ scale: 0.92 }}
          onClick={() => {
            tap()
            push({ name: 'achievements' })
          }}
          className={cx('glass flex h-10 items-center gap-1.5 rounded-full px-3 text-[15px] font-bold', risk ? 'text-warn' : streak ? 'text-fg' : 'text-muted')}
          aria-label={`Серия ${streak} дней`}
        >
          <Flame size={18} fill={streak ? 'currentColor' : 'none'} />
          <span className="tabular">{streak}</span>
        </motion.button>
        <Avatar
          name={name}
          onClick={() => {
            tap()
            switchTab('profile')
          }}
        />
      </StaggerItem>

      <StaggerItem>
        <Card glow={next ? SUBJECTS[next.subject].color : undefined} className="space-y-3">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-[13.5px] text-fg-2">{today.tasks >= goal ? 'План на сегодня выполнен' : 'План на сегодня'}</p>
            {exam && (
              <button type="button" onClick={() => push({ name: 'calendar' })} className="flex shrink-0 items-center gap-0.5 text-[13px] font-semibold text-fg-2">
                {exam.kind === 'ce' ? 'ЦЭ' : 'ЦТ'} через {pluralN(exam.days, ['день', 'дня', 'дней'])} <ChevronRight size={15} />
              </button>
            )}
          </div>
          <div className="flex items-baseline gap-1">
            <Counter value={today.tasks} className="tabular text-[56px] leading-none font-extrabold tracking-[-0.04em] text-fg" />
            <span className="tabular text-[24px] font-semibold text-muted">/{goal}</span>
            <span className="ml-2 text-[13.5px] text-muted">{plural(goal, ['задание', 'задания', 'заданий'])}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-line-strong" role="progressbar" aria-valuemin={0} aria-valuemax={goal} aria-valuenow={done}>
            <div className="h-full rounded-full bg-accent-solid transition-[width] duration-500" style={{ width: `${(done / goal) * 100}%` }} />
          </div>
          {risk && <p className="text-[13px] text-warn">Серия {pluralN(streak, ['день', 'дня', 'дней'])} под угрозой — хватит пяти заданий, чтобы её сохранить.</p>}
          {next ? (
            <Button block size="lg" className="!justify-between" onClick={next.go} trailing={<span className="min-w-0 truncate text-[12.5px] font-medium opacity-80">{next.label}</span>}>
              {today.tasks === 0 ? 'Начать' : today.tasks >= goal ? 'Ещё задания' : 'Продолжить'}
            </Button>
          ) : (
            <Button block size="lg" onClick={() => switchTab('subjects')}>
              Выбрать предметы
            </Button>
          )}
        </Card>
      </StaggerItem>

      <StaggerItem>
        <Card padded={false} className="divide-y divide-line px-4">
          {weakest && review && (
            <Row
              title={`Слабая тема: ${weakest.topic.title}`}
              subtitle={`${SUBJECTS[weakest.subject].short} · верно ${weakest.n ? Math.round(weakest.accuracy * 100) : 0}%`}
              onClick={() => push({ name: 'practice', subject: weakest.subject, topicIds: [weakest.topic.id], size: 8, title: weakest.topic.title })}
            />
          )}
          {weakest && (
            <Row
              title="Разобрать тему с репетитором"
              subtitle={weakest.topic.title}
              onClick={() => openTutor({ mode: 'explain', subject: weakest.subject, topicId: weakest.topic.id, prompt: `Объясни тему «${weakest.topic.title}» простыми словами и покажи типичную ловушку ЦТ.` })}
            />
          )}
          {(exam?.subject ?? first) && (
            <Row title={`Пробный вариант: ${SUBJECTS[(exam?.subject ?? first)!].short}`} subtitle="На время, как на экзамене" onClick={() => push({ name: 'mock', subject: (exam?.subject ?? first)! })} />
          )}
          {forecastSubject && (
            <Row
              title={`Прогноз: ${SUBJECTS[forecastSubject].short}`}
              subtitle={score === null ? 'Появится после первых заданий' : `${score} из 100${target ? ` · цель ${target}` : ''}`}
              onClick={() => switchTab('progress')}
            />
          )}
          {event && (
            <Row
              title={event.title}
              subtitle={`${formatRange(event.start, event.end)}${event.tentative ? ' · ориентировочно' : ''}${isOngoing(event, now) ? ' · идёт сейчас' : ''}`}
              onClick={() => push({ name: 'calendar' })}
            />
          )}
        </Card>
      </StaggerItem>
    </Stagger>
  )
}
