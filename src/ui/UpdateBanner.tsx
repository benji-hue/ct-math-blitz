import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { applyUpdate, onUpdateReady } from '../lib/pwa'
import { springSoft } from './motion'

/**
 * Новая версия скачалась в фоне (PWA). Применяем только по нажатию: иначе
 * страница перезагрузилась бы посреди тренировки и результат пропал бы.
 */
export function UpdateBanner() {
  const [ready, setReady] = useState(false)
  useEffect(() => onUpdateReady(() => setReady(true)), [])

  return (
    <AnimatePresence>
      {ready && (
        <motion.div
          initial={{ y: -80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -80, opacity: 0 }}
          transition={springSoft}
          className="fixed inset-x-0 z-[55] flex justify-center px-4"
          style={{ top: 'calc(var(--app-top) + 8px)' }}
        >
          <div className="glass-strong flex w-full max-w-md items-center gap-3 rounded-2xl px-3.5 py-2.5">
            <RefreshCw size={16} className="shrink-0 text-accent" />
            <span className="flex-1 text-[13.5px] text-fg">Готово обновление приложения</span>
            <button type="button" onClick={applyUpdate} className="shrink-0 rounded-xl bg-accent-solid px-3 py-1.5 text-[13px] font-bold text-on-accent">
              Обновить
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
