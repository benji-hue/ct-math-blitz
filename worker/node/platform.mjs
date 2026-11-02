/**
 * Воркер «Крока» на своём сервере (Node.js 22+) вместо Cloudflare Workers.
 *
 * Здесь всё, что воркеру обычно даёт Cloudflare: база D1 (её заменяет файл SQLite),
 * Workers AI (по REST API Cloudflare), раздача мини-аппа с SPA-фолбэком, Request и
 * Response поверх node:http, расписание напоминаний. Код воркера (src/) не меняется.
 */
import { mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, extname, join, resolve, sep } from 'node:path'
import { once } from 'node:events'
import { DatabaseSync } from 'node:sqlite'
import { parseJsonc } from '../scripts/lib.mjs'

// ---------- База: D1 поверх SQLite ----------

const toSqlite = (value) => (value === undefined ? null : typeof value === 'boolean' ? Number(value) : value)

/**
 * Открывает файл SQLite с тем же интерфейсом, что у D1: prepare().bind().first() / all() / run().
 * Миграции из папки применяются по порядку, каждая один раз.
 */
export function openDatabase(file, migrationsDir) {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true })
  const db = new DatabaseSync(file)
  db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;')
  if (migrationsDir) migrate(db, migrationsDir)

  const cache = new Map()
  const statement = (sql) => {
    let prepared = cache.get(sql)
    if (!prepared) {
      prepared = db.prepare(sql)
      cache.set(sql, prepared)
    }
    return prepared
  }
  const bound = (sql, params) => ({
    bind: (...args) => bound(sql, args.map(toSqlite)),
    first: async (column) => {
      const row = statement(sql).get(...params)
      if (!row) return null
      return column === undefined ? { ...row } : (row[column] ?? null)
    },
    all: async () => ({ success: true, results: statement(sql).all(...params).map((row) => ({ ...row })), meta: {} }),
    run: async () => {
      const info = statement(sql).run(...params)
      return { success: true, results: [], meta: { changes: Number(info.changes), last_row_id: Number(info.lastInsertRowid) } }
    },
  })
  return {
    prepare: (sql) => bound(sql, []),
    exec: async (sql) => {
      db.exec(sql)
      return { count: 0, duration: 0 }
    },
    close: () => db.close(),
  }
}

function migrate(db, dir) {
  db.exec('CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)')
  const applied = new Set(db.prepare('SELECT name FROM _migrations').all().map((row) => row.name))
  const files = readdirSync(dir)
    .filter((name) => name.endsWith('.sql'))
    .sort()
  for (const name of files) {
    if (applied.has(name)) continue
    db.exec('BEGIN')
    try {
      db.exec(readFileSync(join(dir, name), 'utf8'))
      db.prepare('INSERT INTO _migrations (name, applied_at) VALUES (?, ?)').run(name, Date.now())
      db.exec('COMMIT')
    } catch (e) {
      db.exec('ROLLBACK')
      throw new Error(`Миграция ${name} не применилась: ${e.message}`)
    }
  }
}

// ---------- Workers AI по REST API ----------

/**
 * То же, что привязка env.AI в воркере, но через REST API Cloudflare: при stream: true
 * возвращает поток SSE, иначе — result. Нужен токен с правом «Workers AI: Read».
 */
