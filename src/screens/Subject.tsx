import { ArrowUpRight, Brain, CalendarDays, Check, Info, Plus, RotateCcw, Sparkles, Timer, Trophy, Zap } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { useSubject } from '../content'
import { SUBJECTS } from '../domain/subjects'
import { sourcesFor } from '../domain/sources'
import type { SubjectId } from '../domain/types'
import { forecast, topicRows } from '../lib/analytics'
import { formatDay, formatNumber } from '../lib/format'
import { isDue } from '../lib/srs'
import { useStore } from '../lib/store'
import { openExternal } from '../lib/telegram'
import { useNav, useTutorBus } from '../nav/nav'
import { Header, Sheet } from '../ui/chrome'
import { Badge, Bar, Button, Card, Chip, Row, SectionTitle, Skeleton, Stagger, StaggerItem, tap } from '../ui/kit'
import { SubjectIcon } from '../ui/SubjectIcon'

export function SubjectScreen({ id }: { id: SubjectId }) {
  const meta = SUBJECTS[id]
  const content = useSubject(id)
  const progress = useStore((s) => s.progress)
  const generated = useStore((s) => s.generated)
  const profile = useStore((s) => s.profile)
  const updateProfile = useStore((s) => s.updateProfile)
  const push = useNav((s) => s.push)
  const openTutor = useTutorBus((s) => s.open)
  const [howOpen, setHowOpen] = useState(false)
  const isMine = profile.subjects.includes(id)

  const rows = useMemo(() => (content ? topicRows(content, progress) : []), [content, progress])
  const fc = content ? forecast(id, content, progress) : null
  const target = profile.targets[id]
  const due = content
    ? [...content.tasks, ...Object.values(generated).filter((t) => t.subject === id)].filter((t) => progress.srs[t.id] && isDue(progress.srs[t.id])).length
    : 0
  const sources = sourcesFor(id).filter((s) => s.subjects?.includes(id) || ['e-padruchnik', 'specs-2026', 'drt'].includes(s.id))
  const answered = rows.reduce((s, r) => s + r.n, 0)

  return (
    <div>
      <Header />
      <Stagger className="space-y-4">
        <StaggerItem className="flex items-center gap-4">
          <SubjectIcon id={id} size={64} />
          <div className="min-w-0 flex-1">
            <h1 className="text-[26px] leading-[1.1] font-extrabold tracking-[-0.03em] text-fg">{meta.title}</h1>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Badge color={meta.color}>{meta.format.tasks} заданий</Badge>
              <Badge color={meta.color}>
                A{meta.format.partA} + B{meta.format.partB}
              </Badge>
              <Badge color={meta.color}>{meta.format.minutes} мин</Badge>
            </div>
          </div>
        </StaggerItem>

        {!isMine && (
          <StaggerItem>
            <Button variant="secondary" block icon={<Plus size={18} />} onClick={() => updateProfile({ subjects: [...profile.subjects, id] })}>
              Добавить в мои предметы
            </Button>
          </StaggerItem>
        )}

        {fc && answered > 0 && (
          <StaggerItem>
            <Card glow={meta.color}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="eyebrow mb-1">Прогноз балла · бета</p>
                  <p className="text-[40px] leading-none font-extrabold tracking-[-0.03em] text-fg">
                    {fc.low}–{fc.high}
                  </p>
                  <p className="mt-1.5 text-[13px] text-muted">
                    {target ? `Цель ${target} · ` : ''}по {answered} ответам
                  </p>
                </div>
                <button type="button" onClick={() => setHowOpen(true)} className="flex items-center gap-1 text-[12.5px] font-semibold text-accent">
                  <Info size={14} /> Как считается
                </button>
              </div>
              <div className="relative mt-4">
                <Bar value={fc.score / 100} color={meta.color} height={8} />
                {target && (
                  <span className="absolute -top-1 h-4 w-0.5 rounded bg-fg" style={{ left: `${target}%` }} title={`Цель ${target}`} />
                )}
              </div>
              <p className="mt-2 text-[12px] text-muted">Покрытие программы: {Math.round(fc.coverage * 100)}% — чем больше тем пройдено, тем точнее прогноз</p>
            </Card>
          </StaggerItem>
        )}

        <StaggerItem className="grid grid-cols-2 gap-2.5">
          <ActionTile icon={<Zap size={20} />} color="#ffc857" title="Тренировка" text="10 заданий, адаптивно" onClick={() => push({ name: 'practice', subject: id, size: 10 })} />
          <ActionTile icon={<Timer size={20} />} color="#a497ff" title="Пробник" text="Мини-вариант на время" onClick={() => push({ name: 'mock', subject: id })} />
          <ActionTile
            icon={<RotateCcw size={20} />}
            color="#3dd6f5"
            title="Повторение"
            text={due ? `${due} ждут` : 'пока пусто'}
            disabled={!due}
            onClick={() => push({ name: 'practice', subject: id, review: true, size: Math.min(15, due), title: 'Повторение' })}
          />
          <ActionTile
            icon={<Sparkles size={20} />}
            color="#ff7ad9"
            title="ИИ-репетитор"
            text="Спросить по предмету"
            onClick={() => openTutor({ mode: 'tutor', subject: id })}
          />
          {id === 'math' && (
            <ActionTile icon={<Brain size={20} />} color="#3ee0a1" title="Блиц формул" text="119 формул и ловушек" onClick={() => push({ name: 'blitz' })} wide />
          )}
        </StaggerItem>

        <StaggerItem>
          <SectionTitle>Темы программы</SectionTitle>
          <Card padded={false} className="divide-y divide-line px-4">
            {!content &&
              Array.from({ length: 5 }, (_, i) => (
                <div key={i} className="py-3">
                  <Skeleton className="h-4 w-3/5" />
                  <Skeleton className="mt-2 h-2 w-full" />
                </div>
              ))}
            {rows.map((r) => (
              <Row
                key={r.topic.id}
                onClick={() => push({ name: 'topic', subject: id, topicId: r.topic.id })}
                title={r.topic.title}
                subtitle={
                  <span className="flex items-center gap-2">
                    <Bar value={r.mastery} color={r.mastery >= 0.7 ? 'var(--c-good)' : r.mastery >= 0.45 ? meta.color : 'var(--c-warn)'} height={4} className="max-w-[120px]" />
                    <span>{r.n ? `${Math.round(r.mastery * 100)}% · ${r.n} отв.` : r.topic.section}</span>
                  </span>
                }
              />
            ))}
          </Card>
        </StaggerItem>

        <StaggerItem>
          <SectionTitle>ЦЭ и ЦТ-2027</SectionTitle>
          <Card className="space-y-3">
            <div className="flex items-start gap-3">
              <CalendarDays size={18} className="mt-0.5 shrink-0 text-accent" />
              <p className="text-[14px] leading-relaxed text-fg-2">
                ЦЭ — <b className="text-fg">{formatDay(meta.dates.ce, true)}</b>
                <br />
                ЦТ — {meta.dates.ct.map((d) => formatDay(d)).join(' или ')}
              </p>
            </div>
            <div className="flex items-start gap-3">
              <Trophy size={18} className="mt-0.5 shrink-0 text-warn" />
              <p className="text-[14px] leading-relaxed text-fg-2">
                {meta.stats.ctAvg !== undefined && (
                  <>
                    Средний балл ЦТ-2026: <b className="text-fg">{meta.stats.ctAvg}</b>
                    <br />
                  </>
                )}
                {meta.stats.ceAvg !== undefined && (
                  <>
                    Средний балл ЦЭ-2026: <b className="text-fg">{meta.stats.ceAvg}</b> ({formatNumber(meta.stats.ceParticipants ?? 0)} участников)
                    <br />
                  </>
                )}
                {(meta.stats.ctHundred ?? meta.stats.ceHundred) !== undefined && (
                  <>
                    Стобалльников в 2026: <b className="text-fg">{(meta.stats.ceHundred ?? 0) + (meta.stats.ctHundred ?? 0)}</b>
                  </>
                )}
                {meta.stats.ctAvg === undefined && meta.stats.ceAvg === undefined && meta.stats.ctHundred === undefined && 'Статистика по предмету публикуется в общем отчёте РИКЗ.'}
              </p>
            </div>
            <div className="flex items-start gap-3">
              <Check size={18} className="mt-0.5 shrink-0 text-good" />
              <p className="text-[14px] leading-relaxed text-fg-2">
                {meta.thresholds.language !== undefined
                  ? `Минимальный балл для поступления: ${meta.thresholds.language} (на филологию — ${meta.thresholds.philology}).`
                  : `Минимальный балл: ${meta.thresholds.first} как первый профильный, ${meta.thresholds.second} как второй.`}
                {meta.allowed ? ` С собой можно: ${meta.allowed}.` : ''}
              </p>
            </div>
          </Card>
        </StaggerItem>

        <StaggerItem>
          <SectionTitle
            action={
              <button type="button" className="text-[13px] font-semibold text-accent" onClick={() => push({ name: 'library', subject: id })}>
                Все
              </button>
            }
          >
            Учебники и тесты
          </SectionTitle>
          <Card padded={false} className="divide-y divide-line px-4">
            {sources.slice(0, 4).map((s) => (
              <Row
                key={s.id}
                title={s.title}
                subtitle={s.description}
                chevron={false}
                trailing={<ArrowUpRight size={17} className="shrink-0 text-faint" />}
                onClick={() => openExternal(s.url)}
              />
            ))}
          </Card>
        </StaggerItem>
      </Stagger>

      <Sheet open={howOpen} onClose={() => setHowOpen(false)} title="Как считается прогноз">
        <div className="space-y-3 text-[14.5px] leading-relaxed text-fg-2">
          <p>Это модель приложения, а не официальная шкала РИКЗ. Она нужна, чтобы видеть динамику и понимать, какие темы дадут больше всего баллов.</p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>Каждая тема спецификации имеет вес — примерную долю в тесте.</li>
            <li>Освоение темы растёт с верными ответами (сложные весят больше) и плавно снижается без повторения.</li>
            <li>Неизученные темы считаются слабыми, поэтому прогноз растёт, когда вы расширяете покрытие.</li>
            <li>Пробники за последний месяц учитываются с весом 40%.</li>
            <li>Ширина интервала показывает неопределённость: она сужается с покрытием программы.</li>
          </ul>
          <Chip onClick={() => setHowOpen(false)} active>
            Понятно
          </Chip>
        </div>
      </Sheet>
    </div>
  )
}

function ActionTile({
  icon,
  color,
  title,
  text,
  onClick,
  disabled,
  wide,
}: {
  icon: ReactNode
  color: string
  title: string
  text: string
  onClick: () => void
  disabled?: boolean
  wide?: boolean
}) {
  return (
    <Card
      interactive={!disabled}
      onClick={
        disabled
          ? undefined
          : () => {
              tap()
              onClick()
            }
      }
      className={`!p-3.5 ${wide ? 'col-span-2 flex items-center gap-3' : ''} ${disabled ? 'opacity-55' : ''}`}
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: `color-mix(in oklab, ${color} 17%, transparent)`, color }}>
        {icon}
      </span>
      <div className={wide ? '' : 'mt-2.5'}>
        <p className="text-[15px] font-semibold text-fg">{title}</p>
        <p className="text-[12.5px] text-muted">{text}</p>
      </div>
    </Card>
  )
}
