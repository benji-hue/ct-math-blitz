#!/usr/bin/env node
/**
 * Одноразовая настройка бота после деплоя воркера.
 *
 *   BOT_TOKEN=… WEBHOOK_SECRET=… APP_URL=https://krok.<you>.workers.dev npm run bot:setup
 *
 * Делает четыре вещи: ставит вебхук (с секретом), кнопку меню «Открыть Крок»,
 * список команд и описание бота. Повторный запуск безопасен.
 */
const { BOT_TOKEN, WEBHOOK_SECRET, APP_URL } = process.env
if (!BOT_TOKEN || !WEBHOOK_SECRET || !APP_URL) {
  console.error('Нужны переменные BOT_TOKEN, WEBHOOK_SECRET и APP_URL')
  process.exit(1)
}
const app = APP_URL.replace(/\/+$/, '')

async function call(method, body) {
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json()
  if (!data.ok) throw new Error(`${method}: ${data.description}`)
  console.log(`✓ ${method}`)
  return data.result
}

await call('setWebhook', {
  url: `${app}/bot/webhook`,
  secret_token: WEBHOOK_SECRET,
  allowed_updates: ['message'],
  drop_pending_updates: true,
})
await call('setChatMenuButton', { menu_button: { type: 'web_app', text: 'Открыть Крок', web_app: { url: app } } })
await call('setMyCommands', {
  commands: [
    { command: 'start', description: 'Открыть приложение' },
    { command: 'remind', description: 'Напоминания: вкл/выкл' },
    { command: 'stats', description: 'Моя серия и повторения' },
    { command: 'help', description: 'Справка' },
  ],
})
await call('setMyShortDescription', { short_description: 'ИИ-репетитор для ЦЭ и ЦТ: 14 предметов, разбор ошибок, повторение по науке.' })
await call('setMyDescription', {
  description:
    'Крок — подготовка к ЦЭ и ЦТ в Беларуси.\n\n• задания в формате РИКЗ по 14 предметам\n• ИИ-репетитор: объясняет, разбирает ошибки, проверяет решения по фото\n• интервальное повторение FSRS и прогноз балла\n• календарь РТ, ЦЭ и ЦТ, антистресс',
})
console.log(`\nГотово. Откройте бота и нажмите «Открыть Крок». Мини-апп: ${app}`)
