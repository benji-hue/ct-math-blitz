#!/usr/bin/env node
/**
 * «Пробный вариант»: проверка ИИ «Крока» на развёрнутом приложении.
 *
 * Ученик решает вариант с намеренными ошибками (scripts/eval/variant.mjs), а ИИ
 * должен найти причину каждой ошибки. Плюс сценарии: проверка решения текстом
 * и по фото, сократический режим, объяснение темы, антистресс, безопасность,
 * попытка выведать промпт, белорусский язык, генерация заданий, разбор прогресса,
 * разбор темы «Объясни» (по названию и по фото параграфа).
 *
 *   BOT_TOKEN=… [APP_URL=…] [MODELS=@cf/qwen/qwen3.8-27b,gemini:…] [SCENARIOS=mistake:m-log,…]
 *   [FULL_MODELS=1] [EVAL_IMAGES=папка] [EVAL_IMAGE=solution.png] [EVAL_OUT=папка] [EVAL_PACE_MS=4000] node scripts/ai-eval.mjs
 *
 * Между сценариями — пауза EVAL_PACE_MS (по умолчанию 4 с): у бесплатного ключа Gemini
 * около 15 запросов в минуту на всех, и прогон без пауз отнимал бы лимит у учеников.
 *
 * «Фото» — скриншоты страниц из scripts/eval: solution.html (решение) и paragraph.html
 * (параграф учебника). В EVAL_IMAGES лежат <имя>.png; EVAL_IMAGE — по-старому, только
 * решение. Сценарии без своего фото пропускаются.
 *
 * Запросы идут как от ученика из Telegram (подписанный initData) плюс служебный
 * ключ X-Krok-Eval: он снимает дневные лимиты и позволяет выбрать модель.
 * Пустой MODELS — та же цепочка моделей, что у учеников. Полный вариант получают
 * первые FULL_MODELS моделей (по умолчанию одна), остальные — сокращённый набор CORE:
 * бесплатный лимит Workers AI общий с учениками. Если лимит кончился — прогон
 * останавливается, чтобы не оставить бота без ИИ.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { evalKey, signInitData } from './lib.mjs'
import { CORE, SCENARIOS, STUDENT } from './eval/variant.mjs'

const { BOT_TOKEN } = process.env
if (!BOT_TOKEN) {
  console.error('Нужна переменная BOT_TOKEN')
  process.exit(1)
}
const telegram = process.env.TELEGRAM_API_BASE || 'https://api.telegram.org'
const outDir = process.env.EVAL_OUT || '.'
mkdirSync(outDir, { recursive: true })

async function discoverAppUrl() {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/+$/, '')
  const res = await fetch(`${telegram}/bot${BOT_TOKEN}/getWebhookInfo`)
  const url = (await res.json())?.result?.url ?? ''
  if (!url.endsWith('/bot/webhook')) throw new Error('Не удалось узнать адрес приложения из вебхука бота — задайте APP_URL')
  return url.slice(0, -'/bot/webhook'.length)
}

const base = await discoverAppUrl()
// «default» — цепочка моделей, как у учеников (без выбора модели).
const models = (process.env.MODELS ?? '')
  .split(',')
  .map((m) => m.trim())
  .filter(Boolean)
  .map((m) => (m === 'default' ? null : m))
const onlyScenarios = new Set(
  (process.env.SCENARIOS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
)
const scenarios = SCENARIOS.filter((s) => !onlyScenarios.size || onlyScenarios.has(s.id))
function loadImage(name) {
  const path = name === 'solution' && process.env.EVAL_IMAGE ? process.env.EVAL_IMAGE : process.env.EVAL_IMAGES ? join(process.env.EVAL_IMAGES, `${name}.png`) : null
  return path && existsSync(path) ? readFileSync(path).toString('base64') : null
}
const images = Object.fromEntries(['solution', 'paragraph'].map((name) => [name, loadImage(name)]))
/** Фото сценария: true — решение ученика (как раньше), строка — имя страницы. */
const imageOf = (scenario) => (scenario.image ? images[scenario.image === true ? 'solution' : scenario.image] : null)
const photoPayload = (scenario) => (scenario.image ? { image: { mime: 'image/png', data: imageOf(scenario) } } : {})
const JSON_ROUTES = { generate: '/api/ai/generate', analyze: '/api/ai/analyze' }

