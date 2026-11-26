import { SUBJECT_LIST, SUBJECTS } from '../../src/domain/subjects'
import type { SubjectId } from '../../src/domain/types'
import { classifyExam, EXAMS } from './ai/exam-intake'
import type { Env } from './env'
import { consume, limitFor } from './limits'
import { botApi } from './telegram'

interface TelegramAttachment {
  file_id: string
  file_unique_id: string
  file_size?: number
}

export interface VariantMessage {
  message_id: number
  photo?: TelegramAttachment[]
  document?: TelegramAttachment & { mime_type?: string; file_name?: string }
}

interface DraftFile {
  id: string
  unique: string
  message: number
  sentAsPhoto: boolean
}

interface Draft {
  draft_id: string
  subject: SubjectId
  kind: 'pdf' | 'photo'
  files: string
}

const MAX_PHOTOS = 8
const MAX_BYTES = 12 * 1024 * 1024
const DRAFT_TTL = 30 * 60_000
const LOCK_TIME = 90_000

const feedback = {
  wrong_subject: 'Предмет на страницах не совпадает с выбранным. Нажми /upload и выбери нужный предмет.',
  not_exam: 'Не удалось распознать вариант белорусского РТ, ЦТ или ЦЭ. Подойдёт комплект экзаменационных заданий прошлых лет.',
  unreadable: 'Не хватает разборчивых страниц. Нажми /upload и отправь чёткие фото целиком или PDF.',
  missing_year: 'Не виден год или тип экзамена. Нажми /upload и отправь обложку с годом вместе со страницами заданий.',
}

async function tell(env: Env, chatId: number, text: string, keyboard?: { text: string; callback_data: string }[][]) {
  await botApi(env.BOT_TOKEN!, 'sendMessage', {
    chat_id: chatId,
    text,
    link_preview_options: { is_disabled: true },
    ...(keyboard ? { reply_markup: { inline_keyboard: keyboard } } : {}),
  })
}

const subjectButtons = SUBJECT_LIST.map(({ id, short }) => ({ text: short, callback_data: 'variant:subject:' + id }))

export async function showSubjectPicker(env: Env, chatId: number) {
  if (!env.DB || !env.GEMINI_API_KEY) return tell(env, chatId, 'Приём вариантов пока недоступен.')
  const rows = Array.from({ length: Math.ceil(subjectButtons.length / 2) }, (_, i) => subjectButtons.slice(i * 2, i * 2 + 2))
  return tell(env, chatId, '📚 Какой предмет в этом варианте?', rows)
}

export async function variantCallback(env: Env, chatId: number, data: string) {
  const db = env.DB
  if (!db || !env.GEMINI_API_KEY) return tell(env, chatId, 'Приём вариантов пока недоступен.')
  const [, action, value] = data.split(':')
  if (action === 'subject') {
    const subject = SUBJECT_LIST.find(({ id }) => id === value)
    if (!subject) return
    const now = Date.now()
    const draftId = crypto.randomUUID()
    await db.prepare('DELETE FROM bot_variant_drafts WHERE expires_at <= ?1 AND lock_until <= ?1').bind(now).run()
    const draft = await db.prepare(
      'INSERT INTO bot_variant_drafts (chat_id, draft_id, subject, expires_at) VALUES (?1, ?2, ?3, ?4) ' +
      "ON CONFLICT(chat_id) DO UPDATE SET draft_id = excluded.draft_id, subject = excluded.subject, expires_at = excluded.expires_at, files = '[]', kind = NULL, lock_until = 0 " +
      'WHERE bot_variant_drafts.lock_until <= ?5 RETURNING draft_id',
    ).bind(chatId, draftId, subject.id, now + DRAFT_TTL, now).first()
    if (!draft) return tell(env, chatId, 'Проверяю предыдущий вариант. Дождись результата.')
    return tell(env, chatId,
      subject.title + '\n\nПришли один PDF до 12 МБ или до 8 фото одного варианта. Добавь страницу, где видны тип экзамена и год. PDF начну проверять сразу. Для фото нажми «Проверить фото», когда загрузятся все страницы.\n\nМатериал будет передан Gemini для проверки. Присылай страницы без личных данных.',
      [
        [{ text: 'Проверить фото', callback_data: 'variant:check:' + draftId }],
        [{ text: 'Отменить', callback_data: 'variant:cancel:' + draftId }],
      ],
    )
  }
  if (action === 'check' && value) return checkDraft(env, chatId, value)
  if (action === 'cancel' && value) {
    const result = await db.prepare('DELETE FROM bot_variant_drafts WHERE chat_id = ?1 AND draft_id = ?2 AND lock_until <= ?3')
      .bind(chatId, value, Date.now()).run()
    if (result.meta.changes) return tell(env, chatId, 'Загрузка отменена. Отправить другой вариант можно через /upload.')
    return tell(env, chatId, 'Эта загрузка уже закрыта или проверяется.')
  }
}

