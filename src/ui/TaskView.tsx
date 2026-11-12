import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { Check, Lightbulb, RotateCcw, X } from 'lucide-react'
import type { Task } from '../domain/types'
import { correctOptions, isMulti, type Given, type PreparedTask } from '../lib/practice'
import { cx } from '../lib/cx'
import { Badge, tap } from './kit'
import { Tex } from './Rich'
import { GraphRenderer } from './GraphRenderer'
import { springSnappy, springSoft } from './motion'

export const LETTERS = ['А', 'Б', 'В', 'Г', 'Д', 'Е']

const LEVEL = ['', 'I', 'II', 'III', 'IV', 'V']

export function TaskMeta({ task, isReview, topicTitle, color, slot }: { task: Task; isReview?: boolean; topicTitle?: string; color: string; slot?: string }) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-1.5">
      <Badge color={color}>{slot ?? `Часть ${task.part}`}</Badge>
      <Badge color="var(--c-muted)">уровень {LEVEL[task.level]}</Badge>
      {topicTitle && <Badge color="var(--c-muted)">{topicTitle}</Badge>}
      {task.source === 'ai' && <Badge color="#ff7ad9">ИИ</Badge>}
      {isReview && (
        <Badge color="#3dd6f5">
          <RotateCcw size={11} /> повторение
        </Badge>
      )}
    </div>
  )
}

export type Verdict = null | { correct: boolean; given: Given }

/**
 * Карточка задания: выбор варианта (часть A) или ввод краткого ответа (часть B).
 * В режиме «экзамен» (reveal=false) правильный ответ не подсвечивается.
 */
