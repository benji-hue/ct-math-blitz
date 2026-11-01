import { minskDay, type Env } from './env'
import { botApi, openAppKeyboard, TelegramError } from './telegram'

/**
 * Напоминания (Cron Trigger раз в час). Пишем ученику, только если:
 *  - он разрешил сообщения и не выключил напоминания;
 *  - в его часовом поясе сейчас выбранный им час;
 *  - сегодня он ещё не занимался и сегодня мы ему ещё не писали.
 * Наука о привычках: напоминание в одно и то же время + короткая цель
 * («10 минут») работают лучше, чем частые уведомления.
 */

interface Row {
  id: number
  first_name: string | null
  remind_hour: number
  tz: string
  streak: number
  due: number
  last_study_day: string | null
}

export function localHour(tz: string, now = new Date()): number {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', hourCycle: 'h23' }).formatToParts(now)
    return Number(parts.find((p) => p.type === 'hour')?.value ?? -1)
  } catch {
    return new Date(now.getTime() + 3 * 3600_000).getUTCHours()
  }
}

export function reminderText(row: Pick<Row, 'first_name' | 'streak' | 'due'>): string {
  const name = row.first_name ? `${row.first_name}, ` : ''
  if (row.streak >= 2) {
    return `${name}серия ${row.streak} дн. ждёт продолжения 🔥\n${row.due ? `${row.due} заданий как раз пора повторить — память на пике забывания.` : 'Хватит 10 минут, чтобы её сохранить.'}`
  }
  if (row.due > 0) return `${name}${row.due} заданий пора повторить — это займёт около 10 минут. Повторение сегодня экономит часы перед экзаменом.`
  return `${name}10 минут сегодня — шаг к 100 баллам. Начнём?`
}

export async function sendReminders(env: Env, now = new Date()): Promise<number> {
  if (!env.DB || !env.BOT_TOKEN) return 0
  const today = minskDay(now.getTime())
  const rows = await env.DB.prepare(
    `SELECT id, first_name, remind_hour, tz, streak, due, last_study_day FROM users
     WHERE reminders = 1 AND can_message = 1
       AND (last_study_day IS NULL OR last_study_day != ?1)
       AND (last_reminded_day IS NULL OR last_reminded_day != ?1)
     LIMIT 2000`,
  )
    .bind(today)
    .all<Row>()

  let sent = 0
  for (const row of rows.results ?? []) {
    if (localHour(row.tz, now) !== row.remind_hour) continue
    try {
      await botApi(env.BOT_TOKEN, 'sendMessage', {
        chat_id: row.id,
        text: reminderText(row),
        reply_markup: openAppKeyboard(env.MINI_APP_URL, 'Позаниматься'),
      })
      await env.DB.prepare('UPDATE users SET last_reminded_day = ?2 WHERE id = ?1').bind(row.id, today).run()
      sent++
    } catch (e) {
      // 403 — ученик заблокировал бота: больше не пишем.
      if (e instanceof TelegramError && e.code === 403) await env.DB.prepare('UPDATE users SET can_message = 0 WHERE id = ?1').bind(row.id).run()
    }
    // Лимит Telegram — около 30 сообщений в секунду.
    if (sent % 25 === 24) await new Promise((r) => setTimeout(r, 1000))
  }
  return sent
}
