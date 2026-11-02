import type katexType from 'katex'
import { Fragment, memo, useEffect, useMemo, useState, type ReactNode } from 'react'
import { openExternal } from '../lib/telegram'
import { cx } from '../lib/cx'

/**
 * Безопасный рендер Markdown + LaTeX.
 *
 * Ответы ИИ — недоверенный текст, поэтому никакого innerHTML для разметки:
 * всё превращается в React-элементы. Единственное исключение — HTML, который
 * генерирует сам KaTeX из формулы (trust: false запрещает \href, \html* и т.п.,
 * а maxExpand/maxSize защищают от «формул-бомб»).
 * Парсер терпим к обрывам: во время стрима незакрытые $ и ** выводятся как текст.
 *
 * KaTeX (~70 КБ gzip) грузится лениво: на главном экране формул нет, поэтому
 * он не тормозит первый запуск в Telegram, а подтягивается в фоне.
 */

let katex: typeof katexType | null = null
let katexPromise: Promise<typeof katexType> | null = null

export function loadKatex(): Promise<typeof katexType> {
  if (!katexPromise) {
    katexPromise = import('katex').then((m) => {
      katex = m.default
      return katex
    })
  }
  return katexPromise
}

/** true, когда KaTeX готов; если в тексте есть формулы — запускает загрузку. */
function useKatex(text: string): boolean {
  const needed = text.includes('$')
  const [ready, setReady] = useState(() => Boolean(katex))
  useEffect(() => {
    if (!needed || katex) return
    let alive = true
    loadKatex().then(() => alive && setReady(true))
    return () => {
      alive = false
    }
  }, [needed])
  return ready || Boolean(katex)
}

const mathCache = new Map<string, string>()

function renderMath(source: string, display: boolean): string | null {
  if (!katex) return null
  const key = `${display ? 'D' : 'I'}${source}`
  let html = mathCache.get(key)
  if (html === undefined) {
    html = katex.renderToString(source, {
      displayMode: display,
      throwOnError: false,
      strict: false,
      trust: false,
      output: 'html',
      maxSize: 20,
      maxExpand: 200,
    })
    if (mathCache.size > 800) mathCache.clear()
    mathCache.set(key, html)
  }
  return html
}

function MathSpan({ source, display }: { source: string; display: boolean }) {
  const html = renderMath(source, display)
  if (html === null) return <span className={cx('font-mono text-[0.9em] text-fg-2', display && 'block')}>{source}</span>
  return <span className={display ? 'block' : undefined} dangerouslySetInnerHTML={{ __html: html }} />
}

// ---------- Строчные элементы ----------

const INLINE_BASE = String.raw`\$\$[^$]+\$\$|\$[^$\n]+\$|\*\*[^*\n]+\*\*|` + '`[^`\\n]+`' + String.raw`|\[[^\]\n]+\]\(https?:\/\/[^)\s]+\)`

/**
 * Курсив *так* и _так_ не должен срабатывать внутри слов и на «**». Для этого нужен
 * lookbehind, которого нет в Safari до 16.4: регэксп-литерал с ним уронил бы весь модуль
 * ещё при загрузке. Поэтому собираем регэксп в рантайме и при ошибке берём упрощённый.
 */
function buildInline(): RegExp {
  try {
    return new RegExp(`(${INLINE_BASE}|(?<![*\\w])\\*[^*\\n]+\\*(?!\\*)|(?<![_\\w])_[^_\\n]+_(?!\\w))`, 'g')
  } catch {
    return new RegExp(`(${INLINE_BASE}|\\*[^*\\n]+\\*(?!\\*)|_[^_\\n]+_(?!\\w))`, 'g')
  }
}

const INLINE = buildInline()

