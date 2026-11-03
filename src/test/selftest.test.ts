import { describe, expect, it } from 'vitest'
import { lessonSegment, topicFromQuestion } from '../lib/lesson'
import {
  acceptedAnswers,
  checkSelfTestAnswer,
  levelOf,
  levelsDone,
  markFor,
  markTable,
  MAX_POINTS,
  OFFICIAL_SUBJECTS,
  POINTS,
  sanitizeSelfTest,
  scoreSelfTest,
  type SelfTest,
} from '../lib/selftest'
import type { ChatMessage } from '../lib/store'

describe('нормы оценки самостоятельной (Минобразования РБ, к постановлению № 184)', () => {
  it('баллы за задания: 5 заданий — 2, 4, 6, 8, 10; 10 заданий — 1…10', () => {
    expect(POINTS[5]).toEqual([2, 4, 6, 8, 10])
    expect(POINTS[10]).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    expect(POINTS[5].reduce((a, b) => a + b)).toBe(MAX_POINTS[5])
    expect(POINTS[10].reduce((a, b) => a + b)).toBe(MAX_POINTS[10])
  })

  it('уровни: по одному на задание в работе из 5, по два — в работе из 10', () => {
    expect([0, 1, 2, 3, 4].map((i) => levelOf(5, i))).toEqual([1, 2, 3, 4, 5])
    expect(Array.from({ length: 10 }, (_, i) => levelOf(10, i))).toEqual([1, 1, 2, 2, 3, 3, 4, 4, 5, 5])
  })

  // Таблица 3: 1→1, 2→2, 3–5→3, 6–8→4, 9–11→5, 12–14→6, 15–18→7, 19–23→8, 24–28→9, 29–30→10.
  it('перевод суммы в отметку — работа из 5 заданий, все границы', () => {
    const cases: [number, number][] = [
      [0, 0], [1, 1], [2, 2], [3, 3], [5, 3], [6, 4], [8, 4], [9, 5], [11, 5], [12, 6],
      [14, 6], [15, 7], [18, 7], [19, 8], [23, 8], [24, 9], [28, 9], [29, 10], [30, 10],
    ]
    for (const [points, mark] of cases) expect(markFor(points, 5), `${points} баллов`).toBe(mark)
  })

  // Таблица 5: 1→1, 2–4→2, 5–7→3, 8–12→4, 13–18→5, 19–25→6, 26–33→7, 34–42→8, 43–52→9, 53–55→10.
  it('перевод суммы в отметку — работа из 10 заданий, все границы', () => {
    const cases: [number, number][] = [
      [1, 1], [2, 2], [4, 2], [5, 3], [7, 3], [8, 4], [12, 4], [13, 5], [18, 5], [19, 6],
      [25, 6], [26, 7], [33, 7], [34, 8], [42, 8], [43, 9], [52, 9], [53, 10], [55, 10],
    ]
    for (const [points, mark] of cases) expect(markFor(points, 10), `${points} баллов`).toBe(mark)
  })

  it('дробная сумма округляется по правилам математического округления', () => {
    expect(markFor(14.5, 5)).toBe(7) // 15 → 7
    expect(markFor(14.4, 5)).toBe(6) // 14 → 6
  })

  it('таблица «Как считается» совпадает с нормами', () => {
    expect(markTable(5).map((r) => r.range)).toEqual(['1', '2', '3–5', '6–8', '9–11', '12–14', '15–18', '19–23', '24–28', '29–30'])
    expect(markTable(10).map((r) => r.range)).toEqual(['1', '2–4', '5–7', '8–12', '13–18', '19–25', '26–33', '34–42', '43–52', '53–55'])
  })

  it('официальная шкала — для математики, физики, химии, биологии', () => {
    expect([...OFFICIAL_SUBJECTS].sort()).toEqual(['bio', 'chem', 'math', 'phys'])
  })
})

describe('проверка ответов самостоятельной', () => {
  it('ключ модели в LaTeX, с переменной, единицами или дробью', () => {
    expect(acceptedAnswers('$2{,}5$')).toContain('2,5')
    expect(acceptedAnswers('x = 3')).toContain('3')
    expect(acceptedAnswers('12 см')).toContain('12')
    expect(acceptedAnswers('$\\frac{5}{2}$')).toContain('2.5')
  })

  const input = { n: 2, level: 2, points: 4, q: 'q', answer: '$2{,}5$ м/с', solution: 's' }
  const choice = { n: 1, level: 1, points: 2, q: 'q', options: ['a', 'b', 'c', 'd'], answer: 2, solution: 's' }

  it('засчитывает ответ в любой записи, а пустой — нет', () => {
    expect(checkSelfTestAnswer(input, '2,5')).toBe(true)
    expect(checkSelfTestAnswer(input, '2.5 м/с')).toBe(true)
    expect(checkSelfTestAnswer(input, '25')).toBe(false)
    expect(checkSelfTestAnswer(input, '')).toBe(false)
    expect(checkSelfTestAnswer(choice, 2)).toBe(true)
    expect(checkSelfTestAnswer(choice, 0)).toBe(false)
    expect(checkSelfTestAnswer(choice, null)).toBe(false)
  })
})

