import { cloud } from './telegram'
import { normalizeState, snapshot, useStore, type PersistedState } from './store'

/**
 * Синхронизация прогресса между устройствами через Telegram CloudStorage —
 * без собственного сервера и без регистрации.
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

function cloudPayload(state: PersistedState): string {
  const slim: PersistedState = {
    ...state,
    chat: { ...state.chat, messages: [] },
    progress: { ...state.progress, attempts: state.progress.attempts.slice(-400) },
  }
  return JSON.stringify(slim)
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

/** Запускает фоновую синхронизацию: при старте подтянуть, затем пушить не чаще раза в 20 с. */
export function startCloudSync(): () => void {
  pullFromCloud().catch(() => {})
  const unsub = useStore.subscribe((state) => {
    if (state.updatedAt === lastPushed) return
    window.clearTimeout(timer)
    timer = window.setTimeout(() => {
      lastPushed = useStore.getState().updatedAt
      pushToCloud().catch(() => {})
    }, 20000)
  })
  const flush = () => {
    if (document.visibilityState === 'hidden') {
      window.clearTimeout(timer)
      pushToCloud().catch(() => {})
    }
  }
  document.addEventListener('visibilitychange', flush)
  return () => {
    unsub()
    document.removeEventListener('visibilitychange', flush)
  }
}
