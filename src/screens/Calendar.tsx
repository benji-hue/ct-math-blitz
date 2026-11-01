import { CalendarDays, CircleCheck, ClipboardCheck, FlaskConical, GraduationCap } from 'lucide-react'
import { CALENDAR, daysUntil, EXAM_START_TIME, isOngoing, type CalendarEvent } from '../domain/calendar'
import { SUBJECTS } from '../domain/subjects'
import { formatRange, plural } from '../lib/format'
import { useStore } from '../lib/store'
import { openExternal } from '../lib/telegram'
import { Header } from '../ui/chrome'
import { Badge, Button, Card, Stagger, StaggerItem } from '../ui/kit'
import { cx } from '../lib/cx'

const KIND: Record<CalendarEvent['kind'], { icon: typeof CalendarDays; color: string; label: string }> = {
  rehearsal: { icon: FlaskConical, color: '#3dd6f5', label: 'Репетиция' },
  registration: { icon: ClipboardCheck, color: '#ffc857', label: 'Регистрация' },
  exam: { icon: GraduationCap, color: '#a497ff', label: 'Экзамен' },
  result: { icon: CircleCheck, color: '#3ee0a1', label: 'Результаты' },
}

export default function CalendarScreen() {
  const mine = useStore((s) => s.profile.subjects)
  const now = new Date()

  return (
    <div>
      <Header title="Календарь 2026/2027" subtitle="ЦЭ, ЦТ и репетиционное тестирование" />
      <Stagger className="relative space-y-3 pl-6">
        <span className="absolute top-2 bottom-2 left-[9px] w-[2px] rounded bg-line-strong" />
        {CALENDAR.map((e) => {
          const k = KIND[e.kind]
          const ongoing = isOngoing(e, now)
          const past = daysUntil(e.end ?? e.start, now) < 0
          const days = daysUntil(e.start, now)
          const relevant = e.subjects?.filter((s) => mine.includes(s)) ?? []
          return (
            <StaggerItem key={e.id} className={cx('relative', past && 'opacity-50')}>
              <span
                className={cx('absolute top-5 -left-6 h-5 w-5 rounded-full border-[3px] border-canvas', ongoing && 'pulse-ring')}
                style={{ background: k.color }}
              />
              <Card glow={relevant.length ? k.color : undefined}>
                <div className="mb-1 flex items-center gap-2">
                  <Badge color={k.color}>
                    <k.icon size={12} /> {k.label}
                  </Badge>
                  {e.tentative && <Badge color="var(--c-muted)">ориентировочно</Badge>}
                  {ongoing && <Badge color="var(--c-good)">идёт сейчас</Badge>}
                </div>
                <p className="text-[16px] leading-snug font-semibold text-fg">{e.title}</p>
                <p className="mt-0.5 text-[13.5px] text-fg-2">
                  {formatRange(e.start, e.end)}
                  {e.kind === 'exam' && e.id !== 'reserve' ? `, ${EXAM_START_TIME}` : ''}
                  {!past && !ongoing && days > 0 && <span className="text-muted"> · через {days} {plural(days, ['день', 'дня', 'дней'])}</span>}
                </p>
                {e.note && <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{e.note}</p>}
                {relevant.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {relevant.map((s) => (
                      <Badge key={s} color={SUBJECTS[s].color}>
                        {SUBJECTS[s].short}
                      </Badge>
                    ))}
                  </div>
                )}
              </Card>
            </StaggerItem>
          )
        })}
      </Stagger>
      <div className="mt-5 space-y-2">
        <Button block variant="secondary" onClick={() => openExternal('https://rikc.by/')}>
          Сайт РИКЗ — официальные даты
        </Button>
        <p className="px-1 text-center text-[12px] text-muted">Даты модулей РТ и генеральной репетиции РИКЗ уточняет по ходу года.</p>
      </div>
    </div>
  )
}
