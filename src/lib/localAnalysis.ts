import { ERROR_TYPES, type ErrorType } from '../domain/types'
import type { Analysis, AnalyzeRequest } from './ai'

/**
 * Разбор прогресса без ИИ — когда сервер недоступен или не подключён
 * (например, версия на GitHub Pages). Те же агрегаты, что уходят модели,
 * превращаются в выводы и план по простым правилам. Честно хуже, чем ИИ,
 * но ученик не остаётся с пустым экраном.
 */

const DAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

const SHORT_SUBJECT: Record<string, string> = {
  'История Беларуси в контексте всемирной истории': 'История',
}

export function localAnalysis(req: AnalyzeRequest): Analysis {
  const subjects = req.subjects
  const short = (title: string) => SHORT_SUBJECT[title] ?? title

  const gaps = subjects
    .flatMap((s) => s.weak.map((w) => ({ subject: short(s.title), ...w })))
    .sort((a, b) => a.mastery - b.mastery)
    .slice(0, 4)

  const errorTotals: Partial<Record<ErrorType, number>> = {}
  for (const s of subjects) {
    for (const [type, count] of Object.entries(s.errors) as [ErrorType, number][]) errorTotals[type] = (errorTotals[type] ?? 0) + count
  }
  const topError = (Object.entries(errorTotals) as [ErrorType, number][]).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1])[0]?.[0]

  const ranked = [...subjects].sort((a, b) => b.forecast - a.forecast)
  const best = ranked[0]
  const weakest = ranked[ranked.length - 1]

  const summaryParts: string[] = []
  if (best) summaryParts.push(`Сильнее всего сейчас — ${short(best.title).toLowerCase()} (прогноз около ${best.forecast}).`)
  if (gaps.length) summaryParts.push(`Больше всего баллов принесут темы: ${gaps.slice(0, 3).map((g) => `«${g.title}»`).join(', ')}.`)
  if (req.daysToExam !== null) summaryParts.push(`До экзамена ${req.daysToExam} дн. — при регулярных коротких занятиях этого достаточно.`)
  if (!summaryParts.length) summaryParts.push('Данных пока мало: реши ещё несколько тренировок, и разбор станет точнее.')

  const reason = (n: number) =>
    n < 4
      ? 'тема почти не тренировалась — данных мало'
      : topError
        ? `низкая точность, чаще всего — «${ERROR_TYPES[topError].label.toLowerCase()}»`
        : 'низкая точность на последних ответах'

  const focus = gaps.length ? gaps : [{ subject: weakest ? short(weakest.title) : '', title: 'смешанная тренировка', mastery: 0, n: 0 }]
  const pick = (i: number) => focus[i % focus.length]
  const label = (g: (typeof focus)[number]) => (g.subject ? `${g.subject}: ${g.title}` : g.title)

  const week = [
    { focus: `${label(pick(0))} — конспект и 10 заданий`, minutes: 40 },
    { focus: `${label(pick(1))} — 10 заданий вперемешку с повторением`, minutes: 40 },
    { focus: `Повторение по плану FSRS и ${label(pick(0)).toLowerCase()}`, minutes: 30 },
    { focus: `${label(pick(2))} — разбор ошибок с ИИ-репетитором`, minutes: 40 },
    { focus: `Пробник${weakest ? ` по предмету «${short(weakest.title).toLowerCase()}»` : ''} на время`, minutes: 45 },
    { focus: 'Разбор ошибок пробника и повторение', minutes: 35 },
    { focus: 'Лёгкое повторение 10–15 заданий, отдых', minutes: 20 },
  ].map((d, i) => ({ day: DAYS[i], ...d }))

  return {
    summary: summaryParts.join(' '),
    strengths: subjects.flatMap((s) => s.strong.map((t) => `${short(s.title)}: ${t.title}`)).slice(0, 3),
    gaps: gaps.map((g) => ({
      topic: label(g),
      reason: reason(g.n),
      action: 'Перечитай конспект темы, реши 10 заданий и вернись к ним через 1, 3 и 7 дней — так тема закрепится надолго.',
    })),
    week,
    tip: topError
      ? `${ERROR_TYPES[topError].hint}. Короткие ежедневные занятия работают лучше редких длинных — это эффект распределённой практики.`
      : 'Проверяй себя заданиями, а не перечитыванием: самопроверка — самый надёжный способ запоминать.',
  }
}