export async function receiveVariantFile(env: Env, chatId: number, message: VariantMessage) {
  const db = env.DB
  if (!db || !env.GEMINI_API_KEY) return tell(env, chatId, 'Приём вариантов пока недоступен.')
  const now = Date.now()
  const draft = await db.prepare('SELECT draft_id FROM bot_variant_drafts WHERE chat_id = ?1 AND expires_at > ?2')
    .bind(chatId, now).first<{ draft_id: string }>()
  if (!draft) return tell(env, chatId, 'Начни с /upload и выбери предмет. Потом пришли PDF или фото варианта.')
  const photo = message.photo?.at(-1)
  const file = photo ?? message.document
  const mime = message.document?.mime_type ?? ''
  const isPdf = !photo && (mime === 'application/pdf' || /\.pdf$/i.test(message.document?.file_name ?? ''))
  const isImage = photo || mime === 'image/jpeg' || mime === 'image/png' || /\.(jpe?g|png)$/i.test(message.document?.file_name ?? '')
  if (!file || (!isPdf && !isImage)) return tell(env, chatId, 'Подойдут PDF, JPEG или PNG.')
  if ((file.file_size ?? 0) > MAX_BYTES) return tell(env, chatId, 'Файл больше 12 МБ. Пришли уменьшенную копию.')

  const kind = isPdf ? 'pdf' : 'photo'
  const entry: DraftFile = { id: file.file_id, unique: file.file_unique_id, message: message.message_id, sentAsPhoto: Boolean(photo) }
  const added = await db.prepare(
    "UPDATE bot_variant_drafts SET kind = ?1, files = json_insert(files, '$[#]', json(?2)) " +
    'WHERE chat_id = ?3 AND draft_id = ?4 AND expires_at > ?5 AND lock_until <= ?5 ' +
    'AND (kind IS NULL OR (kind = ?1 AND ?1 = \'photo\')) AND json_array_length(files) < ?6 ' +
    "AND NOT EXISTS (SELECT 1 FROM json_each(files) WHERE json_extract(value, '$.unique') = ?7) RETURNING files",
  ).bind(kind, JSON.stringify(entry), chatId, draft.draft_id, now, MAX_PHOTOS, entry.unique).first<{ files: string }>()
  if (!added) {
    const current = await db.prepare('SELECT files, lock_until FROM bot_variant_drafts WHERE chat_id = ?1 AND draft_id = ?2')
      .bind(chatId, draft.draft_id).first<{ files: string; lock_until: number }>()
    if (current && (JSON.parse(current.files) as DraftFile[]).some(({ unique }) => unique === entry.unique)) return
    if (current && current.lock_until > now) return tell(env, chatId, 'Вариант уже проверяется.')
    return tell(env, chatId, 'Можно отправить один PDF или до 8 разных фото. Для новой загрузки нажми /upload.')
  }
  if (isPdf) return checkDraft(env, chatId, draft.draft_id)
  if ((JSON.parse(added.files) as DraftFile[]).length === 1) {
    return tell(env, chatId, 'Фото получено. Можно дослать остальные страницы, затем нажать «Проверить фото».',
      [[{ text: 'Проверить фото', callback_data: 'variant:check:' + draft.draft_id }]])
  }
}

class InvalidFile extends Error {}

