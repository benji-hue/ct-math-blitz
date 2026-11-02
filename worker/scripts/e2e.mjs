#!/usr/bin/env node
/**
 * Сквозная проверка глазами ученика: настоящий браузер открывает мини-апп «как из
 * Telegram» — с подписанным initData в адресе и официальным telegram-web-app.js —
 * и проходит путь ученика: вопрос ИИ, фото решения, разбор ошибки в тренировке.
 * Запросы идут через интерфейс, без служебного ключа: всё как у настоящего ученика.
 *
 *   BOT_TOKEN=… [APP_URL=…] EVAL_IMAGE=solution.png [EVAL_OUT=папка] node scripts/e2e.mjs
 *
 * Скриншоты (JPEG) — в EVAL_OUT; итоги — в консоли и в сводке GitHub Actions.
 * Нужен пакет playwright и Chrome (E2E_CHANNEL=chrome по умолчанию).
 */
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from 'playwright'
import { signInitData } from './lib.mjs'

const { BOT_TOKEN, EVAL_IMAGE } = process.env
if (!BOT_TOKEN) {
  console.error('Нужна переменная BOT_TOKEN')
  process.exit(1)
}
const out = process.env.EVAL_OUT || '.'
mkdirSync(out, { recursive: true })

async function discoverAppUrl() {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/+$/, '')
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getWebhookInfo`)
  const url = (await res.json())?.result?.url ?? ''
  if (!url.endsWith('/bot/webhook')) throw new Error('Не удалось узнать адрес приложения из вебхука — задайте APP_URL')
  return url.slice(0, -'/bot/webhook'.length)
}

const base = await discoverAppUrl()
const user = { id: 900000001, first_name: 'Аня', last_name: 'Тест', username: 'krok_e2e', language_code: 'ru', allows_write_to_pm: true }
const initData = signInitData({ auth_date: String(Math.floor(Date.now() / 1000)), query_id: 'krok-e2e', user: JSON.stringify(user) }, BOT_TOKEN)
const theme = { bg_color: '#17212b', secondary_bg_color: '#232e3c', text_color: '#f5f5f5', hint_color: '#708499', link_color: '#6ab3f3', button_color: '#5288c1', button_text_color: '#ffffff' }
const hash = new URLSearchParams({ tgWebAppData: initData, tgWebAppVersion: '8.0', tgWebAppPlatform: 'android', tgWebAppThemeParams: JSON.stringify(theme) }).toString()

const channel = process.env.E2E_CHANNEL || 'chrome'
const browser = await chromium.launch(channel === 'chromium' ? { args: ['--no-sandbox'] } : { channel, args: ['--no-sandbox'] })
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, locale: 'ru-RU', colorScheme: 'dark' })
const page = await context.newPage()

// Для локальной репетиции без доступа к telegram.org: минимальная заглушка SDK
// (в CI всегда настоящий telegram-web-app.js).
if (process.env.E2E_TELEGRAM_STUB === '1') {
  await page.route('https://telegram.org/js/telegram-web-app.js', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: `(() => {
        const data = new URLSearchParams(location.hash.slice(1)).get('tgWebAppData') || ''
        const user = JSON.parse(new URLSearchParams(data).get('user') || 'null')
        const noop = () => {}
        const button = { show: noop, hide: noop, onClick: noop, offClick: noop, isVisible: false }
        window.Telegram = { WebApp: {
          initData: data, initDataUnsafe: { user }, version: '8.0', platform: 'android', colorScheme: 'dark', isFullscreen: false,
          safeAreaInset: { top: 0, bottom: 0, left: 0, right: 0 }, contentSafeAreaInset: { top: 0, bottom: 0, left: 0, right: 0 },
          ready: noop, expand: noop, onEvent: noop, offEvent: noop, disableVerticalSwipes: noop, requestFullscreen: noop,
          setHeaderColor: noop, setBackgroundColor: noop, setBottomBarColor: noop, isVersionAtLeast: () => true,
          enableClosingConfirmation: noop, disableClosingConfirmation: noop, openLink: noop, openTelegramLink: noop,
          addToHomeScreen: noop, checkHomeScreenStatus: (cb) => cb && cb('unsupported'), requestWriteAccess: (cb) => cb && cb(false),
          BackButton: button, MainButton: { ...button, setText: noop },
          HapticFeedback: { impactOccurred: noop, notificationOccurred: noop, selectionChanged: noop },
          CloudStorage: { getItem: (k, cb) => cb(null, ''), setItem: (k, v, cb) => cb && cb(null, true), removeItem: (k, cb) => cb && cb(null, true), getKeys: (cb) => cb(null, []), getItems: (k, cb) => cb(null, {}) },
        } }
      })()`,
    }),
  )
}
const problems = []
page.on('pageerror', (e) => problems.push(`JS: ${e.message}`))
page.on('response', (r) => {
  if (r.url().includes('/api/') && r.status() >= 400) problems.push(`HTTP ${r.status()} ${new URL(r.url()).pathname}`)
})

const steps = []
async function step(name, fn) {
  const started = Date.now()
  try {
    const detail = await fn()
    steps.push({ name, ok: true, detail, ms: Date.now() - started })
  } catch (e) {
    steps.push({ name, ok: false, detail: String(e.message ?? e).split('\n')[0], ms: Date.now() - started })
    await shot(`fail-${steps.length}`).catch(() => {})
  }
  const s = steps.at(-1)
  console.log(`${s.ok ? '✓' : '✗'} ${name} (${(s.ms / 1000).toFixed(1)} с): ${s.detail}`)
}

const shots = []
async function shot(name) {
  const file = join(out, `${name}.jpg`)
  await page.screenshot({ path: file, type: 'jpeg', quality: 72 })
  shots.push(file)
  return file
}

const copyButtons = () => page.getByRole('button', { name: 'Копировать' })

/** Ждём, пока ИИ допишет ответ: появляется кнопка «Копировать» под новым сообщением. */
async function waitForAnswer(before, timeoutMs = 150_000) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    if ((await copyButtons().count()) > before) {
      const footer = await copyButtons().last().locator('xpath=..').innerText()
      const answer = (await page.locator('.md').allTextContents()).at(-1) ?? ''
      return { footer: footer.replace(/\s+/g, ' ').trim(), answer, ms: Date.now() - started }
    }
    await page.waitForTimeout(500)
  }
  throw new Error(`нет ответа за ${timeoutMs / 1000} с`)
}

async function openTutor(mode) {
  await page.locator('nav').getByRole('button', { name: 'ИИ', exact: true }).click()
  await page.waitForTimeout(800)
  const clear = page.getByRole('button', { name: 'Очистить чат' })
  if (await clear.count()) {
    await clear.click()
    await page.waitForTimeout(400)
  }
  await page.getByRole('button', { name: mode, exact: true }).click()
  await page.waitForTimeout(300)
}

const label = (footer) => footer.split('·').pop()?.trim() ?? '?'

await step('Мини-апп открывается из Telegram', async () => {
  await page.goto(`${base}/#${hash}`, { waitUntil: 'networkidle' })
  await page.waitForFunction(() => Boolean(window.Telegram?.WebApp?.initData), null, { timeout: 15_000 })
  await shot('1-onboarding')
  return 'telegram-web-app.js загружен, initData передан'
})

