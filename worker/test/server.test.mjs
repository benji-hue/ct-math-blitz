import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import worker from '../src/index.ts'
import { consume, track, usage } from '../src/limits.ts'
import { parseJsonc, providerOrder, serverEnvFile } from '../scripts/lib.mjs'
import { buildEnv, createAssets, createHandler, msUntilMinute, openDatabase, workersAiRest } from '../node/platform.mjs'

const migrations = fileURLToPath(new URL('../migrations', import.meta.url))
const wrangler = readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8')

describe('JSON с комментариями (wrangler.jsonc)', () => {
  it('читает настоящий wrangler.jsonc', () => {
    const config = parseJsonc(wrangler)
    expect(config.vars.AI_PROVIDERS).toBe('gemini,workers-ai')
    expect(config.triggers.crons).toEqual(['5 * * * *'])
  })

  it('не трогает «//» внутри строк и убирает висячие запятые', () => {
    const text = '{\n  // комментарий\n  "url": "https://krok.example/a//b", /* блок */\n  "list": [1, 2, ], "esc": "кавычка \\" // не комментарий",\n}'
    expect(parseJsonc(text)).toEqual({ url: 'https://krok.example/a//b', list: [1, 2], esc: 'кавычка " // не комментарий' })
  })
})

describe('окружение своего сервера', () => {
  it('значения по умолчанию — из wrangler.jsonc, поверх — переменные процесса', () => {
    const env = buildEnv({ BOT_TOKEN: 't', GEMINI_API_KEY: 'g', DAILY_LIMIT_CHAT: '100', ALLOWED_ORIGINS: '', PATH: '/usr/bin' }, wrangler)
    expect(env.AI_PROVIDERS).toBe('gemini,workers-ai')
    expect(env.GEMINI_MODEL).toBe('gemini-3.5-flash-lite')
    expect(env.DAILY_LIMIT_CHAT).toBe('100')
    expect(env.BOT_TOKEN).toBe('t')
    expect(env.GEMINI_API_KEY).toBe('g')
    expect(env.ALLOWED_ORIGINS).toBe('')
    expect(env.PATH).toBeUndefined()
  })

  it('файл .env: секреты без опасных символов, пустые значения пропускаются', () => {
    expect(serverEnvFile({ BOT_TOKEN: '123:AA-b_c', GEMINI_API_KEY: '', KROK_IMAGE: 'krok:abc' })).toBe('BOT_TOKEN=123:AA-b_c\nKROK_IMAGE=krok:abc\n')
    expect(() => serverEnvFile({ BOT_TOKEN: 'a\nEVIL=1' })).toThrow(/BOT_TOKEN/)
    expect(() => serverEnvFile({ KEY: 'with $HOME' })).toThrow(/KEY/)
    expect(() => serverEnvFile({ 'bad-name': 'x' })).toThrow(/bad-name/)
  })

  it('порядок моделей на сервере тот же, что на Cloudflare', () => {
    expect(providerOrder({ hasGemini: true })).toEqual({ text: 'gemini,workers-ai', vision: 'gemini,workers-ai' })
  })

  it('напоминания — на 5-й минуте каждого часа, как cron в wrangler.jsonc', () => {
    const at = (iso) => Date.parse(iso)
    expect(msUntilMinute(at('2026-11-02T10:00:00Z'), 5)).toBe(5 * 60_000)
    expect(msUntilMinute(at('2026-11-02T10:05:00Z'), 5)).toBe(60 * 60_000)
    expect(msUntilMinute(at('2026-11-02T10:59:30Z'), 5)).toBe(5.5 * 60_000)
  })
})

describe('база: D1 поверх SQLite', () => {
  const db = openDatabase(':memory:', migrations)
  const env = { DB: db }

  it('миграции применены, повторное открытие их не повторяет', async () => {
    expect(await db.prepare("SELECT name FROM _migrations WHERE name = '0001_init.sql'").first('name')).toBe('0001_init.sql')
    const dir = mkdtempSync(join(tmpdir(), 'krok-db-'))
    openDatabase(join(dir, 'krok.sqlite'), migrations).close()
    const again = openDatabase(join(dir, 'krok.sqlite'), migrations)
    expect((await again.prepare('SELECT COUNT(*) AS n FROM _migrations').first()).n).toBe(1)
    again.close()
  })

  it('настоящий код лимитов воркера работает без изменений (UPSERT … RETURNING)', async () => {
    expect(await consume(env, 'tg:1', 'chat')).toBe(1)
    expect(await consume(env, 'tg:1', 'chat')).toBe(2)
    expect(await consume(env, 'tg:1', 'vision')).toBe(1)
    expect(await usage(env, 'tg:1')).toEqual({ chat: 2, vision: 1 })
    await track(env, 'route:text:gemini:??/SRV')
    expect((await db.prepare('SELECT count FROM events WHERE name = ?1').bind('route:text:gemini:??/SRV').first()).count).toBe(1)
  })

  it('first() без строк — null, run() — число изменений, undefined — NULL', async () => {
    expect(await db.prepare('SELECT * FROM users WHERE id = ?1').bind(42).first()).toBeNull()
    await db.prepare('INSERT INTO users (id, first_name, created_at, updated_at) VALUES (?1, ?2, ?3, ?3)').bind(42, undefined, 1).run()
    const updated = await db.prepare('UPDATE users SET reminders = 1 - reminders, updated_at = ?2 WHERE id = ?1 RETURNING reminders').bind(42, 2).first()
    expect(updated).toEqual({ reminders: 0 })
    expect((await db.prepare('UPDATE users SET streak = 5 WHERE id = ?1').bind(42).run()).meta.changes).toBe(1)
    expect((await db.prepare('SELECT first_name FROM users WHERE id = ?1').bind(42).all()).results).toEqual([{ first_name: null }])
  })
})

