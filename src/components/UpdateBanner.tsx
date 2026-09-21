import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { applyUpdate, onUpdateReady } from '../lib/pwa'

/**
 * Новая версия скачалась в фоне. Применяем только по нажатию: иначе страница
 * перезагрузилась бы посреди раунда и результат пропал бы.
 */
export function UpdateBanner() {
  const [ready, setReady] = useState(false)

  useEffect(() => onUpdateReady(() => setReady(true)), [])

  if (!ready) return null

  return (
    <div className="anim-sheet fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]">
      <div className="flex w-full max-w-lg items-center gap-3 rounded-2xl border border-sky-400/40 bg-panel px-3.5 py-2.5 shadow-2xl">
        <RefreshCw size={15} className="shrink-0 text-sky-300" />
        <span className="flex-1 text-[13px] text-slate-200">Готово обновление приложения</span>
        <button
          type="button"
          onClick={applyUpdate}
          className="shrink-0 rounded-xl bg-sky-400 px-3 py-1.5 text-[13px] font-bold text-slate-950"
        >
          Обновить
        </button>
      </div>
    </div>
  )
}