export function workersAiRest({ accountId, token, fetchImpl = fetch, base = 'https://api.cloudflare.com/client/v4' }) {
  return {
    async run(model, inputs) {
      const res = await fetchImpl(`${base}/accounts/${accountId}/ai/run/${model}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(inputs),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        const detail = (data?.errors ?? []).map((e) => `${e.code}: ${e.message}`).join('; ')
        throw new Error(detail || `HTTP ${res.status}`)
      }
      if (inputs?.stream) return res.body
      return (await res.json()).result
    },
  }
}

// ---------- Раздача мини-аппа ----------

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.xml': 'application/xml',
}

/**
 * Статика из папки dist, как assets у Cloudflare с not_found_handling: single-page-application:
 * несуществующий адрес страницы отдаёт index.html, несуществующий файл — 404.
 * Файлы с хешем в имени (/assets/…) кешируются навсегда, остальное — с проверкой ETag.
 */
export function createAssets(root) {
  const base = resolve(root)
  const cache = new Map()
  const load = (path) => {
    const hit = cache.get(path)
    if (hit) return hit
    let stat
    try {
      stat = statSync(path)
    } catch {
      return null
    }
    if (!stat.isFile()) return null
    const file = {
      body: readFileSync(path),
      etag: `"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`,
      type: TYPES[extname(path).toLowerCase()] ?? 'application/octet-stream',
    }
    cache.set(path, file)
    return file
  }
  const locate = (pathname) => {
    let decoded
    try {
      decoded = decodeURIComponent(pathname)
    } catch {
      return null
    }
    if (decoded.includes('\0')) return null
    const full = resolve(base, `.${decoded}`)
    if (full !== base && !full.startsWith(base + sep)) return null
    return full
  }

  return {
    async fetch(req) {
      if (req.method !== 'GET' && req.method !== 'HEAD') return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'GET, HEAD' } })
      const url = new URL(req.url)
      const path = locate(url.pathname)
      // Битая кодировка, нулевой байт, попытка выйти из папки сборки — сразу 404.
      if (!path) return new Response('Not Found', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
      let file = load(path) ?? load(join(path, 'index.html'))
      if (!file) {
        const page = req.headers.get('Sec-Fetch-Mode') === 'navigate' || (req.headers.get('Accept') ?? '').includes('text/html') || !extname(url.pathname)
        file = page ? load(join(base, 'index.html')) : null
        if (!file) return new Response('Not Found', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
      }
      const headers = {
        'Content-Type': file.type,
        ETag: file.etag,
        'Cache-Control': url.pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
        'X-Content-Type-Options': 'nosniff',
      }
      if (req.headers.get('If-None-Match') === file.etag) return new Response(null, { status: 304, headers })
      return new Response(req.method === 'HEAD' ? null : file.body, { headers })
    },
  }
}

// ---------- Окружение ----------

/** Секреты и настройки, которых нет среди vars в wrangler.jsonc. */
const EXTRA_KEYS = ['BOT_TOKEN', 'WEBHOOK_SECRET', 'GEMINI_API_KEY', 'OPENAI_API_KEY', 'INIT_DATA_TTL']

/**
 * Переменные воркера: значения по умолчанию — из vars в wrangler.jsonc (один источник
 * для Cloudflare и своего сервера), поверх — переменные окружения процесса.
 */
export function buildEnv(processEnv, wranglerText) {
  const vars = parseJsonc(wranglerText).vars ?? {}
  const env = { ...vars }
  for (const key of [...Object.keys(vars), ...EXTRA_KEYS]) {
    const value = processEnv[key]
    if (value !== undefined && value !== '') env[key] = value
  }
  return env
}

// ---------- HTTP: node:http ↔ Request / Response ----------

/** Тело запроса больше этого не читаем: у API свой предел (2,5 МБ), это — защита памяти. */
const MAX_BODY_BYTES = 4 * 1024 * 1024
const HOP_BY_HOP = ['connection', 'keep-alive', 'transfer-encoding', 'upgrade', 'proxy-connection', 'content-length']

const jsonError = (status, error) => new Response(JSON.stringify({ error }), { status, headers: { 'Content-Type': 'application/json; charset=utf-8' } })