await step('Демо-профиль для показа', async () => {
  await page.getByText('Посмотреть демо-профиль').click()
  await page.waitForTimeout(1500)
  await shot('2-today')
  return 'главный экран с планом на сегодня'
})

await step('Вопрос репетитору (текст)', async () => {
  await openTutor('Объясни')
  await page.locator('textarea').fill('Объясни метод интервалов для неравенств')
  const before = await copyButtons().count()
  await page.getByRole('button', { name: 'Отправить' }).click()
  const r = await waitForAnswer(before)
  await page.locator('textarea').blur()
  await page.waitForTimeout(400)
  await shot('3-tutor-text')
  if (r.answer.length < 200) throw new Error(`слишком короткий ответ: ${r.answer.length} символов`)
  return `ответила ${label(r.footer)} за ${(r.ms / 1000).toFixed(1)} с, ${r.answer.length} символов`
})

await step('Проверка решения по фото', async () => {
  if (!EVAL_IMAGE) throw new Error('нет EVAL_IMAGE')
  await openTutor('Проверь решение')
  await page.locator('input[type=file]').setInputFiles(EVAL_IMAGE)
  await page.waitForTimeout(1200)
  const before = await copyButtons().count()
  await page.getByRole('button', { name: 'Отправить' }).click()
  const r = await waitForAnswer(before)
  await page.waitForTimeout(400)
  await shot('4-tutor-photo')
  const found = /шаг[еау]?\s*3|3\)|2x\s*=\s*4/i.test(r.answer)
  if (!found) throw new Error(`ошибка в шаге 3 не названа (ответила ${label(r.footer)})`)
  return `ответила ${label(r.footer)} за ${(r.ms / 1000).toFixed(1)} с, ошибка в шаге 3 найдена`
})