function sniff(bytes: Uint8Array) {
  if (bytes.length < 8) throw new InvalidFile('Файл пустой или повреждён.')
  if (String.fromCharCode(...bytes.subarray(0, 5)) === '%PDF-') return 'application/pdf'
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg'
  if ([137, 80, 78, 71, 13, 10, 26, 10].every((value, i) => bytes[i] === value)) return 'image/png'
  throw new InvalidFile('Файл не открылся как PDF, JPEG или PNG.')
}

async function download(env: Env, file: DraftFile, limit: number, signal: AbortSignal) {
  const { file_path, file_size } = await botApi<{ file_path?: string; file_size?: number }>(
    env.BOT_TOKEN!, 'getFile', { file_id: file.id }, signal,
  )
  if (!file_path || !/^[A-Za-z0-9_.\/-]{1,256}$/.test(file_path) || file_path.split('/').some((part) => !part || part === '.' || part === '..')) {
    throw new Error('Telegram не вернул путь к файлу')
  }
  const sizeError = () => new InvalidFile('Суммарный размер материалов больше 12 МБ.')
  if (limit <= 0 || (file_size ?? 0) > limit) throw sizeError()
  const response = await fetch('https://api.telegram.org/file/bot' + env.BOT_TOKEN + '/' + file_path, { signal, redirect: 'error' })
  if (!response.ok || !response.body) throw new Error('Не удалось скачать файл из Telegram')
  if (Number(response.headers.get('Content-Length')) > limit) {
    await response.body.cancel()
    throw sizeError()
  }
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > limit) {
      await reader.cancel()
      throw sizeError()
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes
}

function encode(bytes: Uint8Array) {
  const chunks: string[] = []
  for (let offset = 0; offset < bytes.length; offset += 24_576) {
    chunks.push(btoa(String.fromCharCode(...bytes.subarray(offset, offset + 24_576))))
  }
  return chunks.join('')
}

async function checkDraft(env: Env, chatId: number, draftId: string) {
  const db = env.DB!
  const now = Date.now()
  const lease = now + LOCK_TIME
  const draft = await db.prepare(
    'UPDATE bot_variant_drafts SET lock_until = ?1 WHERE chat_id = ?2 AND draft_id = ?3 ' +
    'AND expires_at > ?4 AND lock_until <= ?4 AND json_array_length(files) > 0 RETURNING draft_id, subject, kind, files',
  ).bind(lease, chatId, draftId, now).first<Draft>()
  if (!draft) {
    const active = await db.prepare('SELECT lock_until FROM bot_variant_drafts WHERE chat_id = ?1 AND draft_id = ?2 AND expires_at > ?3')
      .bind(chatId, draftId, now).first<{ lock_until: number }>()
    return tell(env, chatId, active ? (active.lock_until > now ? 'Уже проверяю вариант.' : 'Сначала пришли фото.') : 'Начни новую загрузку через /upload.')
  }

  let finished = false
  let result: string
  try {
    const used = await consume(env, 'tg:' + chatId, 'variant')
    if (used > limitFor(env, 'variant', false)) return await tell(env, chatId, 'На сегодня лимит проверок исчерпан. Можно отправить вариант завтра.')
    await tell(env, chatId, '🔎 Проверяю предмет, тип экзамена, год и читаемость страниц.')
    const signal = AbortSignal.timeout(23_000)
    const files = (JSON.parse(draft.files) as DraftFile[]).sort((a, b) => a.message - b.message)
    let remaining = MAX_BYTES
    const media = []
    const hashes = []
    for (const file of files) {
      const bytes = await download(env, file, remaining, signal)
      remaining -= bytes.byteLength
      const mimeType = sniff(bytes)
      if ((mimeType === 'application/pdf') !== (draft.kind === 'pdf')) throw new InvalidFile('Содержимое файла не совпадает с его форматом.')
      const hash = await crypto.subtle.digest('SHA-256', bytes)
      hashes.push(encode(new Uint8Array(hash)))
      media.push({ mimeType, data: encode(bytes) })
    }
    const fingerprint = hashes.sort().join(':')
    const duplicate = await db.prepare('SELECT id FROM bot_variant_archive WHERE fingerprint = ?1').bind(fingerprint).first()
    if (duplicate) {
      result = 'Такой комплект страниц уже есть в архиве. Спасибо!'
    } else {
      const verdict = await classifyExam(env, draft.subject, media, signal)
      if (verdict.verdict !== 'accept') {
        result = feedback[verdict.verdict]
      } else {
        const added = await db.prepare(
          'INSERT INTO bot_variant_archive (draft_id, fingerprint, subject, exam, exam_year, files, created_at) ' +
          'SELECT draft_id, ?1, subject, ?2, ?3, ?4, ?5 FROM bot_variant_drafts WHERE draft_id = ?6 AND lock_until = ?7 ' +
          'ON CONFLICT DO NOTHING RETURNING id',
        ).bind(fingerprint, verdict.exam, verdict.year, JSON.stringify(files), Date.now(), draftId, lease).first<{ id: number }>()
        result = added
          ? '✅ Похоже на ' + EXAMS[verdict.exam] + ' за ' + verdict.year + ' год (' + SUBJECTS[draft.subject].title + '). Сохранил в архив за №' + added.id + ' для дальнейшего разбора.'
          : 'Такой комплект страниц уже есть в архиве. Спасибо!'
      }
    }
    finished = true
  } catch (error) {
    finished = error instanceof InvalidFile
    result = error instanceof InvalidFile
      ? error.message + ' Начни заново через /upload.'
      : 'Не удалось завершить проверку. Материалы остались в загрузке. Нажми «Повторить проверку».'
  } finally {
    const sql = finished ? 'DELETE FROM bot_variant_drafts' : 'UPDATE bot_variant_drafts SET lock_until = 0'
    await db.prepare(sql + ' WHERE chat_id = ?1 AND draft_id = ?2 AND lock_until = ?3').bind(chatId, draftId, lease).run()
  }
  return tell(env, chatId, result, finished ? undefined : [[{ text: 'Повторить проверку', callback_data: 'variant:check:' + draftId }]])
}

