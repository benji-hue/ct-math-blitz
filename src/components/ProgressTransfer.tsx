import { useRef, useState } from 'react'
import { Download, Upload } from 'lucide-react'
import type { Progress } from '../lib/storage'
import { downloadText, exportProgress, parseProgressFile, progressFileName } from '../lib/transfer'
import { cx } from '../lib/cx'

/** Экспорт и восстановление прогресса файлом — страховка от очистки хранилища. */
export function ProgressTransfer({
  progress,
  onImport,
}: {
  progress: Progress
  onImport: (progress: Progress) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null)

  async function handleFile(file: File | undefined) {
    if (!file) return
    const parsed = parseProgressFile(await file.text())
    if (!parsed) {
      setStatus({ ok: false, text: 'Не похоже на файл прогресса этого приложения.' })
      return
    }
    onImport(parsed)
    setStatus({ ok: true, text: 'Прогресс восстановлен.' })
  }

  return (
    <div className="pt-1">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => {
            downloadText(progressFileName(), exportProgress(progress))
            setStatus({ ok: true, text: 'Файл сохранён.' })
          }}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-edge bg-panel-2/50 py-2 text-[12px] text-muted transition hover:text-slate-200"
        >
          <Download size={13} />
          Сохранить прогресс
        </button>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-edge bg-panel-2/50 py-2 text-[12px] text-muted transition hover:text-slate-200"
        >
          <Upload size={13} />
          Восстановить
        </button>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(e) => {
          void handleFile(e.target.files?.[0])
          e.target.value = ''
        }}
      />

      {status && (
        <p
          className={cx(
            'anim-fade mt-2 text-center text-[12px]',
            status.ok ? 'text-emerald-300' : 'text-rose-300',
          )}
        >
          {status.text}
        </p>
      )}
    </div>
  )
}
