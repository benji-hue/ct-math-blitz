import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  ArrowUp,
  BookOpen,
  Camera,
  ChevronDown,
  CircleStop,
  Copy,
  HeartPulse,
  Lightbulb,
  ListChecks,
  MessageCircleQuestion,
  RefreshCw,
  ScanSearch,
  Sparkles,
  Trash2,
  Undo2,
  X,
} from 'lucide-react'
import { topicById, useSubject, loadSubject } from '../content'
import { SUBJECT_LIST, SUBJECTS } from '../domain/subjects'
import type { SubjectId } from '../domain/types'
import { AiError, compressImage, isAiUnavailable, modelLabel, streamChat, type ChatTurn, type TaskContext } from '../lib/ai'
import { demoAnswer } from '../lib/demoAi'
import { referencesFor } from '../lib/retrieval'
import { useStore, type AiMode, type ChatMessage } from '../lib/store'
import { useNav, useTutorBus } from '../nav/nav'
import { Sheet, toast, useUi } from '../ui/chrome'
import { Chip, IconButton, tap } from '../ui/kit'
import { springSoft } from '../ui/motion'
import { Markdown, Tex } from '../ui/Rich'
import { SubjectIcon } from '../ui/SubjectIcon'
import { cx } from '../lib/cx'

const MODES: { id: AiMode; label: string; icon: typeof Sparkles; hint: string }[] = [
  { id: 'tutor', label: 'Репетитор', icon: Sparkles, hint: 'Спроси что угодно по программе ЦЭ/ЦТ' },
  { id: 'explain', label: 'Объясни', icon: Lightbulb, hint: 'Тема с нуля: интуиция → правило → пример → ловушка' },
  { id: 'socratic', label: 'Сократ', icon: MessageCircleQuestion, hint: 'Только наводящие вопросы — дойдёшь до ответа сам' },
  { id: 'check', label: 'Проверь решение', icon: ScanSearch, hint: 'Пришли решение текстом или фото — найду первую ошибку' },
  { id: 'mistake', label: 'Разбор ошибки', icon: BookOpen, hint: 'Почему ошибся и как не попасться снова' },
  { id: 'plan', label: 'План', icon: ListChecks, hint: 'Расписание подготовки под твою дату экзамена' },
  { id: 'calm', label: 'Антистресс', icon: HeartPulse, hint: 'Поддержка перед экзаменом, техники с доказанной пользой' },
]

const SUGGESTIONS: Record<AiMode, string[]> = {
  tutor: ['Как решать задания части B быстрее?', 'Чем отличается ЦЭ от ЦТ?', 'Сделай мини-тест из 3 вопросов по моей слабой теме'],
  explain: ['Объясни метод интервалов', 'Что такое ОДЗ и зачем она нужна?', 'Как отличить причастие от прилагательного?'],
  socratic: ['Проверь, понимаю ли я логарифмы', 'Помоги дойти до формулы площади трапеции', 'Почему тело плавает?'],
  check: ['Вот моё решение: ...', 'Проверь: x² − 5x + 6 = 0, x = 2 и x = 3'],
  mistake: ['Почему я путаю Н и НН?', 'Я снова ошибся в знаке при раскрытии скобок — как перестать?'],
  plan: ['Составь план на неделю: 1 час в день', 'Сколько нужно заниматься, чтобы поднять балл на 15?'],
  calm: ['Очень волнуюсь перед ЦТ', 'Что делать, если на экзамене «поплыл»?', 'Как выспаться перед экзаменом?'],
}

function scrollParent(el: HTMLElement | null): HTMLElement | null {
  return el?.closest('[data-screen]') as HTMLElement | null
}

