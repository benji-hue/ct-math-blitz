import { API_BASE } from '../config'
import { authHeader, dropSession } from './account'
import { cloud, initData } from './telegram'
import { normalizeState, snapshot, useStore, type PersistedState } from './store'

/**
 * Синхронизация прогресса между устройствами — двумя путями:
 *  1) Telegram CloudStorage — в мини-аппе, без сервера;
 *  2) аккаунт на сервере (/api/state) — общий для мини-аппа и сайта после входа
 *     через Telegram (lib/account.ts). Побеждает снимок, изменённый позже.
 *
 * Ограничения CloudStorage: значение до 4096 символов, ключей до 1024.
 * Поэтому снимок режется на куски по 4000 символов (ключи p0, p1, …),
 * а рядом лежит p_meta с количеством кусков и временем обновления.
 * Чат и сырые попытки старше 400 штук в облако не уходят — они не нужны
 * для продолжения работы на другом устройстве, а место ограничено.
 */

const CHUNK = 4000
const META = 'p_meta'
const MAX_CHUNKS = 200

interface Meta {
  n: number
  updatedAt: number
}

function cloudPayload(state: PersistedState, attempts = 400): string {
  const slim: PersistedState = {
    ...state,
    chat: { ...state.chat, messages: [] },
    progress: { ...state.progress, attempts: state.progress.attempts.slice(-attempts) },
  }
  return JSON.stringify(slim)
}

/** На сервере места больше, чем в CloudStorage: храним 1500 последних ответов. */
const SERVER_ATTEMPTS = 1500

export async function pushToServer(): Promise<boolean> {
  const auth = authHeader()
  const state = snapshot()
  if (!auth || state.demo || !state.profile.onboarded) return false
  const res = await fetch(`${API_BASE}/api/state`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: auth },
    body: JSON.stringify({ state: cloudPayload(state, SERVER_ATTEMPTS), updatedAt: state.updatedAt }),
  })
  if (res.status === 401 && !initData()) dropSession()
  return res.ok
}

/**
 * Подтянуть прогресс из аккаунта: если на сервере новее — заменить локальный (чат с
 * этого устройства сохраняем), если новее здесь — отправить на сервер.
 *
 * Сразу после входа на сайте (preferServer) прогресс аккаунта главнее: иначе пара заданий,
 * решённых гостем, «свежее» по времени и затёрла бы недели занятий в Telegram.
 */
export async function pullFromServer({ preferServer = false } = {}): Promise<'restored' | 'pushed' | 'same' | 'unavailable'> {
  const auth = authHeader()
  if (!auth) return 'unavailable'
  const res = await fetch(`${API_BASE}/api/state`, { headers: { Authorization: auth } })
  if (res.status === 401 && !initData()) dropSession()
  if (!res.ok) return 'unavailable'
  const data = (await res.json()) as { state?: string | null; updatedAt?: number }
  const local = snapshot()
  if (local.demo) return 'same'
  const remoteAt = Number(data.updatedAt) || 0
  if (data.state && (preferServer || remoteAt > local.updatedAt)) {
    const remote = normalizeState(JSON.parse(data.state))
    useStore.getState().replaceState({ ...remote, chat: local.chat, updatedAt: remoteAt })
    return 'restored'
  }
  if (local.updatedAt > remoteAt && (await pushToServer())) return 'pushed'
  return 'same'
}

export async function pushToCloud(): Promise<boolean> {
  if (!cloud.available()) return false
  const state = snapshot()
  if (state.demo) return false
  const data = cloudPayload(state)
  const n = Math.ceil(data.length / CHUNK)
  if (n > MAX_CHUNKS) return false
  for (let i = 0; i < n; i++) await cloud.set(`p${i}`, data.slice(i * CHUNK, (i + 1) * CHUNK))
  await cloud.set(META, JSON.stringify({ n, updatedAt: state.updatedAt } satisfies Meta))
  return true
}

export async function pullFromCloud(): Promise<'restored' | 'local-newer' | 'empty' | 'unavailable'> {
  if (!cloud.available()) return 'unavailable'
  const metaRaw = (await cloud.get([META]))[META]
  if (!metaRaw) return 'empty'
  const meta = JSON.parse(metaRaw) as Meta
  const local = snapshot()
  if (local.demo || local.updatedAt >= meta.updatedAt) return 'local-newer'
  const keys = Array.from({ length: meta.n }, (_, i) => `p${i}`)
  const parts = await cloud.get(keys)
  const data = keys.map((k) => parts[k] ?? '').join('')
  const remote = normalizeState(JSON.parse(data))
  // Чат с этого устройства не теряем.
  useStore.getState().replaceState({ ...remote, chat: local.chat, updatedAt: meta.updatedAt })
  return 'restored'
}

let timer: number | undefined
let lastPushed = 0

const pushAll = () => {
  pushToCloud().catch(() => {})
  pushToServer().catch(() => {})
}

/**
 * Запускает фоновую синхронизацию: при старте подтянуть (облако Telegram, затем аккаунт),
 * дальше отправлять не чаще раза в 20 с и сразу, когда приложение сворачивают.
 */
export function startSync(): () => void {
  pullFromCloud()
    .catch(() => {})
    .finally(() => pullFromServer().catch(() => {}))
  const unsub = useStore.subscribe((state) => {
    if (state.updatedAt === lastPushed) return
    window.clearTimeout(timer)
    timer = window.setTimeout(() => {
      lastPushed = useStore.getState().updatedAt
      pushAll()
    }, 20000)
  })
  const flush = () => {
    if (document.visibilityState === 'hidden') {
      window.clearTimeout(timer)
      pushAll()
    }
  }
  document.addEventListener('visibilitychange', flush)
  return () => {
    unsub()
    document.removeEventListener('visibilitychange', flush)
  }
}
