import { afterEach, describe, expect, it, vi } from 'vitest'

// Тесты идут в Node: вместо localStorage браузера — простое хранилище в памяти.
const storage = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => void storage.set(key, String(value)),
  removeItem: (key: string) => void storage.delete(key),
})

const { authHeader, consumeLoginLink, logout, sessionToken, useAccount, waitForLogin } = await import('../lib/account')
const { pullFromServer } = await import('../lib/sync')
const { emptyState, snapshot, useStore } = await import('../lib/store')

const TOKEN = 'T'.repeat(43)
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })

function signIn() {
  storage.set('krok:session', TOKEN)
  storage.set('krok:account', JSON.stringify({ id: 7, first_name: 'Аня' }))
  useAccount.getState().set({ id: 7, first_name: 'Аня' })
}

function localProgress(xp: number) {
  const base = emptyState()
  useStore.getState().replaceState({ ...base, profile: { ...base.profile, onboarded: true, subjects: ['math'] }, progress: { ...base.progress, xp } })
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => void storage.set(key, String(value)),
    removeItem: (key: string) => void storage.delete(key),
  })
  storage.clear()
  useAccount.getState().set(null)
})

describe('аккаунт Telegram на сайте', () => {
  it('гость — без авторизации; после подтверждения в боте — токен сессии', async () => {
    expect(authHeader()).toBeNull()
    vi.useFakeTimers()
    let polls = 0
    vi.stubGlobal('fetch', async (url: string) => {
      expect(url).toContain('/api/auth/poll?nonce=abc')
      polls++
      return json(polls === 1 ? { status: 'pending' } : { status: 'ok', token: TOKEN, user: { id: 7, first_name: 'Аня', username: 'anya' } })
    })
    const done = waitForLogin('abc', new AbortController().signal)
    await vi.advanceTimersByTimeAsync(4100)
    expect(await done).toEqual({ id: 7, first_name: 'Аня', username: 'anya' })
    expect(sessionToken()).toBe(TOKEN)
    expect(authHeader()).toBe(`Bearer ${TOKEN}`)
    expect(useAccount.getState().user?.first_name).toBe('Аня')
  })

  it('вход истёк — понятная ошибка; отмена — без ошибки входа', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', async () => json({ status: 'expired' }))
    const expired = waitForLogin('abc', new AbortController().signal).catch((e: Error) => e.message)
    await vi.advanceTimersByTimeAsync(2100)
    expect(await expired).toContain('Время на вход вышло')
    const controller = new AbortController()
    const cancelled = waitForLogin('abc', controller.signal).catch((e: Error) => e.name)
    controller.abort()
    expect(await cancelled).toBe('AbortError')
  })

  it('сайт открыт по ссылке из мини-аппа: вход без кода, ссылка убрана из адреса', async () => {
    const replaced: string[] = []
    vi.stubGlobal('location', { hash: `#login=${'n'.repeat(22)}`, pathname: '/ct-math-blitz/', search: '' })
    vi.stubGlobal('history', { replaceState: (_state: unknown, _title: string, url: string) => replaced.push(url) })
    vi.stubGlobal('fetch', async (url: string) => {
      expect(url).toContain(`/api/auth/poll?nonce=${'n'.repeat(22)}`)
      return json({ status: 'ok', token: TOKEN, user: { id: 9, first_name: 'Петя' } })
    })
    expect(await consumeLoginLink()).toEqual({ id: 9, first_name: 'Петя' })
    expect(replaced).toEqual(['/ct-math-blitz/'])
    expect(sessionToken()).toBe(TOKEN)
    // Без ссылки в адресе — ничего не делаем.
    vi.stubGlobal('location', { hash: '', pathname: '/', search: '' })
    expect(await consumeLoginLink()).toBeNull()
  })

  it('выход: токен забыт, сервер получает запрос на выход', async () => {
    signIn()
    const calls: string[] = []
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      calls.push(`${init?.method} ${url} ${(init?.headers as Record<string, string>)?.Authorization}`)
      return json({ ok: true })
    })
    await logout()
    expect(sessionToken()).toBeNull()
    expect(useAccount.getState().user).toBeNull()
    expect(calls[0]).toBe(`POST /api/auth/logout Bearer ${TOKEN}`)
  })
})