export default function TutorScreen() {
  const chat = useStore((s) => s.chat)
  const profile = useStore((s) => s.profile)
  const demo = useStore((s) => s.demo)
  const setChat = useStore((s) => s.setChat)
  const pushMessage = useStore((s) => s.pushMessage)
  const patchMessage = useStore((s) => s.patchMessage)
  const clearChat = useStore((s) => s.clearChat)
  const content = useSubject(chat.subject)
  const topic = topicById(content, chat.topicId ?? '')

  const [input, setInput] = useState('')
  const [image, setImage] = useState<{ mime: string; data: string; preview: string } | null>(null)
  const [streamingId, setStreamingId] = useState<string | null>(null)
  const [subjectSheet, setSubjectSheet] = useState(false)
  const pendingTask = useRef<TaskContext | undefined>(undefined)
  const abortRef = useRef<AbortController | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const stick = useRef(true)
  const setKeyboard = useUi((s) => s.setKeyboard)
  const keyboard = useUi((s) => s.keyboard)

  useEffect(() => () => abortRef.current?.abort(), [])
  useEffect(() => () => setKeyboard(false), [setKeyboard])

  // Автопрокрутка вниз, пока пользователь сам не ушёл читать вверх.
  useLayoutEffect(() => {
    const parent = scrollParent(listRef.current)
    if (parent && stick.current) parent.scrollTop = parent.scrollHeight
  }, [chat.messages])
  useEffect(() => {
    const parent = scrollParent(listRef.current)
    if (!parent) return
    const onScroll = () => {
      stick.current = parent.scrollHeight - parent.scrollTop - parent.clientHeight < 120
    }
    parent.addEventListener('scroll', onScroll, { passive: true })
    return () => parent.removeEventListener('scroll', onScroll)
  }, [])

  const send = useCallback(
    async (text: string, opts: { image?: typeof image; task?: TaskContext; mode?: AiMode; subject?: SubjectId | null; topicId?: string | null } = {}) => {
      const state = useStore.getState()
      const mode = opts.mode ?? state.chat.mode
      const subject = opts.subject !== undefined ? opts.subject : state.chat.subject
      const topicId = opts.topicId !== undefined ? opts.topicId : state.chat.topicId
      const body = text.trim()
      if ((!body && !opts.image) || streamingId) return
      tap('medium')
      stick.current = true

      const history: ChatTurn[] = state.chat.messages
        .filter((m) => !m.error && m.content)
        .slice(-10)
        .map((m) => ({ role: m.role, content: m.content }))

      pushMessage({ role: 'user', content: body || 'Проверь решение на фото.', image: opts.image?.preview })
      const id = pushMessage({ role: 'assistant', content: '' })
      setStreamingId(id)
      setInput('')
      setImage(null)

      const subjectContent = subject ? await loadSubject(subject).catch(() => null) : null
      const currentTopic = subjectContent && topicId ? (subjectContent.topics.find((t) => t.id === topicId) ?? null) : null
      const refs = referencesFor(subjectContent, `${body} ${opts.task?.q ?? ''}`, currentTopic)

      const controller = new AbortController()
      abortRef.current = controller
      let acc = ''
      let lastPaint = 0
      try {
        const stream = streamChat(
          {
            mode,
            subject,
            subjectTitle: subject ? SUBJECTS[subject].title : undefined,
            topic: currentTopic?.title,
            messages: [...history, { role: 'user', content: body || 'Проверь решение на фото.' }],
            refs,
            profile: { grade: state.profile.grade, exam: state.profile.exam, target: subject ? state.profile.targets[subject] : undefined },
            task: opts.task,
            image: opts.image ? { mime: opts.image.mime, data: opts.image.data } : undefined,
          },
          controller.signal,
        )
        for await (const ev of stream) {
          if (ev.type === 'delta') {
            acc += ev.text
            const t = performance.now()
            if (t - lastPaint > 40) {
              lastPaint = t
              patchMessage(id, { content: acc })
            }
          } else if (ev.type === 'meta') {
            patchMessage(id, { provider: ev.provider, model: ev.model })
          } else if (ev.type === 'error') {
            throw new AiError(ev.message)
          }
        }
        patchMessage(id, { content: acc || 'Модель вернула пустой ответ. Попробуйте переформулировать вопрос.', error: !acc })
      } catch (e) {
        if ((e as Error).name === 'AbortError') {
          patchMessage(id, { content: acc || 'Остановлено.' })
        } else if (useStore.getState().demo && isAiUnavailable(e)) {
          // Демо без интернета: заранее подготовленный ответ, честно помеченный.
          for await (const chunk of demoAnswer(mode, body)) {
            acc += chunk
            patchMessage(id, { content: acc, provider: 'demo' })
          }
        } else {
          patchMessage(id, { content: (e as Error).message, error: true })
        }
      } finally {
        setStreamingId(null)
        abortRef.current = null
      }
    },
    [patchMessage, pushMessage, streamingId],
  )

  // Переход из другого экрана: «Разобрать с ИИ», «Объясни тему», «Фото решения».
  const intent = useTutorBus((s) => s.intent)
  useEffect(() => {
    if (!intent) return
    const i = useTutorBus.getState().consume()
    if (!i) return
    setChat({ mode: i.mode, subject: i.subject ?? useStore.getState().chat.subject, topicId: i.topicId ?? null })
    if (i.photo) window.setTimeout(() => fileRef.current?.click(), 350)
    if (i.prompt) {
      pendingTask.current = i.task
      window.setTimeout(() => send(i.prompt!, { task: i.task, mode: i.mode, subject: i.subject ?? null, topicId: i.topicId ?? null }), 250)
    }
  }, [intent, send, setChat])

  async function pickImage(file: File | undefined) {
    if (!file) return
    try {
      const compressed = await compressImage(file)
      setImage(compressed)
      if (chat.mode !== 'check') setChat({ mode: 'check' })
    } catch {
      toast('Не удалось прочитать фото', 'error')
    }
  }

  const returnTo = useTutorBus((s) => s.returnTo)
  const clearReturn = useTutorBus((s) => s.clearReturn)
  const switchTab = useNav((s) => s.switchTab)
  const modeMeta = MODES.find((m) => m.id === chat.mode) ?? MODES[0]
  const messages = chat.messages

  return (
    <div className="pt-1">
      <header className="mb-3 flex items-center gap-3">
        <span className="relative flex h-11 w-11 items-center justify-center">
          <span className={cx('orb absolute inset-0 rounded-full', streamingId ? 'opacity-100' : 'opacity-70')} />
          <span className="absolute inset-[2.5px] rounded-full bg-solid" />
          <Sparkles size={19} className="relative text-accent" />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="text-[20px] leading-tight font-bold tracking-[-0.02em] text-fg">ИИ-репетитор</h1>
          <p className="truncate text-[12.5px] text-muted">{streamingId ? 'печатает…' : modeMeta.hint}</p>
        </div>
        {messages.length > 0 && (
          <IconButton
            label="Очистить чат"
            onClick={() => {
              abortRef.current?.abort()
              clearChat()
            }}
          >
            <Trash2 size={17} />
          </IconButton>
        )}
      </header>

      {returnTo && (
        <button
          type="button"
          onClick={() => {
            tap()
            clearReturn()
            switchTab(returnTo)
          }}
          className="glass mb-3 flex w-full items-center gap-2 rounded-2xl px-3.5 py-2.5 text-left text-[14px] font-semibold text-accent"
        >
          <Undo2 size={16} /> Вернуться к заданию
        </button>
      )}

      <div className="no-scrollbar -mx-4 mb-3 flex gap-2 overflow-x-auto px-4 pb-1">
        {MODES.map((m) => (
          <Chip key={m.id} active={chat.mode === m.id} onClick={() => setChat({ mode: m.id })} icon={<m.icon size={14} />}>
            {m.label}
          </Chip>
        ))}
      </div>

      <button
        type="button"
        onClick={() => {
          tap()
          setSubjectSheet(true)
        }}
        className="glass mb-4 flex w-full items-center gap-2.5 rounded-2xl px-3 py-2.5 text-left"
      >
        {chat.subject ? <SubjectIcon id={chat.subject} size={28} /> : <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-surface-2 text-muted"><BookOpen size={15} /></span>}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-semibold text-fg">{chat.subject ? SUBJECTS[chat.subject].short : 'Предмет не выбран'}</span>
          <span className="block truncate text-[12px] text-muted">{topic ? topic.title : 'ИИ опирается на конспекты по выбранному предмету'}</span>
        </span>
        <ChevronDown size={17} className="text-faint" />
      </button>

      <div ref={listRef} className="space-y-3 pb-28">
        {messages.length === 0 && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={springSoft} className="pt-6">
            <p className="mb-1 text-center text-[22px] font-bold text-fg">Чем помочь?</p>
            <p className="mb-5 text-center text-[13.5px] text-muted">Я объясняю и подсказываю, а не решаю за тебя — так знания остаются надолго.</p>
            <div className="space-y-2">
              {SUGGESTIONS[chat.mode].map((s) => (
                <motion.button
                  key={s}
                  type="button"
                  whileTap={{ scale: 0.98 }}
                  onClick={() => (s.endsWith('...') ? setInput(s.replace('...', '')) : send(s))}
                  className="glass w-full rounded-2xl px-4 py-3 text-left text-[14.5px] text-fg-2"
                >
                  {s}
                </motion.button>
              ))}
            </div>
          </motion.div>
        )}

        <AnimatePresence initial={false}>
          {messages.map((m) => (
            <Bubble key={m.id} message={m} streaming={m.id === streamingId} onRetry={() => {
              const lastUser = [...messages].reverse().find((x) => x.role === 'user')
              if (lastUser) send(lastUser.content, { task: pendingTask.current })
            }} />
          ))}
        </AnimatePresence>
        {demo && messages.some((m) => m.provider === 'demo') && (
          <p className="text-center text-[11.5px] text-faint">Демо-режим: если сервер ИИ недоступен, показываются заранее заготовленные ответы.</p>
        )}
      </div>

      <div className="fixed inset-x-0 z-30 px-4" style={{ bottom: keyboard ? 'calc(var(--app-bottom) + 8px)' : 'calc(var(--app-bottom) + var(--tabbar-h) + 18px)' }}>
        <div className="mx-auto max-w-xl">
          <AnimatePresence>
            {image && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} className="mb-2 inline-flex items-center gap-2 rounded-2xl glass-strong p-1.5 pr-3">
                <img src={image.preview} alt="Фото решения" className="h-12 w-12 rounded-xl object-cover" />
                <span className="text-[12.5px] text-fg-2">Фото решения</span>
                <button type="button" aria-label="Убрать фото" onClick={() => setImage(null)} className="text-muted">
                  <X size={16} />
                </button>
              </motion.div>
            )}
          </AnimatePresence>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              send(input, { image, task: pendingTask.current })
            }}
            className="glass-strong flex items-end gap-2 rounded-[26px] p-1.5"
          >
            <button
              type="button"
              aria-label="Прикрепить фото решения"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                tap()
                fileRef.current?.click()
              }}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:text-fg"
            >
              <Camera size={20} />
            </button>
            <textarea
              value={input}
              onChange={(e) => {
                setInput(e.target.value)
                e.target.style.height = 'auto'
                e.target.style.height = `${Math.min(140, e.target.scrollHeight)}px`
              }}
              onFocus={() => setKeyboard(true)}
              onBlur={() => window.setTimeout(() => setKeyboard(false), 120)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !('ontouchstart' in window)) {
                  e.preventDefault()
                  send(input, { image, task: pendingTask.current })
                }
              }}
              rows={1}
              placeholder={chat.mode === 'check' ? 'Опиши решение или прикрепи фото…' : 'Спроси репетитора…'}
              className="max-h-[140px] min-h-10 flex-1 resize-none bg-transparent py-2.5 text-[15px] leading-snug text-fg outline-none placeholder:text-faint"
            />
            {streamingId ? (
              <motion.button
                type="button"
                whileTap={{ scale: 0.9 }}
                aria-label="Остановить"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => abortRef.current?.abort()}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-2 text-fg"
              >
                <CircleStop size={20} />
              </motion.button>
            ) : (
              <motion.button
                type="submit"
                whileTap={{ scale: 0.9 }}
                aria-label="Отправить"
                onMouseDown={(e) => e.preventDefault()}
                disabled={!input.trim() && !image}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-solid text-on-accent transition-opacity disabled:opacity-35"
              >
                <ArrowUp size={20} strokeWidth={2.5} />
              </motion.button>
            )}
          </form>
          <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => pickImage(e.target.files?.[0])} />
        </div>
      </div>

      <Sheet open={subjectSheet} onClose={() => setSubjectSheet(false)} title="Предмет для ИИ">
        <div className="grid grid-cols-2 gap-2 pb-2">
          {SUBJECT_LIST.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => {
                tap()
                setChat({ subject: s.id, topicId: null })
                setSubjectSheet(false)
              }}
              className={cx('glass flex items-center gap-2.5 rounded-2xl p-2.5 text-left', chat.subject === s.id && 'ring-2 ring-accent')}
            >
              <SubjectIcon id={s.id} size={30} />
              <span className="truncate text-[13.5px] font-semibold text-fg">{s.short}</span>
            </button>
          ))}
        </div>
        {chat.subject && (
          <button
            type="button"
            onClick={() => {
              setChat({ subject: null, topicId: null })
              setSubjectSheet(false)
            }}
            className="mt-2 w-full py-2 text-[14px] font-semibold text-muted"
          >
            Без предмета
          </button>
        )}
        {profile.subjects.length === 0 && null}
      </Sheet>
    </div>
  )
}