export function TaskBody({
  prepared,
  verdict,
  onAnswer,
  reveal = true,
  selected,
  onSelect,
  inputValue,
  onInput,
}: {
  prepared: PreparedTask
  verdict: Verdict
  onAnswer?: (given: Given) => void
  reveal?: boolean
  /** Режим экзамена: выбранный вариант (или несколько) хранит экран пробника. */
  selected?: number | number[] | null
  onSelect?: (optionIndex: number) => void
  inputValue?: string
  onInput?: (v: string) => void
}) {
  const { task, order } = prepared
  const [local, setLocal] = useState('')
  const value = inputValue ?? local
  const setValue = onInput ?? setLocal
  const inputRef = useRef<HTMLInputElement>(null)
  const [shake, setShake] = useState(0)
  const multi = isMulti(task)
  const right = correctOptions(task)
  // Отмеченные варианты задания с несколькими верными — до нажатия «Ответить».
  const [marks, setMarks] = useState<number[]>([])
  const pickedList = verdict
    ? typeof verdict.given === 'number'
      ? [verdict.given]
      : Array.isArray(verdict.given)
        ? verdict.given
        : []
    : selected === null || selected === undefined
      ? multi && !onSelect
        ? marks
        : []
      : typeof selected === 'number'
        ? [selected]
        : selected

  useEffect(() => {
    if (verdict && !verdict.correct) setShake((s) => s + 1)
  }, [verdict])

  const numeric = task.kind === 'input' && Array.isArray(task.answer) && (task.answer as string[]).every((a) => /^-?\d+([.,]\d+)?$/.test(String(a).trim()))

  return (
    <div>
      {task.graph && <GraphRenderer spec={task.graph} accent="var(--c-accent)" className="mb-4" />}
      <div className="mb-5 text-[17px] leading-relaxed text-fg">
        <Tex>{task.q}</Tex>
      </div>

      {task.kind === 'choice' && task.options && multi && !verdict && (
        <p className="mb-2.5 px-1 text-[12.5px] font-semibold text-accent">Верных вариантов несколько — отметь все</p>
      )}
      {task.kind === 'choice' && task.options && (
        <ul className="flex flex-col gap-2.5">
          {order.map((optionIndex, pos) => {
            const isCorrectOption = right.includes(optionIndex)
            const picked = pickedList.includes(optionIndex)
            const showRight = reveal && verdict && isCorrectOption
            // Неверно отмеченный вариант; при нескольких верных — и пропущенный верный остаётся зелёным.
            const showWrong = reveal && verdict && picked && !isCorrectOption
            return (
              <li key={optionIndex}>
                <motion.button
                  type="button"
                  disabled={Boolean(verdict)}
                  whileTap={verdict ? undefined : { scale: 0.98 }}
                  transition={springSnappy}
                  onClick={() => {
                    tap('light')
                    if (onSelect) onSelect(optionIndex)
                    else if (multi) setMarks((m) => (m.includes(optionIndex) ? m.filter((x) => x !== optionIndex) : [...m, optionIndex]))
                    else onAnswer?.(optionIndex)
                  }}
                  key={showWrong ? `w${shake}` : 'n'}
                  className={cx(
                    'glass flex w-full items-center gap-3 rounded-[18px] px-3.5 py-3 text-left transition-[background-color,border-color,box-shadow] duration-200',
                    showRight && '!border-good/60 !bg-good/14 shadow-[0_0_0_3px_color-mix(in_oklab,var(--c-good)_18%,transparent)]',
                    showWrong && 'anim-shake !border-bad/55 !bg-bad/10',
                    !verdict && picked && '!border-accent/70 !bg-accent-solid/12',
                    verdict && !showRight && !showWrong && 'opacity-60',
                  )}
                >
                  <span
                    className={cx(
                      'flex h-8 w-8 shrink-0 items-center justify-center text-[13px] font-bold transition-colors',
                      multi ? 'rounded-lg' : 'rounded-xl',
                      showRight ? 'bg-good text-white' : showWrong ? 'bg-bad text-white' : picked ? 'bg-accent-solid text-on-accent' : 'bg-surface-2 text-muted',
                    )}
                  >
                    {showRight ? <Check size={16} /> : showWrong ? <X size={16} /> : multi && picked ? <Check size={16} /> : LETTERS[pos]}
                  </span>
                  <span className={cx('flex-1 text-[15.5px] text-fg', showWrong && 'line-through decoration-bad/60')}>
                    <Tex>{task.options![optionIndex]}</Tex>
                  </span>
                </motion.button>
              </li>
            )
          })}
        </ul>
      )}
      {multi && !verdict && !onSelect && onAnswer && (
        <motion.button
          type="button"
          whileTap={{ scale: 0.97 }}
          disabled={!marks.length}
          onClick={() => onAnswer(marks.slice().sort((x, y) => x - y))}
          className="mt-3 h-13 w-full rounded-[18px] bg-accent-solid py-3.5 text-[15.5px] font-semibold text-on-accent disabled:opacity-40"
        >
          Ответить{marks.length ? ` · отмечено ${marks.length}` : ''}
        </motion.button>
      )}

      {task.kind === 'input' && (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (!value.trim() || verdict) return
            inputRef.current?.blur()
            onAnswer?.(value)
          }}
          className="flex gap-2"
        >
          <input
            ref={inputRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            disabled={Boolean(verdict)}
            inputMode={numeric ? 'decimal' : 'text'}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder={numeric ? 'Ответ — число' : 'Краткий ответ'}
            className={cx(
              'glass h-14 min-w-0 flex-1 rounded-[18px] px-4 text-[18px] font-semibold text-fg outline-none placeholder:font-normal placeholder:text-faint focus:border-accent/70',
              reveal && verdict?.correct && '!border-good/60 !bg-good/12',
              reveal && verdict && !verdict.correct && 'anim-shake !border-bad/55 !bg-bad/10',
            )}
            key={verdict && !verdict.correct ? `w${shake}` : 'n'}
          />
          {onAnswer && !verdict && (
            <motion.button
              type="submit"
              whileTap={{ scale: 0.94 }}
              disabled={!value.trim()}
              className="h-14 rounded-[18px] bg-accent-solid px-5 text-[15px] font-semibold text-on-accent disabled:opacity-40"
            >
              Ответ
            </motion.button>
          )}
        </form>
      )}
      {task.kind === 'input' && !verdict && (
        <p className="mt-2 px-1 text-[12px] text-muted">
          {numeric ? 'Десятичную дробь можно через точку или запятую.' : 'Последовательности вида А1Б3В2 вводите без пробелов.'}
        </p>
      )}
    </div>
  )
}

export function HintButton({ hint, used, onUse }: { hint?: string; used: boolean; onUse: () => void }) {
  if (!hint) return null
  return (
    <div className="mt-4">
      <AnimatePresence initial={false} mode="wait">
        {used ? (
          <motion.div key="hint" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={springSoft} className="glass flex gap-2.5 rounded-[18px] p-3.5">
            <Lightbulb size={17} className="mt-0.5 shrink-0 text-warn" />
            <p className="text-[14px] leading-relaxed text-fg-2">
              <Tex>{hint}</Tex>
            </p>
          </motion.div>
        ) : (
          <motion.button
            key="btn"
            type="button"
            whileTap={{ scale: 0.95 }}
            onClick={() => {
              tap('light')
              onUse()
            }}
            className="flex items-center gap-1.5 text-[13.5px] font-semibold text-warn"
          >
            <Lightbulb size={16} /> Подсказка
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  )
}
