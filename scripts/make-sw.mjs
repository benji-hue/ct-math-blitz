/**
 * Пишет dist/sw.js со списком всех файлов сборки для офлайн-кэша.
 * Запускается после vite build (см. npm run build:pwa).
 *
 * Своя генерация вместо готового плагина: список берётся из реального
 * содержимого dist/, так что он не может разойтись со сборкой.
 */
import { readdir, readFile, writeFile, stat } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import path from 'node:path'

const DIST = 'dist'

async function walk(dir) {
  const out = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...(await walk(full)))
    else out.push(full)
  }
  return out
}

const files = (await walk(DIST))
  .map((f) => '/' + path.relative(DIST, f).split(path.sep).join('/'))
  .filter((f) => f !== '/sw.js')
  .sort()

// Версия кэша — хэш содержимого всех файлов: меняется ровно тогда,
// когда меняется сборка, поэтому старый кэш сбрасывается сам.
const hash = createHash('sha256')
for (const f of files) hash.update(await readFile(path.join(DIST, f.slice(1))))
const version = hash.digest('hex').slice(0, 12)

const total = await files.reduce(
  async (acc, f) => (await acc) + (await stat(path.join(DIST, f.slice(1)))).size,
  Promise.resolve(0),
)

const sw = `// Сгенерировано scripts/make-sw.mjs — правки вручную будут затёрты.
const VERSION = ${JSON.stringify(version)}
const CACHE = 'ct-math-' + VERSION
const ASSETS = ${JSON.stringify(files, null, 2)}

// Пути относительные: приложение живёт в подкаталоге GitHub Pages.
const scoped = (p) => new URL('.' + p, self.registration.scope).toString()

// ignoreVary обязателен: модульные скрипты грузятся в режиме CORS и шлют
// заголовок Origin, а в кэш файлы попали из запросов самого воркера — без него.
// Ответы помечены Vary: Origin, и обычный match на этом промахивался бы.
const fromCache = (request) => caches.match(request, { ignoreVary: true })

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS.map(scoped))),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

// Обновление применяется только по явной команде из приложения,
// чтобы страница не перезагрузилась посреди раунда.
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting()
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  // Навигация: сначала сеть (чтобы увидеть свежий деплой), потом кэш.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone()
          caches.open(CACHE).then((cache) => cache.put(request, copy))
          return response
        })
        .catch(() => fromCache(scoped('/index.html')).then((r) => r || fromCache(request))),
    )
    return
  }

  // Остальное — сначала кэш, при промахе сеть с дозаписью.
  event.respondWith(
    fromCache(request).then((cached) => {
      if (cached) return cached
      return fetch(request)
        .then((response) => {
          if (response.ok && response.type === 'basic') {
            const copy = response.clone()
            caches.open(CACHE).then((cache) => cache.put(request, copy))
          }
          return response
        })
        .catch(
          () =>
            new Response('Офлайн: файла нет в кэше', {
              status: 504,
              headers: { 'Content-Type': 'text/plain; charset=utf-8' },
            }),
        )
    }),
  )
})
`

await writeFile(path.join(DIST, 'sw.js'), sw, 'utf8')
console.log(
  `sw.js готов: ${files.length} файлов, ${(total / 1024 / 1024).toFixed(2)} МБ, версия ${version}`,
)
