import { AnimatePresence, motion, useDragControls, type PanInfo } from 'motion/react'
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronLeft, X } from 'lucide-react'
import { create } from 'zustand'
import { cx } from '../lib/cx'
import { hasNativeBackButton } from '../lib/telegram'
import { useNav } from '../nav/nav'
import { springSoft } from './motion'
import { IconButton, tap } from './kit'

// ---------- Фон ----------

export function Aurora() {
  return (
    <div className="aurora" aria-hidden>
      <i />
      <i />
      <i />
    </div>
  )
}

// ---------- Экран ----------

const scrollMemory = new Map<string, number>()

/**
 * Обёртка экрана: собственный скролл (чтобы переходы не дёргали страницу),
 * запоминание позиции прокрутки при возврате назад, отступы под шапку Telegram.
 */
export function Screen({
  routeKey,
  children,
  className,
  immersive,
}: {
  routeKey: string
  children: ReactNode
  className?: string
  immersive?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.scrollTop = scrollMemory.get(routeKey) ?? 0
    const onScroll = () => scrollMemory.set(routeKey, el.scrollTop)
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [routeKey])
  return (
    <div
      ref={ref}
      data-screen
      className={cx(
        'absolute inset-0 overflow-x-hidden overflow-y-auto overscroll-contain',
        immersive ? 'pb-safe' : 'pb-tabbar',
        className,
      )}
    >
      <div className="pt-safe mx-auto w-full max-w-xl px-4">{children}</div>
    </div>
  )
}

/** Шапка вложенного экрана. Внутри Telegram «Назад» — системная кнопка, свою не рисуем. */
export function Header({
  title,
  subtitle,
  right,
  close,
  onBack,
  large,
}: {
  title?: ReactNode
  subtitle?: ReactNode
  right?: ReactNode
  close?: boolean
  onBack?: () => void
  large?: boolean
}) {
  const pop = useNav((s) => s.pop)
  const native = hasNativeBackButton()
  const back = onBack ?? pop
  const showBack = close || !native
  return (
    <header className={cx('mb-4 flex items-center gap-3', large ? 'pt-2' : 'pt-1')}>
      {showBack && (
        <IconButton label={close ? 'Закрыть' : 'Назад'} onClick={back}>
          {close ? <X size={19} /> : <ChevronLeft size={21} />}
        </IconButton>
      )}
      <div className="min-w-0 flex-1">
        {title && (
          <h1 className={cx('truncate font-bold tracking-[-0.02em] text-fg', large ? 'text-[28px] leading-tight' : 'text-[19px]')}>
            {title}
          </h1>
        )}
        {subtitle && <p className="truncate text-[13px] text-muted">{subtitle}</p>}
      </div>
      {right}
    </header>
  )
}

// ---------- Нижняя шторка ----------

export function Sheet({
  open,
  onClose,
  children,
  title,
  dismissible = true,
}: {
  open: boolean
  onClose: () => void
  children: ReactNode
  title?: ReactNode
  dismissible?: boolean
}) {
  const controls = useDragControls()
  useEffect(() => {
    if (!open || !dismissible) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, dismissible, onClose])

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-modal="true">
          <motion.div
            className="absolute inset-0 bg-black/45"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={dismissible ? onClose : undefined}
          />
          <motion.div
            className="glass-strong relative max-h-[88dvh] w-full max-w-xl overflow-y-auto rounded-t-[28px] px-4 pt-2"
            style={{ paddingBottom: 'calc(var(--app-bottom) + 18px)' }}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 38 }}
            drag={dismissible ? 'y' : false}
            dragListener={false}
            dragControls={controls}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_, info: PanInfo) => {
              if (info.offset.y > 120 || info.velocity.y > 600) onClose()
            }}
          >
            <div
              className="flex cursor-grab touch-none justify-center pt-1.5 pb-3"
              onPointerDown={(e) => dismissible && controls.start(e)}
            >
              <span className="h-1.5 w-10 rounded-full bg-line-strong" />
            </div>
            {title && <h3 className="mb-3 text-[18px] font-bold text-fg">{title}</h3>}
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}

// ---------- Состояние интерфейса ----------

