import math from '../../src/content/math'
import rus from '../../src/content/rus'
import bel from '../../src/content/bel'
import phys from '../../src/content/phys'
import chem from '../../src/content/chem'
import bio from '../../src/content/bio'
import hist from '../../src/content/hist'
import soc from '../../src/content/soc'
import geo from '../../src/content/geo'
import eng from '../../src/content/eng'
import deu from '../../src/content/deu'
import fra from '../../src/content/fra'
import spa from '../../src/content/spa'
import chi from '../../src/content/chi'
import { SUBJECTS as META } from '../../src/domain/subjects'
import type { SubjectContent, SubjectId, Task } from '../../src/domain/types'

/**
 * Темы и образцы заданий всех предметов — те же, что в приложении (src/content).
 *
 * Сервер сам знает название темы, опорные факты и задания реального уровня: в промпт идут
 * они, а не то, что прислал клиент. Поэтому составленные задания можно класть в общий
 * банк — подменить тему или подсунуть свой текст другим ученикам через запрос нельзя.
 */

const CONTENT: Record<SubjectId, SubjectContent> = { math, rus, bel, phys, chem, bio, hist, soc, geo, eng, deu, fra, spa, chi }

export interface TrustedTopic {
  subjectTitle: string
  title: string
  facts: string[]
  examples: { q: string; part: 'A' | 'B'; level: number; answer: string }[]
}

function answerText(task: Task): string {
  if (task.kind === 'choice') {
    const right = typeof task.answer === 'number' ? [task.answer] : (task.answer as number[])
    return right.map((i) => task.options?.[i] ?? '').join('; ')
  }
  return String((task.answer as string[])[0] ?? '')
}

/** Тема приложения по id; null — предмет или тема серверу не известны (общего банка для них нет). */
export function trustedTopic(subject: string, topicId: string, part: 'A' | 'B' | 'mixed', random = Math.random): TrustedTopic | null {
  const content = CONTENT[subject as SubjectId]
  const topic = content?.topics.find((t) => t.id === topicId)
  if (!content || !topic) return null
  const pool = content.tasks.filter((t) => t.topic === topicId && t.source === 'original' && (part === 'mixed' || t.part === part))
  // Образцы — от трудных к простым: планку задают задания III–V, если они есть.
  const shuffled = pool
    .map((t) => ({ t, key: random() }))
    .sort((x, y) => y.t.level - x.t.level || x.key - y.key)
    .map((x) => x.t)
  const examples = shuffled.slice(0, 3).map((t) => ({ q: t.q, part: t.part, level: t.level, answer: answerText(t) }))
  return { subjectTitle: META[subject as SubjectId].title, title: topic.title, facts: topic.facts, examples }
}
