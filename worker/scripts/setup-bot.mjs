#!/usr/bin/env node
/**
 * Настройка бота после деплоя воркера (в GitHub Actions запускается автоматически).
 *
 *   BOT_TOKEN=… APP_URL=https://krok.<you>.workers.dev [MINI_APP_URL=…] [WEBHOOK_SECRET=…] [BOT_USERNAME=…] npm run bot:setup
 *
 * APP_URL — сервер (вебхук бота), MINI_APP_URL — где открывается мини-апп (например GitHub Pages);
 * без MINI_APP_URL мини-апп открывается с того же сервера.
 *
 * Делает четыре вещи: ставит вебхук (с секретом), кнопку меню «Открыть Крок»,
 * список команд и описание бота. Повторный запуск безопасен.
 *
 * WEBHOOK_SECRET по желанию: если не задан, он выводится из токена бота — так же,
 * как при деплое через GitHub Actions (scripts/write-secrets.mjs).
 * BOT_USERNAME — ожидаемое имя бота: если токен от другого бота, будет предупреждение.
 */
import { webhookSecret } from './lib.mjs'

const { BOT_TOKEN, APP_URL, BOT_USERNAME } = process.env
if (!BOT_TOKEN || !APP_URL) {
  console.error('Нужны переменные BOT_TOKEN и APP_URL (WEBHOOK_SECRET — по желанию)')
  process.exit(1)
}
const secret = process.env.WEBHOOK_SECRET || webhookSecret(BOT_TOKEN)
const app = APP_URL.replace(/\/+$/, '')
const miniApp = process.env.MINI_APP_URL || `${app}/`
const telegram = process.env.TELEGRAM_API_BASE || 'https://api.telegram.org'

/** Сетевые сбои между GitHub и Telegram бывают разовыми — повторяем до трёх раз. */
async function post(method, body) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fetch(`${telegram}/bot${BOT_TOKEN}/${method}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
    } catch (e) {
      if (attempt >= 3) throw new Error(`${method}: ${e.message} (после ${attempt} попыток)`)
      await new Promise((resolve) => setTimeout(resolve, 2000 * attempt))
    }
  }
}

/**
 * Telegram сам обращается к нашему серверу (проверяет адрес вебхука), и бесплатный DNS
 * (DuckDNS) иногда на минуту не отвечает: «Failed to resolve host». Это не ошибка
 * настройки — пробуем ещё, до четырёх раз с паузой.
 */
const TRANSIENT = /Failed to resolve host|Temporary failure|timed out|Connection refused|Too Many Requests|retry after/i

async function call(method, body = {}) {
  for (let attempt = 1; ; attempt++) {
    const res = await post(method, body)
    const data = await res.json().catch(() => ({}))
    if (data.ok) {
      console.log(`✓ ${method}`)
      return data.result
    }
    const reason = data.description ?? `HTTP ${res.status}`
    if (attempt >= 4 || !TRANSIENT.test(reason)) throw new Error(`${method}: ${reason}`)
    const wait = (data.parameters?.retry_after ?? 10 * attempt) * 1000
    console.log(`… ${method}: ${reason} — повтор через ${Math.round(wait / 1000)} с`)
    await new Promise((resolve) => setTimeout(resolve, wait))
  }
}

try {
  const me = await call('getMe')
  console.log(`  бот: @${me.username}`)
  const expected = (BOT_USERNAME ?? '').replace(/^@/, '').toLowerCase()
  if (expected && me.username.toLowerCase() !== expected) {
    console.log(`::warning title=Другой бот::Токен принадлежит @${me.username}, а в настройках указан @${expected}`)
  }

  await call('setWebhook', {
    url: `${app}/bot/webhook`,
    secret_token: secret,
    // callback_query — кнопка «Подтвердить вход» на сайт.
    allowed_updates: ['message', 'callback_query'],
    // Адрес вебхука от деплоя к деплою тот же — сообщения, пришедшие во время выкладки, не выбрасываем.
    drop_pending_updates: false,
  })
  await call('setChatMenuButton', { menu_button: { type: 'web_app', text: 'Открыть Крок', web_app: { url: miniApp } } })
  await call('setMyCommands', {
    commands: [
      { command: 'start', description: 'Открыть приложение' },
      { command: 'site', description: 'Сайт в браузере с тем же прогрессом' },
      { command: 'remind', description: 'Напоминания: вкл/выкл' },
      { command: 'stats', description: 'Моя серия и повторения' },
      { command: 'help', description: 'Справка' },
    ],
  })
  await call('setMyShortDescription', { short_description: 'Подготовка выпускников к ЦЭ и ЦТ: задания РИКЗ по 14 предметам и ИИ-репетитор.' })
  await call('setMyDescription', {
    description:
      'Крок — подготовка выпускников к ЦЭ и ЦТ в Беларуси: 11 класс и абитуриенты прошлых лет.\n\n• задания в формате РИКЗ по 14 предметам, пробники на время\n• ИИ-репетитор: объясняет темы в формате ЦТ, разбирает ошибки, проверяет решения по фото\n• интервальное повторение FSRS и прогноз балла\n• календарь РТ, ЦЭ и ЦТ, антистресс',
  })
  console.log(`\nГотово. Откройте бота и нажмите «Открыть Крок». Мини-апп: ${miniApp}, сервер: ${app}`)
} catch (e) {
  console.error(`::error title=Настройка бота::${String(e.message ?? e)}`)
  process.exit(1)
}
