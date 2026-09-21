type Listener = () => void

const listeners = new Set<Listener>()
let waiting: ServiceWorker | null = null

/** Подписка на «обновление скачано и ждёт применения». */
export function onUpdateReady(fn: Listener): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

function notify(worker: ServiceWorker): void {
  waiting = worker
  for (const fn of listeners) fn()
}

/** Применить обновление: ждущий воркер активируется, страница перезагрузится сама. */
export function applyUpdate(): void {
  waiting?.postMessage('SKIP_WAITING')
}

/**
 * Регистрирует service worker для офлайн-режима.
 *
 * Не трогает нативную сборку: внутри Capacitor файлы и так локальные,
 * а лишний кэш там только мешал бы. В dev тоже выключен, иначе Vite HMR
 * начинает отдавать закэшированные модули.
 */
export function registerServiceWorker(): void {
  if (import.meta.env.DEV) return
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
  if ('Capacitor' in window) return
  if (!location.protocol.startsWith('http')) return

  // Первая установка тоже вызывает controllerchange (из-за clients.claim),
  // но перезагружать страницу нужно только при настоящем обновлении.
  const hadController = Boolean(navigator.serviceWorker.controller)
  let reloading = false

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return
    reloading = true
    location.reload()
  })

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('./sw.js')
      .then((registration) => {
        if (registration.waiting && hadController) notify(registration.waiting)

        registration.addEventListener('updatefound', () => {
          const installing = registration.installing
          if (!installing) return
          installing.addEventListener('statechange', () => {
            if (installing.state === 'installed' && navigator.serviceWorker.controller) {
              notify(installing)
            }
          })
        })
      })
      .catch(() => {
        // Офлайн-режим просто не включится — приложение работает как обычный сайт.
      })
  })
}
