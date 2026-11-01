import { minskDay, num, type Env } from './env'

/**
 * Дневные лимиты запросов к ИИ на пользователя.
 *
 * Счётчик — атомарный UPSERT в D1 (INSERT … ON CONFLICT DO UPDATE … RETURNING),
 * поэтому параллельные запросы не обходят лимит. Без D1 (локальная
 * разработка) — счётчик в памяти изолята: неточно, но безопасно по умолчанию.
 */

export type Kind = 'chat' | 'generate' | 'analyze' | 'vision'

const DEFAULTS: Record<Kind, number> = { chat: 60, generate: 15, analyze: 6, vision: 12 }

export function limitFor(env: Env, kind: Kind, anonymous: boolean): number {
  const configured = {
    chat: num(env.DAILY_LIMIT_CHAT, DEFAULTS.chat),
    generate: num(env.DAILY_LIMIT_GENERATE, DEFAULTS.generate),
    analyze: num(env.DAILY_LIMIT_ANALYZE, DEFAULTS.analyze),
    vision: num(env.DAILY_LIMIT_VISION, DEFAULTS.vision),
  }[kind]
  // Без Telegram пользователь анонимен — лимит заметно меньше.
  return anonymous ? Math.max(3, Math.floor(configured / 4)) : configured
}

const memory = new Map<string, number>()

export async function consume(env: Env, userKey: string, kind: Kind): Promise<number> {
  const day = minskDay()
  if (!env.DB) {
    const key = `${userKey}|${day}|${kind}`
    const next = (memory.get(key) ?? 0) + 1
    memory.set(key, next)
    return next
  }
  const row = await env.DB.prepare(
    `INSERT INTO usage (user_key, day, kind, count) VALUES (?1, ?2, ?3, 1)
     ON CONFLICT(user_key, day, kind) DO UPDATE SET count = count + 1
     RETURNING count`,
  )
    .bind(userKey, day, kind)
    .first<{ count: number }>()
  return row?.count ?? 1
}

export async function usage(env: Env, userKey: string): Promise<Partial<Record<Kind, number>>> {
  if (!env.DB) return {}
  const day = minskDay()
  const rows = await env.DB.prepare('SELECT kind, count FROM usage WHERE user_key = ?1 AND day = ?2').bind(userKey, day).all<{ kind: Kind; count: number }>()
  return Object.fromEntries((rows.results ?? []).map((r) => [r.kind, r.count]))
}

/** Обезличенные счётчики событий — для метрик на защите (DAU, задания, запросы к ИИ). */
export async function track(env: Env, name: string): Promise<void> {
  if (!env.DB) return
  await env.DB.prepare(
    `INSERT INTO events (day, name, count) VALUES (?1, ?2, 1)
     ON CONFLICT(day, name) DO UPDATE SET count = count + 1`,
  )
    .bind(minskDay(), name)
    .run()
}
