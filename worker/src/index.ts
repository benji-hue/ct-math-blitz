import { handleApi, json } from './api'
import { handleWebhook } from './bot'
import { sendReminders } from './cron'
import type { Env } from './env'

/**
 * Единая точка входа: один воркер раздаёт мини-апп (статику), обслуживает
 * API для ИИ, принимает вебхук бота и по расписанию отправляет напоминания.
 * Один домен — значит, нет CORS и Telegram открывает приложение мгновенно.
 */

function corsHeaders(req: Request, env: Env): Record<string, string> | null {
  const origin = req.headers.get('Origin')
  if (!origin) return null
  const self = new URL(req.url).origin
  const allowed = (env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  if (origin !== self && !allowed.includes(origin)) return null
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
}

function withHeaders(res: Response, headers: Record<string, string> | null): Response {
  if (!headers) return res
  const out = new Response(res.body, res)
  for (const [k, v] of Object.entries(headers)) out.headers.set(k, v)
  return out
}

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url)

    if (url.pathname.startsWith('/api/')) {
      const cors = corsHeaders(req, env)
      if (req.method === 'OPTIONS') return new Response(null, { status: cors ? 204 : 403, headers: cors ?? {} })
      try {
        return withHeaders(await handleApi(req, env, ctx, url.pathname), cors)
      } catch (e) {
        console.error('api error', (e as Error).message)
        return withHeaders(json({ error: 'Внутренняя ошибка сервера' }, 500), cors)
      }
    }

    if (url.pathname === '/bot/webhook') return handleWebhook(req, env, ctx)

    // Всё остальное — статика мини-аппа (SPA-фолбэк настроен в wrangler.jsonc).
    return env.ASSETS.fetch(req)
  },

  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(sendReminders(env).then((n) => console.log(`reminders sent: ${n}`)))
  },
} satisfies ExportedHandler<Env>
