import { useMemo } from 'react'
import type { GraphSpec, GraphView } from '../types'
import { cx } from '../lib/cx'

const W = 360
const H = 286
const PAD = 24
const STEPS = 720

const DEFAULT_VIEW: GraphView = { xMin: -5, xMax: 5, yMin: -5, yMax: 5 }

const GRID = '#1b2745'
const GRID_STRONG = '#26355c'
const AXIS = '#7286ad'
const LABEL = '#8ea0c4'

interface Point {
  x: number
  y: number
}

type Evaluator = (x: number) => number

function evaluator(spec: GraphSpec): Evaluator {
  const p = spec.params
  if (spec.type === 'linear') {
    const k = p.k ?? 1
    const b = p.b ?? 0
    return (x) => k * x + b
  }
  if (spec.type === 'parabola') {
    const a = p.a ?? 1
    const b = p.b ?? 0
    const c = p.c ?? 0
    return (x) => a * x * x + b * x + c
  }
  if (spec.type === 'hyperbola') {
    const k = p.k ?? 1
    const sx = p.shiftX ?? 0
    const sy = p.shiftY ?? 0
    return (x) => k / (x - sx) + sy
  }
  const amp = p.A ?? 1
  const freq = p.k ?? 1
  const phase = p.phase ?? 0
  const shift = p.shift ?? 0
  const fn = p.fn === 'cos' ? Math.cos : Math.sin
  return (x) => amp * fn(freq * x + phase) + shift
}

/** Exact point where the segment [inside → outside] leaves the viewport. */
function clipToEdge(inside: Point, outside: Point, view: GraphView): Point {
  const bound = outside.y > view.yMax ? view.yMax : view.yMin
  const dy = outside.y - inside.y
  if (dy === 0) return { x: outside.x, y: bound }
  const t = (bound - inside.y) / dy
  return { x: inside.x + t * (outside.x - inside.x), y: bound }
}

/** Samples the curve and cuts it into segments at poles and viewport edges. */
function buildSegments(f: Evaluator, view: GraphView): Point[][] {
  const segments: Point[][] = []
  let current: Point[] = []
  let pending: Point | null = null

  const flush = () => {
    if (current.length > 1) segments.push(current)
    current = []
  }

  const dx = (view.xMax - view.xMin) / STEPS
  for (let i = 0; i <= STEPS; i++) {
    const x = view.xMin + i * dx
    const y = f(x)

    if (!Number.isFinite(y)) {
      flush()
      pending = null
      continue
    }

    const point = { x, y }
    const inside = y >= view.yMin && y <= view.yMax

    if (inside) {
      if (current.length === 0 && pending) current.push(clipToEdge(point, pending, view))
      current.push(point)
      pending = null
    } else {
      if (current.length > 0) {
        current.push(clipToEdge(current[current.length - 1], point, view))
        flush()
      }
      pending = point
    }
  }
  flush()

  return segments
}

function linearTicks(min: number, max: number): number[] {
  const span = max - min
  const step = span > 24 ? 5 : span > 13 ? 2 : 1
  const out: number[] = []
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) {
    out.push(Math.round(v * 1000) / 1000)
  }
  return out
}

function piLabel(k: number): string {
  if (k === 0) return '0'
  const sign = k < 0 ? '−' : ''
  const a = Math.abs(k)
  if (a % 2 === 0) {
    const n = a / 2
    return sign + (n === 1 ? 'π' : `${n}π`)
  }
  return sign + (a === 1 ? 'π/2' : `${a}π/2`)
}

interface Tick {
  value: number
  label: string
}

function xTicks(view: GraphView, isTrig: boolean): Tick[] {
  if (!isTrig) {
    return linearTicks(view.xMin, view.xMax).map((v) => ({ value: v, label: String(v) }))
  }
  const step = Math.PI / 2
  const out: Tick[] = []
  for (let k = Math.ceil(view.xMin / step); k <= Math.floor(view.xMax / step); k++) {
    out.push({ value: k * step, label: piLabel(k) })
  }
  return out
}

function describe(spec: GraphSpec): string {
  const p = spec.params
  switch (spec.type) {
    case 'linear':
      return `График линейной функции y = ${p.k ?? 1}x + ${p.b ?? 0}`
    case 'parabola':
      return `График квадратичной функции y = ${p.a ?? 1}x² + ${p.b ?? 0}x + ${p.c ?? 0}`
    case 'hyperbola':
      return `График гиперболы y = ${p.k ?? 1} / (x − ${p.shiftX ?? 0}) + ${p.shiftY ?? 0}`
    default:
      return `График тригонометрической функции y = ${p.A ?? 1}·${p.fn ?? 'sin'}(${p.k ?? 1}x)`
  }
}

