/**
 * Тонкая обёртка над Telegram Mini Apps API (telegram-web-app.js).
 *
 * Принципы:
 *  - приложение стартует мгновенно и без SDK: SDK грузится лениво и только
 *    если страница действительно открыта внутри Telegram;
 *  - тема определяется ещё до первого кадра — по параметрам из URL-хэша,
 *    которые Telegram передаёт при запуске (никакой вспышки белого);
 *  - каждый вызов проверяет версию API: старые клиенты не падают.
 */

type Haptic = 'light' | 'medium' | 'heavy' | 'rigid' | 'soft'
type Notice = 'success' | 'error' | 'warning'

interface Insets {
  top: number
  bottom: number
  left: number
  right: number
}

export interface TgUser {
  id: number
  first_name: string
  last_name?: string
  username?: string
  language_code?: string
  photo_url?: string
  is_premium?: boolean
}

interface TgButton {
  show: () => void
  hide: () => void
  onClick: (cb: () => void) => void
  offClick: (cb: () => void) => void
  isVisible?: boolean
}

interface TgCloudStorage {
  setItem: (key: string, value: string, cb?: (err: unknown, ok?: boolean) => void) => void
  getItem: (key: string, cb: (err: unknown, value?: string) => void) => void
  getItems: (keys: string[], cb: (err: unknown, values?: Record<string, string>) => void) => void
  removeItems: (keys: string[], cb?: (err: unknown, ok?: boolean) => void) => void
  getKeys: (cb: (err: unknown, keys?: string[]) => void) => void
}

interface TgWebApp {
  initData: string
  initDataUnsafe: { user?: TgUser; start_param?: string }
  version: string
  platform: string
  colorScheme: 'light' | 'dark'
  themeParams: Record<string, string>
  isFullscreen?: boolean
  safeAreaInset?: Insets
  contentSafeAreaInset?: Insets
  isVersionAtLeast: (v: string) => boolean
  ready: () => void
  expand: () => void
  close: () => void
  requestFullscreen?: () => void
  exitFullscreen?: () => void
  disableVerticalSwipes?: () => void
  enableClosingConfirmation?: () => void
  disableClosingConfirmation?: () => void
  setHeaderColor?: (color: string) => void
  setBackgroundColor?: (color: string) => void
  setBottomBarColor?: (color: string) => void
  openLink?: (url: string, options?: { try_instant_view?: boolean }) => void
  openTelegramLink?: (url: string) => void
  showConfirm?: (message: string, cb: (ok: boolean) => void) => void
  requestWriteAccess?: (cb?: (granted: boolean) => void) => void
  addToHomeScreen?: () => void
  onEvent: (event: string, cb: () => void) => void
  offEvent: (event: string, cb: () => void) => void
  BackButton?: TgButton
  HapticFeedback?: {
    impactOccurred: (style: Haptic) => void
    notificationOccurred: (type: Notice) => void
    selectionChanged: () => void
  }
  CloudStorage?: TgCloudStorage
}

interface TelegramGlobal {
  Telegram?: { WebApp?: TgWebApp }
}

const SDK_URL = 'https://telegram.org/js/telegram-web-app.js'

let webApp: TgWebApp | null = null
const readyListeners = new Set<(tg: TgWebApp) => void>()

/** Параметры запуска, которые Telegram кладёт в хэш адреса. */
function launchParams(): URLSearchParams {
  const raw = location.hash.slice(1) || location.search.slice(1)
  try {
    return new URLSearchParams(raw)
  } catch {
    return new URLSearchParams()
  }
}

export function isInsideTelegram(): boolean {
  if (typeof window === 'undefined') return false
  if ((window as unknown as TelegramGlobal).Telegram?.WebApp?.initData) return true
  const params = launchParams()
  return params.has('tgWebAppData') || params.has('tgWebAppPlatform')
}

function luminance(hex: string): number {
  const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex.trim())
  if (!m) return 1
  const [r, g, b] = [m[1], m[2], m[3]].map((h) => parseInt(h, 16) / 255)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/**
 * Тема Telegram без ожидания SDK: из tgWebAppThemeParams в хэше.
 * Возвращает null, если открыто вне Telegram.
 */
