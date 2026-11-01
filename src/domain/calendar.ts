import { SUBJECTS } from './subjects'
import type { SubjectId } from './types'

/**
 * Календарь экзаменационной кампании 2026/2027.
 * Источник: постановление Минобразования о сроках ЦЭ и ЦТ в 2027 году
 * (опубликовано в октябре 2026), сообщения РИКЗ о репетиционном тестировании.
 */

export interface CalendarEvent {
  id: string
  /** Начало (ISO-дата). */
  start: string
  /** Конец для периодов. */
  end?: string
  title: string
  note?: string
  kind: 'exam' | 'registration' | 'rehearsal' | 'result'
  /** Предметы, если событие привязано к ним. */
  subjects?: SubjectId[]
  /** Дата неточная — показываем «ориентировочно». */
  tentative?: boolean
}

const PROFILE_DAY_1: SubjectId[] = [
  'soc',
  'math',
  'bio',
  'eng',
  'deu',
  'fra',
  'spa',
  'chi',
  'chem',
  'phys',
  'geo',
  'hist',
]

export const CALENDAR: CalendarEvent[] = [
  {
    id: 'rt-1',
    start: '2026-10-15',
    end: '2026-12-20',
    kind: 'rehearsal',
    title: 'РТ, модуль 1',
    note: 'Регистрация с 9 октября в личном кабинете РИКЗ. Не смогли прийти — онлайн-вариант 5 дней после модуля.',
  },
  {
    id: 'drt',
    start: '2026-11-15',
    end: '2027-05-15',
    kind: 'rehearsal',
    title: 'Дистанционное РТ (ДРТ)',
    note: 'Бесплатные онлайн-тесты РИКЗ после утверждения спецификаций 2027 года.',
    tentative: true,
  },
  {
    id: 'rt-2',
    start: '2027-01-11',
    end: '2027-02-28',
    kind: 'rehearsal',
    title: 'РТ, модуль 2',
    tentative: true,
  },
  {
    id: 'rce',
    start: '2027-01-30',
    kind: 'rehearsal',
    title: 'Генеральная репетиция ЦЭ',
    note: 'Традиционно в конце января; дату подтверждает РИКЗ.',
    tentative: true,
  },
  {
    id: 'rt-3',
    start: '2027-03-01',
    end: '2027-04-30',
    kind: 'rehearsal',
    title: 'РТ, модуль 3',
    tentative: true,
  },
  {
    id: 'reg-ct',
    start: '2027-04-09',
    end: '2027-04-22',
    kind: 'registration',
    title: 'Регистрация на ЦТ',
    note: 'В пунктах регистрации, с паспортом. На резервные дни — 8–11 июня.',
  },
  {
    id: 'ce-ct-profile',
    start: '2027-05-27',
    kind: 'exam',
    title: 'ЦЭ и ЦТ по профильным предметам',
    note: 'Математика, физика, химия, биология, история, обществоведение, география, иностранные языки.',
    subjects: PROFILE_DAY_1,
  },
  {
    id: 'ce-ct-lang',
    start: '2027-05-31',
    kind: 'exam',
    title: 'ЦЭ и ЦТ по белорусскому и русскому языку',
    subjects: ['rus', 'bel'],
  },
  {
    id: 'ct-june-4',
    start: '2027-06-04',
    kind: 'exam',
    title: 'ЦТ: математика, биология, география, иностранные языки',
    subjects: ['math', 'bio', 'geo', 'eng', 'deu', 'fra', 'spa', 'chi'],
  },
  {
    id: 'ct-june-7',
    start: '2027-06-07',
    kind: 'exam',
    title: 'ЦТ: физика, химия, история, обществоведение',
    subjects: ['phys', 'chem', 'hist', 'soc'],
  },
  {
    id: 'reserve',
    start: '2027-06-19',
    end: '2027-06-23',
    kind: 'exam',
    title: 'Резервные дни ЦТ и ЦЭ',
    note: '19, 21 и 23 июня — для тех, кто пропустил основной день по уважительной причине.',
  },
  {
    id: 'certs',
    start: '2027-07-01',
    kind: 'result',
    title: 'Выдача сертификатов ЦТ',
    note: 'В пункте, где проходили тестирование.',
  },
]

/** Время начала испытаний по сообщениям Минобразования. */
export const EXAM_START_TIME = '11:00'

const DAY = 24 * 60 * 60 * 1000

export function parseDay(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function daysUntil(iso: string, now = new Date()): number {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.round((parseDay(iso).getTime() - today.getTime()) / DAY)
}

export interface NextExam {
  subject: SubjectId
  date: string
  days: number
  kind: 'ce' | 'ct'
}

/** Ближайший экзамен по выбранным предметам. */
export function nextExam(subjects: SubjectId[], kind: 'ce' | 'ct' | 'both', now = new Date()): NextExam | null {
  let best: NextExam | null = null
  for (const id of subjects) {
    const meta = SUBJECTS[id]
    const candidates: { date: string; kind: 'ce' | 'ct' }[] = []
    if (kind !== 'ct') candidates.push({ date: meta.dates.ce, kind: 'ce' })
    if (kind !== 'ce') candidates.push({ date: meta.dates.ct[0], kind: 'ct' })
    for (const c of candidates) {
      const days = daysUntil(c.date, now)
      if (days < 0) continue
      if (!best || days < best.days) best = { subject: id, date: c.date, days, kind: c.kind }
    }
  }
  return best
}

/** Текущие и ближайшие события календаря. */
export function upcomingEvents(now = new Date(), limit = 4): CalendarEvent[] {
  return CALENDAR.filter((e) => daysUntil(e.end ?? e.start, now) >= 0)
    .sort((a, b) => parseDay(a.start).getTime() - parseDay(b.start).getTime())
    .slice(0, limit)
}

export function isOngoing(e: CalendarEvent, now = new Date()): boolean {
  return daysUntil(e.start, now) <= 0 && daysUntil(e.end ?? e.start, now) >= 0
}
