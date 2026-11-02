import { describe, expect, it } from 'vitest'
import type { SubjectContent, Task } from '../domain/types'
import { currentMastery, forecast, heatmap, levelFromXp, liveStreak, streakAtRisk } from '../lib/analytics'
import { sanitizeAnalysis, sanitizeTasks } from '../lib/ai'
import { addDays, dayKey, plural } from '../lib/format'
import { buildQueue, checkInput, interleave, isCorrect, normalizeAnswer } from '../lib/practice'
import { buildIndex, referencesFor, search, stem } from '../lib/retrieval'
import { gradeFromAnswer, review } from '../lib/srs'
import { applyAttempt, EMPTY_PROGRESS, updateMastery, updateStreak, type Attempt } from '../lib/store'
import { normalizeMath, parseBlocks } from '../ui/Rich'

const task = (id: string, topic: string, extra: Partial<Task> = {}): Task => ({
  id,
  subject: 'math',
  topic,
  part: 'A',
  level: 2,
  kind: 'choice',
  q: 'q',
  options: ['a', 'b', 'c'],
  answer: 0,
  explain: 'e',
  ...extra,
})

describe('проверка ответов', () => {
  it('нормализует пробелы, запятые и ё', () => {
    expect(normalizeAnswer(' 0,4 ')).toBe('0.4')
    expect(normalizeAnswer('Ёлка')).toBe('елка')
    expect(normalizeAnswer('−5')).toBe('-5')
  })

  it('сравнивает числа по значению', () => {
    expect(checkInput('0,40', ['0.4'])).toBe(true)
    expect(checkInput('145', ['145'])).toBe(true)
    expect(checkInput('146', ['145'])).toBe(false)
  })

  it('принимает соответствия в любом порядке и латиницу вместо кириллицы', () => {
    expect(checkInput('А1Б3В2', ['А1Б3В2'])).toBe(true)
    expect(checkInput('B2A1Б3', ['А1Б3В2'])).toBe(true)
    expect(checkInput('А1Б2В3', ['А1Б3В2'])).toBe(false)
  })

  it('isCorrect различает части A и B', () => {
    expect(isCorrect(task('t', 'x'), 0)).toBe(true)
    expect(isCorrect(task('t', 'x'), 1)).toBe(false)
    expect(isCorrect(task('t', 'x', { kind: 'input', answer: ['березина'] }), 'Березина')).toBe(true)
  })
})

describe('очередь практики', () => {
  it('чередует темы', () => {
    const tasks = [task('1', 'a'), task('2', 'a'), task('3', 'a'), task('4', 'b'), task('5', 'b'), task('6', 'c')]
    const out = interleave(tasks)
    for (let i = 1; i < out.length - 1; i++) {
      if (out[i].topic === out[i - 1].topic) {
        // соседство допустимо только когда других тем не осталось
        expect(out.slice(i).every((t) => t.topic === out[i].topic)).toBe(true)
      }
    }
  })

  it('сначала берёт задания, у которых подошёл срок повторения', () => {
    const tasks = Array.from({ length: 10 }, (_, i) => task(`t${i}`, i % 2 ? 'a' : 'b'))
    const content: SubjectContent = { topics: [], tasks }
    const past = new Date('2026-10-01T10:00:00Z')
    const srs = { t3: review(undefined, 'again', past), t7: review(undefined, 'again', past) }
    const queue = buildQueue(content, { srs, topics: {} }, [], { size: 4, now: new Date('2026-11-01T10:00:00Z') })
    const ids = queue.map((p) => p.task.id)
    expect(ids).toContain('t3')
    expect(ids).toContain('t7')
    expect(queue.filter((p) => p.isReview)).toHaveLength(2)
  })

  it('задания из блица идут после экзаменационных', () => {
    const tasks = [task('b1', 'a', { source: 'blitz' }), task('b2', 'a', { source: 'blitz' }), task('o1', 'a', { source: 'original' })]
    const queue = buildQueue({ topics: [], tasks }, { srs: {}, topics: {} }, [], { size: 1 })
    expect(queue[0].task.id).toBe('o1')
  })
})

