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
 * BOT_USERNAME — ожидаемый @username. Для --profile-only он обязателен, APP_URL не нужен.
 */
import { readFile } from 'node:fs/promises'
import { webhookSecret } from './lib.mjs'

const { BOT_TOKEN, APP_URL, BOT_USERNAME } = process.env
const profileOnly = process.argv.includes('--profile-only')
if (!BOT_TOKEN || (profileOnly ? !BOT_USERNAME : !APP_URL)) {
  console.error(profileOnly ? 'Для обновления профиля нужны BOT_TOKEN и BOT_USERNAME' : 'Нужны переменные BOT_TOKEN и APP_URL (WEBHOOK_SECRET — по желанию)')
  process.exit(1)
}
const secret = process.env.WEBHOOK_SECRET || webhookSecret(BOT_TOKEN)
const app = (APP_URL ?? '').replace(/\/+$/, '')
const miniApp = process.env.MINI_APP_URL || `${app}/`
const telegram = process.env.TELEGRAM_API_BASE || 'https://api.telegram.org'

/** Сетевые сбои между GitHub и Telegram бывают разовыми — повторяем до трёх раз. */
async function post(method, body) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fetch(`${telegram}/bot${BOT_TOKEN}/${method}`, {
        method: 'POST',
        ...(body instanceof FormData ? { body } : {
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }),
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

const profile = {
  name: 'Крок · ЦЭ и ЦТ',
  shortDescription: 'Подготовка к ЦЭ и ЦТ в Беларуси. 14 предметов, пробники на время и разбор ошибок.',
  description: 'Готовься к ЦЭ и ЦТ в своём темпе. Выбери предмет, начни с короткой тренировки или пройди пробник на время.\n\nВ Кроке есть блицы по математике и русскому, повторение сложных тем и ИИ-репетитор для разбора ошибок.\n\nНажми «Открыть Крок», чтобы выбрать первую тренировку.',
}

async function updateProfile(botId) {
  const avatar = profileOnly ? await readFile(new URL('../assets/bot-avatar.jpg', import.meta.url)) : null
  for (const language_code of ['', 'ru']) {
    await call('setMyName', { name: profile.name, language_code })
    await call('setMyShortDescription', { short_description: profile.shortDescription, language_code })
    await call('setMyDescription', { description: profile.description, language_code })
  }
  if (!avatar) return

  const body = new FormData()
  body.set('photo', JSON.stringify({ type: 'static', photo: 'attach://avatar' }))
  body.set('avatar', new Blob([avatar], { type: 'image/jpeg' }), 'krok.jpg')
  await call('setMyProfilePhoto', body)

  for (const language_code of ['', 'ru']) {
    const name = await call('getMyName', { language_code })
    const bio = await call('getMyShortDescription', { language_code })
    const intro = await call('getMyDescription', { language_code })
    if (name.name !== profile.name || bio.short_description !== profile.shortDescription || intro.description !== profile.description) {
      throw new Error('Telegram не подтвердил имя или описание профиля')
    }
  }
  const photos = await call('getUserProfilePhotos', { user_id: botId, limit: 1 })
  if (!photos.photos?.[0]?.length) throw new Error('Telegram не подтвердил фото профиля')
}

try {
  const me = await call('getMe')
  console.log(`  бот: @${me.username}`)
  const expected = (BOT_USERNAME ?? '').replace(/^@/, '').toLowerCase()
  if (expected && me.username.toLowerCase() !== expected) {
    if (profileOnly) throw new Error(`Токен принадлежит @${me.username}, ожидался @${expected}`)
    console.log(`::warning title=Другой бот::Токен принадлежит @${me.username}, а в настройках указан @${expected}`)
  }

  if (profileOnly) {
    await updateProfile(me.id)
    console.log('Имя, описания и аватар подтверждены Telegram.')
    process.exit(0)
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
      { command: 'start', description: 'Крок — подготовка к ЦЭ и ЦТ' },
      { command: 'site', description: 'Сайт в браузере с тем же прогрессом' },
      { command: 'remind', description: 'Напоминания: вкл/выкл' },
      { command: 'stats', description: 'Моя серия и повторения' },
      { command: 'suggest', description: 'Ящик предложений' },
      { command: 'help', description: 'Справка' },
    ],
  })
  await updateProfile(me.id)
  console.log(`\nГотово. Откройте бота и нажмите «Открыть Крок». Мини-апп: ${miniApp}, сервер: ${app}`)
} catch (e) {
  console.error(`::error title=Настройка бота::${String(e.message ?? e)}`)
  process.exit(1)
}
