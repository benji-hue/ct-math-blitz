#!/usr/bin/env node
/**
 * Проверка после деплоя: приложение открывается, подпись Telegram принимается,
 * ИИ отвечает, вебхук бота настроен. Итог — в консоли и в сводке GitHub Actions.
 *
 *   APP_URL=https://krok.<you>.workers.dev BOT_TOKEN=… node scripts/smoke.mjs
 *
 * Жёсткие проверки (приложение, подпись, бот) валят запуск, ИИ — только
 * предупреждает: приложение работает и с заготовленными ответами.
 */
import { appendFileSync } from 'node:fs'
import { signInitData, webhookSecret } from './lib.mjs'

const { APP_URL, BOT_TOKEN } = process.env
if (!APP_URL || !BOT_TOKEN) {
  console.error('Нужны переменные APP_URL и BOT_TOKEN')
  process.exit(1)
}
const base = APP_URL.replace(/\/+$/, '')
const telegram = process.env.TELEGRAM_API_BASE || 'https://api.telegram.org'

const rows = []
let failed = false

async function check(name, fn, { soft = false } = {}) {
  let row
  try {
    row = { name, ok: true, detail: await fn() }
  } catch (e) {
    row = { name, ok: false, soft, detail: String(e.message ?? e) }
    if (!soft) failed = true
  }
  rows.push(row)
  console.log(`${row.ok ? '✓' : row.soft ? '!' : '✗'} ${name}: ${row.detail}`)
  if (!row.ok) console.log(`::${row.soft ? 'warning' : 'error'} title=${name}::${row.detail.replaceAll('\n', ' ')}`)
}

/** Новый поддомен workers.dev получает сертификат не сразу (до нескольких минут) — пробуем долго. */
async function retry(fn, attempts, delayMs) {
  let last
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn()
    } catch (e) {
      last = e
      await new Promise((resolve) => setTimeout(resolve, delayMs))
    }
  }
  throw last
}

const initData = signInitData(
  { auth_date: String(Math.floor(Date.now() / 1000)), query_id: 'krok-smoke', user: JSON.stringify({ id: 1, first_name: 'Smoke' }) },
  BOT_TOKEN,
)
let botName = ''

await check('Бот отвечает Telegram', async () => {
  const res = await fetch(`${telegram}/bot${BOT_TOKEN}/getMe`)
  const data = await res.json().catch(() => ({}))
  if (!data.ok) throw new Error(`Telegram отклонил токен: ${data.description ?? res.status}`)
  botName = data.result.username
  return `@${botName}`
})

await check('Воркер запущен', () =>
  retry(
    async () => {
      const res = await fetch(`${base}/api/health`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      return `версия ${data.version}`
    },
    40,
    6000,
  ),
)

await check('Мини-апп открывается', async () => {
  const res = await fetch(`${base}/`)
  const html = await res.text()
  if (!res.ok || !html.includes('Крок')) throw new Error(`HTTP ${res.status}, страница приложения не найдена`)
  return 'страница отдаётся'
})

await check('Подпись Telegram принимается', async () => {
  const res = await fetch(`${base}/api/ai/status`, { headers: { Authorization: `tma ${initData}` } })
  const data = await res.json().catch(() => ({}))
  // При неверной подписи сервер отвечает 200, но без блока limits.
  if (!data.limits) throw new Error('подпись не принята: токен бота на сервере не совпадает с проверяемым')
  const models = (data.providers ?? []).map((p) => `${p.id}/${p.model}`).join(', ')
  return `модели: ${models || 'не настроены'}`
})

await check('Вебхук принимает только Telegram', async () => {
  const send = (secret) =>
    fetch(`${base}/bot/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': secret },
      body: JSON.stringify({ update_id: 0 }),
    })
  const good = await send(webhookSecret(BOT_TOKEN))
  const bad = await send('wrong-secret')
  if (good.status !== 200) throw new Error(`с верным секретом HTTP ${good.status}`)
  if (bad.status !== 403) throw new Error(`с неверным секретом HTTP ${bad.status}, ожидали 403`)
  return 'секрет совпадает'
})

await check(
  'Вебхук зарегистрирован в Telegram',
  async () => {
    const res = await fetch(`${telegram}/bot${BOT_TOKEN}/getWebhookInfo`)
    const { result } = await res.json()
    if (result?.url !== `${base}/bot/webhook`) throw new Error(`вебхук указывает на ${result?.url || 'пустое значение'}`)
    if (result.last_error_message) throw new Error(`Telegram сообщает: ${result.last_error_message}`)
    return result.url
  },
  { soft: true },
)

await check(
  'ИИ отвечает',
  async () => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 75_000)
    try {
      const res = await fetch(`${base}/api/ai/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `tma ${initData}` },
        body: JSON.stringify({ mode: 'tutor', messages: [{ role: 'user', content: 'Сколько будет 12 умножить на 12? Ответь одним числом.' }] }),
        signal: controller.signal,
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.json().catch(() => ({}))).error ?? ''}`)
      let text = ''
      let model = ''
      let buffer = ''
      const decoder = new TextDecoder()
      for await (const chunk of res.body) {
        buffer += decoder.decode(chunk, { stream: true })
        const events = buffer.split('\n\n')
        buffer = events.pop() ?? ''
        for (const raw of events) {
          const line = raw.split('\n').find((l) => l.startsWith('data: '))
          if (!line) continue
          const event = JSON.parse(line.slice(6))
          if (event.type === 'meta') model = `${event.provider}/${event.model}`
          if (event.type === 'delta') text += event.text
          if (event.type === 'error') throw new Error(event.message)
        }
      }
      if (!text.trim()) throw new Error('пустой ответ модели')
      return `${model} → «${text.trim().slice(0, 80)}»`
    } finally {
      clearTimeout(timer)
    }
  },
  { soft: true },
)

const icon = (row) => (row.ok ? '✅' : row.soft ? '⚠️' : '❌')
const summary = [
  '## Крок: проверка после деплоя',
  '',
  `**Мини-апп:** ${base}`,
  botName ? `**Бот:** https://t.me/${botName}` : '',
  '',
  '| Проверка | Итог |',
  '| --- | --- |',
  ...rows.map((row) => `| ${icon(row)} ${row.name} | ${row.detail.replaceAll('|', '\\|')} |`),
  '',
  failed
    ? '**Есть ошибки** — детали выше. Исправьте причину и запустите workflow ещё раз: повторный запуск безопасен.'
    : 'Готово. Откройте бота → `/start` → «Открыть Крок».',
  '',
  '_Необязательно:_ BotFather → ваш бот → Bot Settings → Configure Mini App → укажите адрес мини-аппа — тогда приложение откроется и кнопкой в профиле бота.',
  '',
].join('\n')
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary)

process.exit(failed ? 1 : 0)