describe('FSRS и освоение', () => {
  it('«снова» назначает повтор раньше, чем «хорошо»', () => {
    const now = new Date('2026-11-01T10:00:00Z')
    const again = review(undefined, 'again', now)
    const good = review(undefined, 'good', now)
    expect(new Date(again.due).getTime()).toBeLessThanOrEqual(new Date(good.due).getTime())
  })

  it('оценка по поведению', () => {
    expect(gradeFromAnswer({ correct: false, usedHint: false, seconds: 10, expected: 60 })).toBe('again')
    expect(gradeFromAnswer({ correct: true, usedHint: true, seconds: 10, expected: 60 })).toBe('hard')
    expect(gradeFromAnswer({ correct: true, usedHint: false, seconds: 10, expected: 60 })).toBe('easy')
    expect(gradeFromAnswer({ correct: true, usedHint: false, seconds: 50, expected: 60 })).toBe('good')
  })

  it('освоение растёт от верных ответов и падает от ошибок', () => {
    let stat = updateMastery(undefined, true, 3, 0)
    const afterRight = stat.m
    stat = updateMastery(stat, false, 3, 0)
    expect(afterRight).toBeGreaterThan(0.35)
    expect(stat.m).toBeLessThan(afterRight)
  })

  it('без практики освоение постепенно тускнеет', () => {
    const stat = { n: 3, ok: 3, m: 0.9, last: 0 }
    expect(currentMastery(stat, 30 * 86_400_000)).toBeLessThan(0.9)
    expect(currentMastery(stat, 30 * 86_400_000)).toBeGreaterThan(0.9 * 0.6)
  })
})

describe('серии и активность', () => {
  it('серия растёт по дням подряд и сбрасывается после пропуска', () => {
    let s = updateStreak({ current: 0, best: 0, last: null }, '2026-11-01')
    s = updateStreak(s, '2026-11-02')
    expect(s.current).toBe(2)
    s = updateStreak(s, '2026-11-04')
    expect(s).toEqual({ current: 1, best: 2, last: '2026-11-04' })
  })

  it('applyAttempt обновляет всё за раз и выдаёт достижение', () => {
    const attempt: Attempt = { id: 't', s: 'math', t: 'm.trig', ok: true, at: new Date('2026-11-01T12:00:00').getTime(), sec: 30, lvl: 2, mode: 'practice' }
    const p = applyAttempt(EMPTY_PROGRESS, attempt, 'good')
    expect(p.attempts).toHaveLength(1)
    expect(p.srs.t).toBeDefined()
    expect(p.days['2026-11-01'].tasks).toBe(1)
    expect(p.achievements).toContain('first-step')
    expect(p.xp).toBeGreaterThan(0)
  })

  it('серия под угрозой, если вчера занимались, а сегодня ещё нет', () => {
    const now = new Date('2026-11-02T15:00:00')
    const progress = { ...EMPTY_PROGRESS, streak: { current: 5, best: 5, last: dayKey(addDays(now, -1)) } }
    expect(streakAtRisk(progress, now)).toBe(true)
    expect(liveStreak(progress, now)).toBe(5)
  })

  it('тепловая карта — недели по 7 дней', () => {
    const cells = heatmap(EMPTY_PROGRESS, 4, new Date('2026-11-01T12:00:00'))
    expect(cells).toHaveLength(4)
    expect(cells.every((c) => c.length === 7)).toBe(true)
  })

  it('уровни растут с опытом', () => {
    expect(levelFromXp(0).level).toBe(1)
    expect(levelFromXp(5000).level).toBeGreaterThan(5)
  })
})

describe('прогноз', () => {
  const content: SubjectContent = {
    topics: [
      { id: 'a', subject: 'math', title: 'A', section: 's', weight: 5, summary: '', facts: [], traps: [] },
      { id: 'b', subject: 'math', title: 'B', section: 's', weight: 1, summary: '', facts: [], traps: [] },
    ],
    tasks: [],
  }
  it('без ответов — широкий интервал', () => {
    const f = forecast('math', content, EMPTY_PROGRESS)
    expect(f.high - f.low).toBeGreaterThan(30)
  })
  it('освоение важной темы сильнее двигает прогноз', () => {
    const now = Date.now()
    const strongA = forecast('math', content, { ...EMPTY_PROGRESS, topics: { a: { n: 10, ok: 10, m: 0.95, last: now } } }, now)
    const strongB = forecast('math', content, { ...EMPTY_PROGRESS, topics: { b: { n: 10, ok: 10, m: 0.95, last: now } } }, now)
    expect(strongA.score).toBeGreaterThan(strongB.score)
  })
})

describe('поиск по базе знаний (RAG)', () => {
  const topics = [
    { id: 'log', subject: 'math' as const, title: 'Логарифмы', section: 'Алгебра', weight: 4, summary: 'Свойства логарифмов', facts: ['log произведения равен сумме логарифмов'], traps: [], keywords: ['логарифм'] },
    { id: 'tri', subject: 'math' as const, title: 'Тригонометрия', section: 'Тригонометрия', weight: 4, summary: 'Синус и косинус', facts: ['основное тригонометрическое тождество'], traps: [], keywords: ['синус', 'косинус'] },
  ]
  it('стемминг сводит формы слова', () => {
    expect(stem('логарифмы')).toBe(stem('логарифмов'))
  })
  it('находит тему по формам слова', () => {
    const hits = search(buildIndex(topics), 'как решать уравнения с логарифмами?')
    expect(hits[0]?.topic.id).toBe('log')
  })
  it('собирает материалы для ИИ с текущей темой первой', () => {
    const refs = referencesFor({ topics, tasks: [] }, 'чему равен синус', topics[0])
    expect(refs[0].title).toContain('Логарифмы')
    expect(refs.some((r) => r.title.includes('Тригонометрия'))).toBe(true)
  })
})

