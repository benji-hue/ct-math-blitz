import type { SubjectContent } from '../domain/types'
import { kit } from './kit'

const { topic, a, b } = kit('eng')

const topics = [
  topic({
    id: 'e.tenses',
    title: 'Tenses (Active Voice)',
    section: 'Grammar',
    weight: 5,
    summary: 'Выбор времени — по маркерам и по смыслу: факт, процесс, результат или предшествование.',
    facts: [
      'Present Simple — регулярность и факты (usually, every day); Present Continuous — процесс сейчас (now, Look!).',
      'Present Perfect — результат или опыт к настоящему моменту (already, yet, ever, never, since, for).',
      'Past Simple — завершённое действие в прошлом с указанием времени (yesterday, ago, in 2020).',
      'Past Perfect — действие раньше другого прошедшего: When we arrived, the train had left.',
      'Future Perfect — действие завершится к моменту в будущем: By the time you come, I will have finished.',
    ],
    traps: ['Ставят Past Simple при «already/yet» без указания времени.', 'После when/if в придаточном времени будущее не используют: when you come.'],
    keywords: ['tenses', 'present perfect', 'past simple', 'past perfect', 'continuous', 'времена'],
  }),
  topic({
    id: 'e.passive',
    title: 'Passive Voice',
    section: 'Grammar',
    weight: 3,
    summary: 'Страдательный залог: be в нужном времени + третья форма глагола.',
    facts: [
      'be + V3: is built, was built, has been built, will be built, is being built.',
      'Исполнитель действия — через by: The novel was written by Kolas.',
      'Время показывает только глагол be.',
    ],
    traps: ['Пропускают be: «This bridge built in 1957».'],
    keywords: ['passive', 'страдательный залог', 'v3', 'by'],
  }),
  topic({
    id: 'e.conditionals',
    title: 'Conditionals',
    section: 'Grammar',
    weight: 3,
    summary: 'Тип условного предложения определяется реальностью условия и временем.',
    facts: [
      'Zero: If + Present, Present — общие истины.',
      'First: If + Present, will + V — реальное будущее.',
      'Second: If + Past, would + V — нереальное в настоящем: If I had more time, I would learn Chinese.',
      'Third: If + Past Perfect, would have + V3 — нереальное в прошлом.',
      'If I were you… — с I тоже were.',
    ],
    traps: ['Ставят will в придаточное с if.'],
    keywords: ['conditionals', 'условные предложения', 'if', 'would'],
  }),
  topic({
    id: 'e.modals',
    title: 'Modal Verbs',
    section: 'Grammar',
    weight: 2,
    summary: 'Модальные глаголы выражают необходимость, возможность, разрешение и запрет.',
    facts: [
      'must — обязанность (по мнению говорящего) или уверенное предположение; mustn\'t — запрет.',
      'have to — необходимость из-за обстоятельств; needn\'t / don\'t have to — нет необходимости.',
      'should — совет; can/could — умение, возможность; may/might — вероятность, разрешение.',
    ],
    traps: ['Путают mustn\'t (нельзя) и needn\'t (не нужно).'],
    keywords: ['modal', 'must', 'should', 'can', 'may', 'need'],
  }),
  topic({
    id: 'e.articles',
    title: 'Articles',
    section: 'Grammar',
    weight: 3,
    summary: 'a/an — один из многих, the — конкретный или единственный, нулевой — имена и названия большинства стран.',
    facts: [
      'a/an — первое упоминание, профессия: She is a doctor.',
      'the — известный, единственный (the sun), превосходная степень (the best).',
      'the — реки, моря, океаны, горные цепи: the Dnieper, the Black Sea, the Alps.',
      'Без артикля: страны и города (Belarus, Minsk), но the USA, the UK, the Netherlands; приёмы пищи (have breakfast).',
    ],
    traps: ['Ставят the перед названием страны: «the Belarus».'],
    keywords: ['articles', 'артикли', 'a an the'],
  }),
  topic({
    id: 'e.prepositions',
    title: 'Prepositions',
    section: 'Grammar',
    weight: 2,
    summary: 'Предлоги времени и устойчивые сочетания с предлогами.',
    facts: [
      'in — месяцы, годы, времена года: in May, in 2027; on — дни и даты: on Monday, on 27 May; at — часы: at 11 o\'clock, at night.',
      'depend on, interested in, good at, afraid of, proud of, responsible for.',
    ],
    traps: ['Пишут in перед датой: «in 27 May».'],
    keywords: ['prepositions', 'предлоги', 'in on at'],
  }),
  topic({
    id: 'e.word_formation',
    title: 'Word Formation',
    section: 'Vocabulary',
    weight: 4,
    summary: 'Суффиксы и префиксы — частое задание части B: нужное слово нужной части речи.',
    facts: [
      'Существительные: -tion, -ment, -ness, -ity, -er/-or (education, development, kindness, ability, teacher).',
      'Прилагательные: -ful, -less, -ous, -able, -al, -ive (helpful, careless, famous, comfortable, natural, active).',
      'Отрицательные префиксы: un-, in-, im- (перед p, m, b), il- (перед l), ir- (перед r), dis-.',
      'Наречия: прилагательное + -ly (quick → quickly).',
    ],
    traps: ['Ставят un- там, где нужен im-/ir-/il-: «unpossible».'],
    keywords: ['word formation', 'словообразование', 'суффикс', 'префикс'],
  }),
  topic({
    id: 'e.gerund_inf',
    title: 'Gerund and Infinitive',
    section: 'Grammar',
    weight: 2,
    summary: 'После одних глаголов — -ing, после других — to + глагол.',
    facts: [
      '-ing после enjoy, avoid, mind, finish, suggest, keep, can\'t help.',
      'to-infinitive после want, decide, hope, agree, plan, refuse, promise.',
      'stop doing — перестать делать; stop to do — остановиться, чтобы сделать.',
    ],
    traps: ['Пишут «enjoy to read».'],
    keywords: ['gerund', 'infinitive', 'герундий', 'инфинитив', 'ing'],
  }),
  topic({
    id: 'e.reported',
    title: 'Reported Speech',
    section: 'Grammar',
    weight: 2,
    summary: 'Косвенная речь: сдвиг времён и прямой порядок слов в вопросах.',
    facts: [
      'Сдвиг времён: Present Simple → Past Simple, will → would, Present Perfect → Past Perfect.',
      'now → then, here → there, today → that day, tomorrow → the next day.',
      'В косвенном вопросе прямой порядок слов: He asked where I lived.',
    ],
    traps: ['Сохраняют вопросительный порядок слов: «He asked where did I live».'],
    keywords: ['reported speech', 'косвенная речь', 'sequence of tenses'],
  }),
]