describe('Workers AI по REST API', () => {
  const calls = []
  const fetchImpl = async (url, init) => {
    calls.push({ url, init })
    const body = JSON.parse(init.body)
    if (body.fail) return new Response(JSON.stringify({ success: false, errors: [{ code: 4006, message: 'daily free allocation exceeded' }] }), { status: 429 })
    if (body.stream) return new Response('data: {"response":"При"}\n\ndata: [DONE]\n\n', { headers: { 'Content-Type': 'text/event-stream' } })
    return Response.json({ success: true, result: { response: 'готово' } })
  }
  const ai = workersAiRest({ accountId: 'acc', token: 'tok', fetchImpl })

  it('тот же интерфейс, что у env.AI: поток или result', async () => {
    const stream = await ai.run('@cf/qwen/qwen3.8-27b', { messages: [], stream: true, chat_template_kwargs: { enable_thinking: false } })
    expect(await new Response(stream).text()).toContain('"response":"При"')
    expect(await ai.run('@cf/qwen/qwen3.8-27b', { messages: [] })).toEqual({ response: 'готово' })
    expect(calls[0].url).toBe('https://api.cloudflare.com/client/v4/accounts/acc/ai/run/@cf/qwen/qwen3.8-27b')
    expect(calls[0].init.headers.Authorization).toBe('Bearer tok')
    expect(JSON.parse(calls[0].init.body).chat_template_kwargs).toEqual({ enable_thinking: false })
  })

  it('ошибка Cloudflare (кончился лимит) — исключение с кодом: цепочка возьмёт другую модель', async () => {
    await expect(ai.run('@cf/qwen/qwen3.8-27b', { fail: true })).rejects.toThrow('4006: daily free allocation exceeded')
  })
})

describe('раздача мини-аппа', () => {
  const root = mkdtempSync(join(tmpdir(), 'krok-dist-'))
  mkdirSync(join(root, 'assets'))
  writeFileSync(join(root, 'index.html'), '<!doctype html><title>Крок</title>')
  writeFileSync(join(root, 'assets', 'app-1a2b.js'), 'console.log(1)')
  writeFileSync(join(root, 'sw.js'), 'self.x = 1')
  writeFileSync(join(tmpdir(), 'krok-secret.txt'), 'секрет')
  const assets = createAssets(root)
  const get = (path, headers = {}, method = 'GET') => assets.fetch(new Request(`http://krok.test${path}`, { method, headers }))

  it('файлы сборки — с вечным кешем, остальное — с проверкой', async () => {
    const app = await get('/assets/app-1a2b.js')
    expect(app.status).toBe(200)
    expect(app.headers.get('Content-Type')).toContain('text/javascript')
    expect(app.headers.get('Cache-Control')).toContain('immutable')
    const sw = await get('/sw.js')
    expect(sw.headers.get('Cache-Control')).toBe('no-cache')
    expect((await get('/sw.js', { 'If-None-Match': sw.headers.get('ETag') })).status).toBe(304)
  })

  it('страницы приложения — index.html, несуществующие файлы — 404', async () => {
    expect(await (await get('/')).text()).toContain('Крок')
    expect(await (await get('/practice/math', { Accept: 'text/html' })).text()).toContain('Крок')
    expect((await get('/assets/old-chunk.js')).status).toBe(404)
    expect((await get('/', {}, 'POST')).status).toBe(405)
  })

  it('за пределы папки сборки не выйти', async () => {
    expect((await get('/../krok-secret.txt')).status).toBe(404)
    expect((await get('/%2e%2e/krok-secret.txt')).status).toBe(404)
    expect((await get('/%2e%2e%2fkrok-secret.txt')).status).toBe(404)
    expect((await get('/%00')).status).toBe(404)
    // «/../../etc/passwd» парсер URL сводит к «/etc/passwd» внутри папки сборки — это страница приложения.
    const page = await (await get('/../../etc/passwd', { Accept: 'text/html' })).text()
    expect(page).toContain('Крок')
    expect(page).not.toContain('root:')
  })
})

