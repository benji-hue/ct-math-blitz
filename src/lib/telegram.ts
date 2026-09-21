interface TelegramWebApp {
  ready: () => void
  expand: () => void
  setHeaderColor?: (color: string) => void
  setBackgroundColor?: (color: string) => void
}

interface TelegramGlobal {
  Telegram?: { WebApp?: TelegramWebApp }
  Capacitor?: unknown
}

const SDK_URL = 'https://telegram.org/js/telegram-web-app.js'
const CHROME = '#070b18'

function apply(tg: TelegramWebApp): void {
  tg.ready()
  tg.expand()
  tg.setHeaderColor?.(CHROME)
  tg.setBackgroundColor?.(CHROME)
}

/**
 * Telegram's SDK only exists when the page is opened inside Telegram, so it is
 * fetched lazily and only when that is actually the case. In the native iOS
 * build (Capacitor) there is no Telegram host and possibly no network at all —
 * the app must never depend on a remote script to start.
 */
export function initTelegram(): void {
  const scope = window as unknown as TelegramGlobal

  if ('Capacitor' in scope) return
  if (!location.protocol.startsWith('http')) return

  const existing = scope.Telegram?.WebApp
  if (existing) {
    apply(existing)
    return
  }

  const params = location.search + location.hash
  const insideTelegram = params.includes('tgWebApp') || window.parent !== window
  if (!insideTelegram) return

  const script = document.createElement('script')
  script.src = SDK_URL
  script.async = true
  script.onload = () => {
    const tg = scope.Telegram?.WebApp
    if (tg) apply(tg)
  }
  // Blocked or offline: the app runs perfectly well without the SDK.
  script.onerror = () => {}
  document.head.appendChild(script)
}