const tasks = [
  a('t1', 'e.tenses', 1, 'Look! The children ___ in the garden.', ['are playing', 'play', 'played', 'have played'], '«Look!» — действие происходит прямо сейчас: Present Continuous.'),
  a('t2', 'e.tenses', 2, 'I ___ this film three times already.', ['have seen', 'saw', 'see', 'had seen'], 'Опыт к настоящему моменту без указания времени, маркер already — Present Perfect.'),
  a('t3', 'e.tenses', 3, 'When we arrived at the station, the train ___.', ['had already left', 'already left', 'has already left', 'leaves'], 'Поезд ушёл раньше, чем мы приехали: предшествование в прошлом — Past Perfect.', { trap: 'Past Simple не показывает, что поезд ушёл до нашего прихода.' }),
  a('p1', 'e.passive', 2, 'This bridge ___ in 1957.', ['was built', 'built', 'is built', 'has built'], 'Мост построили (кто-то) — пассив; 1957 — прошлое: was built.'),
  a('c1', 'e.conditionals', 3, 'If I ___ more time, I would learn Chinese.', ['had', 'have', 'will have', 'would have'], 'Нереальное условие в настоящем — Second Conditional: If + Past Simple, would + V.'),
  a('c2', 'e.conditionals', 4, 'If she had studied harder, she ___ the exam.', ['would have passed', 'would pass', 'passed', 'will pass'], 'Нереальное прошлое — Third Conditional: would have + V3.'),
  a('ar1', 'e.articles', 2, '___ Dnieper flows into ___ Black Sea.', ['The / the', '— / the', 'The / —', 'A / the'], 'С названиями рек и морей употребляется the.'),
  a('pr1', 'e.prepositions', 1, 'The exam starts ___ 27 May ___ 11 o\'clock.', ['on / at', 'in / at', 'at / on', 'on / in'], 'Дата — on, точное время — at.'),
  a('m1', 'e.modals', 3, 'You ___ bring your passport: without it you can\'t enter the exam room.', ['must', 'needn\'t', 'may', 'might'], 'Обязательное требование — must. needn\'t означает «не нужно», may/might — возможность.'),
  a('g1', 'e.gerund_inf', 2, 'She enjoys ___ detective stories.', ['reading', 'to read', 'read', 'to reading'], 'После enjoy — герундий (-ing).'),
  b('w1', 'e.word_formation', 3, 'Complete with the correct form of the word in brackets: The teacher was very ___ (HELP).', ['helpful'], 'Нужно прилагательное: help + -ful = helpful.'),
  b('w2', 'e.word_formation', 4, 'Form a negative adjective: It is ___ (POSSIBLE) to finish the work in one hour.', ['impossible'], 'Перед p отрицательный префикс im-: impossible.', { trap: 'Ставят un-: «unpossible».' }),
  b('r1', 'e.reported', 4, 'He asked me, "Where do you live?" → He asked me where I ___.', ['lived'], 'Сдвиг времён: Present Simple → Past Simple; порядок слов прямой.'),
  b('t4', 'e.tenses', 3, 'Put the verb in the correct form: By the time you come, I ___ (finish) my homework.', ['will have finished', "'ll have finished"], 'Действие завершится к моменту в будущем — Future Perfect: will have finished.'),
]

const content: SubjectContent = { topics, tasks }
export default content