await step('Тренировка → ошибка → «Разбор ИИ»', async () => {
  // «Разбор ИИ» дописывает в текущий чат — очищаем его, чтобы видеть именно новый ответ.
  await openTutor('Разбор ошибки')
  await page.locator('nav').getByRole('button', { name: 'Предметы', exact: true }).click()
  await page.waitForTimeout(800)
  await page.getByText('Математика').first().click()
  await page.waitForTimeout(900)
  await page.getByText('Тренировка').first().click()
  await page.waitForTimeout(1200)
  let wrong = false
  for (let i = 0; i < 10 && !wrong; i++) {
    const options = page.locator('ul li button')
    if (await options.count()) await options.nth(1).click()
    else {
      await page.locator('input').first().fill('12345')
      await page.getByRole('button', { name: 'Ответ', exact: true }).click()
    }
    await page.waitForTimeout(700)
    wrong = (await page.getByText('Не совсем').count()) > 0
    if (!wrong) {
      await page.getByRole('button', { name: /Дальше|Итоги/ }).click()
      await page.waitForTimeout(600)
    }
  }
  if (!wrong) throw new Error('не удалось ошибиться за 10 заданий')
  await shot('5-practice-wrong')
  await page.getByRole('button', { name: 'Разбор ИИ' }).click()
  const r = await waitForAnswer(0)
  await page.waitForTimeout(400)
  await shot('6-mistake-review')
  if (!/где ошибка/i.test(r.answer)) throw new Error('в разборе нет раздела «Где ошибка»')
  return `ответила ${label(r.footer)} за ${(r.ms / 1000).toFixed(1)} с, структура разбора на месте`
})

await step('Возврат к заданию из разбора', async () => {
  await page.getByText('Вернуться к заданию').click()
  await page.waitForTimeout(1200)
  if (!(await page.getByText('Не совсем').count())) throw new Error('после возврата не видно разобранного задания')
  return 'вернулись к тому же заданию с вердиктом'
})

await browser.close()

const failed = steps.filter((s) => !s.ok)
const summary = [
  '## Крок: сквозная проверка в браузере (как у ученика)',
  '',
  `Приложение: ${base}. Браузер: Chrome, экран 390×844, запуск «из Telegram».`,
  '',
  '| Шаг | Итог | Время |',
  '| --- | --- | --- |',
  ...steps.map((s) => `| ${s.ok ? '✅' : '❌'} ${s.name} | ${s.detail.replaceAll('|', '\\|')} | ${(s.ms / 1000).toFixed(1)} с |`),
  '',
  problems.length ? `**Замечания:** ${[...new Set(problems)].slice(0, 10).join('; ')}` : 'Ошибок в консоли и запросах к API нет.',
  '',
].join('\n')
writeFileSync(join(out, 'e2e-report.md'), summary)
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary)
console.log(`\n${summary}`)
console.log(`Скриншоты: ${shots.join(', ')}`)
process.exit(failed.length ? 1 : 0)
