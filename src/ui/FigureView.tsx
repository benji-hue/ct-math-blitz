import { useId } from 'react'
import type { FigPoint, FigPos, Figure, FigShape } from '../domain/types'
import { cx } from '../lib/cx'

/**
 * Чертёж к заданию: отрезки, многоугольники, окружности, подписи, сектора диаграммы
 * и клетчатый фон. Координаты — как на координатной плоскости (y вверх); цвета берутся
 * из темы оформления, поэтому чертёж одинаково читается в светлой и тёмной теме.
 */

const W = 320
const MAX_H = 300
const PAD = 16

const INK = 'var(--c-fg-2)'
const TEXT = 'var(--c-fg)'
// Клетки должны читаться: по ним считают координаты, поэтому линия сильнее обычной рамки.
const GRID = 'var(--c-line-strong)'
const FILL = 'var(--c-accent)'

/** Смещение подписи от точки (в пикселях) и выравнивание текста. */
const OFFSET: Record<FigPos, { dx: number; dy: number; anchor: 'start' | 'middle' | 'end' }> = {
  n: { dx: 0, dy: -8, anchor: 'middle' },
  s: { dx: 0, dy: 16, anchor: 'middle' },
  e: { dx: 7, dy: 5, anchor: 'start' },
  w: { dx: -7, dy: 5, anchor: 'end' },
  ne: { dx: 5, dy: -6, anchor: 'start' },
  nw: { dx: -5, dy: -6, anchor: 'end' },
  se: { dx: 5, dy: 15, anchor: 'start' },
  sw: { dx: -5, dy: 15, anchor: 'end' },
  c: { dx: 0, dy: 5, anchor: 'middle' },
}

