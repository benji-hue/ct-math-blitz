import type { SubjectContent } from '../domain/types'
import { kit } from './kit'

const { topic, a, b } = kit('deu')

const topics = [
  topic({
    id: 'd.cases',
    title: 'Kasus und Präpositionen',
    section: 'Grammatik',
    weight: 4,
    summary: 'Падеж определяет артикль; предлог определяет падеж.',
    facts: [
      'Nominativ der/die/das; Akkusativ den/die/das; Dativ dem/der/dem, Plural den + -n; Genitiv des/der/des.',
      'Dativ: aus, bei, mit, nach, seit, von, zu.',
      'Akkusativ: durch, für, gegen, ohne, um.',
      'Wechselpräpositionen (in, an, auf, über, unter, vor, hinter, neben, zwischen): wohin? → Akkusativ, wo? → Dativ.',
    ],
    traps: ['После mit ставят Akkusativ.'],
    keywords: ['kasus', 'dativ', 'akkusativ', 'präpositionen', 'артикль', 'падеж'],
  }),
  topic({
    id: 'd.verbs',
    title: 'Zeitformen und Verben',
    section: 'Grammatik',
    weight: 4,
    summary: 'Perfekt с haben или sein, отделяемые приставки, модальные глаголы.',
    facts: [
      'Perfekt = haben/sein + Partizip II. sein — с глаголами движения и изменения состояния: Ich bin gefahren.',
      'Präteritum: war, hatte, ging, kam.',
      'Отделяемые приставки уходят в конец: aufstehen → Ich stehe um 7 Uhr auf.',
      'Modalverben: können, müssen, dürfen, sollen, wollen, möchten + Infinitiv в конце.',
    ],
    traps: ['Используют haben с глаголами движения: «Wir haben gegangen».'],
    keywords: ['perfekt', 'präteritum', 'trennbare verben', 'modalverben'],
  }),
  topic({
    id: 'd.word_order',
    title: 'Wortfolge',
    section: 'Grammatik',
    weight: 3,
    summary: 'В главном предложении глагол на втором месте, в придаточном — в конце.',
    facts: [
      'Hauptsatz: спрягаемый глагол на 2-м месте: Morgen fahre ich nach Minsk.',
      'Nebensatz (weil, dass, wenn, ob): глагол в конце: …, weil ich krank bin.',
    ],
    traps: ['После weil сохраняют порядок главного предложения.'],
    keywords: ['wortfolge', 'порядок слов', 'nebensatz', 'weil', 'dass'],
  }),
  topic({
    id: 'd.adjectives',
    title: 'Komparation',
    section: 'Grammatik',
    weight: 2,
    summary: 'Степени сравнения, включая неправильные формы.',
    facts: ['gut — besser — am besten; viel — mehr — am meisten; gern — lieber — am liebsten.', 'Обычно: schnell — schneller — am schnellsten.'],
    traps: ['Образуют «gerner» вместо lieber.'],
    keywords: ['komparativ', 'superlativ', 'степени сравнения'],
  }),
]

const tasks = [
  a('c1', 'd.cases', 2, 'Ich fahre mit ___ Bus zur Schule.', ['dem', 'den', 'der', 'das'], 'mit требует Dativ; der Bus → dem Bus.'),
  a('c2', 'd.cases', 3, 'Ich lege das Buch auf ___ Tisch.', ['den', 'dem', 'der', 'des'], 'legen отвечает на вопрос wohin? — Wechselpräposition auf + Akkusativ: den Tisch.', { trap: 'Путают wohin? (Akkusativ) и wo? (Dativ).' }),
  a('v1', 'd.verbs', 2, 'Gestern ___ wir ins Kino gegangen.', ['sind', 'haben', 'waren', 'hatten'], 'gehen — глагол движения, Perfekt с sein.'),
  a('w1', 'd.word_order', 3, 'Wählen Sie den richtigen Satz:', ['Ich bleibe zu Hause, weil ich krank bin.', 'Ich bleibe zu Hause, weil ich bin krank.', 'Ich bleibe zu Hause, weil bin ich krank.', 'Ich zu Hause bleibe, weil ich krank bin.'], 'В придаточном с weil спрягаемый глагол стоит в конце.'),
  a('k1', 'd.adjectives', 2, 'Ich trinke gern Tee, aber Kaffee trinke ich ___.', ['lieber', 'gerner', 'mehr gern', 'am liebsten'], 'gern — lieber — am liebsten.'),
  a('v2', 'd.verbs', 2, 'Wann ___ du morgen ___? (aufstehen)', ['stehst … auf', 'aufstehst … —', 'stehst … —', 'stehen … auf'], 'Отделяемая приставка auf уходит в конец предложения.'),
  b('k2', 'd.adjectives', 3, 'Bilden Sie den Komparativ von «gut».', ['besser'], 'gut — besser — am besten.'),
  b('c3', 'd.cases', 3, 'Ergänzen Sie den Artikel (Dativ Plural): Ich helfe ___ Kindern.', ['den'], 'helfen требует Dativ; во множественном числе артикль den, существительное получает -n.'),
]

const content: SubjectContent = { topics, tasks }
export default content