describe('работа от сервера', () => {
  const raw = {
    title: 'Квадратичная функция',
    tasks: [
      { level: 1, q: 'Какая функция квадратичная?', options: ['$y=x^2$', '$y=2x$', '$y=\\frac{1}{x}$', '$y=\\sqrt{x}$'], answer: 0, solution: 'Старшая степень — 2.' },
      { level: 2, q: 'Найдите $y(2)$ для $y=x^2-1$.', answer: '3', solution: '$4-1=3$.' },
      { level: 3, q: 'Абсцисса вершины $y=x^2-4x+1$?', answer: '2', solution: '$x_0=2$.' },
      { level: 4, q: 'Наименьшее значение $y=x^2-4x+1$?', answer: '-3', solution: '$y(2)=-3$.' },
      { level: 5, q: 'Мяч: $h=20t-5t^2$. Максимальная высота?', answer: '20', solution: '$t=2$, $h=20$.' },
    ],
  }

  it('баллы и уровни ставит приложение по нормам, а не модель', () => {
    const test = sanitizeSelfTest(raw, 5)!
    expect(test.tasks.map((t) => t.points)).toEqual([2, 4, 6, 8, 10])
    expect(test.tasks.map((t) => t.level)).toEqual([1, 2, 3, 4, 5])
    expect(test.tasks[0].options).toHaveLength(4)
  })

  it('работа не той длины или с битым ключом — отклоняется', () => {
    expect(sanitizeSelfTest({ ...raw, tasks: raw.tasks.slice(0, 4) }, 5)).toBeNull()
    expect(sanitizeSelfTest({ ...raw, tasks: [{ ...raw.tasks[0], answer: 7 }, ...raw.tasks.slice(1)] }, 5)).toBeNull()
  })

  it('итог: по ответам — полный балл за верный, по фото — частичный', () => {
    const test = sanitizeSelfTest(raw, 5) as SelfTest
    const byAnswers = scoreSelfTest(test, [true, true, true, false, false])
    expect(byAnswers.points).toBe(12)
    expect(byAnswers.mark).toBe(6)
    expect(levelsDone(test, byAnswers.tasks)).toEqual([1, 2, 3])
    const photo = { tasks: [{ n: 4, seen: true, points: 4, errors: [{ kind: 'существенная' as const, text: 'знак' }], comment: '' }, { n: 5, seen: false, points: 0, errors: [], comment: '' }], summary: '' }
    const withPhoto = scoreSelfTest(test, [true, true, true, false, false], photo)
    expect(withPhoto.tasks[3]).toMatchObject({ points: 4, source: 'photo' })
    expect(withPhoto.tasks[4]).toMatchObject({ points: 0, source: 'answers' })
    expect(withPhoto.points).toBe(16)
    expect(withPhoto.mark).toBe(7)
  })
})

describe('урок «Объясни мне это»', () => {
  const msg = (role: 'user' | 'assistant', mode?: ChatMessage['mode'], content = 'x'): ChatMessage => ({ id: Math.random().toString(36), role, content, at: 0, mode })

  it('урок — сообщения с конца чата в режиме урока', () => {
    const messages = [msg('user', 'tutor'), msg('assistant', 'tutor'), msg('user', 'lesson'), msg('assistant', 'lesson')]
    expect(lessonSegment(messages)).toHaveLength(2)
    expect(lessonSegment([...messages, msg('user', 'check')])).toHaveLength(0)
  })

  it('тема самостоятельной из первого вопроса — в именительном падеже', () => {
    expect(topicFromQuestion('Объясни мне квадратичную функцию?')).toBe('Квадратичная функция')
    expect(topicFromQuestion('Что такое импульс тела')).toBe('Импульс тела')
    expect(topicFromQuestion('Объясни тему «Теорема синусов».')).toBe('Теорема синусов')
    expect(topicFromQuestion('объясни теорему синусов')).toBe('Теорема синусов')
    expect(topicFromQuestion('Объясни арифметическую прогрессию')).toBe('Арифметическая прогрессия')
    expect(topicFromQuestion('Расскажи про силу Архимеда')).toBe('Сила Архимеда')
    expect(topicFromQuestion('Объясни кинетическую энергию тела')).toBe('Кинетическая энергия тела')
    expect(topicFromQuestion('Объясните равнодействующую силу')).toBe('Равнодействующая сила')
    expect(topicFromQuestion('Объясни закон Ома')).toBe('Закон Ома')
    expect(topicFromQuestion('Объясни, как решать квадратные уравнения')).toBe('Как решать квадратные уравнения')
  })
})
