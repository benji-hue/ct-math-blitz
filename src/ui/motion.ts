import type { Transition, Variants } from 'motion/react'

/** Пружины: интерфейс отзывается быстро, но без «резиновости». */
export const spring: Transition = { type: 'spring', stiffness: 420, damping: 36, mass: 0.9 }
export const springSoft: Transition = { type: 'spring', stiffness: 260, damping: 30 }
export const springSnappy: Transition = { type: 'spring', stiffness: 600, damping: 38 }

/** Каскадное появление списков. */
export const listVariants: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.045, delayChildren: 0.04 } },
}

export const itemVariants: Variants = {
  hidden: { opacity: 0, y: 14, scale: 0.985 },
  show: { opacity: 1, y: 0, scale: 1, transition: springSoft },
}