export function renderInline(text: string, keyPrefix = 'i'): ReactNode[] {
  const parts = text.split(INLINE)
  return parts.map((part, i) => {
    const key = `${keyPrefix}${i}`
    if (!part) return null
    if (part.startsWith('$$') && part.endsWith('$$') && part.length > 4) return <MathSpan key={key} source={part.slice(2, -2)} display />
    if (part.startsWith('$') && part.endsWith('$') && part.length > 2) return <MathSpan key={key} source={part.slice(1, -1)} display={false} />
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4)
      return (
        <strong key={key} className="font-semibold text-fg">
          {renderInline(part.slice(2, -2), `${key}b`)}
        </strong>
      )
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) return <code key={key}>{part.slice(1, -1)}</code>
    if (part.startsWith('[')) {
      const m = /^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/.exec(part)
      if (m)
        return (
          <a
            key={key}
            href={m[2]}
            onClick={(e) => {
              e.preventDefault()
              openExternal(m[2])
            }}
          >
            {m[1]}
          </a>
        )
    }
    if ((part.startsWith('*') && part.endsWith('*')) || (part.startsWith('_') && part.endsWith('_'))) {
      if (part.length > 2) return <em key={key}>{part.slice(1, -1)}</em>
    }
    return <Fragment key={key}>{part}</Fragment>
  })
}

// ---------- Блоки ----------

type Block =
  | { kind: 'p'; lines: string[] }
  | { kind: 'h'; level: number; text: string }
  | { kind: 'ul' | 'ol'; items: string[]; start?: number }
  | { kind: 'quote'; lines: string[] }
  | { kind: 'code'; text: string }
  | { kind: 'math'; text: string }
  | { kind: 'table'; head: string[]; rows: string[][] }
  | { kind: 'hr' }

const cells = (line: string) =>
  line
    .trim()
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((c) => c.trim())

/** Часть моделей пишет формулы как \(…\) и \[…\] — приводим к $…$ и $$…$$. */
export function normalizeMath(md: string): string {
  return md.replace(/\\\[([\s\S]+?)\\\]/g, (_m, body: string) => `$$${body}$$`).replace(/\\\(([\s\S]+?)\\\)/g, (_m, body: string) => `$${body.trim()}$`)
}

export function parseBlocks(md: string): Block[] {
  const lines = normalizeMath(md).replace(/\r\n?/g, '\n').split('\n')
  const blocks: Block[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    const trimmed = line.trim()
    if (!trimmed) {
      i++
      continue
    }
    if (trimmed.startsWith('```')) {
      const body: string[] = []
      i++
      while (i < lines.length && !lines[i].trim().startsWith('```')) body.push(lines[i++])
      i++
      blocks.push({ kind: 'code', text: body.join('\n') })
      continue
    }
    if (trimmed.length > 4 && trimmed.startsWith('$$') && trimmed.endsWith('$$') && !trimmed.slice(2, -2).includes('$$')) {
      blocks.push({ kind: 'math', text: trimmed.slice(2, -2).trim() })
      i++
      continue
    }
    if (trimmed === '$$' || (trimmed.startsWith('$$') && !trimmed.slice(2).includes('$$'))) {
      const body: string[] = [trimmed.slice(2)]
      i++
      while (i < lines.length && !lines[i].includes('$$')) body.push(lines[i++])
      if (i < lines.length) body.push(lines[i].replace('$$', ''))
      i++
      blocks.push({ kind: 'math', text: body.join('\n').trim() })
      continue
    }
    const heading = /^(#{1,4})\s+(.+)$/.exec(trimmed)
    if (heading) {
      blocks.push({ kind: 'h', level: heading[1].length, text: heading[2] })
      i++
      continue
    }
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      blocks.push({ kind: 'hr' })
      i++
      continue
    }
    if (trimmed.startsWith('|') && i + 1 < lines.length && /^\|?\s*:?-{2,}/.test(lines[i + 1].trim())) {
      const head = cells(trimmed)
      i += 2
      const rows: string[][] = []
      while (i < lines.length && lines[i].trim().startsWith('|')) rows.push(cells(lines[i++]))
      blocks.push({ kind: 'table', head, rows })
      continue
    }
    if (/^([-*•])\s+/.test(trimmed)) {
      const items: string[] = []
      while (i < lines.length && /^\s*([-*•])\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*([-*•])\s+/, ''))
      blocks.push({ kind: 'ul', items })
      continue
    }
    if (/^\d+[.)]\s+/.test(trimmed)) {
      // Модели часто пишут пункты «4. …», «5. …» отдельными абзацами — номер сохраняем.
      const start = Number(/^(\d+)/.exec(trimmed)?.[1] ?? 1)
      const items: string[] = []
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*\d+[.)]\s+/, ''))
      blocks.push({ kind: 'ol', items, ...(start > 1 ? { start } : {}) })
      continue
    }
    if (trimmed.startsWith('>')) {
      const quote: string[] = []
      while (i < lines.length && lines[i].trim().startsWith('>')) quote.push(lines[i++].trim().replace(/^>\s?/, ''))
      blocks.push({ kind: 'quote', lines: quote })
      continue
    }
    const para: string[] = []
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^(#{1,4}\s|```|\$\$|>|[-*•]\s|\d+[.)]\s|\|)/.test(lines[i].trim())
    ) {
      para.push(lines[i++].trim())
    }
    if (para.length) blocks.push({ kind: 'p', lines: para })
    else i++
  }
  return blocks
}

