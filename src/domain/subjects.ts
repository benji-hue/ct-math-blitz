import type { SubjectId } from './types'

/**
 * Справочник предметов ЦЭ/ЦТ.
 *
 * Структура тестов — по спецификациям РИКЗ 2026 года (для 2027 года РИКЗ
 * публикует спецификации осенью; до этого ориентир — прошлогодние).
 * Статистика — официальные итоги ЦЭ/ЦТ-2026 (Минобразования, РИКЗ).
 * Пороговые баллы — постановление Минобразования № 16 от 3.03.2020,
 * без изменений с 2022 года.
 *
 * Каждая цифра здесь должна иметь источник: см. docs/ИССЛЕДОВАНИЕ.md.
 */

export interface ExamFormat {
  tasks: number
  partA: number
  partB: number
  minutes: number
}

export interface SubjectStats {
  /** Средний балл ЦТ-2026 (основные дни). */
  ctAvg?: number
  /** Средний балл ЦЭ-2026. */
  ceAvg?: number
  ceParticipants?: number
  /** Стобалльники ЦТ-2026 (основные дни 2 и 5 июня). */
  ctHundred?: number
  ceHundred?: number
}

export interface Thresholds {
  /** Минимальный балл, если предмет — первый профильный. */
  first?: number
  /** Минимальный балл, если предмет — второй профильный. */
  second?: number
  /** Для языков (белорусский / русский). */
  language?: number
  /** Для филологических специальностей. */
  philology?: number
}

export interface SubjectMeta {
  id: SubjectId
  title: string
  short: string
  /** Цвет предмета: плитка, свечение, графики. */
  color: string
  /** Буквенный значок вместо иконки (иностранные языки). */
  badge?: string
  group: 'core' | 'stem' | 'humanities' | 'foreign'
  format: ExamFormat
  /** Даты 2027 года (ISO). ce — день ЦЭ, ct — дни ЦТ (первый совпадает с ЦЭ). */
  dates: { ce: string; ct: string[] }
  stats: SubjectStats
  thresholds: Thresholds
  /** Что можно взять с собой кроме ручки и документов. */
  allowed?: string
  /** Язык контента предмета (для озвучки/шрифтов и подсказок ИИ). */
  lang: 'ru' | 'be' | 'en' | 'de' | 'fr' | 'es' | 'zh'
}

const FOREIGN_FORMAT: ExamFormat = { tasks: 40, partA: 18, partB: 22, minutes: 120 }
const FOREIGN_DATES = { ce: '2027-05-27', ct: ['2027-05-27', '2027-06-04'] }
const HUMANITIES_THRESHOLDS: Thresholds = { first: 25, second: 15 }
const STEM_THRESHOLDS: Thresholds = { first: 20, second: 10 }

