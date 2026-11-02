#!/usr/bin/env node
/**
 * Пишет JSON с секретами воркера для `wrangler deploy --secrets-file`.
 * Файл кладётся во временную папку раннера и удаляется workflow сразу после деплоя.
 *
 *   BOT_TOKEN=… node scripts/write-secrets.mjs <файл>
 */
import { writeFileSync } from 'node:fs'
import { webhookSecret } from './lib.mjs'

const [target] = process.argv.slice(2)
const botToken = process.env.BOT_TOKEN
if (!target || !botToken) {
  console.error('Использование: BOT_TOKEN=… node scripts/write-secrets.mjs <файл>')
  process.exit(1)
}

const secrets = { BOT_TOKEN: botToken, WEBHOOK_SECRET: webhookSecret(botToken) }
// Ключи внешних моделей — только если заданы в секретах репозитория.
for (const name of ['GEMINI_API_KEY', 'OPENAI_API_KEY']) if (process.env[name]) secrets[name] = process.env[name]
writeFileSync(target, JSON.stringify(secrets), { mode: 0o600 })
console.log(`Секреты воркера подготовлены (${Object.keys(secrets).join(', ')})`)
