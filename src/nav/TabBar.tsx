import { motion } from 'motion/react'
import { ChartColumn, House, LayoutGrid, Sparkles, UserRound, type LucideIcon } from 'lucide-react'
import { cx } from '../lib/cx'
import { tap } from '../ui/kit'
import { springSnappy } from '../ui/motion'
import { useNav, type Tab } from './nav'

const TABS: { id: Tab; label: string; icon: LucideIcon }[] = [
  { id: 'today', label: 'Сегодня', icon: House },
  { id: 'subjects', label: 'Предметы', icon: LayoutGrid },
  { id: 'tutor', label: 'ИИ', icon: Sparkles },
  { id: 'progress', label: 'Прогресс', icon: ChartColumn },
  { id: 'profile', label: 'Профиль', icon: UserRound },
]

export function TabBar({ hidden }: { hidden: boolean }) {
  const tab = useNav((s) => s.tab)
  const switchTab = useNav((s) => s.switchTab)

  return (
    <motion.nav
      aria-label="Разделы"
      className="fixed inset-x-0 z-40 flex justify-center px-4"
      initial={false}
      // Только transform: анимация opacity на предке ломает backdrop-filter стекла.
      animate={{ y: hidden ? 140 : 0 }}
      transition={{ type: 'spring', stiffness: 380, damping: 34 }}
      style={{ bottom: 'calc(var(--app-bottom) + 10px)', pointerEvents: hidden ? 'none' : undefined }}
      aria-hidden={hidden || undefined}
    >
      <div className="tabbar flex w-full max-w-md items-stretch gap-1 rounded-[26px] p-1.5">
        {TABS.map(({ id, label, icon: Icon }) => {
          const active = tab === id
          const isAi = id === 'tutor'
          return (
            <button
              key={id}
              type="button"
              aria-current={active ? 'page' : undefined}
              onClick={() => {
                if (!active) tap('light')
                switchTab(id)
              }}
              className={cx(
                'relative flex h-[56px] min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-[20px] text-[10.5px] leading-none font-semibold tracking-[-0.01em] transition-colors',
                active ? 'text-fg' : 'text-muted',
              )}
            >
              {active && (
                <motion.span layoutId="tab-pill" className="absolute inset-0 rounded-[20px] bg-surface-2" transition={springSnappy} />
              )}
              {isAi ? (
                <span className="relative flex h-7 w-7 items-center justify-center">
                  <span className="orb absolute inset-0 rounded-full opacity-90" />
                  <span className="absolute inset-[2px] rounded-full bg-solid" />
                  <Icon size={15} className="relative text-accent" strokeWidth={2.4} />
                </span>
              ) : (
                <motion.span className="relative" animate={{ y: active ? -1 : 0, scale: active ? 1.06 : 1 }} transition={springSnappy}>
                  <Icon size={22} strokeWidth={active ? 2.3 : 1.9} />
                </motion.span>
              )}
              <span className="relative">{label}</span>
            </button>
          )
        })}
      </div>
    </motion.nav>
  )
}
