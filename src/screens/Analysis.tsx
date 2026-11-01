import { motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { Brain, CalendarRange, CircleCheck, Lightbulb, RefreshCw, Target, TriangleAlert } from 'lucide-react'
import { loadSubject } from '../content'
import { nextExam } from '../domain/calendar'
import { SUBJECTS } from '../domain/subjects'
import { analyzeProgress, isAiUnavailable, type Analysis, type AnalyzeRequest } from '../lib/ai'
import { localAnalysis } from '../lib/localAnalysis'
import { errorBreakdown, forecast, liveStreak, topicRows, weakTopics } from '../lib/analytics'
import { useStore } from '../lib/store'
import { Header } from '../ui/chrome'
import { Button, Card, SectionTitle, Skeleton, notify } from '../ui/kit'
import { springSoft } from '../ui/motion'

const CACHE_KEY = 'krok:analysis'

/**
 * ИИ-разбор прогресса. Сырых ответов модель не видит: на клиенте считаем
 * компактную сводку (прогнозы, слабые темы, типы ошибок), а ИИ превращает её
 * в понятные выводы и план. Так дешевле, быстрее и без лишних персональных данных.
 */
export default function AnalysisScreen() {
  const profile = useStore((s) => s.profile)
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [result, setResult] = useState<Analysis | null>(() => {
    try {
      const cached = JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null') as { at: number; data: Analysis } | null
      return cached && Date.now() - cached.at < 12 * 3600_000 ? cached.data : null
    } catch {
      return null
    }
  })
  const [error, setError] = useState('')
  const [offline, setOffline] = useState(false)
  const abort = useRef<AbortController | null>(null)
  useEffect(() => () => abort.current?.abort(), [])

  async function run() {
    setState('loading')
    setError('')
    abort.current?.abort()
    const controller = new AbortController()
    abort.current = controller
    try {
      const { progress } = useStore.getState()
      const subjects = await Promise.all(
        profile.subjects.map(async (id) => {
          const content = await loadSubject(id)
          const rows = topicRows(content, progress)
          const fc = forecast(id, content, progress)
          return {
            id,
            title: SUBJECTS[id].title,
            forecast: fc.score,
            coverage: Math.round(fc.coverage * 100) / 100,
            target: profile.targets[id],
            weak: weakTopics(rows, 4).map((r) => ({ title: r.topic.title, mastery: Math.round(r.mastery * 100) / 100, n: r.n })),
            strong: rows
              .filter((r) => r.n >= 3 && r.mastery >= 0.75)
              .slice(0, 3)
              .map((r) => ({ title: r.topic.title, mastery: Math.round(r.mastery * 100) / 100 })),
            errors: errorBreakdown(progress.attempts, id),
          }
        }),
      )
      const exam = nextExam(profile.subjects, profile.exam)
      const request: AnalyzeRequest = {
        profile: { grade: profile.grade, exam: profile.exam, dailyGoal: profile.dailyGoal },
        streak: liveStreak(progress),
        daysToExam: exam?.days ?? null,
        subjects,
      }
      let data: Analysis
      let local = false
      try {
        data = await analyzeProgress(request, controller.signal)
      } catch (e) {
        // Сервер ИИ недоступен — считаем разбор на устройстве, а не показываем ошибку.
        if ((e as Error).name === 'AbortError' || !isAiUnavailable(e)) throw e
        data = localAnalysis(request)
        local = true
      }
      setOffline(local)
      setResult(data)
      setState('done')
      notify('success')
      // Разбор без ИИ не кэшируем: в следующий раз стоит снова попробовать сервер.
      if (!local) {
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), data }))
        } catch {
          // ignore
        }
      }
    } catch (e) {
      if ((e as Error).name === 'AbortError') return
      setError((e as Error).message)
      setState('error')
    }
  }

  return (
    <div>
      <Header title="ИИ-разбор" subtitle="Где теряются баллы и что делать" />

      {!result && state !== 'loading' && (
        <Card glow="#a497ff" className="mb-4">
          <Brain size={26} className="mb-2 text-accent" />
          <p className="text-[15px] leading-relaxed text-fg-2">
            ИИ посмотрит на прогноз по каждому предмету, слабые темы и типичные причины ошибок — и предложит конкретный план на неделю под твою дату экзамена.
          </p>
        </Card>
      )}

      {state === 'error' && (
        <Card className="mb-4 flex gap-2.5 !border-bad/40">
          <TriangleAlert size={18} className="mt-0.5 shrink-0 text-bad" />
          <p className="text-[14px] text-fg-2">{error}</p>
        </Card>
      )}

      {state === 'loading' && (
        <div className="space-y-3">
          <Card>
            <Skeleton className="h-5 w-1/2" />
            <Skeleton className="mt-3 h-4 w-full" />
            <Skeleton className="mt-2 h-4 w-5/6" />
          </Card>
          <Card>
            <Skeleton className="h-5 w-1/3" />
            <Skeleton className="mt-3 h-16 w-full" />
          </Card>
        </div>
      )}

      {result && state !== 'loading' && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={springSoft} className="space-y-4">
          {offline && (
            <p className="px-1 text-[12.5px] leading-relaxed text-muted">
              Сервер ИИ сейчас недоступен, поэтому разбор посчитан на устройстве по тем же данным. С ИИ выводы будут подробнее.
            </p>
          )}
          <Card glow="#a497ff">
            <p className="text-[15.5px] leading-relaxed text-fg">{result.summary}</p>
          </Card>

          {result.strengths.length > 0 && (
            <div>
              <SectionTitle>Сильные стороны</SectionTitle>
              <Card className="space-y-2">
                {result.strengths.map((s, i) => (
                  <p key={i} className="flex gap-2.5 text-[14.5px] text-fg-2">
                    <CircleCheck size={17} className="mt-0.5 shrink-0 text-good" />
                    {s}
                  </p>
                ))}
              </Card>
            </div>
          )}

          {result.gaps.length > 0 && (
            <div>
              <SectionTitle>Где теряются баллы</SectionTitle>
              <div className="space-y-2.5">
                {result.gaps.map((g, i) => (
                  <Card key={i}>
                    <p className="flex items-center gap-2 text-[15px] font-semibold text-fg">
                      <Target size={16} className="text-warn" />
                      {g.topic}
                    </p>
                    <p className="mt-1 text-[13.5px] leading-relaxed text-muted">{g.reason}</p>
                    <p className="mt-2 text-[14px] leading-relaxed text-fg-2">
                      <b className="text-fg">Что делать: </b>
                      {g.action}
                    </p>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {result.week.length > 0 && (
            <div>
              <SectionTitle>План на неделю</SectionTitle>
              <Card padded={false} className="divide-y divide-line px-4">
                {result.week.map((d, i) => (
                  <div key={i} className="flex items-start gap-3 py-3">
                    <CalendarRange size={17} className="mt-0.5 shrink-0 text-accent" />
                    <div className="flex-1">
                      <p className="text-[14px] font-semibold text-fg">{d.day}</p>
                      <p className="text-[13.5px] leading-snug text-fg-2">{d.focus}</p>
                    </div>
                    {d.minutes > 0 && <span className="tabular text-[12.5px] text-muted">{d.minutes} мин</span>}
                  </div>
                ))}
              </Card>
            </div>
          )}

          {result.tip && (
            <Card className="flex gap-3">
              <Lightbulb size={19} className="mt-0.5 shrink-0 text-warn" />
              <p className="text-[14px] leading-relaxed text-fg-2">{result.tip}</p>
            </Card>
          )}
        </motion.div>
      )}

      <div className="mt-5">
        <Button block size="lg" loading={state === 'loading'} icon={result ? <RefreshCw size={18} /> : <Brain size={19} />} onClick={run} disabled={profile.subjects.length === 0}>
          {result ? 'Обновить разбор' : 'Сделать разбор'}
        </Button>
      </div>
    </div>
  )
}
