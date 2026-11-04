import { animate, motion, useMotionValue, useReducedMotion, useTransform, type HTMLMotionProps } from 'motion/react'
import { forwardRef, useEffect, type CSSProperties, type ReactNode } from 'react'
import { ChevronRight, Loader } from 'lucide-react'
import { cx } from '../lib/cx'
import { haptic } from '../lib/telegram'
import { useStore } from '../lib/store'
import { itemVariants, listVariants, springSnappy } from './motion'

/** Тактильный отклик с учётом настройки пользователя. */
export function tap(style: 'light' | 'medium' | 'heavy' | 'soft' | 'rigid' = 'light'): void {
  if (useStore.getState().settings.haptics) haptic.impact(style)
}

export function notify(type: 'success' | 'error' | 'warning'): void {
  if (useStore.getState().settings.haptics) haptic.notify(type)
}

// ---------- Карточка ----------

type CardProps = HTMLMotionProps<'div'> & {
  glow?: string
  strong?: boolean
  interactive?: boolean
  padded?: boolean
}

export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { className, glow, strong, interactive, padded = true, style, onClick, children, ...rest },
  ref,
) {
  return (
    <motion.div
      ref={ref}
      className={cx(
        strong ? 'glass-strong' : 'glass',
        'relative rounded-[22px]',
        padded && 'p-4',
        glow && 'glow overflow-hidden',
        interactive && 'cursor-pointer select-none',
        className,
      )}
      style={glow ? ({ ...(style as object), '--glow': glow } as CSSProperties) : style}
      whileTap={interactive ? { scale: 0.975 } : undefined}
      transition={springSnappy}
      onClick={
        onClick
          ? (e) => {
              if (interactive) tap('light')
              onClick(e)
            }
          : undefined
      }
      {...rest}
    >
      {children}
    </motion.div>
  )
})

// ---------- Кнопки ----------

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success'

const BUTTON: Record<ButtonVariant, string> = {
  primary: 'bg-accent-solid text-on-accent shadow-[0_10px_30px_-12px_var(--c-accent-solid)]',
  secondary: 'glass text-fg',
  ghost: 'text-fg-2 hover:bg-surface',
  danger: 'bg-bad/12 text-bad border border-bad/25',
  success: 'bg-good text-white shadow-[0_10px_30px_-12px_var(--c-good)]',
}

type ButtonProps = Omit<HTMLMotionProps<'button'>, 'children'> & {
  variant?: ButtonVariant
  size?: 'sm' | 'md' | 'lg'
  icon?: ReactNode
  trailing?: ReactNode
  loading?: boolean
  block?: boolean
  children?: ReactNode
}

export function Button({
  variant = 'primary',
  size = 'md',
  icon,
  trailing,
  loading,
  block,
  className,
  disabled,
  onClick,
  children,
  ...rest
}: ButtonProps) {
  const sizes = {
    sm: 'h-9 px-3.5 text-[13px] rounded-xl gap-1.5',
    md: 'h-12 px-5 text-[15px] rounded-2xl gap-2',
    lg: 'h-14 px-6 text-[16px] rounded-[20px] gap-2.5',
  }
  return (
    <motion.button
      type="button"
      disabled={disabled || loading}
      whileTap={disabled ? undefined : { scale: 0.965 }}
      transition={springSnappy}
      onClick={(e) => {
        tap(variant === 'primary' ? 'medium' : 'light')
        onClick?.(e)
      }}
      className={cx(
        'relative inline-flex items-center justify-center overflow-hidden font-semibold whitespace-nowrap transition-[opacity,background-color] duration-200',
        sizes[size],
        BUTTON[variant],
        block && 'w-full',
        (disabled || loading) && 'opacity-45',
        className,
      )}
      {...rest}
    >
      {variant === 'primary' && (
        <span className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/18 to-transparent" />
      )}
      {loading ? <Loader size={18} className="animate-spin" /> : icon}
      {children && <span className="relative">{children}</span>}
      {trailing}
    </motion.button>
  )
}

export function IconButton({
  label,
  children,
  onClick,
  className,
  active,
}: {
  label: string
  children: ReactNode
  onClick?: () => void
  className?: string
  active?: boolean
}) {
  return (
    <motion.button
      type="button"
      aria-label={label}
      whileTap={{ scale: 0.9 }}
      transition={springSnappy}
      onClick={() => {
        tap('light')
        onClick?.()
      }}
      className={cx(
        'glass flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-fg-2',
        active && 'text-accent',
        className,
      )}
    >
      {children}
    </motion.button>
  )
}

// ---------- Чипы и сегменты ----------

export function Chip({
  children,
  active,
  onClick,
  color,
  className,
  icon,
}: {
  children: ReactNode
  active?: boolean
  onClick?: () => void
  color?: string
  className?: string
  icon?: ReactNode
}) {
  const Comp = onClick ? motion.button : motion.span
  return (
    <Comp
      type={onClick ? 'button' : undefined}
      whileTap={onClick ? { scale: 0.94 } : undefined}
      transition={springSnappy}
      onClick={
        onClick
          ? () => {
              tap('light')
              onClick()
            }
          : undefined
      }
      aria-pressed={onClick ? Boolean(active) : undefined}
      className={cx(
        'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-medium whitespace-nowrap transition-colors duration-200',
        active ? 'text-white' : 'glass text-fg-2',
        className,
      )}
      style={active ? { background: color ?? 'var(--c-accent-solid)', boxShadow: `0 8px 22px -12px ${color ?? 'var(--c-accent-solid)'}` } : undefined}
    >
      {icon}
      {children}
    </Comp>
  )
}