export const SUBJECTS: Record<SubjectId, SubjectMeta> = {
  math: {
    id: 'math',
    title: 'Математика',
    short: 'Математика',
    color: '#7c6cff',
    group: 'core',
    format: { tasks: 30, partA: 10, partB: 20, minutes: 210 },
    dates: { ce: '2027-05-27', ct: ['2027-05-27', '2027-06-04'] },
    stats: { ctAvg: 46.1, ctHundred: 216 },
    thresholds: STEM_THRESHOLDS,
    lang: 'ru',
  },
  rus: {
    id: 'rus',
    title: 'Русский язык',
    short: 'Русский',
    color: '#ff6b6b',
    group: 'core',
    format: { tasks: 40, partA: 18, partB: 22, minutes: 120 },
    dates: { ce: '2027-05-31', ct: ['2027-05-31'] },
    stats: { ctAvg: 51.9, ceAvg: 66.16, ceParticipants: 48456, ceHundred: 1301 },
    thresholds: { language: 10, philology: 25 },
    lang: 'ru',
  },
  bel: {
    id: 'bel',
    title: 'Белорусский язык',
    short: 'Белорусский',
    color: '#ef4f7a',
    group: 'core',
    format: { tasks: 40, partA: 18, partB: 22, minutes: 120 },
    dates: { ce: '2027-05-31', ct: ['2027-05-31'] },
    stats: { ctAvg: 47.0, ceAvg: 63.85, ceParticipants: 10417, ceHundred: 125 },
    thresholds: { language: 10, philology: 25 },
    lang: 'be',
  },
  phys: {
    id: 'phys',
    title: 'Физика',
    short: 'Физика',
    color: '#3b82f6',
    group: 'stem',
    format: { tasks: 30, partA: 10, partB: 20, minutes: 210 },
    dates: { ce: '2027-05-27', ct: ['2027-05-27', '2027-06-07'] },
    stats: { ctHundred: 43 },
    thresholds: STEM_THRESHOLDS,
    allowed: 'непрограммируемый калькулятор (сверьтесь с памяткой РИКЗ)',
    lang: 'ru',
  },
  chem: {
    id: 'chem',
    title: 'Химия',
    short: 'Химия',
    color: '#14b8a6',
    group: 'stem',
    format: { tasks: 38, partA: 16, partB: 22, minutes: 150 },
    dates: { ce: '2027-05-27', ct: ['2027-05-27', '2027-06-07'] },
    stats: { ctAvg: 48.8 },
    thresholds: STEM_THRESHOLDS,
    allowed: 'непрограммируемый калькулятор (сверьтесь с памяткой РИКЗ)',
    lang: 'ru',
  },
  bio: {
    id: 'bio',
    title: 'Биология',
    short: 'Биология',
    color: '#22c55e',
    group: 'stem',
    format: { tasks: 38, partA: 16, partB: 22, minutes: 120 },
    dates: { ce: '2027-05-27', ct: ['2027-05-27', '2027-06-04'] },
    stats: { ctAvg: 57.7 },
    thresholds: STEM_THRESHOLDS,
    lang: 'ru',
  },
  hist: {
    id: 'hist',
    title: 'История Беларуси в контексте всемирной истории',
    short: 'История',
    color: '#f59e0b',
    group: 'humanities',
    format: { tasks: 38, partA: 16, partB: 22, minutes: 90 },
    dates: { ce: '2027-05-27', ct: ['2027-05-27', '2027-06-07'] },
    stats: { ctAvg: 46.2 },
    thresholds: HUMANITIES_THRESHOLDS,
    lang: 'ru',
  },
  soc: {
    id: 'soc',
    title: 'Обществоведение',
    short: 'Обществоведение',
    color: '#a855f7',
    group: 'humanities',
    format: { tasks: 38, partA: 16, partB: 22, minutes: 90 },
    dates: { ce: '2027-05-27', ct: ['2027-05-27', '2027-06-07'] },
    stats: { ctAvg: 61.2 },
    thresholds: HUMANITIES_THRESHOLDS,
    lang: 'ru',
  },
  geo: {
    id: 'geo',
    title: 'География',
    short: 'География',
    color: '#06b6d4',
    group: 'humanities',
    format: { tasks: 38, partA: 16, partB: 22, minutes: 90 },
    dates: { ce: '2027-05-27', ct: ['2027-05-27', '2027-06-04'] },
    stats: { ctAvg: 66.4 },
    thresholds: HUMANITIES_THRESHOLDS,
    lang: 'ru',
  },
  eng: {
    id: 'eng',
    title: 'Английский язык',
    short: 'Английский',
    color: '#6366f1',
    badge: 'EN',
    group: 'foreign',
    format: FOREIGN_FORMAT,
    dates: FOREIGN_DATES,
    stats: { ctHundred: 169 },
    thresholds: HUMANITIES_THRESHOLDS,
    lang: 'en',
  },
  deu: {
    id: 'deu',
    title: 'Немецкий язык',
    short: 'Немецкий',
    color: '#d4a20b',
    badge: 'DE',
    group: 'foreign',
    format: FOREIGN_FORMAT,
    dates: FOREIGN_DATES,
    stats: {},
    thresholds: HUMANITIES_THRESHOLDS,
    lang: 'de',
  },
  fra: {
    id: 'fra',
    title: 'Французский язык',
    short: 'Французский',
    color: '#0ea5e9',
    badge: 'FR',
    group: 'foreign',
    format: FOREIGN_FORMAT,
    dates: FOREIGN_DATES,
    stats: {},
    thresholds: HUMANITIES_THRESHOLDS,
    lang: 'fr',
  },
  spa: {
    id: 'spa',
    title: 'Испанский язык',
    short: 'Испанский',
    color: '#f97316',
    badge: 'ES',
    group: 'foreign',
    format: FOREIGN_FORMAT,
    dates: FOREIGN_DATES,
    stats: {},
    thresholds: HUMANITIES_THRESHOLDS,
    lang: 'es',
  },
  chi: {
    id: 'chi',
    title: 'Китайский язык',
    short: 'Китайский',
    color: '#e5484d',
    badge: '中',
    group: 'foreign',
    format: FOREIGN_FORMAT,
    dates: FOREIGN_DATES,
    stats: {},
    thresholds: HUMANITIES_THRESHOLDS,
    lang: 'zh',
  },
}

export const SUBJECT_LIST = Object.values(SUBJECTS)

export const GROUP_LABEL: Record<SubjectMeta['group'], string> = {
  core: 'Обязательные',
  stem: 'Естественные науки',
  humanities: 'Гуманитарные',
  foreign: 'Иностранные языки',
}

export function subjectTitle(id: SubjectId): string {
  return SUBJECTS[id]?.short ?? id
}