interface UiState {
  /** Открыта клавиатура — прячем таб-бар, чтобы он не прыгал над ней. */
  keyboard: boolean
  setKeyboard: (v: boolean) => void
}

export const useUi = create<UiState>()((set) => ({
  keyboard: false,
  setKeyboard: (keyboard) => set({ keyboard }),
}))

// ---------- Тосты ----------

interface Toast {
  id: number
  text: string
  tone: 'default' | 'success' | 'error'
  icon?: ReactNode
}

interface ToastState {
  toasts: Toast[]
  show: (text: string, tone?: Toast['tone'], icon?: ReactNode) => void
  dismiss: (id: number) => void
}

let toastId = 0

export const useToasts = create<ToastState>()((set, get) => ({
  toasts: [],
  show: (text, tone = 'default', icon) => {
    const id = ++toastId
    set({ toasts: [...get().toasts.slice(-2), { id, text, tone, icon }] })
    window.setTimeout(() => get().dismiss(id), 3200)
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}))

export function toast(text: string, tone: Toast['tone'] = 'default', icon?: ReactNode): void {
  useToasts.getState().show(text, tone, icon)
}

export function Toasts() {
  const toasts = useToasts((s) => s.toasts)
  return (
    <div className="pointer-events-none fixed inset-x-0 z-[60] flex flex-col items-center gap-2 px-4" style={{ top: 'calc(var(--app-top) + 10px)' }}>
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, y: -16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.96 }}
            transition={springSoft}
            className={cx(
              'glass-strong pointer-events-auto flex max-w-sm items-center gap-2.5 rounded-2xl px-4 py-3 text-[14px] font-medium',
              t.tone === 'success' && 'text-good',
              t.tone === 'error' && 'text-bad',
            )}
            onClick={() => useToasts.getState().dismiss(t.id)}
          >
            {t.icon}
            <span className="text-fg">{t.text}</span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}

// ---------- Конфетти ----------

/** Лёгкий салют на canvas: ~90 частиц, 1.4 секунды, без библиотек. */
export function burstConfetti(colors = ['#7c6cff', '#3dd6f5', '#ff7ad9', '#ffc857', '#3ee0a1']): void {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  const canvas = document.createElement('canvas')
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  canvas.width = innerWidth * dpr
  canvas.height = innerHeight * dpr
  Object.assign(canvas.style, { position: 'fixed', inset: '0', width: '100%', height: '100%', pointerEvents: 'none', zIndex: '70' })
  document.body.appendChild(canvas)
  const ctx = canvas.getContext('2d')!
  ctx.scale(dpr, dpr)
  const parts = Array.from({ length: 90 }, () => ({
    x: innerWidth / 2,
    y: innerHeight * 0.38,
    vx: (Math.random() - 0.5) * 13,
    vy: -Math.random() * 13 - 4,
    r: 3 + Math.random() * 4,
    c: colors[Math.floor(Math.random() * colors.length)],
    a: Math.random() * Math.PI,
    va: (Math.random() - 0.5) * 0.3,
  }))
  const start = performance.now()
  const frame = (t: number) => {
    const elapsed = t - start
    ctx.clearRect(0, 0, innerWidth, innerHeight)
    for (const p of parts) {
      p.vy += 0.38
      p.vx *= 0.99
      p.x += p.vx
      p.y += p.vy
      p.a += p.va
      ctx.save()
      ctx.globalAlpha = Math.max(0, 1 - elapsed / 1400)
      ctx.translate(p.x, p.y)
      ctx.rotate(p.a)
      ctx.fillStyle = p.c
      ctx.fillRect(-p.r, -p.r / 2, p.r * 2, p.r)
      ctx.restore()
    }
    if (elapsed < 1400) requestAnimationFrame(frame)
    else canvas.remove()
  }
  requestAnimationFrame(frame)
}

// ---------- Таймер обратного отсчёта ----------

export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(id)
  }, [intervalMs])
  return now
}

export function PressableTitle({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={() => {
        tap('light')
        onClick()
      }}
      className="text-[13px] font-semibold text-accent"
    >
      {children}
    </button>
  )
}
