/** Русская плюрализация: plural(5, ['день', 'дня', 'дней']) → 'дней'. */
export function plural(n: number, forms: [string, string, string]): string {
  const abs = Math.abs(n) % 100
  const last = abs % 10
  if (abs > 10 && abs < 20) return forms[2]
  if (last > 1 && last < 5) return forms[1]
  if (last === 1) return forms[0]
  return forms[2]
}

export function pluralN(n: number, forms: [string, string, string]): string {
  return `${n} ${plural(n, forms)}`
}

const pad = (n: number) => String(n).padStart(2, '0')

/** Ключ дня в локальном времени устройства: 2026-11-01. */
export function dayKey(date = new Date()): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

const MONTHS_GEN = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
]

const WEEKDAYS = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота']

export function formatDay(iso: string | Date, withWeekday = false): string {
  const d = typeof iso === 'string' ? new Date(`${iso}T00:00:00`) : iso
  const base = `${d.getDate()} ${MONTHS_GEN[d.getMonth()]}`
  return withWeekday ? `${base}, ${WEEKDAYS[d.getDay()]}` : base
}

export function formatRange(start: string, end?: string): string {
  if (!end || end === start) return formatDay(start)
  const a = new Date(`${start}T00:00:00`)
  const b = new Date(`${end}T00:00:00`)
  if (a.getMonth() === b.getMonth()) return `${a.getDate()}–${b.getDate()} ${MONTHS_GEN[b.getMonth()]}`
  return `${formatDay(start)} — ${formatDay(end)}`
}

export function greeting(now = new Date()): string {
  const h = now.getHours()
  if (h < 5) return 'Доброй ночи'
  if (h < 12) return 'Доброе утро'
  if (h < 18) return 'Добрый день'
  return 'Добрый вечер'
}

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${pad(s)}`
}

// Форматтеры Intl создаются один раз: toLocaleDateString каждый раз строит новый, и на
// слабом телефоне список из пяти дат стоил ~90 мс (замер на «Прогрессе», CPU ×6).
const DATE_RU = new Intl.DateTimeFormat('ru-RU')
const NUMBER_RU = new Intl.NumberFormat('ru-RU')

/** «04.11.2026» */
export function shortDate(at: number | Date): string {
  return DATE_RU.format(at)
}

/** «12 345» */
export function formatNumber(n: number): string {
  return NUMBER_RU.format(n)
}

export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v))
}

export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)
}