const headers = () => ({
  'Content-Type': 'application/json',
  Authorization: `tma ${signInitData({ auth_date: String(Math.floor(Date.now() / 1000)), query_id: 'krok-eval', user: JSON.stringify({ id: 1, first_name: 'Eval' }) }, BOT_TOKEN)}`,
  'X-Krok-Eval': evalKey(BOT_TOKEN),
})

async function runChat(scenario, model) {
  const body = {
    mode: scenario.mode,
    messages: [...(scenario.history ?? []), { role: 'user', content: scenario.message }],
    subject: scenario.subject,
    subjectTitle: scenario.subjectTitle,
    topic: scenario.topic,
    profile: STUDENT,
    task: scenario.task,
    refs: scenario.refs,
    ...photoPayload(scenario),
    // У сценария может быть своя модель и уровень рассуждений (эксперименты).
    ...((scenario.model ?? model) ? { model: scenario.model ?? model } : {}),
    ...(scenario.reasoning ? { reasoning: scenario.reasoning } : {}),
  }
  const started = Date.now()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 120_000)
  const result = { text: '', ttft: null, ms: 0, meta: null, error: null }
  try {
    const res = await fetch(`${base}/api/ai/chat`, { method: 'POST', headers: headers(), body: JSON.stringify(body), signal: controller.signal })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      result.error = `HTTP ${res.status}: ${data.error ?? ''}`
      return result
    }
    const decoder = new TextDecoder()
    let buffer = ''
    for await (const chunk of res.body) {
      buffer += decoder.decode(chunk, { stream: true })
      const events = buffer.split('\n\n')
      buffer = events.pop() ?? ''
      for (const raw of events) {
        const line = raw.split('\n').find((l) => l.startsWith('data: '))
        if (!line) continue
        const event = JSON.parse(line.slice(6))
        if (event.type === 'meta') result.meta = { provider: event.provider, model: event.model, skipped: event.skipped ?? [] }
        if (event.type === 'delta') {
          if (result.ttft === null) result.ttft = Date.now() - started
          result.text += event.text
        }
        if (event.type === 'error') result.error = event.detail ? `${event.message} (${event.detail})` : event.message
      }
    }
  } catch (e) {
    result.error = e.name === 'AbortError' ? 'таймаут 120 с' : String(e.message ?? e)
  } finally {
    clearTimeout(timer)
    result.ms = Date.now() - started
  }
  return result
}

async function runJson(path, scenario, model) {
  const started = Date.now()
  try {
    const res = await fetch(`${base}${path}`, { method: 'POST', headers: headers(), body: JSON.stringify({ ...scenario.body, ...photoPayload(scenario), ...(model ? { model } : {}) }) })
    const data = await res.json().catch(() => ({}))
    const ms = Date.now() - started
    if (!res.ok) return { data, ms, error: `HTTP ${res.status}: ${data.error ?? ''}${data.detail ? ` (${data.detail})` : ''}` }
    return { data, ms, error: null }
  } catch (e) {
    return { data: null, ms: Date.now() - started, error: String(e.message ?? e) }
  }
}

/** Автопроверки для генерации и разбора — формат ответа. */
function structuralChecks(scenario, data) {
  if (scenario.kind === 'generate') {
    const tasks = Array.isArray(data?.tasks) ? data.tasks : []
    const valid = tasks.filter((t) => {
      if (typeof t?.q !== 'string' || typeof t?.explain !== 'string') return false
      if (Array.isArray(t.options)) return t.options.length === 5 && Number.isInteger(Number(t.answer)) && Number(t.answer) >= 0 && Number(t.answer) < t.options.length
      return t.answer !== undefined && String(t.answer).trim() !== ''
    })
    return [
      ['перепроверку прошли хотя бы 2 задания', tasks.length >= 2],
      ['все задания в верном формате', tasks.length > 0 && valid.length === tasks.length],
    ]
  }
  const weak = ['логарифм', 'неравенств', 'тригонометр', 'кинематик', 'н и нн', 'количество вещества']
  const gaps = Array.isArray(data?.gaps) ? data.gaps : []
  const week = Array.isArray(data?.week) ? data.week : []
  return [
    ['есть сводка и совет', typeof data?.summary === 'string' && data.summary.length > 20 && typeof data?.tip === 'string'],
    ['пробелы — из слабых тем', gaps.length >= 2 && gaps.every((g) => weak.some((w) => String(g?.topic ?? '').toLowerCase().includes(w)))],
    ['план ровно на 7 дней', week.length === 7],
    // День отдыха с 0 минут — нормально (распределённая практика), но учиться — хотя бы 4 дня.
    ['нагрузка реалистичная (≤ 90 мин/день)', week.length > 0 && week.every((d) => Number(d?.minutes) >= 0 && Number(d?.minutes) <= 90) && week.filter((d) => Number(d?.minutes) > 0).length >= 4],
  ]
}

