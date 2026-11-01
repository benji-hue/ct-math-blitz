import type { SubjectContent } from '../domain/types'
import { kit } from './kit'

const { topic, a, b } = kit('fra')

const topics = [
  topic({
    id: 'f.articles',
    title: 'Les articles',
    section: 'Grammaire',
    weight: 3,
    summary: 'Определённые, неопределённые и частичные артикли; слияние с предлогами.',
    facts: [
      'Définis: le, la, l\', les. Indéfinis: un, une, des.',
      'Partitifs (неопределённое количество): du, de la, de l\', des — Je mange du pain.',
      'После отрицания — de: Je n\'ai pas de frère.',
      'Слияние: à + le = au, à + les = aux, de + le = du, de + les = des.',
    ],
    traps: ['Сохраняют un/du после отрицания.'],
    keywords: ['articles', 'partitif', 'артикль'],
  }),
  topic({
    id: 'f.tenses',
    title: 'Les temps',
    section: 'Grammaire',
    weight: 4,
    summary: 'Passé composé с avoir и être, imparfait, futur.',
    facts: [
      'Passé composé: avoir + participe passé (j\'ai mangé); être — с глаголами движения и возвратными (je suis allé(e), elle s\'est levée).',
      'С être причастие согласуется с подлежащим: Elle est allée.',
      'Imparfait — описание и привычка в прошлом; futur simple: je parlerai, nous visiterons.',
      'Futur proche: aller + infinitif (je vais parler).',
    ],
    traps: ['Используют avoir с aller: «elle a allé».'],
    keywords: ['passé composé', 'imparfait', 'futur', 'времена'],
  }),
  topic({
    id: 'f.pronouns',
    title: 'Les pronoms',
    section: 'Grammaire',
    weight: 2,
    summary: 'Местоимения-дополнения и наречные местоимения y и en.',
    facts: ['COD: le, la, les; COI: lui, leur.', 'y — замена места или à + chose: J\'y vais.', 'en — замена de + существительное, количества: J\'en veux deux.'],
    traps: ['Путают y и en.'],
    keywords: ['pronoms', 'y', 'en', 'местоимения'],
  }),
  topic({
    id: 'f.agreement',
    title: 'L\'accord',
    section: 'Grammaire',
    weight: 2,
    summary: 'Согласование прилагательных и причастий.',
    facts: ['beau — belle — bel (перед гласной: un bel homme); nouveau — nouvelle; vieux — vieille.', 'С être причастие согласуется в роде и числе: Elles sont parties.'],
    traps: ['Не согласуют прилагательное с существительным женского рода.'],
    keywords: ['accord', 'согласование', 'adjectif'],
  }),
]

const tasks = [
  a('a1', 'f.articles', 2, 'Le matin, je mange ___ pain.', ['du', 'le', 'un', 'de la'], 'Неопределённое количество (хлеба) — partitif: du pain.'),
  a('a2', 'f.articles', 3, 'Je n\'ai pas ___ frère.', ['de', 'un', 'du', 'le'], 'После отрицания неопределённый артикль заменяется на de.'),
  a('t1', 'f.tenses', 2, 'Hier, elle ___ à Minsk.', ['est allée', 'a allé', 'est allé', 'allait allée'], 'aller спрягается с être, причастие согласуется с elle: est allée.'),
  a('t2', 'f.tenses', 2, 'Demain, nous ___ le musée. (visiter)', ['visiterons', 'visitons', 'avons visité', 'visitions'], 'Demain — будущее: futur simple, nous visiterons.'),
  a('p1', 'f.pronouns', 3, 'Tu vas à la bibliothèque ? — Oui, j\'___ vais.', ['y', 'en', 'le', 'lui'], 'y заменяет место (à la bibliothèque).'),
  a('ag1', 'f.agreement', 2, 'C\'est une ___ maison. (beau)', ['belle', 'beau', 'bel', 'beaux'], 'maison — женский род: belle.'),
  b('a3', 'f.articles', 2, 'Écrivez la forme contractée: à + le = ?', ['au'], 'à + le = au (je vais au cinéma).'),
  b('t3', 'f.tenses', 3, 'Mettez au passé composé: Nous ___ fini le travail. (avoir)', ['avons'], 'finir спрягается с avoir: nous avons fini.'),
]

const content: SubjectContent = { topics, tasks }
export default content