describe('прогресс в аккаунте', () => {
  it('на сервере новее — подтянуть (чат с устройства остаётся); здесь новее — отправить', async () => {
    signIn()
    localProgress(10)
    const remote = { ...emptyState(), profile: { ...emptyState().profile, onboarded: true }, progress: { ...emptyState().progress, xp: 500 } }
    vi.stubGlobal('fetch', async () => json({ state: JSON.stringify(remote), updatedAt: Date.now() + 60_000 }))
    expect(await pullFromServer()).toBe('restored')
    expect(snapshot().progress.xp).toBe(500)

    const posted: { state: string; updatedAt: number }[] = []
    vi.stubGlobal('fetch', async (_url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        posted.push(JSON.parse(String(init.body)))
        return json({ ok: true })
      }
      return json({ state: JSON.stringify(remote), updatedAt: 1 })
    })
    localProgress(700)
    expect(await pullFromServer()).toBe('pushed')
    expect(JSON.parse(posted[0].state).progress.xp).toBe(700)
    // Чат в аккаунт не уходит.
    expect(JSON.parse(posted[0].state).chat.messages).toEqual([])
  })

  it('сразу после входа прогресс аккаунта главнее, даже если гость только что решал задания', async () => {
    signIn()
    localProgress(5)
    const remote = { ...emptyState(), profile: { ...emptyState().profile, onboarded: true }, progress: { ...emptyState().progress, xp: 900 } }
    vi.stubGlobal('fetch', async () => json({ state: JSON.stringify(remote), updatedAt: 1 }))
    expect(await pullFromServer({ preferServer: true })).toBe('restored')
    expect(snapshot().progress.xp).toBe(900)
  })

  it('новое устройство: приветствие не пройдено — прогресс аккаунта главнее, даже если снимок «свежее»', async () => {
    signIn()
    // Мини-апп только открыли: имя из Telegram записано сразу, снимок новее сохранённого.
    const base = emptyState()
    useStore.getState().replaceState({ ...base, profile: { ...base.profile, name: 'Аня' } })
    const remote = { ...base, profile: { ...base.profile, onboarded: true, subjects: ['math'] }, progress: { ...base.progress, xp: 321 } }
    vi.stubGlobal('fetch', async () => json({ state: JSON.stringify(remote), updatedAt: 1 }))
    expect(await pullFromServer()).toBe('restored')
    expect(snapshot().profile.onboarded).toBe(true)
    expect(snapshot().progress.xp).toBe(321)
  })

  it('снимок с другого устройства сохраняет своё время — старая копия не станет «свежей»', async () => {
    signIn()
    const base = emptyState()
    // Новый телефон: мини-апп поднял из облака Telegram копию от времени 5000…
    useStore.getState().restoreState({ ...base, profile: { ...base.profile, onboarded: true }, progress: { ...base.progress, xp: 100 }, updatedAt: 5000 })
    expect(snapshot().updatedAt).toBe(5000)
    // …а в браузере потом занимались ещё (на сервере — время 9000): побеждает сервер.
    const remote = { ...base, profile: { ...base.profile, onboarded: true }, progress: { ...base.progress, xp: 450 } }
    const urls: string[] = []
    vi.stubGlobal('fetch', async (url: string) => {
      urls.push(url)
      return json({ state: JSON.stringify(remote), updatedAt: 9000 })
    })
    expect(await pullFromServer()).toBe('restored')
    expect(snapshot().progress.xp).toBe(450)
    expect(snapshot().updatedAt).toBe(9000)
    expect(urls[0]).toBe('/api/state?since=5000')
  })

  it('частая проверка: «новее нет» — ничего не меняем; на устройстве новее — отправляем', async () => {
    signIn()
    const base = emptyState()
    useStore.getState().restoreState({ ...base, profile: { ...base.profile, onboarded: true }, progress: { ...base.progress, xp: 70 }, updatedAt: 8000 })
    vi.stubGlobal('fetch', async () => json({ state: null, updatedAt: 8000, unchanged: true }))
    expect(await pullFromServer()).toBe('same')
    const posted: number[] = []
    vi.stubGlobal('fetch', async (_url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        posted.push(JSON.parse(String(init.body)).updatedAt)
        return json({ ok: true })
      }
      return json({ state: null, updatedAt: 3000, unchanged: true })
    })
    expect(await pullFromServer()).toBe('pushed')
    expect(posted).toEqual([8000])
  })

  it('гость сайта — без синхронизации; вход истёк — токен забыт', async () => {
    expect(await pullFromServer()).toBe('unavailable')
    signIn()
    vi.stubGlobal('fetch', async () => json({ error: 'Вход истёк' }, 401))
    expect(await pullFromServer()).toBe('unavailable')
    expect(sessionToken()).toBeNull()
  })
})
