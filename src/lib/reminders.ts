import { useEffect } from 'react'
import { syncReminders } from './ai'
import { liveStreak, todayStats } from './analytics'
import { dueCount } from './practice'
import { useStore } from './store'
import { authHeader } from './account'

/** Ученик разрешил боту писать ему (requestWriteAccess) — нужно для напоминаний. */
export const WRITE_ACCESS_KEY = 'krok:write-access'

function hasWriteAccess(): boolean {
  try {
    return localStorage.getItem(WRITE_ACCESS_KEY) === '1'
  } catch {
    return false
  }
}

let lastSent = ''

function flush(): void {
  const { progress, settings, demo } = useStore.getState()
  // И мини-апп, и сайт после входа: иначе бот напоминал бы тем, кто уже позанимался на сайте.
  if (demo || !authHeader()) return
  const body = {
    reminders: settings.reminders,
    remindHour: settings.remindHour,
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Minsk',
    streak: liveStreak(progress),
    due: dueCount(progress),
    studiedToday: todayStats(progress).tasks > 0,
    canMessage: hasWriteAccess() || undefined,
  }
  const key = JSON.stringify(body)
  if (key === lastSent) return
  lastSent = key
  syncReminders(body)
}

/**
 * Бот напоминает позаниматься, только если ученик сегодня ещё не занимался.
 * Для этого воркеру нужна сводка: серия, сколько карточек ждёт повторения,
 * занимался ли сегодня. Отправляем её через 15 секунд после последнего
 * изменения и сразу, когда приложение сворачивают (keepalive-запрос).
 */
export function useReminderSync(): void {
  const updatedAt = useStore((s) => s.updatedAt)

  useEffect(() => {
    const t = window.setTimeout(flush, 15_000)
    return () => window.clearTimeout(t)
  }, [updatedAt])

  useEffect(() => {
    const onHide = () => document.visibilityState === 'hidden' && flush()
    document.addEventListener('visibilitychange', onHide)
    return () => document.removeEventListener('visibilitychange', onHide)
  }, [])
}