function formatGenerate(data) {
  const tasks = Array.isArray(data?.tasks) ? data.tasks : []
  const rejected = Array.isArray(data?.rejected) ? data.rejected : []
  const audit = data?.drafts ? `Черновиков: ${data.drafts}, прошли первичный отсев: ${data.screened}, подтверждены проверяющей моделью (${data.verifier ?? '—'}): ${tasks.length}.\n` : ''
  const dropped = rejected.length ? `\nОтклонены:\n${rejected.map((t) => `- ${t?.q ?? '?'} (ключ: ${Array.isArray(t?.options) ? `вариант ${Number(t.answer) + 1}` : t?.answer})`).join('\n')}` : ''
  return audit + tasks
    .map((t, i) => {
      const options = Array.isArray(t.options) ? `\n   Варианты: ${t.options.map((o, j) => `${j + 1}) ${o}`).join('; ')}\n   Ответ: вариант ${Number(t.answer) + 1}` : `\n   Ответ: ${Array.isArray(t.answer) ? t.answer.join(' / ') : t.answer}`
      return `${i + 1}. [${Array.isArray(t.options) ? 'A' : 'B'}, уровень ${t.level}] ${t.q}${options}\n   Решение: ${t.explain}`
    })
    .join('\n') + dropped
}

function formatAnalysis(data) {
  if (!data) return ''
  const { _eval, ...rest } = data
  return JSON.stringify(rest, null, 2)
}

// ---------- Прогон ----------

const runs = []
const targets = models.length ? models : [null]
const fullModels = Math.max(1, Number(process.env.FULL_MODELS) || 1)
const isQuotaError = (error) => /4006|neuron|allocation|quota|429|rate limit|квота исчерпана/i.test(error ?? '') && !/лимит запросов в минуту/.test(error ?? '')
const pace = Math.max(0, Number(process.env.EVAL_PACE_MS ?? 4000) || 0)
let stopAll = false
const noPhoto = Object.entries(images).filter(([, data]) => !data).map(([name]) => name)
console.log(`Приложение: ${base}\nМодели: ${targets.map((m) => m ?? 'цепочка по умолчанию').join(', ')}\nСценарии: ${scenarios.length}${noPhoto.length ? ` (нет фото: ${noPhoto.join(', ')} — эти сценарии пропускаются)` : ''}\n`)

for (const [index, model] of targets.entries()) {
  if (stopAll) break
  let failuresInRow = 0
  const planned = index < fullModels || onlyScenarios.size ? scenarios : scenarios.filter((s) => CORE.includes(s.id))
  for (const scenario of planned) {
    if (stopAll) break
    if (scenario.image && !imageOf(scenario)) continue
    // Модель недоступна (например, только на платном тарифе) — не тратим время на остальные сценарии.
    if (failuresInRow >= 3) {
      runs.push({ model, scenario: scenario.id, title: scenario.title, skipped: true })
      continue
    }
    let run
    if (scenario.kind === 'chat') {
      const r = await runChat(scenario, model)
      const checks = r.error ? [] : scenario.checks.map(([name, test]) => [name, Boolean(test(r.text))])
      run = { ...r, checks }
    } else {
      const r = await runJson(JSON_ROUTES[scenario.kind], scenario, model)
      const checks = r.error ? [] : structuralChecks(scenario, r.data)
      const meta = scenario.kind === 'analyze' ? r.data?._eval ?? null : { provider: r.data?.provider, model: r.data?.model, skipped: r.data?.skipped ?? [] }
      const format = scenario.kind === 'generate' ? formatGenerate : formatAnalysis
      run = { ...r, meta, text: r.error ? '' : format(r.data), checks }
    }
    failuresInRow = run.error ? failuresInRow + 1 : 0
    if (pace) await new Promise((resolve) => setTimeout(resolve, pace))
    if (isQuotaError(run.error)) {
      stopAll = true
      console.log('::warning title=Лимит Workers AI::Бесплатный дневной лимит исчерпан — прогон остановлен, чтобы не оставить бота без ИИ')
    }
    const passed = run.checks.filter(([, ok]) => ok).length
    runs.push({ model, scenario: scenario.id, title: scenario.title, expected: scenario.expected, task: scenario.task, message: scenario.message, ...run, passed, total: run.checks.length })
    const label = run.error ? `ОШИБКА: ${run.error.slice(0, 300)}` : `${passed}/${run.checks.length} проверок, ${(run.ms / 1000).toFixed(1)} с${run.ttft ? ` (первый токен ${(run.ttft / 1000).toFixed(1)} с)` : ''}, ответила ${run.meta?.model ?? '?'}`
    console.log(`[${model ?? 'default'}] ${scenario.id}: ${label}`)
  }
}

