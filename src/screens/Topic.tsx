import { AlertTriangle, BookMarked, MessageCircleQuestion, Sparkles, WandSparkles, Zap } from 'lucide-react'
import { tasksOfTopic, topicById, useSubject } from '../content'
import { SUBJECTS } from '../domain/subjects'
import type { SubjectId } from '../domain/types'
import { currentMastery } from '../lib/analytics'
import { useStore } from '../lib/store'
import { useNav, useTutorBus } from '../nav/nav'
import { Header } from '../ui/chrome'
import { Badge, Bar, Button, Card, Empty, ProgressRing, SectionTitle, Skeleton, Stagger, StaggerItem } from '../ui/kit'
import { Markdown, Tex } from '../ui/Rich'

export function TopicScreen({ subject, topicId }: { subject: SubjectId; topicId: string }) {
  const content = useSubject(subject)
  const topic = topicById(content, topicId)
  const stat = useStore((s) => s.progress.topics[topicId])
  const generated = useStore((s) => s.generated)
  const push = useNav((s) => s.push)
  const openTutor = useTutorBus((s) => s.open)
  const meta = SUBJECTS[subject]

  if (!content) {
    return (
      <div>
        <Header />
        <Skeleton className="h-9 w-3/4" />
        <Skeleton className="mt-4 h-40 w-full rounded-[22px]" />
      </div>
    )
  }
  if (!topic) {
    return (
      <div>
        <Header />
        <Empty icon={<BookMarked size={24} />} title="Тема не найдена" />
      </div>
    )
  }

  const tasks = tasksOfTopic(content, topicId)
  const aiTasks = Object.values(generated).filter((t) => t.topic === topicId)
  const mastery = currentMastery(stat)

  return (
    <div>
      <Header subtitle={`${meta.short} · ${topic.section}`} />
      <Stagger className="space-y-4">
        <StaggerItem className="flex items-start gap-4">
          <div className="min-w-0 flex-1">
            <h1 className="text-[26px] leading-[1.12] font-extrabold tracking-[-0.03em] text-fg">{topic.title}</h1>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Badge color={meta.color}>вес в тесте {'●'.repeat(topic.weight)}{'○'.repeat(5 - topic.weight)}</Badge>
              <Badge color="var(--c-muted)">{tasks.length + aiTasks.length} заданий</Badge>
            </div>
          </div>
          <ProgressRing value={mastery} size={60} stroke={6} color={meta.color}>
            <span className="tabular text-[14px] font-bold text-fg">{Math.round(mastery * 100)}%</span>
          </ProgressRing>
        </StaggerItem>

        <StaggerItem>
          <Card glow={meta.color}>
            <p className="eyebrow mb-2">Коротко</p>
            <Markdown className="text-[15px] leading-relaxed text-fg">{topic.summary}</Markdown>
          </Card>
        </StaggerItem>

        <StaggerItem>
          <SectionTitle>Опорный конспект</SectionTitle>
          <Card className="space-y-2.5">
            {topic.facts.map((f, i) => (
              <div key={i} className="flex gap-3">
                <span className="mt-[3px] flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[10.5px] font-bold" style={{ background: `color-mix(in oklab, ${meta.color} 18%, transparent)`, color: meta.color }}>
                  {i + 1}
                </span>
                <span className="flex-1 text-[14.5px] leading-relaxed text-fg-2">
                  <Tex>{f}</Tex>
                </span>
              </div>
            ))}
          </Card>
        </StaggerItem>

        {topic.traps.length > 0 && (
          <StaggerItem>
            <Card className="border-warn/30">
              <p className="mb-2 flex items-center gap-2 text-[14px] font-bold text-warn">
                <AlertTriangle size={16} /> Ловушки ЦТ
              </p>
              <ul className="space-y-2">
                {topic.traps.map((t, i) => (
                  <li key={i} className="text-[14px] leading-relaxed text-fg-2">
                    <Tex>{t}</Tex>
                  </li>
                ))}
              </ul>
            </Card>
          </StaggerItem>
        )}

        {stat && stat.n > 0 && (
          <StaggerItem>
            <Card className="flex items-center gap-4">
              <div className="flex-1">
                <p className="text-[14px] font-semibold text-fg">Твоя статистика</p>
                <p className="text-[12.5px] text-muted">
                  {stat.ok} из {stat.n} верно · последний раз {new Date(stat.last).toLocaleDateString('ru-RU')}
                </p>
                <Bar value={stat.ok / stat.n} className="mt-2" color={meta.color} />
              </div>
            </Card>
          </StaggerItem>
        )}

        <StaggerItem className="space-y-2.5">
          <Button
            block
            size="lg"
            icon={<Zap size={19} />}
            disabled={tasks.length + aiTasks.length === 0}
            onClick={() => push({ name: 'practice', subject, topicIds: [topicId], size: Math.min(10, tasks.length + aiTasks.length), title: topic.title })}
          >
            Тренировать тему
          </Button>
          <div className="grid grid-cols-2 gap-2.5">
            <Button
              variant="secondary"
              icon={<Sparkles size={17} />}
              onClick={() => openTutor({ mode: 'explain', subject, topicId, prompt: `Объясни тему «${topic.title}»: интуиция, правило, пример и типичная ловушка ЦТ.` })}
            >
              Объясни
            </Button>
            <Button
              variant="secondary"
              icon={<MessageCircleQuestion size={17} />}
              onClick={() => openTutor({ mode: 'socratic', subject, topicId, prompt: `Проверь, как я понимаю тему «${topic.title}». Задавай вопросы по одному.` })}
            >
              Проверь меня
            </Button>
          </div>
          <Button variant="secondary" block icon={<WandSparkles size={17} />} onClick={() => push({ name: 'generate', subject, topicId })}>
            Новые задания от ИИ
          </Button>
        </StaggerItem>
      </Stagger>
    </div>
  )
}