function renderBlock(block: Block, key: string): ReactNode {
  switch (block.kind) {
    case 'h': {
      const Tag = block.level <= 1 ? 'h1' : block.level === 2 ? 'h2' : 'h3'
      return <Tag key={key}>{renderInline(block.text, key)}</Tag>
    }
    case 'p':
      return (
        <p key={key}>
          {block.lines.map((l, j) => (
            <Fragment key={j}>
              {j > 0 && <br />}
              {renderInline(l, `${key}l${j}`)}
            </Fragment>
          ))}
        </p>
      )
    case 'ul':
    case 'ol': {
      const Tag = block.kind
      return (
        <Tag key={key} start={block.kind === 'ol' ? block.start : undefined}>
          {block.items.map((item, j) => (
            <li key={j}>{renderInline(item, `${key}li${j}`)}</li>
          ))}
        </Tag>
      )
    }
    case 'quote':
      return (
        <blockquote key={key}>
          {block.lines.map((l, j) => (
            <p key={j}>{renderInline(l, `${key}q${j}`)}</p>
          ))}
        </blockquote>
      )
    case 'code':
      return (
        <pre key={key}>
          <code>{block.text}</code>
        </pre>
      )
    case 'math':
      return <MathSpan key={key} source={block.text} display />
    case 'table':
      return (
        <table key={key}>
          <thead>
            <tr>
              {block.head.map((h, j) => (
                <th key={j}>{renderInline(h, `${key}h${j}`)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row, r) => (
              <tr key={r}>
                {row.map((c, j) => (
                  <td key={j}>{renderInline(c, `${key}r${r}c${j}`)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )
    case 'hr':
      return <hr key={key} />
  }
}

/** Полноценный Markdown (ответы ИИ, конспекты). */
export const Markdown = memo(function Markdown({ children, className, streaming }: { children: string; className?: string; streaming?: boolean }) {
  const ready = useKatex(children)
  const nodes = useMemo(() => parseBlocks(children).map((b, i) => renderBlock(b, `b${i}`)), [children, ready]) // eslint-disable-line
  return <div className={cx('md tex-host', streaming && 'caret', className)}>{nodes}</div>
})

/** Одна строка: условие задания, вариант ответа, формула. */
export const Tex = memo(function Tex({ children, className }: { children: string; className?: string }) {
  const ready = useKatex(children)
  const nodes = useMemo(() => {
    const lines = children.split('\n')
    return lines.map((l, i) => (
      <Fragment key={i}>
        {i > 0 && <br />}
        {renderInline(l, `t${i}`)}
      </Fragment>
    ))
  }, [children, ready]) // eslint-disable-line
  return <span className={cx('tex-host', className)}>{nodes}</span>
})
