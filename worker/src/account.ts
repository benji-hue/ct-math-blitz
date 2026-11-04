import type { Env } from './env'

/**
 * Аккаунт ученика — его Telegram-аккаунт, без паролей и регистрации.
 *
 * В мини-аппе ученик известен сразу: initData подписана токеном бота. На сайте вход
 * идёт через бота (как «вход по устройству»):
 *   1) сайт просит одноразовый запрос: nonce и короткий код;
 *   2) ученик открывает t.me/<бот>?start=login_<nonce>, бот показывает тот же код и
 *      кнопку «Подтвердить» — чужая ссылка не войдёт в чужой аккаунт незаметно;
 *   3) сайт опрашивает сервер и после подтверждения получает токен сессии.
 * На сервере хранится только хэш токена. Прогресс (user_state) общий для сайта и
 * мини-аппа: побеждает снимок, изменённый позже.
 */

export const LOGIN_TTL_MS = 10 * 60_000
export const SESSION_TTL_MS = 180 * 86_400_000
/** Снимок прогресса без чата — с запасом: 1500 последних ответов, задания от ИИ, профиль. */
export const MAX_STATE_CHARS = 1_500_000
export const NONCE = /^[A-Za-z0-9_-]{16,64}$/

export interface AccountUser {
  id: number
  first_name: string
  username?: string
}

function base64url(bytes: Uint8Array): string {
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function randomToken(bytes: number): string {
  return base64url(crypto.getRandomValues(new Uint8Array(bytes)))
}

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Код из 4 цифр для сверки на сайте и в боте. */
function loginCode(): string {
  return String(1000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 9000))
}

// ---------- Вход через бота ----------

export async function startLogin(env: Env, now = Date.now()): Promise<{ nonce: string; code: string }> {
  const db = env.DB!
  await db.prepare('DELETE FROM login_requests WHERE created_at < ?1').bind(now - LOGIN_TTL_MS).run()
  const nonce = randomToken(16)
  const code = loginCode()
  await db.prepare('INSERT INTO login_requests (nonce, code, created_at) VALUES (?1, ?2, ?3)').bind(nonce, code, now).run()
  return { nonce, code }
}

/** Запрос на вход, если он есть, не устарел и ещё не подтверждён. */
export async function pendingLogin(env: Env, nonce: string, now = Date.now()): Promise<{ code: string } | null> {
  if (!NONCE.test(nonce)) return null
  return env.DB!.prepare('SELECT code FROM login_requests WHERE nonce = ?1 AND created_at >= ?2 AND user_id IS NULL')
    .bind(nonce, now - LOGIN_TTL_MS)
    .first<{ code: string }>()
}

/** Ученик нажал «Подтвердить» в боте. */
export async function confirmLogin(env: Env, nonce: string, user: AccountUser, now = Date.now()): Promise<boolean> {
  if (!NONCE.test(nonce)) return false
  const result = await env.DB!.prepare(
    'UPDATE login_requests SET user_id = ?2, first_name = ?3, username = ?4 WHERE nonce = ?1 AND created_at >= ?5 AND user_id IS NULL',
  )
    .bind(nonce, user.id, user.first_name, user.username ?? null, now - LOGIN_TTL_MS)
    .run()
  return Number(result.meta?.changes ?? 0) > 0
}

export type PollResult = { status: 'pending' } | { status: 'expired' } | { status: 'ok'; token: string; user: AccountUser }

/**
 * Опрос с сайта. Подтверждённый запрос забирается атомарно (DELETE … RETURNING):
 * токен выдаётся ровно один раз, даже если опросов два одновременно.
 */
export async function pollLogin(env: Env, nonce: string, now = Date.now()): Promise<PollResult> {
  if (!NONCE.test(nonce)) return { status: 'expired' }
  const db = env.DB!
  const claimed = await db
    .prepare('DELETE FROM login_requests WHERE nonce = ?1 AND user_id IS NOT NULL AND created_at >= ?2 RETURNING user_id, first_name, username')
    .bind(nonce, now - LOGIN_TTL_MS)
    .first<{ user_id: number; first_name: string | null; username: string | null }>()
  if (!claimed) {
    const waiting = await pendingLogin(env, nonce, now)
    return waiting ? { status: 'pending' } : { status: 'expired' }
  }
  const token = randomToken(32)
  await db.prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?1, ?2, ?3, ?4)')
    .bind(await sha256(token), claimed.user_id, now, now + SESSION_TTL_MS)
    .run()
  return { status: 'ok', token, user: { id: claimed.user_id, first_name: claimed.first_name ?? '', ...(claimed.username ? { username: claimed.username } : {}) } }
}

export async function sessionUser(env: Env, token: string, now = Date.now()): Promise<AccountUser | null> {
  if (!env.DB || !/^[A-Za-z0-9_-]{32,128}$/.test(token)) return null
  const row = await env.DB.prepare(
    'SELECT s.user_id AS id, u.first_name AS first_name, u.username AS username FROM sessions s LEFT JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?1 AND s.expires_at > ?2',
  )
    .bind(await sha256(token), now)
    .first<{ id: number; first_name: string | null; username: string | null }>()
  return row ? { id: row.id, first_name: row.first_name ?? '', ...(row.username ? { username: row.username } : {}) } : null
}

export async function endSession(env: Env, token: string): Promise<void> {
  if (!env.DB) return
  await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?1').bind(await sha256(token)).run()
}

// ---------- Прогресс ----------

export async function loadState(env: Env, userId: number): Promise<{ state: string; updatedAt: number } | null> {
  const row = await env.DB!.prepare('SELECT state, updated_at FROM user_state WHERE user_id = ?1').bind(userId).first<{ state: string; updated_at: number }>()
  return row ? { state: row.state, updatedAt: row.updated_at } : null
}

/** Сохраняет снимок, только если он не старше сохранённого. Возвращает время сохранённого снимка. */
export async function saveState(env: Env, userId: number, state: string, updatedAt: number, now = Date.now()): Promise<number> {
  const db = env.DB!
  await db
    .prepare(
      `INSERT INTO user_state (user_id, state, updated_at, saved_at) VALUES (?1, ?2, ?3, ?4)
       ON CONFLICT(user_id) DO UPDATE SET state = excluded.state, updated_at = excluded.updated_at, saved_at = excluded.saved_at
       WHERE excluded.updated_at >= user_state.updated_at`,
    )
    .bind(userId, state, updatedAt, now)
    .run()
  const row = await db.prepare('SELECT updated_at FROM user_state WHERE user_id = ?1').bind(userId).first<{ updated_at: number }>()
  return row?.updated_at ?? updatedAt
}
