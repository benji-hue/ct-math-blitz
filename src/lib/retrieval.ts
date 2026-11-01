import type { SubjectContent, Topic } from '../domain/types'

/**
 * Поиск по базе знаний для ИИ (RAG — retrieval-augmented generation).
 *
 * Модель не «дообучаем» — это дорого и устаревает с каждой новой
 * спецификацией. Вместо этого к каждому вопросу ученика подбираем 2–3 самые
 * близкие темы из нашего конспекта и передаём их модели как опору. Так ИИ
 * отвечает в рамках программы РИКЗ, а мы можем обновить знания правкой JSON.
 *
 * Алгоритм — BM25 с упрощённым стеммингом для русского: работает офлайн,
 * за миллисекунды и без внешних сервисов эмбеддингов.
 */

const STOP = new Set(
  'и в во не что он на я с со как а то все она так его но да ты к у же вы за бы по только ее мне было вот от меня еще нет о из ему теперь когда даже ну вдруг ли если уже или ни быть был него до вас нибудь опять уж вам ведь там потом себя ничего ей может они тут где есть надо ней для мы тебя их чем была сам чтоб без будто чего раз тоже себе под будет ж тогда кто этот того потому этого какой совсем ним здесь этом один почти мой тем чтобы нее сейчас были куда зачем всех никогда можно при наконец два об другой хоть после над больше тот через эти нас про всего них какая много разве три эту моя впрочем хорошо свою этой перед иногда лучше чуть том нельзя такой им более всегда конечно всю между это как почему объясни помоги реши задача задание тема пожалуйста'.split(
    ' ',
  ),
)

const ENDINGS =
  /(иями|ями|ами|ией|иях|ого|его|ому|ему|ыми|ими|ией|ая|яя|ое|ее|ые|ие|ый|ий|ой|ой|ам|ям|ах|ях|ов|ев|ей|ом|ем|ию|ью|ия|ья|ть|ться|тся|ешь|ет|ют|ут|ит|ат|ят|ла|ло|ли|а|я|о|е|ы|и|у|ю|ь)$/

export function stem(word: string): string {
  if (word.length <= 4) return word
  const s = word.replace(ENDINGS, '')
  return s.length >= 3 ? s : word
}

export function tokenize(text: string): string[] {
  return (
    text
      .toLowerCase()
      .replace(/ё/g, 'е')
      .replace(/\$[^$]*\$/g, ' ')
      .match(/[a-zа-яіў0-9]+/gi) ?? []
  )
    .filter((w) => w.length > 1 && !STOP.has(w))
    .map(stem)
}

interface Doc {
  topic: Topic
  tf: Map<string, number>
  length: number
}

export interface Index {
  docs: Doc[]
  df: Map<string, number>
  avgLength: number
}

function topicText(t: Topic): string {
  // Название и ключевые слова важнее основного текста — повторяем их.
  return [t.title, t.title, t.section, ...(t.keywords ?? []), ...(t.keywords ?? []), t.summary, ...t.facts, ...t.traps].join(' ')
}

export function buildIndex(topics: Topic[]): Index {
  const docs: Doc[] = topics.map((topic) => {
    const tokens = tokenize(topicText(topic))
    const tf = new Map<string, number>()
    for (const tok of tokens) tf.set(tok, (tf.get(tok) ?? 0) + 1)
    return { topic, tf, length: tokens.length }
  })
  const df = new Map<string, number>()
  for (const d of docs) for (const tok of d.tf.keys()) df.set(tok, (df.get(tok) ?? 0) + 1)
  const avgLength = docs.reduce((s, d) => s + d.length, 0) / Math.max(1, docs.length)
  return { docs, df, avgLength }
}

export function search(index: Index, query: string, limit = 3): { topic: Topic; score: number }[] {
  const terms = [...new Set(tokenize(query))]
  if (!terms.length) return []
  const N = index.docs.length
  const k1 = 1.4
  const b = 0.72
  const scored = index.docs.map((d) => {
    let score = 0
    for (const term of terms) {
      const f = d.tf.get(term)
      if (!f) continue
      const n = index.df.get(term) ?? 0
      const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5))
      score += (idf * f * (k1 + 1)) / (f + k1 * (1 - b + (b * d.length) / index.avgLength))
    }
    return { topic: d.topic, score }
  })
  return scored
    .filter((s) => s.score > 0.8)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}

const indexes = new WeakMap<SubjectContent, Index>()

export function indexFor(content: SubjectContent): Index {
  let idx = indexes.get(content)
  if (!idx) {
    idx = buildIndex(content.topics)
    indexes.set(content, idx)
  }
  return idx
}

export interface Reference {
  title: string
  text: string
}

/** Конспект темы в виде, удобном для модели: компактно, без лишней разметки. */
export function topicReference(t: Topic): Reference {
  const facts = t.facts.map((f) => `- ${f}`).join('\n')
  const traps = t.traps.length ? `\nТипичные ошибки:\n${t.traps.map((f) => `- ${f}`).join('\n')}` : ''
  return { title: `${t.title} (${t.section})`, text: `${t.summary}\n${facts}${traps}` }
}

/** Подбор материалов к вопросу: текущая тема + найденные по смыслу, суммарно ≤ ~2500 символов. */
export function referencesFor(content: SubjectContent | null, query: string, current?: Topic | null): Reference[] {
  if (!content) return current ? [topicReference(current)] : []
  const picked: Topic[] = current ? [current] : []
  for (const hit of search(indexFor(content), query, 3)) {
    if (!picked.some((p) => p.id === hit.topic.id)) picked.push(hit.topic)
  }
  const refs: Reference[] = []
  let budget = 2500
  for (const t of picked.slice(0, 3)) {
    const ref = topicReference(t)
    if (ref.text.length > budget) break
    budget -= ref.text.length
    refs.push(ref)
  }
  return refs
}
