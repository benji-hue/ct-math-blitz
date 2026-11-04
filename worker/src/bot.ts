import { confirmLogin, pendingLogin } from './account'
import { complete } from './ai/providers'
import { buildSystemPrompt } from './ai/prompts'
import type { Env } from './env'
import { consume, limitFor, track } from './limits'
import { botApi, openAppKeyboard, TelegramError } from './telegram'

/**
 * Telegram-бот. Обрабатывает команды и отвечает на вопросы прямо в чате —
 * короткий ответ ИИ плюс кнопка «Продолжить в приложении».
 * Вебхук защищён секретом: Telegram присылает его в заголовке
 * X-Telegram-Bot-Api-Secret-Token, чужие запросы отбрасываются.
 */

interface Update {
  update_id: number
  message?: {
    message_id: number
    chat: { id: number; type: string }
    from?: { id: number; first_name?: string; username?: string; is_bot?: boolean }
    text?: string
  }
  /** Нажатие инлайн-кнопки — подтверждение входа на сайте. */
  callback_query?: {
    id: string
    from: { id: number; first_name?: string; username?: string; is_bot?: boolean }
    data?: string
    message?: { message_id: number; chat: { id: number; type: string } }
  }
}

const WELCOME = (name: string) =>
  `Привет, ${name || 'абитуриент'}! Я «Крок» — ИИ-репетитор для выпускников: готовлю к ЦЭ и ЦТ.

Что умею:
• задания по всем 14 предметам в формате РИКЗ;
• повторение по алгоритму FSRS — ровно тогда, когда тема начинает забываться;
• разбор ошибок и проверка решений по фото;
• прогноз балла и план подготовки.

Открой приложение кнопкой ниже. А короткий вопрос можно задать прямо здесь, в чате.`

const HELP = `Команды:
/start — открыть приложение
/remind — включить или выключить напоминания
/stats — моя серия и повторения
/help — эта справка

Просто напиши вопрос — например «как найти вершину параболы» — и я коротко отвечу.`

async function upsertUser(env: Env, from: { id: number; first_name?: string; username?: string } | undefined): Promise<void> {
  if (!env.DB || !from) return
  const now = Date.now()
  await env.DB.prepare(
    `INSERT INTO users (id, first_name, username, can_message, created_at, updated_at)
     VALUES (?1, ?2, ?3, 1, ?4, ?4)
     ON CONFLICT(id) DO UPDATE SET first_name = excluded.first_name, username = excluded.username, can_message = 1, updated_at = excluded.updated_at`,
  )
    .bind(from.id, from.first_name ?? '', from.username ?? null, now)
    .run()
}

async function reply(env: Env, chatId: number, text: string, withButton = false): Promise<void> {
  await botApi(env.BOT_TOKEN!, 'sendMessage', {
    chat_id: chatId,
    text,
    link_preview_options: { is_disabled: true },
    ...(withButton ? { reply_markup: openAppKeyboard(env.MINI_APP_URL, 'Открыть Крок') } : {}),
  })
}

// ---------- Вход на сайте через бота (account.ts) ----------

/** /start login_<nonce>: показать код и спросить подтверждение — кнопкой, а не автоматически. */
async function askLogin(env: Env, chatId: number, nonce: string): Promise<void> {
  const request = env.DB ? await pendingLogin(env, nonce) : null
  if (!request) {
    await reply(env, chatId, 'Ссылка для входа устарела или уже использована. Нажми «Войти через Telegram» на сайте ещё раз.')
    return
  }
  await botApi(env.BOT_TOKEN!, 'sendMessage', {
    chat_id: chatId,
    text: `Вход на сайт «Крок»\n\nКод на сайте: ${request.code}\n\nПодтверди, только если ты сам сейчас входишь на сайт и видишь там этот же код. После входа прогресс будет общим на сайте и в Telegram.`,
    reply_markup: {
      inline_keyboard: [[{ text: `✅ Да, это я — код ${request.code}`, callback_data: `login:${nonce}` }], [{ text: 'Отмена', callback_data: 'login_cancel' }]],
    },
  })
}

async function handleCallback(env: Env, query: NonNullable<Update['callback_query']>): Promise<void> {
  const data = query.data ?? ''
  const chatId = query.message?.chat.id
  const messageId = query.message?.message_id
  const edit = (text: string) =>
    chatId && messageId ? botApi(env.BOT_TOKEN!, 'editMessageText', { chat_id: chatId, message_id: messageId, text }).catch(() => {}) : Promise.resolve()
  if (query.from.is_bot || (query.message && query.message.chat.type !== 'private')) {
    await botApi(env.BOT_TOKEN!, 'answerCallbackQuery', { callback_query_id: query.id })
    return
  }
  if (data === 'login_cancel') {
    await botApi(env.BOT_TOKEN!, 'answerCallbackQuery', { callback_query_id: query.id, text: 'Вход отменён' })
    await edit('Вход на сайт отменён.')
    return
  }
  if (data.startsWith('login:') && env.DB) {
    await upsertUser(env, query.from)
    const ok = await confirmLogin(env, data.slice(6), { id: query.from.id, first_name: query.from.first_name ?? '', username: query.from.username })
    await botApi(env.BOT_TOKEN!, 'answerCallbackQuery', { callback_query_id: query.id, text: ok ? 'Вход подтверждён' : 'Ссылка устарела' })
    await edit(ok ? '✅ Вход подтверждён. Вернись на сайт — прогресс подтянется сам.' : 'Ссылка для входа устарела. Нажми «Войти через Telegram» на сайте ещё раз.')
    if (ok) await track(env, 'login_site').catch(() => {})
    return
  }
  await botApi(env.BOT_TOKEN!, 'answerCallbackQuery', { callback_query_id: query.id })
}

