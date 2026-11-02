/**
 * «Крок» на своём сервере: тот же воркер (src/index.ts), но в обычном Node.js.
 * Раздаёт мини-апп, обслуживает API с ИИ, принимает вебхук бота и раз в час
 * рассылает напоминания. Собирается в один файл (npm run build:server) и
 * запускается в Docker за Caddy, который даёт HTTPS (Dockerfile, deploy/).
 *
 * Переменные окружения: BOT_TOKEN, GEMINI_API_KEY, CLOUDFLARE_ACCOUNT_ID и
 * CLOUDFLARE_AI_TOKEN (Qwen через Workers AI), MINI_APP_URL, ALLOWED_ORIGINS и
 * остальные из vars в wrangler.jsonc; PORT, DATA_DIR, APP_ROOT, TRUST_PROXY.
 */
import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import worker from '../src/index.ts'
import { webhookSecret } from '../scripts/lib.mjs'
import { buildEnv, createAssets, createHandler, openDatabase, scheduleHourly, workersAiRest } from './platform.mjs'

const root = process.env.APP_ROOT || process.cwd()
const port = Number(process.env.PORT || 8080)

const env = buildEnv(process.env, readFileSync(join(root, 'wrangler.jsonc'), 'utf8'))
env.DB = openDatabase(join(process.env.DATA_DIR || join(root, 'data'), 'krok.sqlite'), join(root, 'migrations'))
env.ASSETS = createAssets(join(root, 'dist'))
if (process.env.CLOUDFLARE_AI_TOKEN && process.env.CLOUDFLARE_ACCOUNT_ID) {
  env.AI = workersAiRest({ accountId: process.env.CLOUDFLARE_ACCOUNT_ID, token: process.env.CLOUDFLARE_AI_TOKEN })
}
// Секрет вебхука выводится из токена бота — так же, как в scripts/setup-bot.mjs.
if (env.BOT_TOKEN && !env.WEBHOOK_SECRET) env.WEBHOOK_SECRET = webhookSecret(env.BOT_TOKEN)

/** Фоновые задачи (ctx.waitUntil): при остановке сервера дожидаемся их. */
const pending = new Set()
const ctx = {
  waitUntil(promise) {
    const task = Promise.resolve(promise).catch((e) => console.error('background task failed', e?.message ?? e))
    pending.add(task)
    task.finally(() => pending.delete(task))
  },
  passThroughOnException() {},
  props: {},
}

const server = createServer(createHandler((request) => worker.fetch(request, env, ctx), { trustProxy: process.env.TRUST_PROXY === '1' }))
server.listen(port, () => {
  const ai = [env.GEMINI_API_KEY && 'Gemini', env.AI && 'Qwen (Workers AI)', env.OPENAI_API_KEY && 'OpenAI-совместимый', env.ALLOW_MOCK_AI === 'true' && 'заглушка'].filter(Boolean)
  console.log(`Крок запущен на порту ${port}. ИИ: ${ai.join(', ') || 'не настроен'}. Бот: ${env.BOT_TOKEN ? 'есть токен' : 'нет BOT_TOKEN'}.`)
})

// Напоминания — как cron «5 * * * *» в wrangler.jsonc.
const stopReminders = scheduleHourly(5, () => worker.scheduled({ cron: '5 * * * *', scheduledTime: Date.now(), noRetry() {} }, env, ctx))

let stopping = false
async function shutdown(signal) {
  if (stopping) return
  stopping = true
  console.log(`${signal}: останавливаюсь`)
  stopReminders()
  server.close()
  server.closeIdleConnections()
  await Promise.race([Promise.allSettled([...pending]), new Promise((resolve) => setTimeout(resolve, 10_000))])
  server.closeAllConnections()
  env.DB.close()
  process.exit(0)
}
process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
