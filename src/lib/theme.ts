import { useEffect } from 'react'
import { useStore } from './store'
import { colorScheme, initialTelegramScheme, onThemeChanged, performanceClass, setChromeColor } from './telegram'

const CANVAS = { dark: '#05060b', light: '#f2f3f8' }

function systemScheme(): 'light' | 'dark' {
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

export function resolveScheme(setting: 'auto' | 'light' | 'dark'): 'light' | 'dark' {
  if (setting !== 'auto') return setting
  return colorScheme() ?? initialTelegramScheme() ?? systemScheme()
}

/**
 * Лёгкий режим: без размытия фона, «авроры» и анимаций движения. Размытие и анимации
 * тормозят не только слабые, но и средние Android: Telegram сам относит большинство
 * недорогих телефонов к классу AVERAGE.
 */
export function isLite(setting: 'auto' | 'on' | 'off'): boolean {
  if (setting !== 'auto') return setting === 'on'
  const perf = performanceClass()
  return perf === 'low' || perf === 'average'
}

export function applyTheme(): void {
  const { theme, lite } = useStore.getState().settings
  const scheme = resolveScheme(theme)
  const root = document.documentElement
  root.dataset.theme = scheme
  root.dataset.lite = String(isLite(lite))
  setChromeColor(CANVAS[scheme])
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', CANVAS[scheme])
}

/** Следит за темой Telegram, системы и настройками пользователя. */
export function useThemeSync(): void {
  const theme = useStore((s) => s.settings.theme)
  const lite = useStore((s) => s.settings.lite)
  useEffect(() => {
    applyTheme()
    const media = window.matchMedia?.('(prefers-color-scheme: light)')
    media?.addEventListener('change', applyTheme)
    const off = onThemeChanged(applyTheme)
    return () => {
      media?.removeEventListener('change', applyTheme)
      off()
    }
  }, [theme, lite])
}
