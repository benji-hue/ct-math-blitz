#!/usr/bin/env node
/**
 * Шаг деплоя на свой сервер (deploy-server.yml): собирает файл .env для deploy/compose.yml
 * и пишет его в stdout — в workflow он сразу уходит по SSH на сервер и в лог не попадает.
 * Сообщения — в stderr.
 *
 *   KROK_DOMAIN=… KROK_IMAGE=… BOT_TOKEN=… [GEMINI_API_KEY=…] [CLOUDFLARE_AI_TOKEN=…]
 *   [CLOUDFLARE_ACCOUNT_ID=… | CLOUDFLARE_API_TOKEN=…] node scripts/server-env.mjs > .env
 */
import { cloudflare, findAccountId, providerOrder, serverEnvFile } from './lib.mjs'

const e = process.env
const fail = (title, message) => {
  console.error(`::error title=${title}::${message}`)
  process.exit(1)
}

const domain = (e.KROK_DOMAIN ?? '').trim().toLowerCase()
if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain)) fail('Нет домена', 'Задайте переменную репозитория KROK_DOMAIN — домен, направленный на сервер (например, krok.example.by)')
if (!e.BOT_TOKEN) fail('Нет секрета BOT_TOKEN', 'Добавьте BOT_TOKEN в секреты репозитория')
if (!e.KROK_IMAGE) fail('Нет образа', 'Не задан KROK_IMAGE')

// Qwen через Workers AI: нужен ID аккаунта Cloudflare — явный или найденный по токену.
let accountId = ''
if (e.CLOUDFLARE_AI_TOKEN) {
  for (const token of [e.CLOUDFLARE_API_TOKEN, e.CLOUDFLARE_AI_TOKEN].filter(Boolean)) {
    try {
      accountId = await findAccountId(cloudflare(token), e.CLOUDFLARE_ACCOUNT_ID)
      break
    } catch {
      // пробуем следующий токен
    }
  }
  if (!accountId) console.error('::warning title=Qwen не подключена::Не удалось определить аккаунт Cloudflare — задайте секрет CLOUDFLARE_ACCOUNT_ID')
}
const hasQwen = Boolean(e.CLOUDFLARE_AI_TOKEN && accountId)
const order = providerOrder({
  hasGemini: Boolean(e.GEMINI_API_KEY),
  hasOpenai: Boolean(e.OPENAI_API_KEY),
  text: (e.AI_PROVIDERS ?? '').trim(),
  vision: (e.AI_VISION_PROVIDERS ?? '').trim(),
})
const models = [e.GEMINI_API_KEY && 'Gemini', hasQwen && 'Qwen (Workers AI)', e.OPENAI_API_KEY && 'OpenAI-совместимый API'].filter(Boolean)
if (!models.length) console.error('::warning title=ИИ не настроен::Нет ни GEMINI_API_KEY, ни CLOUDFLARE_AI_TOKEN — ИИ отвечать не будет')
console.error(`Адрес: https://${domain}. Модели: ${models.join(' → ') || 'нет'}.`)

process.stdout.write(
  serverEnvFile({
    KROK_DOMAIN: domain,
    KROK_IMAGE: e.KROK_IMAGE,
    BOT_TOKEN: e.BOT_TOKEN,
    GEMINI_API_KEY: e.GEMINI_API_KEY,
    OPENAI_API_KEY: e.OPENAI_API_KEY,
    CLOUDFLARE_ACCOUNT_ID: hasQwen ? accountId : '',
    CLOUDFLARE_AI_TOKEN: hasQwen ? e.CLOUDFLARE_AI_TOKEN : '',
    MINI_APP_URL: `https://${domain}`,
    ALLOWED_ORIGINS: (e.ALLOWED_ORIGINS ?? '').trim().toLowerCase(),
    ALLOW_ANONYMOUS: e.ALLOW_ANONYMOUS === 'true' ? 'true' : 'false',
    AI_PROVIDERS: order.text,
    AI_VISION_PROVIDERS: order.vision,
  }),
)
