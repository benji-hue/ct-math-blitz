import { API_BASE } from '../config'
import { accountUser, authHeader, dropSession, logout } from './account'
import { cloud, initData } from './telegram'
import { emptyState, normalizeState, snapshot, useStore, type PersistedState } from './store'

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

/**
 * Время последнего снимка, пришедшего с другого устройства: его не отправляем обратно —
 * на сервере он уже есть, а облако Telegram догонит при следующем изменении.
 */
let restoredAt = 0

/**
 * Чей прогресс лежит на устройстве (id аккаунта). На общем компьютере или при двух
 * аккаунтах Telegram на одном телефоне прогресс одного ученика не должен попасть другому.
 * Нет метки — это прогресс гостя: он достаётся первому вошедшему.
 */
const OWNER_KEY = 'krok:owner'

function isForeign(me: number | undefined): boolean {
  if (me === undefined) return false
  try {
    const owner = localStorage.getItem(OWNER_KEY)
    return Boolean(owner) && owner !== String(me)
  } catch {
    return false
  }
}

function setOwner(me: number | undefined | null): void {
  try {
    if (me === undefined || me === null) localStorage.removeItem(OWNER_KEY)
    else localStorage.setItem(OWNER_KEY, String(me))
  } catch {
    // Приватный режим: метки нет — ведём себя как раньше.
  }
}

/** На сервере места больше, чем в CloudStorage: храним 1500 последних ответов. */
const SERVER_ATTEMPTS = 1500

export async function pushToServer(): Promise<boolean> {
  const auth = authHeader()
  const state = snapshot()
  if (!auth || state.demo || !state.profile.onboarded || isForeign(accountUser()?.id)) return false
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
  const before = snapshot()
  if (before.demo) return 'same'
  // Обычная проверка — с ?since: если на сервере не новее, он ответит коротко, без снимка.
  const me = accountUser()?.id
  // На устройстве остался прогресс другого аккаунта — он не смешивается с этим.
  const foreign = isForeign(me)
  const full = preferServer || !before.profile.onboarded || foreign
  const res = await fetch(`${API_BASE}/api/state${full ? '' : `?since=${before.updatedAt}`}`, { headers: { Authorization: auth } })
  if (res.status === 401 && !initData()) dropSession()
  if (!res.ok) return 'unavailable'
  const data = (await res.json()) as { state?: string | null; updatedAt?: number }
  const local = snapshot()
  if (local.demo) return 'same'
  const remoteAt = Number(data.updatedAt) || 0
  // Приветствие на этом устройстве не пройдено — прогресс аккаунта главнее (см. pullFromCloud).
  if (data.state && (foreign || preferServer || !local.profile.onboarded || remoteAt > local.updatedAt)) {
    const remote = normalizeState(JSON.parse(data.state))
    // Чат и настройки устройства (тема, лёгкий режим, вибрация) — свои на каждом устройстве.
    // Время снимка — серверное: иначе старая копия стала бы «свежей» и затёрла бы новую.
    restoredAt = remoteAt
    useStore.getState().restoreState({ ...remote, chat: foreign ? emptyState().chat : local.chat, settings: local.settings, updatedAt: remoteAt })
    setOwner(me)
    return 'restored'
  }
  if (foreign) {
    // У этого аккаунта прогресса ещё нет: начинаем с чистого листа, а не с чужого.
    useStore.getState().resetAll()
    setOwner(me)
    return 'same'
  }
  setOwner(me)
  if (local.updatedAt > remoteAt && (await pushToServer())) return 'pushed'
  return 'same'
}

/**
 * Выход на сайте. Сначала досылаем прогресс в аккаунт; если он точно там — убираем его с
 * устройства (за общим компьютером следующий не увидит чужие ответы и чат). Нет связи —
 * прогресс остаётся здесь и уйдёт в аккаунт при следующем входе этого же ученика.
 */
export async function logoutAndClear(): Promise<'cleared' | 'kept'> {
  const synced = await pushToServer().catch(() => false)
  await logout()
  if (!synced) return 'kept'
  useStore.getState().resetAll()
  setOwner(null)
  return 'cleared'
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
  // Новое устройство или новый адрес мини-аппа: приветствие не пройдено — облако главнее, даже если
  // мини-апп успел что-то записать (имя из Telegram ставится сразу и делает снимок «свежее»).
  if (local.demo || (local.profile.onboarded && local.updatedAt >= meta.updatedAt)) return 'local-newer'
  const keys = Array.from({ length: meta.n }, (_, i) => `p${i}`)
  const parts = await cloud.get(keys)
  const data = keys.map((k) => parts[k] ?? '').join('')
  const remote = normalizeState(JSON.parse(data))
  // Чат и настройки устройства не теряем; время снимка — из облака, чтобы следом сервер мог
  // оказаться новее (занимался в браузере) и победить, а не наоборот.
  restoredAt = meta.updatedAt
  useStore.getState().restoreState({ ...remote, chat: local.chat, settings: local.settings, updatedAt: meta.updatedAt })
  return 'restored'
}

/** Сервер — через 4 с после изменения (ответил на задание — уже на других устройствах). */
const SERVER_DELAY_MS = 4000
/** Облако Telegram — реже: каждый снимок там — десятки запросов по 4000 символов. */
const CLOUD_DELAY_MS = 20_000
/** Открытая вкладка сама проверяет, нет ли прогресса новее (занимаешься с телефона). */
const POLL_MS = 30_000

/**
 * Запускает фоновую синхронизацию: при старте подтянуть (облако Telegram, затем аккаунт);
 * изменения — на сервер через 4 с, в облако через 20 с, сразу — при сворачивании и закрытии;
 * при возвращении в приложение и раз в 30 с, пока оно открыто, — проверить, нет ли новее.
 */
export function startSync({ preferServer = false } = {}): () => void {
  let serverTimer: number | undefined
  let cloudTimer: number | undefined
  let lastPushed = 0
  let lastPull = Date.now()
  pullFromCloud()
    .catch(() => {})
    .finally(() => pullFromServer({ preferServer }).catch(() => {}))
  const unsub = useStore.subscribe((state) => {
    if (state.updatedAt === lastPushed || state.updatedAt === restoredAt) return
    window.clearTimeout(serverTimer)
    window.clearTimeout(cloudTimer)
    serverTimer = window.setTimeout(() => {
      lastPushed = useStore.getState().updatedAt
      pushToServer().catch(() => {})
    }, SERVER_DELAY_MS)
    cloudTimer = window.setTimeout(() => pushToCloud().catch(() => {}), CLOUD_DELAY_MS)
  })
  const pushNow = () => {
    window.clearTimeout(serverTimer)
    window.clearTimeout(cloudTimer)
    pushToServer().catch(() => {})
    pushToCloud().catch(() => {})
  }
  const pull = () => {
    if (Date.now() - lastPull < 5000) return
    lastPull = Date.now()
    pullFromServer().catch(() => {})
  }
  const onVisibility = () => (document.visibilityState === 'hidden' ? pushNow() : pull())
  const poll = window.setInterval(() => {
    if (document.visibilityState === 'visible') pull()
  }, POLL_MS)
  document.addEventListener('visibilitychange', onVisibility)
  window.addEventListener('pagehide', pushNow)
  window.addEventListener('focus', pull)
  return () => {
    unsub()
    window.clearInterval(poll)
    document.removeEventListener('visibilitychange', onVisibility)
    window.removeEventListener('pagehide', pushNow)
    window.removeEventListener('focus', pull)
  }
}