export function initialTelegramScheme(): 'light' | 'dark' | null {
  const raw = launchParams().get('tgWebAppThemeParams')
  if (!raw) return null
  try {
    const theme = JSON.parse(raw) as Record<string, string>
    const bg = theme.bg_color ?? theme.secondary_bg_color
    return bg ? (luminance(bg) < 0.5 ? 'dark' : 'light') : null
  } catch {
    return null
  }
}

/** Класс производительности устройства: Telegram для Android пишет его в User-Agent. */
export function performanceClass(): 'low' | 'average' | 'high' | 'unknown' {
  const ua = navigator.userAgent
  const m = /Telegram-Android\/[^\s]+ \([^)]*;\s*(LOW|AVERAGE|HIGH)\)/i.exec(ua)
  if (m) return m[1].toLowerCase() as 'low' | 'average' | 'high'
  const nav = navigator as Navigator & { deviceMemory?: number }
  if ((nav.deviceMemory ?? 8) <= 2 || (navigator.hardwareConcurrency ?? 8) <= 2) return 'low'
  return 'unknown'
}

export function tg(): TgWebApp | null {
  return webApp
}

export function onTelegramReady(cb: (tg: TgWebApp) => void): () => void {
  if (webApp) cb(webApp)
  else readyListeners.add(cb)
  return () => readyListeners.delete(cb)
}

function atLeast(version: string): boolean {
  try {
    return Boolean(webApp?.isVersionAtLeast(version))
  } catch {
    return false
  }
}

// ---------- Безопасные зоны ----------

function applyInsets(): void {
  if (!webApp) return
  const root = document.documentElement
  const safe = webApp.safeAreaInset
  const content = webApp.contentSafeAreaInset
  if (webApp.isFullscreen && safe && content) {
    root.style.setProperty('--app-top', `${safe.top + content.top}px`)
    root.style.setProperty('--app-bottom', `${safe.bottom + content.bottom}px`)
  } else {
    root.style.setProperty('--app-top', `${safe?.top ?? 0}px`)
    root.style.setProperty('--app-bottom', `${safe?.bottom ?? 0}px`)
  }
}

// ---------- Цвета шапки ----------

let chromeColor = '#05060b'

export function setChromeColor(color: string): void {
  chromeColor = color
  if (!webApp) return
  try {
    if (atLeast('6.1')) {
      webApp.setHeaderColor?.(color)
      webApp.setBackgroundColor?.(color)
    }
    if (atLeast('7.10')) webApp.setBottomBarColor?.(color)
  } catch {
    // старый клиент — оставляем цвета Telegram
  }
}

// ---------- Инициализация ----------

function setup(app: TgWebApp): void {
  webApp = app
  try {
    app.ready()
    app.expand()
    // Свайп вниз не должен сворачивать приложение посреди прокрутки.
    if (atLeast('7.7')) app.disableVerticalSwipes?.()
    // Полноэкранный режим — только на телефонах: на десктопе он мешает.
    const mobile = app.platform === 'ios' || app.platform === 'android'
    if (mobile && atLeast('8.0') && !app.isFullscreen) app.requestFullscreen?.()
  } catch {
    // ignore
  }
  setChromeColor(chromeColor)
  applyInsets()
  for (const event of ['safeAreaChanged', 'contentSafeAreaChanged', 'fullscreenChanged', 'viewportChanged']) {
    app.onEvent(event, applyInsets)
  }
  document.documentElement.dataset.telegram = app.platform
  for (const cb of readyListeners) cb(app)
  readyListeners.clear()
}

export function initTelegram(): void {
  if (typeof window === 'undefined') return
  if ('Capacitor' in window) return
  if (!location.protocol.startsWith('http')) return

  const scope = window as unknown as TelegramGlobal
  if (scope.Telegram?.WebApp?.initData) {
    setup(scope.Telegram.WebApp)
    return
  }
  if (!isInsideTelegram()) return

  const script = document.createElement('script')
  script.src = SDK_URL
  script.async = true
  script.onload = () => {
    const app = scope.Telegram?.WebApp
    if (app) setup(app)
  }
  script.onerror = () => {}
  document.head.appendChild(script)
}

// ---------- Данные пользователя ----------

