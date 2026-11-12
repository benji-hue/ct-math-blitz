import { useState } from 'react'
import { Flag } from 'lucide-react'
import { reportTask, type ReportReason } from '../lib/ai'
import { useStore } from '../lib/store'
import { toast } from './chrome'
import { Chip } from './kit'

const REASONS: { id: ReportReason; label: string }[] = [
  { id: 'answer', label: 'Неверный ответ' },
  { id: 'statement', label: 'Ошибка в условии' },
  { id: 'other', label: 'Другое' },
]

/**
 * «Ошибка в задании»: жалоба уходит на сервер. Задание общего банка ИИ перепроверяется и
 * снимается, если ключ неверный; с этого устройства оно убирается сразу. Жалобы на
 * встроенные задания копятся для автора банка.
 */
export function ReportTask({ taskId }: { taskId: string }) {
  const [open, setOpen] = useState(false)
  const [sent, setSent] = useState(false)
  const removeGenerated = useStore((s) => s.removeGenerated)

  if (sent) return <p className="px-1 text-[12.5px] text-muted">Спасибо — задание проверим.</p>
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="flex items-center gap-1.5 px-1 text-[12.5px] font-semibold text-muted">
        <Flag size={13} /> Ошибка в задании?
      </button>
    )
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[12.5px] text-muted">Что не так?</span>
      {REASONS.map((r) => (
        <Chip
          key={r.id}
          onClick={() => {
            setSent(true)
            removeGenerated(taskId)
            reportTask(taskId, r.id)
              .then((res) => res.hidden && toast('Задание снято из общего банка', 'success'))
              .catch(() => toast('Не удалось отправить — нет связи с сервером', 'error'))
          }}
        >
          {r.label}
        </Chip>
      ))}
    </div>
  )
}