async function handleUpdate(env: Env, update: Update): Promise<void> {
  if (update.callback_query) return handleCallback(env, update.callback_query)
  const message = update.message
  if (!message?.text || message.chat.type !== 'private' || message.from?.is_bot) return
  const chatId = message.chat.id
  const text = message.text.trim()
  const [command, payload] = text.split(/\s+/)

  if (command === '/start' && payload?.startsWith('login_')) {
    await upsertUser(env, message.from)
    await askLogin(env, chatId, payload.slice(6))
    return
  }
  if (command === '/start') {
    await upsertUser(env, message.from)
    await track(env, 'bot_start').catch(() => {})
    await reply(env, chatId, WELCOME(message.from?.first_name ?? ''), true)
    return
  }
  if (command === '/help') {
    await reply(env, chatId, HELP, true)
    return
  }
  if (command === '/remind') {
    if (!env.DB) return reply(env, chatId, 'Напоминания пока не настроены на сервере.')
    await upsertUser(env, message.from)
    const row = await env.DB.prepare('UPDATE users SET reminders = 1 - reminders, updated_at = ?2 WHERE id = ?1 RETURNING reminders, remind_hour')
      .bind(chatId, Date.now())
      .first<{ reminders: number; remind_hour: number }>()
    await reply(
      env,
      chatId,
      row?.reminders
        ? `Напоминания включены: напишу в ${row.remind_hour}:00, если в этот день ты ещё не занимался. Время меняется в профиле приложения.`
        : 'Напоминания выключены. Включить снова — /remind.',
    )
    return
  }
  if (command === '/stats') {
    const row = env.DB ? await env.DB.prepare('SELECT streak, due, last_study_day FROM users WHERE id = ?1').bind(chatId).first<{ streak: number; due: number; last_study_day: string | null }>() : null
    await reply(
      env,
      chatId,
      row ? `Серия: ${row.streak} дн.\nЖдут повторения: ${row.due}\nПоследнее занятие: ${row.last_study_day ?? '—'}` : 'Статистика появится после первых занятий в приложении.',
      true,
    )
    return
  }
  if (text.startsWith('/')) {
    await reply(env, chatId, HELP)
    return
  }

  // Вопрос в свободной форме — короткий ответ ИИ.
  const used = await consume(env, `tg:${chatId}`, 'chat')
  if (used > limitFor(env, 'chat', false)) {
    await reply(env, chatId, 'На сегодня лимит вопросов исчерпан — он обновится в полночь. Задания в приложении доступны без ограничений.', true)
    return
  }
  await botApi(env.BOT_TOKEN!, 'sendChatAction', { chat_id: chatId, action: 'typing' }).catch(() => {})
  try {
    const { text: answer } = await complete(env, {
      system: buildSystemPrompt({ mode: 'bot' }),
      messages: [{ role: 'user', content: text.slice(0, 2000) }],
      maxTokens: 600,
      temperature: 0.4,
    })
    await reply(env, chatId, answer.slice(0, 3900) || 'Не получилось ответить — попробуй переформулировать вопрос.', true)
    await track(env, 'bot_question').catch(() => {})
  } catch {
    await reply(env, chatId, 'ИИ сейчас недоступен. Попробуй через минуту или открой приложение.', true)
  }
}

export async function handleWebhook(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 })
  if (!env.BOT_TOKEN || !env.WEBHOOK_SECRET) return new Response('Bot is not configured', { status: 503 })
  if (req.headers.get('X-Telegram-Bot-Api-Secret-Token') !== env.WEBHOOK_SECRET) return new Response('Forbidden', { status: 403 })
  let update: Update
  try {
    update = (await req.json()) as Update
  } catch {
    return new Response('Bad Request', { status: 400 })
  }
  // Отвечаем Telegram сразу, работу доделываем в фоне — иначе он повторит доставку.
  ctx.waitUntil(
    handleUpdate(env, update).catch((e) => {
      if (e instanceof TelegramError && e.code === 403 && update.message && env.DB) {
        return env.DB.prepare('UPDATE users SET can_message = 0 WHERE id = ?1').bind(update.message.chat.id).run()
      }
      console.error('bot update failed', (e as Error).message)
    }),
  )
  return new Response('ok')
}
