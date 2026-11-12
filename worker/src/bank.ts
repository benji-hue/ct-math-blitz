import type { Env } from './env'

/**
 * Общий банк заданий от ИИ (миграция 0003_bank.sql).
 *
 * Задание, которое составила одна модель и независимо решила вторая (ai/verify.ts),
 * сохраняется и выдаётся следующим ученикам той же темы — бесплатно для их дневного
 * лимита. Ученик может пожаловаться «Ошибка в задании»: после двух жалоб от разных
 * учеников задание снимается (по жалобе на ответ — сразу, если перепроверка его не
 * подтвердила). Жалобы на встроенные задания копятся для автора банка.
 */

export const SUBJECT_ID = /^(math|phys|rus|bel|chem|bio|hist|soc|geo|eng|deu|fra|spa|chi)$/
export const TOPIC_ID = /^[a-z]{1,3}\.[a-z_]{2,30}$/
/** Задание приложения: встроенное (phys.b.el4, blitz_trig_…) или из банка (ai.phys.k3x9…). */
export const TASK_ID = /^[a-z][a-z0-9_.-]{2,80}$/
export const REPORTS_TO_HIDE = 2

export interface BankTask {
  id: string
  q: string
  part: 'A' | 'B'
  level: number
  options?: string[]
  answer: unknown
  explain: string
  hint?: string
  trap?: string
}

function randomId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(9))
  return [...bytes].map((b) => (b % 36).toString(36)).join('')
}

/** Сохраняет подтверждённые задания; возвращает их с id банка — по нему же придут жалобы. */
export async function saveToBank(
  env: Env,
  where: { subject: string; topic: string; subjectTitle: string },
  tasks: Omit<BankTask, 'id'>[],
  now = Date.now(),
): Promise<BankTask[]> {
  const out: BankTask[] = []
  for (const t of tasks) {
    const id = `ai.${where.subject}.${randomId()}`
    const task: BankTask = { ...t, id }
    if (env.DB) {
      await env.DB.prepare(
        'INSERT INTO bank_tasks (id, subject, topic, subject_title, part, level, task, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)',
      )
        .bind(id, where.subject, where.topic, where.subjectTitle, t.part, t.level, JSON.stringify(task), now)
        .run()
    }
    out.push(task)
  }
  return out
}

/** Задания темы, которых у ученика ещё нет (seen — id из банка на его устройстве). */
export async function takeFromBank(env: Env, subject: string, topic: string, seen: string[], count: number, part: 'A' | 'B' | 'mixed' = 'mixed'): Promise<BankTask[]> {
  if (!env.DB) return []
  const rows = await env.DB.prepare("SELECT id, task FROM bank_tasks WHERE subject = ?1 AND topic = ?2 AND hidden = 0 AND (?3 = 'mixed' OR part = ?3) ORDER BY served ASC, created_at DESC LIMIT 200")
    .bind(subject, topic, part)
    .all<{ id: string; task: string }>()
  const skip = new Set(seen)
  const fresh = (rows.results ?? []).filter((r) => !skip.has(r.id))
  // Сначала реже выданные — банк выравнивается, но порядок внутри выдачи случайный.
  const picked = fresh.slice(0, count * 3).sort(() => Math.random() - 0.5).slice(0, count)
  for (const r of picked) await env.DB.prepare('UPDATE bank_tasks SET served = served + 1 WHERE id = ?1').bind(r.id).run()
  return picked.map((r) => JSON.parse(r.task) as BankTask)
}

export type ReportReason = 'answer' | 'statement' | 'other'

/**
 * Жалоба от ученика. Один голос на задание с одного ключа. Возвращает, снято ли задание
 * из общего банка (для встроенных заданий — всегда false: их правит автор).
 */
export async function reportTask(
  env: Env,
  taskId: string,
  reporter: string,
  reason: ReportReason,
  note: string | undefined,
  recheck: (task: BankTask, subjectTitle: string) => Promise<boolean | null>,
  now = Date.now(),
): Promise<{ counted: boolean; hidden: boolean }> {
  if (!env.DB) return { counted: false, hidden: false }
  const added = await env.DB.prepare('INSERT OR IGNORE INTO bank_reports (task_id, reporter, reason, note, at) VALUES (?1, ?2, ?3, ?4, ?5)')
    .bind(taskId, reporter, reason, note ?? null, now)
    .run()
  const counted = Number(added.meta?.changes ?? 0) > 0
  if (!taskId.startsWith('ai.')) return { counted, hidden: false }
  const row = await env.DB.prepare('SELECT task, subject_title, reports, hidden FROM bank_tasks WHERE id = ?1')
    .bind(taskId)
    .first<{ task: string; subject_title: string; reports: number; hidden: number }>()
  if (!row) return { counted, hidden: false }
  if (row.hidden) return { counted, hidden: true }
  if (!counted) return { counted, hidden: false }
  const reports = row.reports + 1
  // Жалоба на ответ — сразу перепроверяем: не подтвердилось — снимаем, не дожидаясь второй.
  const confirmed = reason === 'answer' ? await recheck(JSON.parse(row.task) as BankTask, row.subject_title).catch(() => null) : null
  const hide = reports >= REPORTS_TO_HIDE || confirmed === false
  await env.DB.prepare('UPDATE bank_tasks SET reports = ?2, hidden = ?3 WHERE id = ?1').bind(taskId, reports, hide ? 1 : 0).run()
  return { counted, hidden: hide }
}

/** Для автора банка: на что жалуются (служебный ключ, как у /api/admin/stats). */
export async function reportedTasks(env: Env): Promise<{ task_id: string; reports: number; reasons: string; last: number }[]> {
  if (!env.DB) return []
  const rows = await env.DB.prepare(
    `SELECT task_id, COUNT(*) AS reports, GROUP_CONCAT(reason || COALESCE(': ' || note, ''), ' | ') AS reasons, MAX(at) AS last
     FROM bank_reports GROUP BY task_id ORDER BY reports DESC, last DESC LIMIT 200`,
  ).all<{ task_id: string; reports: number; reasons: string; last: number }>()
  return rows.results ?? []
}
