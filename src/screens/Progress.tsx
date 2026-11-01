import { motion } from 'motion/react'
import { useMemo, type ReactNode } from 'react'
import { Award, Brain, ChevronRight, Flame, Sparkles, Target, TrendingUp, Zap } from 'lucide-react'
import { useSubjects } from '../content'
import { SUBJECTS } from '../domain/subjects'
import { ERROR_TYPES, type ErrorType, type SubjectId } from '../domain/types'
import { ACHIEVEMENTS, errorBreakdown, forecast, heatmap, levelFromXp, liveStreak, topicRows, weakTopics, weeklyAccuracy } from '../lib/analytics'
import { pluralN } from '../lib/format'
import { useStore } from '../lib/store'
import { useNav } from '../nav/nav'
import { Bar, Card, Counter, Empty, SectionTitle, Stagger, StaggerItem, tap } from '../ui/kit'
import { SubjectIcon } from '../ui/SubjectIcon'

const ERROR_COLORS: Record<ErrorType, string> = {
  knowledge: '#a497ff',
  misapplied: '#3dd6f5',
  calc: '#ffc857',
  careless: '#ff7ad9',
  misread: '#3ee0a1',
  time: '#ff6b8a',
}

export default function ProgressScreen() {
  const progress = useStore((s) => s.progress)
  const profile = useStore((s) => s.profile)
  const push = useNav((s) => s.push)
  const contents = useSubjects(profile.subjects)
  const level = levelFromXp(progress.xp)
  const streak = liveStreak(progress)
  const total = progress.attempts.length
  const accuracy = total ? progress.attempts.filter((a) => a.ok).length / total : 0
  const weeks = useMemo(() => weeklyAccuracy(progress), [progress])
  const cells = useMemo(() => heatmap(progress, 16), [progress])
  const errors = errorBreakdown(progress.attempts)
  const errorTotal = Object.values(errors).reduce((a, b) => a + b, 0)

  if (total === 0) {
    return (
      <div className="pt-2">
        <h1 className="mb-4 text-[30px] font-extrabold tracking-[-0.03em] text-fg">Прогресс</h1>
        <Card>
          <Empty
            icon={<TrendingUp size={26} />}
            title="Здесь появится твоя статистика"
            text="Реши первые задания — построим прогноз балла, карту слабых тем и тепловую карту занятий."
          />
        </Card>
      </div>
    )
  }

  return (
    <Stagger className="space-y-4 pt-2">
      <StaggerItem>
        <h1 className="text-[30px] font-extrabold tracking-[-0.03em] text-fg">Прогресс</h1>
      </StaggerItem>

      <StaggerItem className="grid grid-cols-3 gap-2.5">
        <Stat icon={<Flame size={17} />} color="#ff8a3d" value={streak} label="дней подряд" />
        <Stat icon={<Target size={17} />} color="var(--c-good)" value={Math.round(accuracy * 100)} suffix="%" label="точность" />
        <Stat icon={<Zap size={17} />} color="var(--c-accent)" value={level.level} label={`уровень · ${progress.xp} XP`} />
      </StaggerItem>

      <StaggerItem>
        <motion.button
          type="button"
          whileTap={{ scale: 0.98 }}
          onClick={() => {
            tap('medium')
            push({ name: 'analysis' })
          }}
          className="relative w-full overflow-hidden rounded-[22px] p-[1.5px] text-left"
        >
          <span className="orb absolute inset-[-60%] opacity-90" />
          <span className="relative flex items-center gap-3 rounded-[21px] bg-solid p-4">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-accent-solid/15 text-accent">
              <Brain size={22} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[16px] font-bold text-fg">ИИ-разбор прогресса</span>
              <span className="block text-[13px] text-muted">Пробелы, причины ошибок и план на неделю</span>
            </span>
            <Sparkles size={18} className="text-accent" />
          </span>
        </motion.button>
      </StaggerItem>

      <StaggerItem>
        <SectionTitle>Прогноз баллов</SectionTitle>
        <Card className="space-y-4">
          {profile.subjects.map((id) => {
            const content = contents[id]
            if (!content) return null
            const fc = forecast(id, content, progress)
            const target = profile.targets[id]
            return (
              <button key={id} type="button" className="block w-full text-left" onClick={() => push({ name: 'subject', id })}>
                <div className="mb-1.5 flex items-center gap-2.5">
                  <SubjectIcon id={id} size={26} />
                  <span className="flex-1 text-[14.5px] font-semibold text-fg">{SUBJECTS[id].short}</span>
                  <span className="tabular text-[15px] font-bold text-fg">
                    {fc.basis ? `${fc.low}–${fc.high}` : '—'}
                  </span>
                  {target && <span className="text-[12px] text-muted">/ {target}</span>}
                </div>
                <div className="relative">
                  <div className="h-2.5 w-full overflow-hidden rounded-full bg-line-strong">
                    <motion.div
                      className="h-full rounded-full"
                      style={{ marginLeft: `${fc.low}%`, background: `linear-gradient(90deg, color-mix(in oklab, ${SUBJECTS[id].color} 55%, transparent), ${SUBJECTS[id].color})` }}
                      initial={{ width: 0 }}
                      animate={{ width: `${fc.basis ? fc.high - fc.low : 0}%` }}
                      transition={{ type: 'spring', stiffness: 70, damping: 20 }}
                    />
                  </div>
                  {target && <span className="absolute -top-1 h-[18px] w-[2.5px] rounded bg-fg" style={{ left: `calc(${target}% - 1px)` }} />}
                </div>
              </button>
            )
          })}
          <p className="text-[11.5px] leading-snug text-faint">Интервал — модель приложения по твоим ответам и пробникам; черта — цель.</p>
        </Card>
      </StaggerItem>

      <StaggerItem>
        <SectionTitle>Активность</SectionTitle>
        <Card>
          <div className="flex gap-[3px]" role="img" aria-label="Тепловая карта занятий за 16 недель">
            {cells.map((col, i) => (
              <div key={i} className="flex flex-1 flex-col gap-[3px]">
                {col.map((c) => (
                  <span
                    key={c.key}
                    title={`${c.key}: ${c.tasks}`}
                    className="aspect-square w-full rounded-[3px]"
                    style={{
                      background: c.future
                        ? 'transparent'
                        : c.level === 0
                          ? 'var(--c-line)'
                          : `color-mix(in oklab, var(--c-good) ${[0, 30, 55, 78, 100][c.level]}%, transparent)`,
                    }}
                  />
                ))}
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center justify-between text-[12px] text-muted">
            <span>{pluralN(Object.keys(progress.days).length, ['день', 'дня', 'дней'])} с занятиями</span>
            <span>лучшая серия: {progress.streak.best}</span>
          </div>
        </Card>
      </StaggerItem>

      <StaggerItem>
        <SectionTitle>Точность по неделям</SectionTitle>
        <Card>
          <div className="flex h-32 items-end gap-2">
            {weeks.map((w, i) => (
              <div key={i} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
                <span className="tabular text-[10.5px] text-muted">{w.accuracy === null ? '' : Math.round(w.accuracy * 100)}</span>
                <motion.span
                  className="w-full rounded-t-lg rounded-b-sm"
                  style={{ background: w.accuracy === null ? 'var(--c-line)' : 'linear-gradient(180deg, var(--c-accent), color-mix(in oklab, var(--c-accent) 35%, transparent))' }}
                  initial={{ height: 0 }}
                  animate={{ height: `${w.accuracy === null ? 4 : Math.max(6, w.accuracy * 100)}%` }}
                  transition={{ type: 'spring', stiffness: 80, damping: 16, delay: i * 0.04 }}
                />
                <span className="text-[9.5px] text-faint">{w.label}</span>
              </div>
            ))}
          </div>
        </Card>
      </StaggerItem>

      {errorTotal > 0 && (
        <StaggerItem>
          <SectionTitle>Почему ошибаюсь</SectionTitle>
          <Card>
            <div className="mb-3 flex h-3 w-full overflow-hidden rounded-full">
              {(Object.keys(errors) as ErrorType[])
                .filter((e) => errors[e] > 0)
                .map((e) => (
                  <motion.span
                    key={e}
                    style={{ background: ERROR_COLORS[e] }}
                    initial={{ width: 0 }}
                    animate={{ width: `${(errors[e] / errorTotal) * 100}%` }}
                    transition={{ type: 'spring', stiffness: 70, damping: 20 }}
                  />
                ))}
            </div>
            <div className="space-y-2">
              {(Object.keys(errors) as ErrorType[])
                .filter((e) => errors[e] > 0)
                .sort((a, b) => errors[b] - errors[a])
                .map((e) => (
                  <div key={e} className="flex items-start gap-2.5">
                    <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: ERROR_COLORS[e] }} />
                    <div className="flex-1">
                      <p className="text-[14px] text-fg">
                        {ERROR_TYPES[e].label} <span className="text-muted">· {Math.round((errors[e] / errorTotal) * 100)}%</span>
                      </p>
                      <p className="text-[12.5px] text-muted">{ERROR_TYPES[e].hint}</p>
                    </div>
                  </div>
                ))}
            </div>
          </Card>
        </StaggerItem>
      )}

      <StaggerItem>
        <SectionTitle>Слабые темы</SectionTitle>
        <Card padded={false} className="divide-y divide-line px-4">
          {profile.subjects.flatMap((id) => {
            const content = contents[id]
            if (!content) return []
            return weakTopics(topicRows(content, progress), 3).map((r) => (
              <button
                key={r.topic.id}
                type="button"
                onClick={() => push({ name: 'topic', subject: id as SubjectId, topicId: r.topic.id })}
                className="flex w-full items-center gap-3 py-3 text-left"
              >
                <SubjectIcon id={id} size={30} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14.5px] font-medium text-fg">{r.topic.title}</span>
                  <Bar value={r.mastery} color="var(--c-warn)" height={4} className="mt-1.5 max-w-[160px]" />
                </span>
                <span className="tabular text-[13px] text-muted">{Math.round(r.mastery * 100)}%</span>
                <ChevronRight size={17} className="text-faint" />
              </button>
            ))
          })}
          {profile.subjects.every((id) => !contents[id] || weakTopics(topicRows(contents[id]!, progress)).length === 0) && (
            <p className="py-4 text-center text-[13.5px] text-muted">Явных пробелов нет — так держать!</p>
          )}
        </Card>
      </StaggerItem>

      {progress.mocks.length > 0 && (
        <StaggerItem>
          <SectionTitle>Пробники</SectionTitle>
          <Card padded={false} className="divide-y divide-line px-4">
            {[...progress.mocks]
              .reverse()
              .slice(0, 5)
              .map((m) => (
                <div key={m.id} className="flex items-center gap-3 py-3">
                  <SubjectIcon id={m.subject} size={30} />
                  <span className="flex-1 text-[14px] text-fg">
                    {SUBJECTS[m.subject].short}
                    <span className="block text-[12px] text-muted">{new Date(m.at).toLocaleDateString('ru-RU')}</span>
                  </span>
                  <span className="tabular text-[16px] font-bold text-fg">
                    {m.correct}/{m.total}
                  </span>
                </div>
              ))}
          </Card>
        </StaggerItem>
      )}

      <StaggerItem>
        <Card interactive onClick={() => push({ name: 'achievements' })} className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-warn/15 text-warn">
            <Award size={22} />
          </span>
          <span className="flex-1">
            <span className="block text-[15px] font-semibold text-fg">Достижения</span>
            <span className="block text-[12.5px] text-muted">
              {progress.achievements.length} из {Object.keys(ACHIEVEMENTS).length}
            </span>
          </span>
          <ChevronRight size={18} className="text-faint" />
        </Card>
      </StaggerItem>
    </Stagger>
  )
}

function Stat({ icon, color, value, label, suffix = '' }: { icon: ReactNode; color: string; value: number; label: string; suffix?: string }) {
  return (
    <Card className="!p-3.5">
      <span style={{ color }}>{icon}</span>
      <Counter value={value} suffix={suffix} className="mt-2 block text-[24px] leading-none font-extrabold text-fg" />
      <p className="mt-1 text-[11.5px] leading-tight text-muted">{label}</p>
    </Card>
  )
}