export function GraphRenderer({
  spec,
  accent = '#7dd3fc',
  className,
}: {
  spec: GraphSpec
  accent?: string
  className?: string
}) {
  const view = spec.params.view ?? DEFAULT_VIEW
  const isTrig = spec.type === 'trig'

  const { segments, ticksX, ticksY, toX, toY } = useMemo(() => {
    const sx = (x: number) => PAD + ((x - view.xMin) / (view.xMax - view.xMin)) * (W - 2 * PAD)
    const sy = (y: number) => PAD + ((view.yMax - y) / (view.yMax - view.yMin)) * (H - 2 * PAD)
    return {
      segments: buildSegments(evaluator(spec), view),
      ticksX: xTicks(view, isTrig),
      ticksY: linearTicks(view.yMin, view.yMax),
      toX: sx,
      toY: sy,
    }
  }, [spec, view, isTrig])

  // Axes stay visible even when the origin is off-screen.
  const axisY = toY(Math.max(view.yMin, Math.min(view.yMax, 0)))
  const axisX = toX(Math.max(view.xMin, Math.min(view.xMax, 0)))

  const asymptoteX = spec.type === 'hyperbola' ? (spec.params.shiftX ?? 0) : null
  const asymptoteY = spec.type === 'hyperbola' ? (spec.params.shiftY ?? 0) : null

  return (
    <div
      className={cx(
        'rounded-2xl border border-edge bg-[#0b1226] p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]',
        className,
      )}
    >
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full"
        role="img"
        aria-label={describe(spec)}
      >
        <defs>
          <clipPath id="plot-area">
            <rect x={PAD - 6} y={PAD - 6} width={W - 2 * PAD + 12} height={H - 2 * PAD + 12} />
          </clipPath>
          <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M 0 0 L 10 5 L 0 10 z" fill={AXIS} />
          </marker>
        </defs>

        {/* grid */}
        <g stroke={GRID} strokeWidth="1">
          {ticksX.map((t) => (
            <line key={`gx${t.value}`} x1={toX(t.value)} y1={PAD - 6} x2={toX(t.value)} y2={H - PAD + 6} />
          ))}
          {ticksY.map((v) => (
            <line key={`gy${v}`} x1={PAD - 6} y1={toY(v)} x2={W - PAD + 6} y2={toY(v)} />
          ))}
        </g>

        {/* asymptotes */}
        {asymptoteX !== null && asymptoteX > view.xMin && asymptoteX < view.xMax && (
          <line
            x1={toX(asymptoteX)}
            y1={PAD - 6}
            x2={toX(asymptoteX)}
            y2={H - PAD + 6}
            stroke="#f87171"
            strokeWidth="1.5"
            strokeDasharray="5 5"
            opacity="0.75"
          />
        )}
        {asymptoteY !== null && asymptoteY > view.yMin && asymptoteY < view.yMax && (
          <line
            x1={PAD - 6}
            y1={toY(asymptoteY)}
            x2={W - PAD + 6}
            y2={toY(asymptoteY)}
            stroke="#f87171"
            strokeWidth="1.5"
            strokeDasharray="5 5"
            opacity="0.75"
          />
        )}

        {/* axes */}
        <line
          x1={PAD - 10}
          y1={axisY}
          x2={W - PAD + 12}
          y2={axisY}
          stroke={AXIS}
          strokeWidth="1.6"
          markerEnd="url(#arrow)"
        />
        <line
          x1={axisX}
          y1={H - PAD + 10}
          x2={axisX}
          y2={PAD - 12}
          stroke={AXIS}
          strokeWidth="1.6"
          markerEnd="url(#arrow)"
        />

        {/* ticks */}
        <g fill={LABEL} fontSize="10" fontFamily="inherit">
          {ticksX.map((t) =>
            Math.abs(t.value) < 1e-9 ? null : (
              <g key={`tx${t.value}`}>
                <line
                  x1={toX(t.value)}
                  y1={axisY - 3}
                  x2={toX(t.value)}
                  y2={axisY + 3}
                  stroke={GRID_STRONG}
                  strokeWidth="1.5"
                />
                <text x={toX(t.value)} y={axisY + 14} textAnchor="middle">
                  {t.label}
                </text>
              </g>
            ),
          )}
          {ticksY.map((v) =>
            Math.abs(v) < 1e-9 ? null : (
              <g key={`ty${v}`}>
                <line x1={axisX - 3} y1={toY(v)} x2={axisX + 3} y2={toY(v)} stroke={GRID_STRONG} strokeWidth="1.5" />
                <text x={axisX - 7} y={toY(v) + 3.5} textAnchor="end">
                  {v}
                </text>
              </g>
            ),
          )}
          <text x={axisX - 7} y={axisY + 14} textAnchor="end">
            0
          </text>
          <text x={W - PAD + 10} y={axisY - 8} textAnchor="end" fill={AXIS} fontStyle="italic">
            x
          </text>
          <text x={axisX + 10} y={PAD - 6} fill={AXIS} fontStyle="italic">
            y
          </text>
        </g>

        {/* curve */}
        <g clipPath="url(#plot-area)" fill="none" strokeLinecap="round" strokeLinejoin="round">
          {segments.map((segment, i) => {
            const points = segment.map((p) => `${toX(p.x).toFixed(2)},${toY(p.y).toFixed(2)}`).join(' ')
            return (
              <g key={i}>
                <polyline points={points} stroke={accent} strokeWidth="7" opacity="0.16" />
                <polyline points={points} stroke={accent} strokeWidth="2.6" />
              </g>
            )
          })}
        </g>
      </svg>
    </div>
  )
}