export function telegramUser(): TgUser | null {
  return webApp?.initDataUnsafe?.user ?? null
}

export function initData(): string {
  return webApp?.initData ?? ''
}

export function colorScheme(): 'light' | 'dark' | null {
  return webApp?.colorScheme ?? null
}

export function onThemeChanged(cb: () => void): () => void {
  let off = () => {}
  const unsub = onTelegramReady((app) => {
    app.onEvent('themeChanged', cb)
    off = () => app.offEvent('themeChanged', cb)
  })
  return () => {
    unsub()
    off()
  }
}

// ---------- Тактильный отклик ----------

export const haptic = {
  impact(style: Haptic = 'light') {
    try {
      if (webApp?.HapticFeedback && atLeast('6.1')) webApp.HapticFeedback.impactOccurred(style)
      else navigator.vibrate?.(style === 'heavy' ? 18 : 8)
    } catch {
      // ignore
    }
  },
  notify(type: Notice) {
    try {
      if (webApp?.HapticFeedback && atLeast('6.1')) webApp.HapticFeedback.notificationOccurred(type)
      else navigator.vibrate?.(type === 'error' ? [12, 60, 12] : 14)
    } catch {
      // ignore
    }
  },
  select() {
    try {
      if (webApp?.HapticFeedback && atLeast('6.1')) webApp.HapticFeedback.selectionChanged()
    } catch {
      // ignore
    }
  },
}

// ---------- Кнопка «Назад» ----------

let backHandler: (() => void) | null = null
const onBack = () => backHandler?.()

export function setBackButton(handler: (() => void) | null): void {
  backHandler = handler
  const button = webApp?.BackButton
  if (!button || !atLeast('6.1')) return
  button.offClick(onBack)
  if (handler) {
    button.onClick(onBack)
    button.show()
  } else {
    button.hide()
  }
}

export function hasNativeBackButton(): boolean {
  return Boolean(webApp?.BackButton) && atLeast('6.1')
}

// ---------- Подтверждение закрытия (идёт тест) ----------

export function setClosingConfirmation(on: boolean): void {
  try {
    if (!atLeast('6.2')) return
    if (on) webApp?.enableClosingConfirmation?.()
    else webApp?.disableClosingConfirmation?.()
  } catch {
    // ignore
  }
}

// ---------- Ссылки ----------

export function openExternal(url: string): void {
  if (webApp?.openLink) {
    webApp.openLink(url)
    return
  }
  window.open(url, '_blank', 'noopener,noreferrer')
}

export function openTelegram(url: string): void {
  if (webApp?.openTelegramLink) {
    webApp.openTelegramLink(url)
    return
  }
  window.open(url, '_blank', 'noopener,noreferrer')
}

export function requestWriteAccess(): Promise<boolean> {
  return new Promise((resolve) => {
    if (!webApp?.requestWriteAccess || !atLeast('6.9')) {
      resolve(false)
      return
    }
    webApp.requestWriteAccess((granted) => resolve(Boolean(granted)))
  })
}

export function canAddToHomeScreen(): boolean {
  return Boolean(webApp?.addToHomeScreen) && atLeast('8.0')
}

export function addToHomeScreen(): void {
  if (canAddToHomeScreen()) webApp?.addToHomeScreen?.()
}

// ---------- CloudStorage: синхронизация между устройствами ----------

export const cloud = {
  available(): boolean {
    return Boolean(webApp?.CloudStorage) && atLeast('6.9')
  },
  get(keys: string[]): Promise<Record<string, string>> {
    return new Promise((resolve, reject) => {
      const storage = webApp?.CloudStorage
      if (!storage) return reject(new Error('CloudStorage недоступен'))
      storage.getItems(keys, (err, values) => (err ? reject(err) : resolve(values ?? {})))
    })
  },
  set(key: string, value: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const storage = webApp?.CloudStorage
      if (!storage) return reject(new Error('CloudStorage недоступен'))
      storage.setItem(key, value, (err) => (err ? reject(err) : resolve()))
    })
  },
  remove(keys: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      const storage = webApp?.CloudStorage
      if (!storage) return reject(new Error('CloudStorage недоступен'))
      storage.removeItems(keys, (err) => (err ? reject(err) : resolve()))
    })
  },
}
