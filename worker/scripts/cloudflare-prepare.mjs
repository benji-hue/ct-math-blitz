#!/usr/bin/env node
/**
 * Шаг деплоя: готовит Cloudflare — находит аккаунт, создаёт базу D1 и поддомен
 * workers.dev, если их ещё нет, и вписывает адрес и ID базы в РАБОЧУЮ копию
 * wrangler.jsonc (в git это не попадает).
 *
 *   CLOUDFLARE_API_TOKEN=… [CLOUDFLARE_ACCOUNT_ID=…] [ALLOW_ANONYMOUS=true]
 *   [ALLOWED_ORIGINS=https://user.github.io] node scripts/cloudflare-prepare.mjs
 *
 * В GitHub Actions ID аккаунта и адрес приложения передаются следующим шагам
 * через GITHUB_ENV (CLOUDFLARE_ACCOUNT_ID, APP_URL).
 */
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs'
import { cloudflare, prepareCloudflare, rewriteWranglerConfig } from './lib.mjs'

/**
 * Если в секретах репозитория есть ключ внешней модели (GEMINI_API_KEY, OPENAI_API_KEY),
 * она идёт первой, а Workers AI остаётся запасной. Без ключей — как в wrangler.jsonc.
 */
function providersFromKeys() {
  const external = ['gemini', 'openai'].filter((id) => process.env[`HAS_${id.toUpperCase()}`] === 'true')
  return external.length ? [...external, 'workers-ai'].join(',') : ''
}

const token = process.env.CLOUDFLARE_API_TOKEN
if (!token) {
  console.error('::error title=Нет секрета CLOUDFLARE_API_TOKEN::Создайте токен в Cloudflare и добавьте его в Settings → Secrets and variables → Actions')
  process.exit(1)
}

try {
  const result = await prepareCloudflare(cloudflare(token), {
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
    log: (message) => console.log(message),
  })

  const configPath = new URL('../wrangler.jsonc', import.meta.url)
  const updated = rewriteWranglerConfig(readFileSync(configPath, 'utf8'), {
    databaseId: result.databaseId,
    appUrl: result.appUrl,
    allowedOrigins: (process.env.ALLOWED_ORIGINS ?? '').trim().toLowerCase(),
    allowAnonymous: process.env.ALLOW_ANONYMOUS === 'true',
    aiProviders: providersFromKeys(),
  })
  writeFileSync(configPath, updated)

  console.log(`Адрес приложения: ${result.appUrl}`)
  if (process.env.GITHUB_ENV) {
    console.log(`::add-mask::${result.accountId}`)
    appendFileSync(process.env.GITHUB_ENV, `CLOUDFLARE_ACCOUNT_ID=${result.accountId}\nAPP_URL=${result.appUrl}\n`)
  }
} catch (e) {
  console.error(`::error title=Cloudflare::${String(e.message ?? e).replaceAll('\n', ' ')}`)
  process.exit(1)
}
