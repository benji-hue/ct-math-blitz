import { motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { Play, RefreshCw, TriangleAlert, WandSparkles } from 'lucide-react'
import { topicById, useSubject } from '../content'
import { SUBJECTS } from '../domain/subjects'
import type { SubjectId, Task } from '../domain/types'
import { generateTasks } from '../lib/ai'
import { useStore } from '../lib/store'
import { useNav } from '../nav/nav'
import { Header } from '../ui/chrome'
import { Badge, Button, Card, Segmented, Skeleton, notify } from '../ui/kit'
import { springSoft } from '../ui/motion'
import { Tex } from '../ui/Rich'

export default function GenerateScreen({ subject, topicId }: { subject: SubjectId; topicId: string }) {
  const content = useSubject(subject)
  const topic = topicById(content, topicId)
  const addGenerated = useStore((s) => s.addGenerated)
  const generated = useStore((s) => s.generated)
  const replace = useNav((s) => s.replace)
  const [part, setPart] = useState<'A' | 'B' | 'mixed'>('mixed')
  const [count, setCount] = useState<'5' | '8'>('5')
  const [phase, setPhase] = useState<'setup' | 'loading' | 'done'>('setup')
  const [tasks, setTasks] = useState<Task[]>([])
  const [error, setError] = useState<string | null>(null)
  const abort = useRef<AbortController | null>(null)
  const meta = SUBJECTS[subject]

  useEffect(() => () => abort.current?.abort(), [])

  async function run() {
    if (!topic) return
    setError(null)
    setPhase('loading')
    abort.current?.abort()
    const controller = new AbortController()
    abort.current = controller
    try {
      const result = await generateTasks(
        { subject, subjectTitle: meta.title, topic: topic.title, topicFacts: topic.facts, count: Number(count), part, seen: Object.keys(generated).filter((id) => id.startsWith('ai.')).slice(-400) },
        topicId,
        controller.signal,
      )
      addGenerated(result)
      setTasks(result)
      setPhase('done')
      notify('success')
    } catch (e) {
      if ((e as Error).name === 'AbortError') return
      setError((e as Error).message)
      setPhase('setup')
      notify('error')
    }
  }

  return (
    <div>
      <Header close title="Задания от ИИ" subtitle={topic ? `${meta.short} · ${topic.title}` : meta.short} />

      {phase === 'setup' && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={springSoft} className="space-y-4">
          <Card glow={meta.color}>
            <p className="text-[14.5px] leading-relaxed text-fg-2">
              Нейросеть составит новые задания в формате ЦТ по теме <b className="text-fg">«{topic?.title}»</b>: с правдоподобными ловушками, решением и подсказкой. Каждое задание проходит автоматическую проверку формата.
            </p>
          </Card>
          <div>
            <p className="mb-2 px-1 text-[13px] text-muted">Часть теста</p>
            <Segmented
              layoutId="gen-part"
              value={part}
              onChange={setPart}
              options={[
                { value: 'A', label: 'A · выбор' },
                { value: 'B', label: 'B · ответ' },
                { value: 'mixed', label: 'Обе' },
              ]}
            />
          </div>
          <div>
            <p className="mb-2 px-1 text-[13px] text-muted">Количество</p>
            <Segmented
              layoutId="gen-count"
              value={count}
              onChange={setCount}
              options={[
                { value: '5', label: '5 заданий' },
                { value: '8', label: '8 заданий' },
              ]}
            />
          </div>
          {error && (
            <Card className="flex gap-2.5 !border-bad/40">
              <TriangleAlert size={18} className="mt-0.5 shrink-0 text-bad" />
              <p className="text-[14px] text-fg-2">{error}</p>
            </Card>
          )}
          <Button block size="lg" icon={<WandSparkles size={19} />} onClick={run} disabled={!topic}>
            Сгенерировать
          </Button>
          <p className="px-1 text-center text-[12px] leading-relaxed text-muted">ИИ может ошибаться. Если задание кажется неверным — спроси репетитора или сверься с конспектом.</p>
        </motion.div>
      )}

      {phase === 'loading' && (
        <div className="space-y-3 pt-2">
          <p className="mb-3 text-center text-[14px] text-muted">Составляю задания по спецификации… обычно 10–25 секунд</p>
          {Array.from({ length: 3 }, (_, i) => (
            <Card key={i}>
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="mt-3 h-4 w-full" />
              <Skeleton className="mt-2 h-4 w-4/5" />
            </Card>
          ))}
          <Button block variant="ghost" onClick={() => { abort.current?.abort(); setPhase('setup') }}>
            Отменить
          </Button>
        </div>
      )}

      {phase === 'done' && (
        <div className="space-y-3">
          {tasks.map((t, i) => (
            <motion.div key={t.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ ...springSoft, delay: i * 0.05 }}>
              <Card>
                <div className="mb-2 flex gap-1.5">
                  <Badge color={meta.color}>Часть {t.part}</Badge>
                  <Badge color="var(--c-muted)">уровень {t.level}</Badge>
                </div>
                <div className="line-clamp-3 text-[14.5px] leading-relaxed text-fg">
                  <Tex>{t.q}</Tex>
                </div>
              </Card>
            </motion.div>
          ))}
          <Button block size="lg" icon={<Play size={18} />} onClick={() => replace({ name: 'practice', subject, topicIds: [topicId], generated: true, size: tasks.length, title: 'Задания от ИИ' })}>
            Решать
          </Button>
          <Button block variant="secondary" icon={<RefreshCw size={17} />} onClick={() => setPhase('setup')}>
            Ещё задания
          </Button>
        </div>
      )}
    </div>
  )
}