export function Badge({ children, color, className }: { children: ReactNode; color?: string; className?: string }) {
  return (
    <span
      className={cx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold', className)}
      // Текст подмешиваем к основному цвету темы: жёлтый на светлом фоне иначе не читается.
      style={{
        background: `color-mix(in oklab, ${color ?? 'var(--c-accent)'} 16%, transparent)`,
        color: `color-mix(in oklab, ${color ?? 'var(--c-accent)'} 72%, var(--c-fg))`,
      }}
    >
      {children}
    </span>
  )
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  layoutId,
  className,
}: {
  value: T
  options: { value: T; label: ReactNode }[]
  onChange: (v: T) => void
  layoutId: string
  className?: string
}) {
  return (
    <div className={cx('glass flex rounded-2xl p-1', className)} role="tablist">
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => {
              if (!active) tap('light')
              onChange(o.value)
            }}
            className={cx('relative flex-1 rounded-xl px-2 py-2 text-[13px] font-semibold transition-colors', active ? 'text-fg' : 'text-muted')}
          >
            {active && (
              <motion.span
                layoutId={layoutId}
                className="absolute inset-0 rounded-xl bg-surface-2 shadow-sm"
                transition={springSnappy}
              />
            )}
            <span className="relative">{o.label}</span>
          </button>
        )
      })}
    </div>
  )
}

// ---------- Индикаторы ----------

export function ProgressRing({
  value,
  size = 56,
  stroke = 6,
  color = 'var(--c-accent)',
  track = 'var(--c-line-strong)',
  children,
}: {
  value: number
  size?: number
  stroke?: number
  color?: string
  track?: string
  children?: ReactNode
}) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const clamped = Math.max(0, Math.min(1, value))
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - clamped) }}
          transition={{ type: 'spring', stiffness: 60, damping: 18, delay: 0.1 }}
        />
      </svg>
      {children && <div className="absolute inset-0 flex items-center justify-center">{children}</div>}
    </div>
  )
}

export function Bar({ value, color = 'var(--c-accent)', className, height = 6 }: { value: number; color?: string; className?: string; height?: number }) {
  return (
    <div className={cx('w-full overflow-hidden rounded-full bg-line-strong', className)} style={{ height }}>
      <motion.div
        className="h-full rounded-full"
        style={{ background: color }}
        initial={{ width: 0 }}
        animate={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }}
        transition={{ type: 'spring', stiffness: 70, damping: 20 }}
      />
    </div>
  )
}

/** Число, которое «доезжает» до значения. */
export function Counter({ value, className, suffix = '' }: { value: number; className?: string; suffix?: string }) {
  const reduce = useReducedMotion()
  const mv = useMotionValue(reduce ? value : 0)
  const rounded = useTransform(mv, (v) => `${Math.round(v)}${suffix}`)
  useEffect(() => {
    if (reduce) {
      mv.set(value)
      return
    }
    const controls = animate(mv, value, { duration: 0.9, ease: [0.22, 1, 0.36, 1] })
    return () => controls.stop()
  }, [value, mv, reduce])
  return <motion.span className={cx('tabular', className)}>{rounded}</motion.span>
}

// ---------- Списки ----------

export function Stagger({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div className={className} variants={listVariants} initial="hidden" animate="show">
      {children}
    </motion.div>
  )
}

export function StaggerItem({ children, className, ...rest }: HTMLMotionProps<'div'>) {
  return (
    <motion.div className={className} variants={itemVariants} {...rest}>
      {children}
    </motion.div>
  )
}

export function Row({
  icon,
  title,
  subtitle,
  trailing,
  onClick,
  className,
  chevron = Boolean(onClick),
}: {
  icon?: ReactNode
  title: ReactNode
  subtitle?: ReactNode
  trailing?: ReactNode
  onClick?: () => void
  className?: string
  chevron?: boolean
}) {
  const Comp = onClick ? motion.button : motion.div
  return (
    <Comp
      type={onClick ? 'button' : undefined}
      whileTap={onClick ? { scale: 0.985 } : undefined}
      transition={springSnappy}
      onClick={
        onClick
          ? () => {
              tap('light')
              onClick()
            }
          : undefined
      }
      className={cx('flex w-full items-center gap-3 py-2.5 text-left', className)}
    >
      {icon}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-medium text-fg">{title}</span>
        {subtitle && <span className="mt-0.5 block text-[12.5px] leading-snug text-muted">{subtitle}</span>}
      </span>
      {trailing}
      {chevron && <ChevronRight size={18} className="shrink-0 text-faint" />}
    </Comp>
  )
}

export function SectionTitle({ children, action, className }: { children: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cx('mb-2.5 flex items-end justify-between gap-3 px-1', className)}>
      <h2 className="text-[17px] font-bold tracking-[-0.01em] text-fg">{children}</h2>
      {action}
    </div>
  )
}

export function Empty({ icon, title, text, action }: { icon: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-2 text-accent">{icon}</div>
      <p className="text-[16px] font-semibold text-fg">{title}</p>
      {text && <p className="mt-1 max-w-xs text-[13.5px] leading-relaxed text-muted">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('skeleton', className)} />
}

