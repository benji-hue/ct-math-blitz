import { useEffect } from 'react'
import { useStore, type Skin } from './store'
import { colorScheme, initialTelegramScheme, onThemeChanged, performanceClass, setChromeColor } from './telegram'

/** Что ставится на <html>: data-skin и data-theme (светлая/тёмная — для стилей и цвета шапки Telegram). */
export interface ResolvedSkin {
  skin: 'air' | 'graphite' | 'blocks'
  scheme: 'light' | 'dark'
  /** Цвет фона — для шапки Telegram и meta theme-color. */
  canvas: string
}

export const SKINS: { id: Exclude<Skin, 'auto'>; title: string; hint: string; resolved: ResolvedSkin; preview: { surface: string; fg: string; accent: string; radius: number } }[] = [
  { id: 'air', title: 'Воздух', hint: 'светлая', resolved: { skin: 'air', scheme: 'light', canvas: '#f4f5f7' }, preview: { surface: '#ffffff', fg: '#0d0f12', accent: '#2f7cf6', radius: 8 } },
  { id: 'air-dark', title: 'Воздух', hint: 'тёмная', resolved: { skin: 'air', scheme: 'dark', canvas: '#0f1012' }, preview: { surface: '#1a1b1f', fg: '#f1f2f4', accent: '#4b8eff', radius: 8 } },
  { id: 'graphite', title: 'Графит', hint: 'тёмная, строгая', resolved: { skin: 'graphite', scheme: 'dark', canvas: '#0e0e10' }, preview: { surface: '#1e1e22', fg: '#f3f3f4', accent: '#f3f3f4', radius: 4 } },
  { id: 'blocks', title: 'Блоки', hint: 'светлая, яркая', resolved: { skin: 'blocks', scheme: 'light', canvas: '#ffffff' }, preview: { surface: '#ffd84a', fg: '#101010', accent: '#101010', radius: 999 } },
]

function systemScheme(): 'light' | 'dark' {
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

/** auto — «Воздух» в теме Telegram (или системы); остальное — как выбрал ученик. */
export function resolveSkin(setting: Skin): ResolvedSkin {
  const id = setting === 'auto' ? ((colorScheme() ?? initialTelegramScheme() ?? systemScheme()) === 'light' ? 'air' : 'air-dark') : setting
  return (SKINS.find((s) => s.id === id) ?? SKINS[0]).resolved
}

/**
 * Лёгкий режим: без анимаций движения. Telegram относит большинство недорогих Android
 * к классу AVERAGE — на них анимации заметно тормозят.
 */
export function isLite(setting: 'auto' | 'on' | 'off'): boolean {
  if (setting !== 'auto') return setting === 'on'
  const perf = performanceClass()
  return perf === 'low' || perf === 'average'
}

export function applyTheme(): void {
  const { skin, lite } = useStore.getState().settings
  const resolved = resolveSkin(skin)
  const root = document.documentElement
  root.dataset.skin = resolved.skin
  root.dataset.theme = resolved.scheme
  root.dataset.lite = String(isLite(lite))
  setChromeColor(resolved.canvas)
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolved.canvas)
}

/** Следит за темой Telegram, системы и настройками пользователя. */
export function useThemeSync(): void {
  const skin = useStore((s) => s.settings.skin)
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
  }, [skin, lite])
}
