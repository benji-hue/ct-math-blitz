import { Atom, Dna, Earth, FlaskConical, Flower2, Landmark, PenLine, Scale, Sigma, type LucideIcon } from 'lucide-react'
import { SUBJECTS } from '../domain/subjects'
import type { SubjectId } from '../domain/types'
import { cx } from '../lib/cx'

const ICONS: Partial<Record<SubjectId, LucideIcon>> = {
  math: Sigma,
  rus: PenLine,
  // Василёк — национальный цветок Беларуси.
  bel: Flower2,
  phys: Atom,
  chem: FlaskConical,
  bio: Dna,
  hist: Landmark,
  soc: Scale,
  geo: Earth,
}

export function SubjectIcon({ id, size = 44, className }: { id: SubjectId; size?: number; className?: string }) {
  const meta = SUBJECTS[id]
  const Icon = ICONS[id]
  return (
    <span
      className={cx('relative inline-flex shrink-0 items-center justify-center overflow-hidden text-white', className)}
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.32,
        background: `linear-gradient(140deg, color-mix(in oklab, ${meta.color} 82%, white) 0%, ${meta.color} 55%, color-mix(in oklab, ${meta.color} 70%, black) 100%)`,
        boxShadow: `0 10px 24px -12px ${meta.color}, inset 0 1px 0 rgb(255 255 255 / 0.35)`,
      }}
    >
      {Icon ? (
        <Icon size={size * 0.48} strokeWidth={2.1} />
      ) : (
        <span className="font-bold tracking-tight" style={{ fontSize: size * (meta.badge && meta.badge.length > 1 ? 0.34 : 0.46) }}>
          {meta.badge}
        </span>
      )}
    </span>
  )
}
