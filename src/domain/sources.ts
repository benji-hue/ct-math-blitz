import type { SubjectId } from './types'

/**
 * Библиотека: только официальные или открытые источники.
 *
 * Мы НЕ копируем к себе учебники и тесты РИКЗ — это объекты авторского права.
 * Приложение ведёт на первоисточник (открывается во встроенном браузере
 * Telegram), а внутри даёт собственные конспекты, задания и ИИ-разборы.
 */

export type SourceKind = 'official' | 'textbook' | 'tests' | 'stats'

export interface Source {
  id: string
  title: string
  description: string
  url: string
  kind: SourceKind
  /** Пусто — источник общий для всех предметов. */
  subjects?: SubjectId[]
  free: boolean
}

export const SOURCES: Source[] = [
  {
    id: 'rikz',
    title: 'РИКЗ — Республиканский институт контроля знаний',
    description: 'Организатор ЦЭ, ЦТ и РТ: новости, регистрация, результаты.',
    url: 'https://rikc.by/',
    kind: 'official',
    free: true,
  },
  {
    id: 'specs-2026',
    title: 'Спецификации ЦЭ и ЦТ',
    description: 'Структура теста, число заданий, уровни сложности и программа по каждому из 14 предметов.',
    url: 'https://rikc.by/cctesting/49-specifikacii-jekzamenacionnyh-testovyh-rabot-po-uchebnym-predmetam-dlja-provedenija-centralizovannogo-jekzamena-i-centralizovannogo-testirovanija-v-2026-godu.html',
    kind: 'official',
    free: true,
  },
  {
    id: 'spec-math-2026',
    title: 'Спецификация по математике (PDF)',
    description: '30 заданий: 10 в части А и 20 в части В, 210 минут.',
    url: 'https://rikc.by/ru/specification/2026/04.pdf',
    kind: 'official',
    subjects: ['math'],
    free: true,
  },
  {
    id: 'drt',
    title: 'Дистанционное РТ',
    description: 'Бесплатные онлайн-тесты РИКЗ в формате ЦЭ/ЦТ с автоматической проверкой.',
    url: 'https://result.rikc.by/ru/free/Default.aspx',
    kind: 'tests',
    free: true,
  },
  {
    id: 'memo-ct',
    title: 'Памятка участнику ЦТ',
    description: 'Что взять с собой, когда приходить, что запрещено.',
    url: 'https://rikc.by/cctesting/44-pamyatka-uchastniku.html',
    kind: 'official',
    free: true,
  },
  {
    id: 'memo-ce',
    title: 'Памятка участнику ЦЭ',
    description: 'Правила проведения централизованного экзамена.',
    url: 'https://rikc.by/centralizovannyj-jekzamen/697-pamjatka-uchastniku.html',
    kind: 'official',
    free: true,
  },
  {
    id: 'blank',
    title: 'Как заполнять бланк ответов',
    description: 'Образец заполнения — частая причина потерянных баллов.',
    url: 'https://rikc.by/cctesting/45-zapolnenie-blanka.html',
    kind: 'official',
    free: true,
  },
  {
    id: 'ce-2026',
    title: 'Централизованный экзамен — Минобразования',
    description: 'Порядок ЦЭ, предметы, сроки, ответы на частые вопросы.',
    url: 'https://edu.gov.by/tsentralizovannyy-ekzamen/tsentralizovannyy-ekzamen-2026/',
    kind: 'official',
    free: true,
  },
  {
    id: 'scales',
    title: 'Перевод баллов ЦЭ в отметку',
    description: 'Официальные шкалы перевода 100-балльного результата в десятибалльную отметку.',
    url: 'https://edu.gov.by/gotovimsya-k-tse/shkaly-perevoda-ballov/',
    kind: 'official',
    free: true,
  },
  {
    id: 'results-ct',
    title: 'Результаты ЦТ',
    description: 'Проверка результатов по номеру пропуска.',
    url: 'https://result.rikc.by/ru/testing/ResultCT.aspx',
    kind: 'official',
    free: true,
  },
  {
    id: 'results-ce',
    title: 'Результаты ЦЭ',
    description: 'Проверка результатов централизованного экзамена.',
    url: 'https://result.rikc.by/ru/testing/ResultCE.aspx',
    kind: 'official',
    free: true,
  },
  {
    id: 'e-padruchnik',
    title: 'Электронные учебники (e-padruchnik)',
    description: 'Официальные электронные версии школьных учебников Беларуси, 1–11 классы. Выберите класс и предмет.',
    url: 'https://e-padruchnik.adu.by/',
    kind: 'textbook',
    free: true,
  },
  {
    id: 'adu',
    title: 'Национальный образовательный портал',
    description: 'Учебные программы, «Дневник абитуриента», методические материалы.',
    url: 'https://adu.by/',
    kind: 'textbook',
    free: true,
  },
  {
    id: 'reshu-math',
    title: 'РЕШУ ЦТ: математика',
    description: 'Открытый банк заданий с решениями, задания ЦТ прошлых лет.',
    url: 'https://math_ct.reshu.by/',
    kind: 'tests',
    subjects: ['math'],
    free: true,
  },
  {
    id: 'reshu-rus',
    title: 'РЕШУ ЦЭ: русский язык',
    description: 'Банк заданий по русскому языку в формате ЦЭ/ЦТ.',
    url: 'https://rus_ce.sdamgia.ru/',
    kind: 'tests',
    subjects: ['rus'],
    free: true,
  },
  {
    id: 'reshu-hist',
    title: 'РЕШУ ЦТ: история Беларуси',
    description: 'Задания с ответами и пояснениями.',
    url: 'https://bh_ct.sdamgia.ru/',
    kind: 'tests',
    subjects: ['hist'],
    free: true,
  },
  {
    id: 'reshu-soc',
    title: 'РЕШУ ЦЭ: обществоведение',
    description: 'Варианты экзаменов прошлых лет и тренировочные задания.',
    url: 'https://soc_ce.reshu.by/',
    kind: 'tests',
    subjects: ['soc'],
    free: true,
  },
  {
    id: 'adukar-rus',
    title: 'Варианты ЦТ прошлых лет онлайн',
    description: 'Подборка вариантов 2018–2026 годов для самопроверки (сторонний сайт).',
    url: 'https://adukar.com/by/test/ct-russkij-yazyk',
    kind: 'tests',
    subjects: ['rus'],
    free: true,
  },
  {
    id: 'stats-2026',
    title: 'Итоги ЦТ-2026: стобалльники и средние баллы',
    description: 'Официальные первые итоги кампании 2026 года.',
    url: 'https://edu.gov.by/news/pervye-itogi-tst2026-stoballniki-statistika-i-distsiplina/',
    kind: 'stats',
    free: true,
  },
  {
    id: 'stats-ce-2026',
    title: 'Итоги ЦЭ-2026 по языкам',
    description: 'Участники, средние баллы, стобалльники по русскому и белорусскому.',
    url: 'https://kudapostupat.by/article/item/id/3130',
    kind: 'stats',
    subjects: ['rus', 'bel'],
    free: true,
  },
]

export const SOURCE_KIND_LABEL: Record<SourceKind, string> = {
  official: 'Официально',
  textbook: 'Учебники',
  tests: 'Тесты',
  stats: 'Статистика',
}

export function sourcesFor(subject: SubjectId): Source[] {
  return SOURCES.filter((s) => !s.subjects || s.subjects.includes(subject))
}

/** Печатные сборники — говорим о них честно, но ссылок на пиратские копии не даём. */
export const PRINTED_COLLECTIONS =
  'Полные тексты тестов ЦЭ/ЦТ прошлых лет РИКЗ издаёт сборниками по 14 предметам; ' +
  'сборники с ответами выпускает и издательство «Аверсэв». Ищите их в школьной ' +
  'библиотеке или книжных магазинах — в приложение они не встраиваются из-за авторских прав.'
