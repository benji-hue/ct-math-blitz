import { create } from 'zustand'
import { API_BASE, BOT_USERNAME } from '../config'
import { initData, openExternal, telegramUser } from './telegram'

/**
 * Аккаунт ученика — его Telegram, без паролей и регистрации.
 *
 * В мини-аппе ученик известен сам (initData подписана токеном бота). На сайте — после
 * входа через бота: сайт показывает код, ученик подтверждает вход в чате с ботом, сайт
 * получает токен сессии и хранит его в этом браузере. Прогресс лежит на сервере и общий
 * для сайта и мини-аппа (lib/sync.ts).
 */

export interface AccountUser {
  id: number
  first_name: string
  username?: string
}

const TOKEN_KEY = 'krok:session'
const USER_KEY = 'krok:account'
const TOKEN = /^[A-Za-z0-9_-]{32,128}$/

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    // Приватный режим браузера: вход просто не переживёт перезагрузку.
  }
}

export function sessionToken(): string | null {
  const token = read(TOKEN_KEY)
  return token && TOKEN.test(token) ? token : null
}

function storedUser(): AccountUser | null {
  try {
    const user = JSON.parse(read(USER_KEY) ?? 'null') as AccountUser | null
    return user && typeof user.id === 'number' ? user : null
  } catch {
    return null
  }
}

/** Вход на сайте: кто вошёл (в мини-аппе не используется — там Telegram сам знает ученика). */
export const useAccount = create<{ user: AccountUser | null; set: (user: AccountUser | null) => void }>()((set) => ({
  user: sessionToken() ? storedUser() : null,
  set: (user) => set({ user }),
}))

/** Ученик в мини-аппе Telegram или вошедший на сайте; null — гость сайта. */
export function accountUser(): AccountUser | null {
  const tg = telegramUser()
  if (tg) return { id: tg.id, first_name: tg.first_name, ...(tg.username ? { username: tg.username } : {}) }
  return useAccount.getState().user
}

/** Заголовок для сервера: в Telegram — подпись initData, на сайте после входа — токен сессии. */
export function authHeader(): string | null {
  const data = initData()
  if (data) return `tma ${data}`
  const token = sessionToken()
  return token ? `Bearer ${token}` : null
}

/** Сервер сказал, что вход истёк (401 на токен сессии): забываем его. */
export function dropSession(): void {
  write(TOKEN_KEY, null)
  write(USER_KEY, null)
  useAccount.getState().set(null)
}

export interface LoginRequest {
  nonce: string
  code: string
  /** Ссылка на бота: /start login_<nonce>. */
  link: string
}

export async function startLogin(): Promise<LoginRequest> {
  let data: { nonce?: string; code?: string; error?: string } = {}
  let ok = false
  try {
    const res = await fetch(`${API_BASE}/api/auth/start`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
    ok = res.ok
    data = await res.json().catch(() => ({}))
  } catch {
    throw new Error('Нет связи с сервером. Проверь интернет.')
  }
  if (!ok || !data.nonce || !data.code) throw new Error(data.error || 'Не удалось начать вход. Попробуй ещё раз.')
  return { nonce: data.nonce, code: data.code, link: `https://t.me/${BOT_USERNAME}?start=login_${data.nonce}` }
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer)
      reject(new DOMException('Вход отменён', 'AbortError'))
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    if (signal.aborted) onAbort()
    else signal.addEventListener('abort', onAbort, { once: true })
  })
}

/** Ждёт подтверждения в боте: опрос раз в 2 с, не дольше 10 минут. */
export async function waitForLogin(nonce: string, signal: AbortSignal): Promise<AccountUser> {
  const until = Date.now() + 10 * 60_000
  while (Date.now() < until) {
    await sleep(2000, signal)
    let data: { status?: string; token?: string; user?: AccountUser } | null = null
    try {
      const res = await fetch(`${API_BASE}/api/auth/poll?nonce=${encodeURIComponent(nonce)}`, { signal })
      data = res.ok ? await res.json() : null
    } catch (e) {
      if ((e as Error).name === 'AbortError') throw e
      continue // Связь моргнула — спросим ещё раз.
    }
    if (data?.status === 'ok' && data.token && data.user) {
      saveSession(data.token, data.user)
      return data.user
    }
    if (data?.status === 'expired') break
  }
  throw new Error('Время на вход вышло. Нажми «Войти через Telegram» ещё раз.')
}

function saveSession(token: string, user: AccountUser): void {
  write(TOKEN_KEY, token)
  write(USER_KEY, JSON.stringify(user))
  useAccount.getState().set(user)
}

/**
 * Сайт открыт по ссылке из мини-аппа или бота (#login=<nonce>): вход уже подтверждён
 * в Telegram — забираем токен сессии и убираем ссылку из адреса (она одноразовая).
 */
export async function consumeLoginLink(): Promise<AccountUser | null> {
  if (typeof location === 'undefined' || initData()) return null
  const params = new URLSearchParams(location.hash.slice(1))
  const nonce = params.get('login')
  if (!nonce) return null
  params.delete('login')
  const rest = params.toString()
  history.replaceState(null, '', `${location.pathname}${location.search}${rest ? `#${rest}` : ''}`)
  try {
    const res = await fetch(`${API_BASE}/api/auth/poll?nonce=${encodeURIComponent(nonce)}`)
    const data = (await res.json()) as { status?: string; token?: string; user?: AccountUser }
    if (data.status !== 'ok' || !data.token || !data.user) return null
    saveSession(data.token, data.user)
    return data.user
  } catch {
    return null
  }
}

/** Из мини-аппа: открыть сайт в браузере уже со своим аккаунтом и прогрессом. */
export async function openOnSite(): Promise<void> {
  const auth = authHeader()
  if (!auth) throw new Error('Открой «Крок» из Telegram')
  const res = await fetch(`${API_BASE}/api/auth/link`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: auth }, body: '{}' })
  const data = (await res.json().catch(() => ({}))) as { nonce?: string; error?: string }
  if (!res.ok || !data.nonce) throw new Error(data.error || 'Не удалось подготовить ссылку. Попробуй ещё раз.')
  // Мини-апп сам живёт на сайте (GitHub Pages) — открываем этот же адрес во внешнем браузере.
  openExternal(`${location.origin}${location.pathname}#login=${data.nonce}`)
}

export async function logout(): Promise<void> {
  const token = sessionToken()
  dropSession()
  if (token) await fetch(`${API_BASE}/api/auth/logout`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } }).catch(() => {})
}
