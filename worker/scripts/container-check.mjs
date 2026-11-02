#!/usr/bin/env node
/**
 * Проверка собранного Docker-образа до выкладки на сервер: контейнер запускается с
 * заглушкой ИИ, а скрипт проходит по главному — приложение, переходы внутри него,
 * файлы сборки, API и потоковый ответ ИИ.
 *
 *   node scripts/container-check.mjs http://127.0.0.1:8080
 */
const base = (process.argv[2] ?? 'http://127.0.0.1:8080').replace(/\/+$/, '')
let failed = false

async function check(name, fn) {
  try {
    console.log(`✓ ${name}: ${await fn()}`)
  } catch (e) {
    failed = true
    console.log(`✗ ${name}: ${e.message ?? e}`)
  }
}

const deadline = Date.now() + 60_000
for (;;) {
  try {
    if ((await fetch(`${base}/api/health`)).ok) break
  } catch {
    // контейнер ещё запускается
  }
  if (Date.now() > deadline) {
    console.log('✗ Сервер не ответил за 60 с')
    process.exit(1)
  }
  await new Promise((resolve) => setTimeout(resolve, 1000))
}

let html = ''
await check('Приложение', async () => {
  const res = await fetch(`${base}/`)
  html = await res.text()
  if (!res.ok || !html.includes('Крок')) throw new Error(`HTTP ${res.status}`)
  return 'index.html отдаётся'
})

await check('Переход внутри приложения', async () => {
  const res = await fetch(`${base}/practice/math`, { headers: { Accept: 'text/html' } })
  if (!res.ok || !(await res.text()).includes('Крок')) throw new Error(`HTTP ${res.status}`)
  return 'index.html вместо 404'
})

await check('Файлы сборки', async () => {
  // Vite собирает с base: './' — пути в index.html относительные (./assets/…).
  const script = /src="\.?(\/assets\/[^"]+\.js)"/.exec(html)?.[1]
  if (!script) throw new Error('в index.html нет скрипта /assets/…')
  const res = await fetch(`${base}${script}`)
  if (!res.ok) throw new Error(`${script}: HTTP ${res.status}`)
  if (!/immutable/.test(res.headers.get('Cache-Control') ?? '')) throw new Error('нет долгого кеша')
  const missing = await fetch(`${base}/assets/missing-file.js`)
  if (missing.status !== 404) throw new Error(`несуществующий файл: HTTP ${missing.status}`)
  return `${script} с кешем, лишние файлы — 404`
})

await check('API', async () => {
  const res = await fetch(`${base}/api/health`)
  const data = await res.json()
  return `версия ${data.version}`
})

await check('Ответ ИИ потоком', async () => {
  const res = await fetch(`${base}/api/ai/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode: 'tutor', messages: [{ role: 'user', content: 'Привет!' }] }),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`)
  if (!(res.headers.get('Content-Type') ?? '').includes('text/event-stream')) throw new Error('ответ не потоковый')
  const text = await res.text()
  const events = text.split('\n\n').filter((chunk) => chunk.startsWith('data: ')).map((chunk) => JSON.parse(chunk.slice(6)))
  const types = new Set(events.map((event) => event.type))
  if (!types.has('meta') || !types.has('delta') || !types.has('done')) throw new Error(`события: ${[...types].join(', ')}`)
  return `${events.length} событий, модель ${events.find((event) => event.type === 'meta').model}`
})

await check('Слишком большой запрос', async () => {
  const res = await fetch(`${base}/api/ai/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: 'x'.repeat(5_000_000) })
  if (res.status !== 413) throw new Error(`HTTP ${res.status}, ожидали 413`)
  return '413'
})

process.exit(failed ? 1 : 0)
