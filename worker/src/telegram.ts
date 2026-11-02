/**
 * Telegram: проверка подписи initData и вызовы Bot API.
 *
 * initData — строка, которую Telegram передаёт мини-аппу при запуске. Она
 * подписана токеном бота, поэтому подделать user.id нельзя: это наша
 * «авторизация без паролей». Алгоритм — из документации Telegram:
 *   secret = HMAC_SHA256(key = "WebAppData", data = bot_token)
 *   hash   = hex(HMAC_SHA256(key = secret, data = data_check_string))
 * где data_check_string — все поля кроме hash, отсортированные по ключу,
 * в виде key=value через перевод строки.
 */

export interface TgUser {
  id: number
  first_name: string
  last_name?: string
  username?: string
  language_code?: string
}

export type InitDataResult = { ok: true; user: TgUser; authDate: number } | { ok: false; reason: string }

const encoder = new TextEncoder()

async function hmac(key: ArrayBuffer | Uint8Array, data: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(data))
}

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Сравнение за постоянное время — не даём подобрать подпись по таймингу. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/**
 * Производный секрет из токена бота: hex(HMAC_SHA256(key = токен, data = метка)).
 * Так считаются секрет вебхука и ключ служебной проверки ИИ — отдельно их хранить
 * не нужно, а без токена бота их не подобрать. Тот же расчёт — в scripts/lib.mjs.
 */
export async function deriveSecret(botToken: string, label: string): Promise<string> {
  return toHex(await hmac(encoder.encode(botToken), label))
}

export async function validateInitData(initData: string, botToken: string, maxAgeSeconds = 86400, now = Date.now()): Promise<InitDataResult> {
  if (!initData) return { ok: false, reason: 'empty' }
  let params: URLSearchParams
  try {
    params = new URLSearchParams(initData)
  } catch {
    return { ok: false, reason: 'malformed' }
  }
  const hash = params.get('hash')
  if (!hash) return { ok: false, reason: 'no hash' }

  const pairs = [...params.entries()]
    .filter(([key]) => key !== 'hash')
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
  const secret = await hmac(encoder.encode('WebAppData'), botToken)
  const expected = toHex(await hmac(secret, pairs.join('\n')))
  if (!safeEqual(expected, hash.toLowerCase())) return { ok: false, reason: 'bad signature' }

  const authDate = Number(params.get('auth_date'))
  if (!Number.isFinite(authDate) || authDate <= 0) return { ok: false, reason: 'no auth_date' }
  if (now / 1000 - authDate > maxAgeSeconds) return { ok: false, reason: 'expired' }

  try {
    const user = JSON.parse(params.get('user') ?? 'null') as TgUser | null
    if (!user || typeof user.id !== 'number') return { ok: false, reason: 'no user' }
    return { ok: true, user, authDate }
  } catch {
    return { ok: false, reason: 'bad user' }
  }
}

/** Подписывает initData — нужно для тестов и локальной проверки. */
export async function signInitData(fields: Record<string, string>, botToken: string): Promise<string> {
  const pairs = Object.entries(fields)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
  const secret = await hmac(encoder.encode('WebAppData'), botToken)
  const hash = toHex(await hmac(secret, pairs.join('\n')))
  const params = new URLSearchParams(fields)
  params.set('hash', hash)
  return params.toString()
}

// ---------- Bot API ----------

export class TelegramError extends Error {
  code: number
  constructor(message: string, code: number) {
    super(message)
    this.code = code
  }
}

export async function botApi<T = unknown>(token: string, method: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; result?: T; description?: string; error_code?: number }
  if (!data.ok) throw new TelegramError(data.description ?? `Telegram ${method} failed`, data.error_code ?? res.status)
  return data.result as T
}

export function openAppKeyboard(url: string | undefined, text = 'Открыть Крок') {
  if (!url) return undefined
  return { inline_keyboard: [[{ text, web_app: { url } }]] }
}