describe('ответы ИИ проходят проверку формата', () => {
  it('битые задания отбрасываются, нормальные — приводятся к типу', () => {
    const tasks = sanitizeTasks(
      {
        tasks: [
          { q: 'Сколько будет 2+2?', part: 'A', level: 1, options: ['4', '3', '5', '22', '0'], answer: 0, explain: '2+2=4' },
          { q: 'Ответ числом', part: 'B', level: 9, answer: 42, explain: 'потому что' },
          { q: '', options: ['a'], answer: 5, explain: '' },
          { q: 'Неверный индекс', options: ['a', 'b', 'c'], answer: 7, explain: 'x' },
        ],
      },
      'math',
      'm.numbers',
    )
    expect(tasks).toHaveLength(2)
    expect(tasks[0].kind).toBe('choice')
    expect(tasks[1]).toMatchObject({ kind: 'input', answer: ['42'], level: 5, source: 'ai' })
  })
  it('разбор прогресса без summary отклоняется', () => {
    expect(sanitizeAnalysis({ gaps: [] })).toBeNull()
    expect(sanitizeAnalysis({ summary: 'ok', week: [{ day: 'Пн', focus: 'x', minutes: 999 }] })?.week[0].minutes).toBe(240)
  })
})

describe('markdown-парсер', () => {
  it('распознаёт заголовки, списки, формулы и таблицы', () => {
    const blocks = parseBlocks('# Тема\n\n- раз\n- два\n\n$$x^2$$\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\nТекст')
    expect(blocks.map((b) => b.kind)).toEqual(['h', 'ul', 'math', 'table', 'p'])
  })
  it('не теряет незакрытую формулу при стриминге', () => {
    const blocks = parseBlocks('Начало $\\frac{1}{2')
    expect(blocks).toHaveLength(1)
  })
  it('понимает формулы в \\( \\) и \\[ \\] — так пишет часть моделей', () => {
    expect(normalizeMath('Скорость \\(v = 20\\ \\text{м/с}\\) и путь')).toBe('Скорость $v = 20\\ \\text{м/с}$ и путь')
    const blocks = parseBlocks('Решение:\n\\[\nx = 4 - 1 = 3\n\\]\nОтвет: 3')
    expect(blocks.map((b) => b.kind)).toEqual(['p', 'math', 'p'])
  })
})

describe('русская плюрализация', () => {
  it('1 день, 2 дня, 5 дней, 11 дней, 21 день', () => {
    const f: [string, string, string] = ['день', 'дня', 'дней']
    expect([1, 2, 5, 11, 21, 104].map((n) => plural(n, f))).toEqual(['день', 'дня', 'дней', 'дней', 'день', 'дня'])
  })
})

describe('разбор прогресса без ИИ', async () => {
  const { localAnalysis } = await import('../lib/localAnalysis')
  const { isAiUnavailable, AiError } = await import('../lib/ai')

  it('строит выводы и план на 7 дней из тех же агрегатов', () => {
    const a = localAnalysis({
      profile: { grade: '11', exam: 'both', dailyGoal: 15 },
      streak: 4,
      daysToExam: 200,
      subjects: [
        { id: 'math', title: 'Математика', forecast: 64, coverage: 0.9, target: 85, weak: [{ title: 'Логарифмы', mastery: 0.4, n: 9 }], strong: [{ title: 'Уравнения', mastery: 0.86 }], errors: { careless: 5, calc: 1 } },
        { id: 'phys', title: 'Физика', forecast: 72, coverage: 0.8, weak: [{ title: 'Оптика', mastery: 0.25, n: 6 }], strong: [], errors: {} },
      ],
    })
    expect(a.week).toHaveLength(7)
    expect(a.gaps[0].topic).toContain('Оптика')
    expect(a.summary).toContain('физика')
    expect(a.strengths[0]).toContain('Уравнения')
    expect(a.tip).toContain('Подчёркивать')
  })

  it('отличает «сервер не подключён» от настоящей ошибки', () => {
    expect(isAiUnavailable(new AiError('x', 0))).toBe(true)
    expect(isAiUnavailable(new AiError('x', 405))).toBe(true)
    expect(isAiUnavailable(new AiError('x', 429))).toBe(false)
    expect(isAiUnavailable(new AiError('x', 401))).toBe(false)
  })
})