describe('сервер целиком: воркер в node:http', () => {
  let server
  let base
  let db
  const root = mkdtempSync(join(tmpdir(), 'krok-app-'))
  writeFileSync(join(root, 'index.html'), '<!doctype html><title>Крок</title>')

  beforeAll(async () => {
    db = openDatabase(':memory:', migrations)
    const env = { ...buildEnv({ ALLOW_MOCK_AI: 'true', ALLOW_ANONYMOUS: 'true', BOT_TOKEN: '1:test', WEBHOOK_SECRET: 'hook' }, wrangler), DB: db, ASSETS: createAssets(root) }
    const ctx = { waitUntil: (p) => Promise.resolve(p).catch(() => {}), passThroughOnException() {} }
    server = createServer(createHandler((request) => worker.fetch(request, env, ctx)))
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    base = `http://127.0.0.1:${server.address().port}`
  })
  afterAll(() => new Promise((resolve) => server.close(resolve)))

  it('API, страница приложения и вебхук бота', async () => {
    expect(await (await fetch(`${base}/api/health`)).json()).toMatchObject({ ok: true })
    expect(await (await fetch(`${base}/anything`, { headers: { Accept: 'text/html' } })).text()).toContain('Крок')
    const webhook = (secret) => fetch(`${base}/bot/webhook`, { method: 'POST', headers: { 'X-Telegram-Bot-Api-Secret-Token': secret, 'Content-Type': 'application/json' }, body: '{"update_id":1}' })
    expect((await webhook('wrong')).status).toBe(403)
    expect((await webhook('hook')).status).toBe(200)
  })

  it('ответ ИИ идёт потоком SSE', async () => {
    const res = await fetch(`${base}/api/ai/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'tutor', messages: [{ role: 'user', content: 'Привет' }] }) })
    expect(res.headers.get('Content-Type')).toContain('text/event-stream')
    const types = (await res.text())
      .split('\n\n')
      .filter((chunk) => chunk.startsWith('data: '))
      .map((chunk) => JSON.parse(chunk.slice(6)).type)
    expect(types[0]).toBe('meta')
    expect(types).toContain('delta')
    expect(types.at(-1)).toBe('done')
  })

  it('IP из заголовков клиента не подменить: лимит считается по настоящему адресу', async () => {
    await fetch(`${base}/api/ai/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '6.6.6.6', 'X-Forwarded-For': '7.7.7.7' },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'x' }] }),
    })
    const keys = (await db.prepare('SELECT user_key FROM usage').all()).results.map((row) => row.user_key)
    expect(keys.some((key) => key.includes('127.0.0.1'))).toBe(true)
    expect(keys.some((key) => key.includes('6.6.6.6') || key.includes('7.7.7.7'))).toBe(false)
  })

  it('слишком большой запрос отклоняется до чтения целиком', async () => {
    const res = await fetch(`${base}/api/ai/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: 'x'.repeat(5_000_000) })
    expect(res.status).toBe(413)
  })

  const post = (path, body) => fetch(`${base}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

  it('самостоятельная: 5 заданий по уровням 1–5 с баллами 2, 4, 6, 8, 10', async () => {
    const res = await post('/api/ai/selftest', { subjectTitle: 'Математика', topic: 'Квадратичная функция', size: 5, grade: '9 класс' })
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.tasks.map((t) => t.level)).toEqual([1, 2, 3, 4, 5])
    expect(data.tasks.map((t) => t.points)).toEqual([2, 4, 6, 8, 10])
    expect(data.tasks[0].options).toHaveLength(4)
  })

  it('самостоятельная из 10 заданий: по два на уровень, баллы 1…10', async () => {
    const data = await (await post('/api/ai/selftest', { subjectTitle: 'Физика', topic: 'Импульс', size: 10 })).json()
    expect(data.tasks.map((t) => t.level)).toEqual([1, 1, 2, 2, 3, 3, 4, 4, 5, 5])
    expect(data.tasks.map((t) => t.points)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    expect((await post('/api/ai/selftest', { subjectTitle: 'Физика' })).status).toBe(400)
  })

  it('проверка тетради: нужно фото, баллы не больше максимума задания', async () => {
    const tasks = [1, 2].map((n) => ({ n, level: n, max: n * 2, q: `Задание ${n}`, answer: '1', solution: 'Решение' }))
    expect((await post('/api/ai/grade', { subjectTitle: 'Математика', tasks })).status).toBe(400)
    const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
    const res = await post('/api/ai/grade', { subjectTitle: 'Математика', tasks, image: { mime: 'image/png', data: png } })
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.tasks.map((t) => t.points)).toEqual([2, 4])
  })

  it('урок: тот же поток SSE, что и в чате', async () => {
    const res = await post('/api/ai/chat', { mode: 'lesson', subject: 'math', messages: [{ role: 'user', content: 'Объясни квадратичную функцию' }], history: true })
    expect(res.headers.get('Content-Type')).toContain('text/event-stream')
    expect(await res.text()).toContain('"type":"done"')
  })
})
