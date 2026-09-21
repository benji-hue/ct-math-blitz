import { CATEGORY_META, type Category } from '../types'

/**
 * Ключ Gemini хранится ТОЛЬКО в localStorage устройства и никогда не попадает
 * ни в репозиторий, ни в собранный бандл: приложение статическое, всё зашитое
 * в него извлекается из IPA любым, у кого есть файл.
 */
const KEY = 'ct-math-blitz:gemini:v1'

export const DEFAULT_MODEL = 'gemini-2.5-flash'

export interface GeminiSettings {
  apiKey: string
  model: string
}

export const EMPTY_SETTINGS: GeminiSettings = { apiKey: '', model: DEFAULT_MODEL }

export function loadSettings(): GeminiSettings {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return EMPTY_SETTINGS
    const parsed = JSON.parse(raw) as Partial<GeminiSettings>
    return {
      apiKey: typeof parsed.apiKey === 'string' ? parsed.apiKey : '',
      model: typeof parsed.model === 'string' && parsed.model ? parsed.model : DEFAULT_MODEL,
    }
  } catch {
    return EMPTY_SETTINGS
  }
}

export function saveSettings(settings: GeminiSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings))
  } catch {
    // приватный режим — ключ просто не переживёт перезапуск
  }
}

export function clearSettings(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // ignore
  }
}

/**
 * AI Studio выдаёт ключи двух видов: новые начинаются с «AQ.», старые —
 * с «AIza». Принимаем оба, иначе проверка ругалась бы на свежий ключ.
 */
export function looksLikeGeminiKey(key: string): boolean {
  const k = key.trim()
  return /^AQ\.[\w-]{20,}$/.test(k) || /^AIza[\w-]{30,}$/.test(k)
}

export interface AiTask {
  question: string
  options: string[]
  correct_index: number
  solution: string[]
  difficulty: number
  topic: string
}

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    tasks: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          question: { type: 'STRING' },
          options: { type: 'ARRAY', items: { type: 'STRING' } },
          correct_index: { type: 'INTEGER' },
          solution: { type: 'ARRAY', items: { type: 'STRING' } },
          difficulty: { type: 'INTEGER' },
          topic: { type: 'STRING' },
        },
        required: ['question', 'options', 'correct_index', 'solution', 'difficulty', 'topic'],
      },
    },
  },
  required: ['tasks'],
}

function buildPrompt(categories: Category[], count: number): string {
  const topics = categories.length
    ? categories.map((c) => CATEGORY_META[c].label).join(', ')
    : 'тригонометрия, стереометрия, планиметрия, функции и графики, степени и логарифмы, прогрессии'

  return [
    `Составь проверочную работу из ${count} заданий по математике для подготовки`,
    'к централизованному тестированию (ЦТ/ЦЭ) в Беларуси.',
    '',
    `Темы: ${topics}.`,
    '',
    'Требования:',
    `1. Ровно ${count} заданий, строго по возрастанию сложности: первое — на прямое`,
    '   применение формулы, последнее — в два-три действия, уровня части B.',
    '2. Поле difficulty — целое от 1 до 5, не убывает от задания к заданию.',
    '3. У каждого задания ровно 4 варианта ответа, верный ровно один.',
    '4. Неверные варианты должны быть ПРАВДОПОДОБНЫМИ: результат типичной ошибки',
    '   (потерянный множитель, перепутанный знак, подстановка диаметра вместо радиуса,',
    '   показатель n вместо n−1), а не случайные числа.',
    '5. correct_index — индекс верного варианта в массиве options, от 0 до 3.',
    '6. solution — от 2 до 4 шагов решения, каждый шаг отдельной строкой.',
    '7. Формулы записывай в LaTeX между знаками доллара: $\\sin 2\\alpha$, $\\dfrac{a}{b}$.',
    '   Обычный текст — по-русски, без LaTeX.',
    '8. topic — название темы задания по-русски.',
    '9. Числа подбирай так, чтобы ответы были аккуратными.',
    '',
    'Ответ верни строго в JSON по заданной схеме, без пояснений вокруг.',
  ].join('\n')
}

function describeError(status: number, body: string): string {
  if (status === 400 && /API key not valid/i.test(body)) return 'Ключ недействителен. Проверьте его в настройках.'
  if (status === 400) return 'Запрос отклонён (400). Возможно, ключ или модель указаны неверно.'
  if (status === 401 || status === 403) return 'Доступ запрещён. Ключ не подходит или у него нет прав на Gemini API.'
  if (status === 404) return 'Модель не найдена. Попробуйте другое имя модели в настройках.'
  if (status === 429) return 'Превышен лимит запросов. Подождите минуту и попробуйте снова.'
  if (status >= 500) return 'Сбой на стороне Google. Попробуйте ещё раз через минуту.'
  return `Ошибка ${status}.`
}

function validate(raw: unknown, count: number): AiTask[] {
  const tasks = (raw as { tasks?: unknown })?.tasks
  if (!Array.isArray(tasks) || tasks.length === 0) throw new Error('Модель вернула пустой список заданий.')

  const out: AiTask[] = []
  for (const t of tasks) {
    const task = t as Partial<AiTask>
    if (typeof task.question !== 'string' || !task.question.trim()) continue
    if (!Array.isArray(task.options) || task.options.length !== 4) continue
    if (task.options.some((o) => typeof o !== 'string' || !o.trim())) continue
    if (!Number.isInteger(task.correct_index) || task.correct_index! < 0 || task.correct_index! > 3) continue
    out.push({
      question: task.question,
      options: task.options as string[],
      correct_index: task.correct_index as number,
      solution: Array.isArray(task.solution) ? (task.solution as string[]).filter((s) => typeof s === 'string') : [],
      difficulty: Number.isInteger(task.difficulty) ? (task.difficulty as number) : 1,
      topic: typeof task.topic === 'string' ? task.topic : '',
    })
  }

  if (out.length === 0) throw new Error('Ни одно задание не прошло проверку формата. Попробуйте сгенерировать ещё раз.')
  return out.slice(0, count)
}

export async function generateTest({
  settings,
  categories,
  count,
  signal,
}: {
  settings: GeminiSettings
  categories: Category[]
  count: number
  signal?: AbortSignal
}): Promise<AiTask[]> {
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(settings.model)}` +
    ':generateContent'

  let response: Response
  try {
    response = await fetch(url, {
      method: 'POST',
      // Ключ идёт заголовком, а не в query-строке: из URL он попадал бы
      // в логи прокси и историю запросов.
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': settings.apiKey },
      signal,
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: buildPrompt(categories, count) }] }],
        generationConfig: {
          temperature: 1.0,
          responseMimeType: 'application/json',
          responseSchema: SCHEMA,
        },
      }),
    })
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') throw e
    throw new Error('Нет соединения с Google. Проверьте интернет — этот режим работает только онлайн.')
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(describeError(response.status, body))
  }

  const data = (await response.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[]
  }

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) throw new Error('Модель не вернула текст ответа. Попробуйте ещё раз.')

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('Не удалось разобрать ответ модели как JSON. Попробуйте ещё раз.')
  }

  return validate(parsed, count)
}