/** Имена точек (A, B₁, S) — курсивом, как в учебнике; числа и слова — прямым шрифтом. */
const isPointName = (text: string) => /^[A-Za-z][₀-₉']*$/.test(text)

export function FigureView({ figure, className }: { figure: Figure; className?: string }) {
  const arrowId = `fig-arrow-${useId().replace(/:/g, '')}`
  const [x0, y0, x1, y1] = figure.view
  const scale = Math.min((W - 2 * PAD) / (x1 - x0), (MAX_H - 2 * PAD) / (y1 - y0))
  const width = (x1 - x0) * scale + 2 * PAD
  const height = (y1 - y0) * scale + 2 * PAD
  const X = (x: number) => PAD + (x - x0) * scale
  const Y = (y: number) => PAD + (y1 - y) * scale
  const pt = (p: FigPoint) => `${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`

  const grid: string[] = []
  if (figure.grid) {
    const dx = figure.grid.dx ?? 1
    const dy = figure.grid.dy ?? 1
    const [gx0, gy0, gx1, gy1] = figure.grid.area ?? figure.view
    for (let gx = Math.ceil(gx0 / dx - 1e-9) * dx; gx <= gx1 + 1e-9; gx += dx) grid.push(`M${X(gx).toFixed(1)},${Y(gy0).toFixed(1)}V${Y(gy1).toFixed(1)}`)
    for (let gy = Math.ceil(gy0 / dy - 1e-9) * dy; gy <= gy1 + 1e-9; gy += dy) grid.push(`M${X(gx0).toFixed(1)},${Y(gy).toFixed(1)}H${X(gx1).toFixed(1)}`)
  }

  const draw = (s: FigShape, i: number) => {
    if ('line' in s) {
      const [a, b] = s.line
      const ticks = s.ticks ? tickMarks(X(a[0]), Y(a[1]), X(b[0]), Y(b[1]), s.ticks) : null
      return (
        <g key={i}>
          <line x1={X(a[0])} y1={Y(a[1])} x2={X(b[0])} y2={Y(b[1])} stroke={INK} strokeWidth={s.bold ? 2.6 : 1.5} strokeDasharray={s.dash ? '5 4' : undefined} strokeLinecap="round" />
          {ticks && <path d={ticks} stroke={INK} strokeWidth={1.5} />}
        </g>
      )
    }
    if ('poly' in s) {
      const d = s.poly.map(pt).join(' ')
      const common = { stroke: INK, strokeWidth: s.bold ? 2.6 : 1.5, strokeDasharray: s.dash ? '5 4' : undefined, strokeLinejoin: 'round' as const }
      return s.closed || s.fill ? (
        <polygon key={i} points={d} {...common} fill={s.fill ? FILL : 'none'} fillOpacity={s.fill ? 0.18 : undefined} />
      ) : (
        <polyline key={i} points={d} {...common} fill="none" />
      )
    }
    if ('circle' in s) return <circle key={i} cx={X(s.circle[0])} cy={Y(s.circle[1])} r={s.r * scale} stroke={INK} strokeWidth={1.5} fill="none" />
    if ('dot' in s) return <circle key={i} cx={X(s.dot[0])} cy={Y(s.dot[1])} r={3.2} fill={TEXT} />
    // Сектор проверяем раньше подписи: у него тоже есть поле text.
    if ('sector' in s) {
      const [cxp, cyp] = s.sector
      const at = (deg: number, r: number) => `${X(cxp + r * Math.cos((deg * Math.PI) / 180)).toFixed(1)},${Y(cyp + r * Math.sin((deg * Math.PI) / 180)).toFixed(1)}`
      const large = s.to - s.from > 180 ? 1 : 0
      const mid = (s.from + s.to) / 2
      const [lx, ly] = at(mid, s.r * 0.62).split(',').map(Number)
      return (
        <g key={i}>
          <path d={`M${pt(s.sector)}L${at(s.from, s.r)}A${(s.r * scale).toFixed(1)},${(s.r * scale).toFixed(1)} 0 ${large} 0 ${at(s.to, s.r)}Z`} stroke={INK} strokeWidth={1.3} fill="var(--c-surface-2)" />
          {s.text &&
            s.text.split('\n').map((line, j, all) => (
              <text key={j} x={lx} y={ly + 4 + (j - (all.length - 1) / 2) * 14} textAnchor="middle" fill={TEXT} fontSize={12}>
                {line}
              </text>
            ))}
        </g>
      )
    }
    if ('text' in s) {
      const o = OFFSET[s.pos ?? 'c']
      return (
        <text key={i} x={X(s.at[0]) + o.dx} y={Y(s.at[1]) + o.dy} textAnchor={o.anchor} fill={TEXT} fontSize={14} fontStyle={isPointName(s.text) ? 'italic' : undefined} fontFamily={isPointName(s.text) ? 'Georgia, "Times New Roman", serif' : undefined}>
          {s.text}
        </text>
      )
    }
    const [a, b] = s.arrow
    return <line key={i} x1={X(a[0])} y1={Y(a[1])} x2={X(b[0])} y2={Y(b[1])} stroke={INK} strokeWidth={1.4} markerEnd={`url(#${arrowId})`} />
  }

  return (
    <div className={cx('glass flex justify-center rounded-[20px] px-2 py-1', className)}>
      <svg viewBox={`0 0 ${width.toFixed(1)} ${height.toFixed(1)}`} width={width} className="h-auto max-w-full" role="img" aria-label={figure.alt}>
        <defs>
          <marker id={arrowId} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0L10,5L0,10z" fill={INK} />
          </marker>
        </defs>
        {grid.length > 0 && <path d={grid.join('')} stroke={GRID} strokeWidth={1} fill="none" />}
        {figure.shapes.map(draw)}
      </svg>
    </div>
  )
}

/** Штрихи равных отрезков: один или два коротких поперечных штриха посередине. */
function tickMarks(ax: number, ay: number, bx: number, by: number, count: 1 | 2): string {
  const len = Math.hypot(bx - ax, by - ay) || 1
  const ux = (bx - ax) / len
  const uy = (by - ay) / len
  const mx = (ax + bx) / 2
  const my = (ay + by) / 2
  const shifts = count === 1 ? [0] : [-2.5, 2.5]
  return shifts
    .map((t) => {
      const cxp = mx + ux * t
      const cyp = my + uy * t
      return `M${(cxp - uy * 5).toFixed(1)},${(cyp + ux * 5).toFixed(1)}L${(cxp + uy * 5).toFixed(1)},${(cyp - ux * 5).toFixed(1)}`
    })
    .join('')
}