export async function showVariantArchive(env: Env, chatId: number, before?: string) {
  if (!env.DB) return tell(env, chatId, 'Архив пока недоступен.')
  const cursor = before ? Number(before) : Number.MAX_SAFE_INTEGER
  if (!Number.isSafeInteger(cursor) || cursor < 1) return tell(env, chatId, 'Открой архив командой /variants.')
  const { results } = await env.DB.prepare(
    'SELECT id, subject, exam, exam_year FROM bot_variant_archive WHERE id < ?1 ORDER BY id DESC LIMIT 9',
  ).bind(cursor).all<{ id: number; subject: SubjectId; exam: keyof typeof EXAMS; exam_year: number }>()
  if (!results.length) return tell(env, chatId, 'В этой части архива пока нет вариантов.')
  const entries = results.slice(0, 8)
  return tell(env, chatId, '📚 Варианты после проверки Gemini\n\n' +
    entries.map(({ id, subject, exam, exam_year }) => '№' + id + ' · ' + EXAMS[exam] + ' ' + exam_year + ' · ' + SUBJECTS[subject].title).join('\n') +
    '\n\nПолучить файлы — /variant_file номер' + (results.length > 8 ? '\nРаньше — /variants ' + entries[7].id : ''))
}

export async function sendArchivedVariant(env: Env, chatId: number, rawId?: string) {
  if (!env.DB) return tell(env, chatId, 'Архив пока недоступен.')
  const id = Number(rawId)
  if (!Number.isSafeInteger(id) || id < 1) return tell(env, chatId, 'Укажи номер, например /variant_file 1.')
  const row = await env.DB.prepare('SELECT files FROM bot_variant_archive WHERE id = ?1').bind(id).first<{ files: string }>()
  if (!row) return tell(env, chatId, 'Такого варианта нет в архиве.')
  for (const file of JSON.parse(row.files) as DraftFile[]) {
    await botApi(env.BOT_TOKEN!, file.sentAsPhoto ? 'sendPhoto' : 'sendDocument',
      { chat_id: chatId, [file.sentAsPhoto ? 'photo' : 'document']: file.id })
  }
}
