/**
 * Общие функции скриптов деплоя (запускаются в GitHub Actions и локально).
 * Всё чистое и без побочных эффектов — поэтому покрыто тестами (test/deploy.test.mjs).
 */
import { createHmac } from 'node:crypto'

/**
 * Секрет вебхука Telegram выводится из токена бота: он одинаков при каждом
 * запуске деплоя и не требует отдельного секрета. Без токена его не подобрать.
 * Telegram допускает в секрете только A-Z, a-z, 0-9, «_» и «-» — hex подходит.
 */
export function webhookSecret(botToken) {
  return createHmac('sha256', botToken).update('krok-telegram-webhook').digest('hex')
}

/** Подпись initData — тот же алгоритм, что в worker/src/telegram.ts (для проверки после деплоя). */
export function signInitData(fields, botToken) {
  const pairs = Object.entries(fields)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest()
  const hash = createHmac('sha256', secret).update(pairs.join('\n')).digest('hex')
  const params = new URLSearchParams(fields)
  params.set('hash', hash)
  return params.toString()
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Подставляет данные деплоя в wrangler.jsonc. Меняется только рабочая копия
 * в CI — в git это не попадает, а комментарии и форматирование сохраняются.
 */
export function rewriteWranglerConfig(text, { databaseId, appUrl, allowedOrigins = '', allowAnonymous = false }) {
  if (!UUID.test(databaseId)) throw new Error(`database_id должен быть UUID, получено: ${databaseId}`)
  if (!/^https:\/\/[a-z0-9.-]+$/i.test(appUrl)) throw new Error(`Некорректный адрес приложения: ${appUrl}`)
  if (/["\\\n]/.test(allowedOrigins)) throw new Error('ALLOWED_ORIGINS содержит недопустимые символы')

  let out = text
  const set = (key, value) => {
    const pattern = new RegExp(`("${key}"\\s*:\\s*)"[^"]*"`)
    if (!pattern.test(out)) throw new Error(`В wrangler.jsonc нет поля ${key}`)
    out = out.replace(pattern, (_match, head) => `${head}"${value}"`)
  }
  set('database_id', databaseId)
  set('MINI_APP_URL', appUrl)
  set('ALLOWED_ORIGINS', allowedOrigins)
  set('ALLOW_ANONYMOUS', allowAnonymous ? 'true' : 'false')
  return out
}

// ---------- Cloudflare API ----------

export class CloudflareError extends Error {
  constructor(message, status, errors = []) {
    super(message)
    this.status = status
    this.errors = errors
  }
}

const HINTS = {
  401: 'Cloudflare не принял токен. Скопируйте его целиком, без пробелов, и проверьте, что он не отозван.',
  403: 'У токена не хватает прав. Нужны: Account → Workers Scripts: Edit, D1: Edit, Account Settings: Read (шаблон «Edit Cloudflare Workers» + D1 Edit).',
}

export function cloudflare(token, fetchImpl = fetch, base = process.env.CLOUDFLARE_API_BASE || 'https://api.cloudflare.com/client/v4') {
  async function call(method, path, body) {
    const res = await fetchImpl(`${base}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || data.success === false) {
      const detail = (data.errors ?? []).map((e) => `${e.message} (код ${e.code})`).join('; ') || `HTTP ${res.status}`
      const hint = HINTS[res.status] ? ` ${HINTS[res.status]}` : ''
      throw new CloudflareError(`${method} ${path}: ${detail}.${hint}`, res.status, data.errors ?? [])
    }
    return data.result
  }
  return { get: (path) => call('GET', path), post: (path, body) => call('POST', path, body), put: (path, body) => call('PUT', path, body) }
}

/** У аккаунта ещё нет поддомена workers.dev: Cloudflare отвечает 404 (код 10007). */
const isNoSubdomain = (e) => e instanceof CloudflareError && (e.status === 404 || e.errors.some((x) => x.code === 10007))

/**
 * Готовит аккаунт Cloudflare: находит аккаунт, создаёт базу D1 и поддомен
 * workers.dev, если их ещё нет. Повторный запуск ничего не ломает.
 */
export async function prepareCloudflare(api, { accountId, workerName = 'krok', databaseName = 'krok', log = () => {} } = {}) {
  let account = accountId?.trim()
  if (!account) {
    const accounts = await api.get('/accounts?per_page=50')
    if (!accounts?.length) {
      throw new Error('Токен не видит ни одного аккаунта Cloudflare. Добавьте токену право «Account Settings: Read» или задайте секрет CLOUDFLARE_ACCOUNT_ID.')
    }
    if (accounts.length > 1) {
      throw new Error(`У токена несколько аккаунтов. Задайте секрет CLOUDFLARE_ACCOUNT_ID одним из значений: ${accounts.map((a) => `${a.name} — ${a.id}`).join('; ')}`)
    }
    account = accounts[0].id
    log(`Аккаунт Cloudflare: ${accounts[0].name}`)
  }

  const found = await api.get(`/accounts/${account}/d1/database?name=${encodeURIComponent(databaseName)}`)
  let database = (found ?? []).find((d) => d.name === databaseName)
  if (database) {
    log(`База D1 «${databaseName}» уже есть`)
  } else {
    database = await api.post(`/accounts/${account}/d1/database`, { name: databaseName })
    log(`База D1 «${databaseName}» создана`)
  }
  const databaseId = database.uuid ?? database.id

  let subdomain = null
  try {
    subdomain = (await api.get(`/accounts/${account}/workers/subdomain`))?.subdomain ?? null
  } catch (e) {
    if (!isNoSubdomain(e)) throw e
  }
  if (!subdomain) {
    const candidates = [`${workerName}-${account.slice(0, 6)}`, `${workerName}-${account.slice(0, 10)}`, `${workerName}-app-${account.slice(0, 6)}`]
    for (const name of candidates) {
      try {
        await api.put(`/accounts/${account}/workers/subdomain`, { subdomain: name })
        subdomain = name
        log(`Создан поддомен workers.dev: ${name}`)
        break
      } catch (e) {
        if (!(e instanceof CloudflareError) || e.status === 401 || e.status === 403) throw e
      }
    }
    if (!subdomain) throw new Error('Не удалось создать поддомен workers.dev. Создайте его вручную: Cloudflare → Workers & Pages → Subdomain.')
  }

  return { accountId: account, databaseId, subdomain, appUrl: `https://${workerName}.${subdomain}.workers.dev` }
}
