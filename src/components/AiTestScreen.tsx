import { useEffect, useRef, useState } from 'react'
import {
  ArrowRight,
  Check,
  ChevronDown,
  Key,
  Loader,
  Sparkles,
  TriangleAlert,
  X,
} from 'lucide-react'
import { CATEGORIES, CATEGORY_META, type Category } from '../types'
import {
  DEFAULT_MODEL,
  generateTest,
  loadSettings,
  looksLikeGeminiKey,
  saveSettings,
  type AiTask,
  type GeminiSettings,
} from '../lib/gemini'
import { cx } from '../lib/cx'
import { Tex } from './Tex'

type Phase = 'setup' | 'loading' | 'test' | 'result'

const LETTERS = ['А', 'Б', 'В', 'Г']
const COUNTS = [5, 10]

function Difficulty({ level }: { level: number }) {
  const n = Math.max(1, Math.min(5, level))
  return (
    <span className="flex items-center gap-0.5" title={`Сложность ${n} из 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span
          key={i}
          className={cx('h-1.5 w-1.5 rounded-full', i <= n ? 'bg-amber-400' : 'bg-white/15')}
        />
      ))}
    </span>
  )
}

function KeyEditor({
  settings,
  onSave,
}: {
  settings: GeminiSettings
  onSave: (s: GeminiSettings) => void
}) {
  const [apiKey, setApiKey] = useState(settings.apiKey)
  const [model, setModel] = useState(settings.model)
  const [visible, setVisible] = useState(false)

  const suspicious = apiKey.trim() !== '' && !looksLikeGeminiKey(apiKey)

  return (
    <div className="rounded-2xl border border-edge bg-panel-2/70 p-3.5">
      <p className="mb-2 flex items-center gap-2 text-[13px] font-bold text-slate-200">
        <Key size={14} className="text-sky-300" />
        Ключ Gemini API
      </p>
      <p className="mb-3 text-[12px] leading-relaxed text-muted">
        Ключ хранится только на этом устройстве и отправляется напрямую в Google. Получить:{' '}
        <span className="text-sky-300">aistudio.google.com/apikey</span>
      </p>

      <div className="mb-2 flex gap-2">
        <input
          type={visible ? 'text' : 'password'}
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="AQ. или AIza…"
          autoComplete="off"
          spellCheck={false}
          className="min-w-0 flex-1 rounded-xl border border-edge bg-abyss/60 px-3 py-2 font-mono text-[13px] text-slate-100 outline-none placeholder:text-muted/60 focus:border-sky-400/60"
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="shrink-0 rounded-xl border border-edge px-3 text-[12px] text-muted transition hover:text-white"
        >
          {visible ? 'Скрыть' : 'Показать'}
        </button>
      </div>

      {suspicious && (
        <p className="mb-2 flex gap-1.5 text-[12px] leading-relaxed text-amber-300">
          <TriangleAlert size={13} className="mt-0.5 shrink-0" />
          Не похоже на ключ AI Studio: они начинаются с «AQ.» или «AIza». Сохранить можно,
          но запрос, скорее всего, отклонят.
        </p>
      )}

      <input
        value={model}
        onChange={(e) => setModel(e.target.value)}
        placeholder={DEFAULT_MODEL}
        spellCheck={false}
        className="mb-3 w-full rounded-xl border border-edge bg-abyss/60 px-3 py-2 font-mono text-[12px] text-slate-300 outline-none placeholder:text-muted/60 focus:border-sky-400/60"
      />

      <button
        type="button"
        disabled={apiKey.trim() === ''}
        onClick={() => onSave({ apiKey: apiKey.trim(), model: model.trim() || DEFAULT_MODEL })}
        className={cx(
          'w-full rounded-xl py-2.5 text-[14px] font-semibold transition',
          apiKey.trim() ? 'bg-sky-400 text-slate-950' : 'bg-white/8 text-muted',
        )}
      >
        Сохранить ключ
      </button>
    </div>
  )
}

function TaskReview({ task, chosen, index }: { task: AiTask; chosen: number | null; index: number }) {
  const [open, setOpen] = useState(false)
  const correct = chosen === task.correct_index

  return (
    <li className="overflow-hidden rounded-2xl border border-edge bg-panel-2/60">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-start gap-3 px-3.5 py-3 text-left"
      >
        <span
          className={cx(
            'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold',
            correct ? 'bg-emerald-400 text-emerald-950' : 'bg-rose-500 text-white',
          )}
        >
          {correct ? <Check size={13} /> : <X size={13} />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="mb-1 flex items-center gap-2">
            <span className="text-[11px] text-muted">Задание {index + 1}</span>
            <Difficulty level={task.difficulty} />
          </span>
          <span className="block text-[14px] text-slate-100">
            <Tex>{task.question}</Tex>
          </span>
        </span>
        <ChevronDown
          size={16}
          className={cx('mt-1 shrink-0 text-muted transition-transform', open && 'rotate-180')}
        />
      </button>

      {open && (
        <div className="anim-fade space-y-2.5 border-t border-edge/70 px-3.5 py-3">
          <div className="rounded-xl border border-emerald-400/25 bg-emerald-400/10 p-3">
            <p className="mb-1 text-[11px] font-bold tracking-wider text-emerald-300 uppercase">
              Верный ответ
            </p>
            <p className="text-[14px] text-emerald-50">
              <Tex>{task.options[task.correct_index]}</Tex>
            </p>
          </div>

          {!correct && chosen !== null && (
            <div className="rounded-xl border border-rose-500/25 bg-rose-500/8 p-3">
              <p className="mb-1 text-[11px] font-bold tracking-wider text-rose-300 uppercase">
                Ваш ответ
              </p>
              <p className="text-[14px] text-rose-100/90 line-through decoration-rose-400/50">
                <Tex>{task.options[chosen]}</Tex>
              </p>
            </div>
          )}

          {task.solution.length > 0 && (
            <div className="rounded-xl border border-edge bg-abyss/40 p-3">
              <p className="mb-2 text-[11px] font-bold tracking-wider text-sky-300 uppercase">
                Решение
              </p>
              <ol className="space-y-1.5">
                {task.solution.map((step, i) => (
                  <li key={i} className="flex gap-2.5">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-sky-400/15 text-[10px] font-bold text-sky-300">
                      {i + 1}
                    </span>
                    <span className="flex-1 text-[14px] leading-relaxed text-slate-200">
                      <Tex>{step}</Tex>
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}
    </li>
  )
}

export function AiTestScreen({ onBack }: { onBack: () => void }) {
  const [phase, setPhase] = useState<Phase>('setup')
  const [settings, setSettings] = useState<GeminiSettings>(loadSettings)
  const [editingKey, setEditingKey] = useState(false)
  const [categories, setCategories] = useState<Category[]>([])
  const [count, setCount] = useState(5)
  const [tasks, setTasks] = useState<AiTask[]>([])
  const [answers, setAnswers] = useState<(number | null)[]>([])
  const [idx, setIdx] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const abortRef = useRef<AbortController | null>(null)
  useEffect(() => () => abortRef.current?.abort(), [])

  const hasKey = settings.apiKey.trim() !== ''

  function toggle(category: Category) {
    setCategories((prev) =>
      prev.includes(category) ? prev.filter((c) => c !== category) : [...prev, category],
    )
  }

  async function start() {
    setError(null)
    setPhase('loading')
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    try {
      const generated = await generateTest({ settings, categories, count, signal: controller.signal })
      setTasks(generated)
      setAnswers(new Array(generated.length).fill(null))
      setIdx(0)
      setPhase('test')
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') return
      setError((e as Error).message)
      setPhase('setup')
    }
  }

  // ---------- Загрузка ----------
  if (phase === 'loading') {
    return (
      <div className="mx-auto flex w-full max-w-lg flex-col items-center px-4 pt-24 text-center">
        <Loader size={30} className="mb-4 animate-spin text-sky-400" />
        <p className="text-[15px] font-semibold text-slate-100">Составляю работу…</p>
        <p className="mt-1.5 text-[13px] text-muted">
          {count} заданий по возрастанию сложности. Обычно занимает 10–20 секунд.
        </p>
        <button
          type="button"
          onClick={() => {
            abortRef.current?.abort()
            setPhase('setup')
          }}
          className="mt-6 rounded-xl border border-edge px-4 py-2 text-[13px] text-muted transition hover:text-white"
        >
          Отменить
        </button>
      </div>
    )
  }

  // ---------- Результат ----------
  if (phase === 'result') {
    const right = tasks.filter((t, i) => answers[i] === t.correct_index).length
    const percent = tasks.length ? Math.round((right / tasks.length) * 100) : 0

    return (
      <div className="mx-auto w-full max-w-lg px-4 pt-6">
        <header className="anim-pop mb-5 text-center">
          <p className="text-[11px] tracking-[0.15em] text-muted uppercase">результат работы</p>
          <p className="tabular text-5xl leading-tight font-black text-white">
            {right}
            <span className="text-2xl text-muted">/{tasks.length}</span>
          </p>
          <p className="mt-1 text-[14px] text-muted">{percent}% верных ответов</p>
        </header>

        <ul className="mb-4 space-y-2">
          {tasks.map((task, i) => (
            <TaskReview key={i} task={task} chosen={answers[i]} index={i} />
          ))}
        </ul>

        <div className="safe-bottom space-y-2.5">
          <button
            type="button"
            onClick={() => setPhase('setup')}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-violet-400 to-fuchsia-500 px-4 py-3.5 text-[15px] font-bold text-slate-950 transition active:scale-[0.99]"
          >
            <Sparkles size={17} />
            Новая работа
          </button>
          <button
            type="button"
            onClick={onBack}
            className="w-full rounded-2xl border border-edge bg-panel-2/60 px-4 py-3.5 text-[15px] font-semibold text-slate-200 transition active:scale-[0.99]"
          >
            В меню
          </button>
        </div>
      </div>
    )
  }

  // ---------- Прохождение ----------
  if (phase === 'test') {
    const task = tasks[idx]
    const chosen = answers[idx]
    const answered = answers.filter((a) => a !== null).length
    const last = idx === tasks.length - 1

    return (
      <div className="mx-auto w-full max-w-lg px-4 pt-4">
        <header className="mb-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={onBack}
              aria-label="Выйти"
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-edge bg-panel-2/70 text-muted transition hover:text-white"
            >
              <X size={17} />
            </button>
            <div className="min-w-0 flex-1 text-center">
              <p className="truncate text-[13px] font-semibold text-slate-200">Проверочная работа</p>
              <p className="text-[11px] text-muted">
                Задание {idx + 1} из {tasks.length} · отвечено {answered}
              </p>
            </div>
            <Difficulty level={task.difficulty} />
          </div>

          <div className="flex gap-1">
            {tasks.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setIdx(i)}
                aria-label={`Задание ${i + 1}`}
                className={cx(
                  'h-1.5 flex-1 rounded-full transition',
                  i === idx
                    ? 'bg-white'
                    : answers[i] !== null
                      ? 'bg-violet-400/70'
                      : 'bg-white/10',
                )}
              />
            ))}
          </div>
        </header>

        <main className="safe-bottom">
          {task.topic && (
            <p className="mb-2 inline-block rounded-full bg-violet-400/15 px-2.5 py-1 text-[11px] font-semibold text-violet-300">
              {task.topic}
            </p>
          )}

          <h2 className="mb-5 text-[17px] leading-relaxed text-slate-100">
            <Tex>{task.question}</Tex>
          </h2>

          <ul className="mb-5 flex flex-col gap-2.5">
            {task.options.map((option, pos) => (
              <li key={pos}>
                <button
                  type="button"
                  onClick={() =>
                    setAnswers((prev) => prev.map((a, i) => (i === idx ? pos : a)))
                  }
                  className={cx(
                    'flex w-full items-center gap-3 rounded-2xl border px-3.5 py-3 text-left transition active:scale-[0.99]',
                    chosen === pos
                      ? 'border-violet-400/70 bg-violet-400/15 text-violet-50'
                      : 'border-edge bg-panel-2/80 text-slate-100 hover:border-slate-500',
                  )}
                >
                  <span
                    className={cx(
                      'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold',
                      chosen === pos ? 'bg-violet-400 text-slate-950' : 'bg-white/8 text-muted',
                    )}
                  >
                    {LETTERS[pos]}
                  </span>
                  <span className="flex-1 text-[15px]">
                    <Tex>{option}</Tex>
                  </span>
                </button>
              </li>
            ))}
          </ul>

          <div className="flex gap-2.5">
            {idx > 0 && (
              <button
                type="button"
                onClick={() => setIdx((i) => i - 1)}
                className="rounded-2xl border border-edge bg-panel-2/60 px-5 py-3.5 text-[15px] font-semibold text-slate-200"
              >
                Назад
              </button>
            )}
            <button
              type="button"
              onClick={() => (last ? setPhase('result') : setIdx((i) => i + 1))}
              className={cx(
                'flex flex-1 items-center justify-center gap-2 rounded-2xl px-4 py-3.5 text-[15px] font-bold transition active:scale-[0.99]',
                last
                  ? 'bg-gradient-to-r from-violet-400 to-fuchsia-500 text-slate-950'
                  : 'bg-white text-slate-900',
              )}
            >
              {last ? 'Завершить работу' : 'Дальше'}
              <ArrowRight size={17} />
            </button>
          </div>

          {last && answered < tasks.length && (
            <p className="mt-3 text-center text-[12px] text-amber-300">
              Без ответа осталось заданий: {tasks.length - answered}
            </p>
          )}
        </main>
      </div>
    )
  }

  // ---------- Настройка ----------
  return (
    <div className="mx-auto w-full max-w-lg px-4 pt-4">
      <header className="mb-5 flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          aria-label="Назад"
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-edge bg-panel-2/70 text-muted transition hover:text-white"
        >
          <X size={17} />
        </button>
        <div>
          <h1 className="text-lg font-bold text-white">Проверочная работа</h1>
          <p className="text-[12px] text-muted">Задания генерирует Gemini по выбранным темам</p>
        </div>
      </header>

      {error && (
        <div className="anim-pop mb-4 flex gap-2.5 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-3.5">
          <TriangleAlert size={16} className="mt-0.5 shrink-0 text-rose-300" />
          <p className="text-[13px] leading-relaxed text-rose-100">{error}</p>
        </div>
      )}

      {!hasKey || editingKey ? (
        <div className="mb-5">
          <KeyEditor
            settings={settings}
            onSave={(s) => {
              saveSettings(s)
              setSettings(s)
              setEditingKey(false)
              setError(null)
            }}
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setEditingKey(true)}
          className="mb-5 flex w-full items-center gap-2.5 rounded-2xl border border-edge bg-panel-2/60 px-3.5 py-3 text-left"
        >
          <Key size={15} className="shrink-0 text-emerald-300" />
          <span className="flex-1 text-[13px] text-slate-200">
            Ключ сохранён на устройстве
            <span className="block text-[11px] text-muted">модель: {settings.model}</span>
          </span>
          <span className="text-[12px] text-muted">Изменить</span>
        </button>
      )}

      <section className="mb-4">
        <h2 className="mb-2 text-[13px] font-semibold text-slate-200">
          Темы <span className="font-normal text-muted">· ничего не выбрано = все</span>
        </h2>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((category) => {
            const meta = CATEGORY_META[category]
            const active = categories.includes(category)
            return (
              <button
                key={category}
                type="button"
                onClick={() => toggle(category)}
                aria-pressed={active}
                className={cx(
                  'rounded-full border px-3 py-1.5 text-[13px] font-medium transition active:scale-[0.98]',
                  active ? 'text-slate-950' : 'border-edge bg-panel-2/60 text-slate-300',
                )}
                style={active ? { background: meta.accent, borderColor: meta.accent } : undefined}
              >
                {meta.short}
              </button>
            )
          })}
        </div>
      </section>

      <section className="mb-5">
        <h2 className="mb-2 text-[13px] font-semibold text-slate-200">Количество заданий</h2>
        <div className="flex gap-2">
          {COUNTS.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setCount(n)}
              aria-pressed={count === n}
              className={cx(
                'flex-1 rounded-xl border py-2.5 text-[14px] font-semibold transition active:scale-[0.98]',
                count === n
                  ? 'border-violet-400/60 bg-violet-400/15 text-violet-200'
                  : 'border-edge bg-panel-2/60 text-muted',
              )}
            >
              {n} заданий
            </button>
          ))}
        </div>
      </section>

      <div className="safe-bottom">
        <button
          type="button"
          disabled={!hasKey}
          onClick={start}
          className={cx(
            'flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-4 text-[16px] font-bold transition active:scale-[0.99]',
            hasKey
              ? 'bg-gradient-to-r from-violet-400 to-fuchsia-500 text-slate-950 shadow-lg shadow-violet-500/20'
              : 'bg-white/8 text-muted',
          )}
        >
          <Sparkles size={18} />
          Составить работу
        </button>
        <p className="mt-3 px-1 text-[12px] leading-relaxed text-muted">
          Требуется интернет. Задания придумывает нейросеть, поэтому изредка возможны неточности —
          спорные места сверяйте с формульником.
        </p>
      </div>
    </div>
  )
}
