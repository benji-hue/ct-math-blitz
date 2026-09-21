import { EMPTY_PROGRESS, type Progress } from './storage'

const FORMAT = 'ct-math-blitz/progress'

interface Envelope {
  format: string
  version: 1
  exportedAt: string
  progress: Progress
}

/**
 * Прогресс живёт в localStorage, а его iOS может вычистить при нехватке места.
 * Экспорт в файл — страховка на этот случай и способ перенести его на другое
 * устройство: между PWA и нативной сборкой хранилища разные.
 */
export function exportProgress(progress: Progress): string {
  const envelope: Envelope = {
    format: FORMAT,
    version: 1,
    exportedAt: new Date().toISOString(),
    progress,
  }
  return JSON.stringify(envelope, null, 2)
}

export function progressFileName(): string {
  const stamp = new Date().toISOString().slice(0, 10)
  return `ct-math-progress-${stamp}.json`
}

function toCountMap(value: unknown): Record<string, number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const out: Record<string, number> = {}
  for (const [key, count] of Object.entries(value as Record<string, unknown>)) {
    if (typeof count === 'number' && Number.isFinite(count) && count > 0) {
      out[key] = Math.floor(count)
    }
  }
  return out
}

function toCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0
}

/**
 * Разбирает файл экспорта. Всё приводится к ожидаемым типам: файл мог быть
 * отредактирован руками или прийти из другой версии приложения.
 */
export function parseProgressFile(text: string): Progress | null {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return null
  }
  if (!data || typeof data !== 'object') return null

  const envelope = data as Partial<Envelope>
  const raw = (envelope.progress ?? data) as Partial<Progress>
  if (!raw || typeof raw !== 'object') return null

  const seen = toCountMap(raw.seen)
  const firstTry = toCountMap(raw.firstTry)
  const missed = toCountMap(raw.missed)

  // Пустой во всех полях файл — почти наверняка не наш экспорт.
  const empty =
    Object.keys(seen).length === 0 &&
    Object.keys(firstTry).length === 0 &&
    Object.keys(missed).length === 0 &&
    toCount(raw.totalAnswered) === 0
  if (empty) return null

  return {
    ...EMPTY_PROGRESS,
    seen,
    firstTry,
    missed,
    bestScore: toCount(raw.bestScore),
    bestStreak: toCount(raw.bestStreak),
    rounds: toCount(raw.rounds),
    totalAnswered: toCount(raw.totalAnswered),
    totalFirstTryCorrect: toCount(raw.totalFirstTryCorrect),
  }
}

/** Скачивание файла: в Safari на iOS он уходит в «Файлы». */
export function downloadText(filename: string, text: string): void {
  const blob = new Blob([text], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