// ---------- Отчёт ----------

const byModel = new Map()
for (const run of runs) {
  const key = run.model ?? 'цепочка по умолчанию'
  if (!byModel.has(key)) byModel.set(key, [])
  byModel.get(key).push(run)
}

const lines = ['# Пробный вариант: проверка ИИ «Крока»', '', `Приложение: ${base}. Дата: ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC.`, '']
lines.push('| Модель | Сценариев без ошибок | Автопроверки | Среднее время | Первый токен |', '| --- | --- | --- | --- | --- |')
for (const [model, list] of byModel) {
  const done = list.filter((r) => !r.skipped && !r.error)
  const passed = done.reduce((s, r) => s + r.passed, 0)
  const total = done.reduce((s, r) => s + r.total, 0)
  const avg = done.length ? done.reduce((s, r) => s + r.ms, 0) / done.length / 1000 : 0
  const ttfts = done.filter((r) => r.ttft).map((r) => r.ttft)
  const ttft = ttfts.length ? ttfts.reduce((s, v) => s + v, 0) / ttfts.length / 1000 : 0
  lines.push(`| ${model} | ${done.length}/${list.length} | ${passed}/${total} | ${avg.toFixed(1)} с | ${ttft ? `${ttft.toFixed(1)} с` : '—'} |`)
}

for (const [model, list] of byModel) {
  lines.push('', `## ${model}`)
  for (const run of list) {
    lines.push('', `### ${run.title} (\`${run.scenario}\`)`)
    if (run.skipped) {
      lines.push('', '_Пропущено: модель трижды подряд не ответила._')
      continue
    }
    if (run.expected) lines.push('', `**Ожидаем:** ${run.expected}`)
    if (run.task) lines.push('', `**Задание:** ${run.task.q}${run.task.options ? ` Варианты: ${run.task.options.map((o, i) => `${i + 1}) ${o}`).join('; ')}.` : ''} **Ответ ученика:** ${run.task.given}. **Верно:** ${run.task.correct}.`)
    else if (run.message) lines.push('', `**Сообщение ученика:** ${run.message.replaceAll('\n', ' ')}`)
    if (run.meta?.skipped?.length) lines.push('', `**Модели, отказавшие до ответа:** ${run.meta.skipped.join(' | ')}`)
    if (run.error) {
      lines.push('', `**Ошибка:** ${run.error}`)
      continue
    }
    lines.push('', `**Ответила:** ${run.meta?.provider ?? '?'}/${run.meta?.model ?? '?'} за ${(run.ms / 1000).toFixed(1)} с${run.ttft ? `, первый токен ${(run.ttft / 1000).toFixed(1)} с` : ''}.`)
    if (run.checks.length) lines.push('', `**Автопроверки ${run.passed}/${run.total}:** ${run.checks.map(([name, ok]) => `${ok ? '✅' : '❌'} ${name}`).join('; ')}`)
    lines.push('', '<details open><summary>Ответ ИИ</summary>', '', '```text', run.text.trim().slice(0, 6000), '```', '', '</details>')
  }
}

// Обезличенная статистика маршрута ИИ за неделю (какая модель отвечала ученикам и откуда).
try {
  const res = await fetch(`${base}/api/admin/stats`, { headers: headers() })
  const events = res.ok ? ((await res.json()).events ?? []).filter((e) => /^(route|gemini|failover):/.test(e.name)) : []
  lines.push('', '## Маршрут ИИ у учеников за неделю', '', events.length ? '| День | Событие | Сколько |\n| --- | --- | --- |' : '_Пока нет данных._')
  for (const e of events) lines.push(`| ${e.day} | \`${e.name}\` | ${e.count} |`)
} catch {
  lines.push('', '_Статистику получить не удалось._')
}

const report = lines.join('\n')
writeFileSync(join(outDir, 'eval-report.md'), report)
writeFileSync(join(outDir, 'eval-results.json'), JSON.stringify({ base, date: new Date().toISOString(), runs }, null, 2))
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, report.slice(0, 900_000))
console.log(`\n===== ОТЧЁТ =====\n${report}`)
