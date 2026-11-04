/**
 * Окружение воркера. Секреты (BOT_TOKEN, *_API_KEY, WEBHOOK_SECRET) задаются
 * командой `wrangler secret put` и никогда не лежат в репозитории.
 */
export interface Env {
  /** Статика мини-аппа (папка dist после `npm run build`). */
  ASSETS: Fetcher
  /** Cloudflare Workers AI — работает без внешних ключей. */
  AI?: Ai
  /** D1: пользователи, лимиты, напоминания, обезличенные метрики. */
  DB?: D1Database

  BOT_TOKEN?: string
  WEBHOOK_SECRET?: string
  GEMINI_API_KEY?: string
  OPENAI_API_KEY?: string

  /** Порядок провайдеров, по умолчанию "gemini,workers-ai" (без ключа Gemini пропускается). */
  AI_PROVIDERS?: string
  /** Порядок провайдеров для фото решений (по умолчанию — как AI_PROVIDERS). */
  AI_VISION_PROVIDERS?: string
  WORKERS_AI_MODELS?: string
  WORKERS_AI_VISION_MODELS?: string
  GEMINI_MODEL?: string
  /** Любой OpenAI-совместимый API: DeepSeek, OpenRouter, Groq, Mistral… */
  OPENAI_BASE_URL?: string
  OPENAI_MODEL?: string

  /** Откуда разрешены запросы (CORS), через запятую. Тот же домен разрешён всегда. */
  ALLOWED_ORIGINS?: string
  /** "true" — пускать к ИИ с сайта, без Telegram: лимит по IP и общий дневной потолок для всех гостей. */
  ALLOW_ANONYMOUS?: string
  /** Общий дневной потолок гостей сайта — во столько раз больше лимита одного ученика (по умолчанию 5). */
  ANON_TOTAL_FACTOR?: string
  /** "true" — провайдер-заглушка для локальной разработки без ИИ. */
  ALLOW_MOCK_AI?: string
  /** Адрес мини-аппа для кнопок бота. */
  MINI_APP_URL?: string
  /** Срок жизни initData, секунд (по умолчанию сутки). */
  INIT_DATA_TTL?: string

  /** Пауза перед повторной попыткой, если все модели ответили «перегружена» (503), мс; по умолчанию 1200. */
  AI_RETRY_MS?: string

  DAILY_LIMIT_CHAT?: string
  DAILY_LIMIT_GENERATE?: string
  DAILY_LIMIT_ANALYZE?: string
  DAILY_LIMIT_VISION?: string
}

export const VERSION = '2.0.0'

export function num(value: string | undefined, fallback: number): number {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

export function list(value: string | undefined, fallback: string[]): string[] {
  const items = (value ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  return items.length ? items : fallback
}

/** День по минскому времени (UTC+3, без перехода на летнее время). */
export function minskDay(now = Date.now()): string {
  return new Date(now + 3 * 3600_000).toISOString().slice(0, 10)
}