async function readBody(nodeReq, maxBody) {
  if (Number(nodeReq.headers['content-length'] ?? 0) > maxBody) return null
  const chunks = []
  let size = 0
  for await (const chunk of nodeReq) {
    size += chunk.length
    if (size > maxBody) return null
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

/**
 * Запрос node:http → Request. IP клиента кладётся в CF-Connecting-IP, как у Cloudflare:
 * присланному клиентом заголовку не верим, X-Forwarded-For берём только от своего прокси (Caddy).
 */
export async function toRequest(nodeReq, { trustProxy = false, maxBody = MAX_BODY_BYTES, signal, colo = 'SRV' } = {}) {
  const headers = new Headers()
  for (let i = 0; i < nodeReq.rawHeaders.length; i += 2) headers.append(nodeReq.rawHeaders[i], nodeReq.rawHeaders[i + 1])
  for (const name of [...HOP_BY_HOP, 'cf-connecting-ip']) headers.delete(name)
  const forwarded = trustProxy ? String(nodeReq.headers['x-forwarded-for'] ?? '').split(',')[0].trim() : ''
  headers.set('CF-Connecting-IP', forwarded || nodeReq.socket?.remoteAddress || 'local')

  const proto = trustProxy && nodeReq.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http'
  const path = String(nodeReq.url ?? '/').startsWith('/') ? nodeReq.url : '/'
  const url = new URL(path, `${proto}://${nodeReq.headers.host || 'localhost'}`)

  const method = nodeReq.method ?? 'GET'
  let body
  if (method !== 'GET' && method !== 'HEAD') {
    body = await readBody(nodeReq, maxBody)
    if (body === null) return jsonError(413, 'Слишком большой запрос')
    headers.set('Content-Length', String(body.length))
  }
  const request = new Request(url, { method, headers, body, signal })
  // Как request.cf у Cloudflare: в статистике маршрута ИИ видно, что ответил свой сервер.
  Object.defineProperty(request, 'cf', { value: { colo } })
  return request
}

/** Response → ответ node:http. Поток (SSE) пишется кусками сразу, без буферизации. */
export async function sendResponse(nodeRes, response) {
  nodeRes.statusCode = response.status
  for (const [key, value] of response.headers) if (key !== 'set-cookie') nodeRes.setHeader(key, value)
  const cookies = response.headers.getSetCookie?.() ?? []
  if (cookies.length) nodeRes.setHeader('Set-Cookie', cookies)
  if (!response.body) {
    nodeRes.end()
    return
  }
  nodeRes.flushHeaders()
  const reader = response.body.getReader()
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (nodeRes.destroyed) {
        await reader.cancel().catch(() => {})
        return
      }
      if (!nodeRes.write(value)) await Promise.race([once(nodeRes, 'drain'), once(nodeRes, 'close')])
    }
    nodeRes.end()
  } catch {
    await reader.cancel().catch(() => {})
    nodeRes.destroy()
  }
}

/** Обработчик для http.createServer: handle(request) → Response. Обрыв соединения отменяет запрос. */
export function createHandler(handle, options = {}) {
  return async (nodeReq, nodeRes) => {
    const controller = new AbortController()
    nodeRes.on('close', () => {
      if (!nodeRes.writableFinished) controller.abort()
    })
    try {
      const request = await toRequest(nodeReq, { ...options, signal: controller.signal })
      await sendResponse(nodeRes, request instanceof Response ? request : await handle(request))
    } catch (e) {
      console.error('request failed', e?.message ?? e)
      if (!nodeRes.headersSent) await sendResponse(nodeRes, jsonError(500, 'Внутренняя ошибка сервера'))
      else nodeRes.destroy()
    }
  }
}

// ---------- Расписание ----------

/** Сколько миллисекунд до ближайшей минуты minute каждого часа (UTC), как cron «minute * * * *». */
export function msUntilMinute(now, minute) {
  const next = new Date(now)
  next.setUTCMinutes(minute, 0, 0)
  if (next.getTime() <= now) next.setUTCHours(next.getUTCHours() + 1)
  return next.getTime() - now
}

/** Запускает task каждый час на минуте minute. Возвращает функцию остановки. */
export function scheduleHourly(minute, task) {
  let timer
  const plan = () => {
    timer = setTimeout(async () => {
      try {
        await task()
      } catch (e) {
        console.error('scheduled task failed', e?.message ?? e)
      }
      plan()
    }, msUntilMinute(Date.now(), minute))
    timer.unref?.()
  }
  plan()
  return () => clearTimeout(timer)
}
