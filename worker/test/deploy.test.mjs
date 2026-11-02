import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { CloudflareError, cloudflare, prepareCloudflare, rewriteWranglerConfig, signInitData, webhookSecret } from '../scripts/lib.mjs'
import { validateInitData } from '../src/telegram'

const TOKEN = '1234567890:TEST-token-for-unit-tests'
const DB_ID = '0f1e2d3c-4b5a-6978-8a9b-0c1d2e3f4a5b'
const ACCOUNT = 'a1b2c3d4e5f60718293a4b5c6d7e8f90'

describe('секрет вебхука', () => {
  it('стабилен, зависит от токена и допустим для Telegram', () => {
    const secret = webhookSecret(TOKEN)
    expect(secret).toBe(webhookSecret(TOKEN))
    expect(secret).not.toBe(webhookSecret(`${TOKEN}x`))
    expect(secret).toMatch(/^[A-Za-z0-9_-]{1,256}$/)
  })
})

describe('подпись initData в скриптах деплоя', () => {
  it('принимается воркером — значит, проверка после деплоя честная', async () => {
    const now = Date.now()
    const fields = { auth_date: String(Math.floor(now / 1000)), query_id: 'krok-smoke', user: JSON.stringify({ id: 1, first_name: 'Smoke' }) }
    const result = await validateInitData(signInitData(fields, TOKEN), TOKEN, 86400, now)
    expect(result.ok).toBe(true)
    expect((await validateInitData(signInitData(fields, TOKEN), `${TOKEN}x`, 86400, now)).ok).toBe(false)
  })
})

describe('wrangler.jsonc в CI', () => {
  const original = readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8')
  const parse = (text) =>
    JSON.parse(
      text
        .split('\n')
        .filter((line) => !line.trim().startsWith('//'))
        .join('\n'),
    )
  const values = { databaseId: DB_ID, appUrl: 'https://krok.demo.workers.dev', allowedOrigins: 'https://user.github.io', allowAnonymous: true }

  it('подставляет значения деплоя и не трогает остальное', () => {
    const out = rewriteWranglerConfig(original, values)
    const config = parse(out)
    const before = parse(original)
    expect(config.d1_databases[0].database_id).toBe(DB_ID)
    expect(config.vars.MINI_APP_URL).toBe('https://krok.demo.workers.dev')
    expect(config.vars.ALLOWED_ORIGINS).toBe('https://user.github.io')
    expect(config.vars.ALLOW_ANONYMOUS).toBe('true')
    expect(config.vars.AI_PROVIDERS).toBe(before.vars.AI_PROVIDERS)
    expect(config.triggers).toEqual(before.triggers)
    expect(out).toContain('// Cloudflare Workers AI')
  })

  it('по умолчанию анонимный доступ выключен', () => {
    expect(parse(rewriteWranglerConfig(original, { ...values, allowAnonymous: false })).vars.ALLOW_ANONYMOUS).toBe('false')
  })

  it('отклоняет подозрительные значения', () => {
    expect(() => rewriteWranglerConfig(original, { ...values, databaseId: 'not-a-uuid' })).toThrow(/UUID/)
    expect(() => rewriteWranglerConfig(original, { ...values, appUrl: 'http://evil.example' })).toThrow(/адрес/)
    expect(() => rewriteWranglerConfig(original, { ...values, allowedOrigins: 'a","ALLOW_ANONYMOUS":"true' })).toThrow(/ALLOWED_ORIGINS/)
    expect(() => rewriteWranglerConfig('{}', values)).toThrow(/database_id/)
  })
})

describe('клиент Cloudflare API', () => {
  const reply = (status, body) => async () => ({ ok: status < 400, status, json: async () => body })

  it('возвращает result', async () => {
    const api = cloudflare('t', reply(200, { success: true, result: [{ id: 1 }] }))
    expect(await api.get('/accounts')).toEqual([{ id: 1 }])
  })

  it('объясняет, чего не хватает токену', async () => {
    const api = cloudflare('t', reply(403, { success: false, errors: [{ code: 10000, message: 'Authentication error' }] }))
    const error = await api.get('/accounts').catch((e) => e)
    expect(error).toBeInstanceOf(CloudflareError)
    expect(error.message).toContain('Authentication error')
    expect(error.message).toContain('не хватает прав')
    expect(error.message).not.toContain('Bearer')
  })
})

