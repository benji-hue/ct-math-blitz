#!/usr/bin/env node
/**
 * После переезда на свой сервер: выключает расписание у старого воркера на Cloudflare,
 * иначе напоминания приходили бы дважды — и со старого воркера, и с сервера.
 * Сам воркер не удаляется: вернуться можно, запустив «Deploy to Cloudflare».
 *
 *   CLOUDFLARE_API_TOKEN=… [CLOUDFLARE_ACCOUNT_ID=…] node scripts/cloudflare-retire.mjs
 */
import { CloudflareError, cloudflare, findAccountId } from './lib.mjs'

const token = process.env.CLOUDFLARE_API_TOKEN
if (!token) {
  console.log('::warning title=Старый воркер не выключен::Нет секрета CLOUDFLARE_API_TOKEN. Если «Крок» раньше работал на Cloudflare, удалите воркер krok в панели Cloudflare, чтобы напоминания не приходили дважды.')
  process.exit(0)
}

try {
  const api = cloudflare(token)
  const account = await findAccountId(api, process.env.CLOUDFLARE_ACCOUNT_ID)
  await api.put(`/accounts/${account}/workers/scripts/krok/schedules`, [])
  console.log('Напоминания со старого воркера Cloudflare выключены — теперь их отправляет только сервер.')
} catch (e) {
  if (e instanceof CloudflareError && e.status === 404) {
    console.log('Воркера krok на Cloudflare нет — выключать нечего.')
  } else {
    console.log(`::warning title=Старый воркер не выключен::${String(e.message ?? e).replaceAll('\n', ' ')} — удалите воркер krok в панели Cloudflare, чтобы напоминания не приходили дважды.`)
  }
}
