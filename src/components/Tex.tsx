import katex from 'katex'
import { Fragment, useMemo } from 'react'
import { cx } from '../lib/cx'

/** Splits on `$$…$$` and `$…$` while keeping the delimiters. */
const SEGMENT = /(\$\$[^$]*\$\$|\$[^$]*\$)/g
const BOLD = /(\*\*[^*]+\*\*)/g

function renderMath(source: string, display: boolean): string {
  return katex.renderToString(source, {
    displayMode: display,
    throwOnError: false,
    strict: false,
    output: 'html',
    trust: false,
  })
}

/**
 * Renders a small Markdown subset (`**bold**`) with inline `$…$` and block
 * `$$…$$` LaTeX. KaTeX never throws here — a malformed formula shows up in
 * red rather than taking the round down.
 */
export function Tex({ children, className }: { children: string; className?: string }) {
  const nodes = useMemo(() => {
    const segments = children.split(SEGMENT).filter((s) => s !== '')

    return segments.map((segment, i) => {
      const isBlock = segment.startsWith('$$') && segment.endsWith('$$') && segment.length > 3
      const isInline = !isBlock && segment.startsWith('$') && segment.endsWith('$') && segment.length > 1

      if (isBlock || isInline) {
        const body = isBlock ? segment.slice(2, -2) : segment.slice(1, -1)
        return (
          <span
            key={i}
            // KaTeX output only; the source is our own dataset, never user input.
            dangerouslySetInnerHTML={{ __html: renderMath(body, isBlock) }}
          />
        )
      }

      return (
        <Fragment key={i}>
          {segment.split(BOLD).map((chunk, j) =>
            chunk.startsWith('**') && chunk.endsWith('**') && chunk.length > 4 ? (
              <strong key={j} className="font-semibold text-white">
                {chunk.slice(2, -2)}
              </strong>
            ) : (
              <Fragment key={j}>{chunk}</Fragment>
            ),
          )}
        </Fragment>
      )
    })
  }, [children])

  return <span className={cx('tex-host', className)}>{nodes}</span>
}