describe('подготовка аккаунта Cloudflare', () => {
  function fake(routes) {
    const calls = []
    const handler = (method) => async (path, body) => {
      calls.push(`${method} ${path.split('?')[0]}`)
      const route = routes[`${method} ${path.split('?')[0]}`]
      if (route === undefined) throw new Error(`неожиданный вызов ${method} ${path}`)
      return typeof route === 'function' ? route(body) : route
    }
    return { api: { get: handler('GET'), post: handler('POST'), put: handler('PUT') }, calls }
  }
  const noSubdomain = () => {
    throw new CloudflareError('нет поддомена', 404, [{ code: 10007 }])
  }

  it('находит единственный аккаунт и готовые ресурсы, ничего не создавая', async () => {
    const { api, calls } = fake({
      'GET /accounts': [{ id: ACCOUNT, name: 'Me' }],
      [`GET /accounts/${ACCOUNT}/d1/database`]: [{ uuid: DB_ID, name: 'krok' }],
      [`GET /accounts/${ACCOUNT}/workers/subdomain`]: { subdomain: 'demo' },
    })
    expect(await prepareCloudflare(api)).toEqual({ accountId: ACCOUNT, databaseId: DB_ID, subdomain: 'demo', appUrl: 'https://krok.demo.workers.dev' })
    expect(calls.some((c) => c.startsWith('POST') || c.startsWith('PUT'))).toBe(false)
  })

  it('создаёт базу и поддомен, если их ещё нет', async () => {
    const { api, calls } = fake({
      [`GET /accounts/${ACCOUNT}/d1/database`]: [{ uuid: 'other', name: 'krok-old' }],
      [`POST /accounts/${ACCOUNT}/d1/database`]: { uuid: DB_ID },
      [`GET /accounts/${ACCOUNT}/workers/subdomain`]: noSubdomain,
      [`PUT /accounts/${ACCOUNT}/workers/subdomain`]: {},
    })
    const result = await prepareCloudflare(api, { accountId: ACCOUNT })
    expect(result.databaseId).toBe(DB_ID)
    expect(result.subdomain).toBe(`krok-${ACCOUNT.slice(0, 6)}`)
    expect(calls).toContain(`POST /accounts/${ACCOUNT}/d1/database`)
    expect(calls).toContain(`PUT /accounts/${ACCOUNT}/workers/subdomain`)
  })

  it('берёт другое имя поддомена, если первое занято', async () => {
    let attempt = 0
    const { api } = fake({
      [`GET /accounts/${ACCOUNT}/d1/database`]: [{ uuid: DB_ID, name: 'krok' }],
      [`GET /accounts/${ACCOUNT}/workers/subdomain`]: noSubdomain,
      [`PUT /accounts/${ACCOUNT}/workers/subdomain`]: () => {
        if (attempt++ === 0) throw new CloudflareError('занято', 409, [{ code: 10006 }])
        return {}
      },
    })
    expect((await prepareCloudflare(api, { accountId: ACCOUNT })).subdomain).toBe(`krok-${ACCOUNT.slice(0, 10)}`)
  })

  it('просит указать аккаунт, если их несколько', async () => {
    const { api } = fake({ 'GET /accounts': [{ id: 'a', name: 'Один' }, { id: 'b', name: 'Два' }] })
    await expect(prepareCloudflare(api)).rejects.toThrow(/CLOUDFLARE_ACCOUNT_ID.*Один — a.*Два — b/)
  })

  it('не глотает ошибку прав доступа', async () => {
    const { api } = fake({
      [`GET /accounts/${ACCOUNT}/d1/database`]: () => {
        throw new CloudflareError('нет прав', 403)
      },
    })
    await expect(prepareCloudflare(api, { accountId: ACCOUNT })).rejects.toThrow(/нет прав/)
  })
})