function Bubble({ message, streaming, onRetry }: { message: ChatMessage; streaming: boolean; onRetry: () => void }) {
  const mine = message.role === 'user'
  return (
    <motion.div
      layout="position"
      initial={{ opacity: 0, y: 14, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={springSoft}
      className={cx('flex', mine ? 'justify-end' : 'justify-start')}
    >
      <div
        className={cx(
          'max-w-[88%] rounded-[22px] px-4 py-3 text-[15px] leading-relaxed',
          mine ? 'rounded-br-md bg-accent-solid text-on-accent' : 'glass rounded-bl-md text-fg',
          message.error && '!border-bad/40',
        )}
      >
        {message.image && <img src={message.image} alt="" className="mb-2 max-h-48 rounded-xl object-cover" />}
        {mine ? (
          <p className="whitespace-pre-wrap">
            <Tex>{message.content}</Tex>
          </p>
        ) : message.content ? (
          <Markdown streaming={streaming} className={message.error ? 'text-bad' : undefined}>
            {message.content}
          </Markdown>
        ) : (
          <span className="flex items-center gap-1.5 py-1" aria-label="ИИ печатает">
            {[0, 1, 2].map((i) => (
              <motion.span
                key={i}
                className="h-2 w-2 rounded-full bg-muted"
                animate={{ opacity: [0.3, 1, 0.3], y: [0, -3, 0] }}
                transition={{ duration: 1, repeat: Infinity, delay: i * 0.15 }}
              />
            ))}
          </span>
        )}
        {!mine && !streaming && message.content && (
          <div className="mt-2 flex items-center gap-3 text-[12px] text-faint">
            {message.error ? (
              <button type="button" onClick={onRetry} className="flex items-center gap-1 font-semibold text-accent">
                <RefreshCw size={13} /> Повторить
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard?.writeText(message.content).then(() => toast('Скопировано', 'success'))
                }}
                className="flex items-center gap-1"
              >
                <Copy size={13} /> Копировать
              </button>
            )}
            {message.provider && <span>· {message.provider === 'demo' ? 'демо' : modelLabel(message.model, message.provider)}</span>}
          </div>
        )}
      </div>
    </motion.div>
  )
}
