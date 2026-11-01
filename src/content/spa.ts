import type { SubjectContent } from '../domain/types'
import { kit } from './kit'

const { topic, a, b } = kit('spa')

const topics = [
  topic({
    id: 'sp.ser_estar',
    title: 'Ser y estar',
    section: 'Gramática',
    weight: 4,
    summary: 'ser — что это и какое по сути; estar — где и в каком состоянии сейчас.',
    facts: [
      'ser: identidad, origen, profesión, características: Soy de Minsk. Minsk es la capital.',
      'estar: lugar y estado temporal: Estoy cansado. Minsk está en Bielorrusia.',
    ],
    traps: ['Используют ser для местоположения: «Minsk es en Bielorrusia».'],
    keywords: ['ser', 'estar', 'быть'],
  }),
  topic({
    id: 'sp.past',
    title: 'Pretérito indefinido e imperfecto',
    section: 'Gramática',
    weight: 4,
    summary: 'Indefinido — законченное событие, imperfecto — описание и привычка в прошлом.',
    facts: [
      'Indefinido: acción terminada en un momento concreto — Ayer fui al cine.',
      'Imperfecto: descripción, hábito — De niño jugaba al fútbol.',
      'Pretérito perfecto: con hoy, esta semana, ya — He comido.',
    ],
    traps: ['Ставят imperfecto при точном моменте (ayer).'],
    keywords: ['indefinido', 'imperfecto', 'прошедшее время'],
  }),
  topic({
    id: 'sp.subjuntivo',
    title: 'Subjuntivo',
    section: 'Gramática',
    weight: 2,
    summary: 'Сослагательное наклонение после глаголов желания, чувства и оценки.',
    facts: ['Quiero que + subjuntivo: Quiero que vengas.', 'Espero que, es importante que, cuando + futuro: Cuando llegues, llámame.'],
    traps: ['Ставят indicativo после quiero que.'],
    keywords: ['subjuntivo', 'сослагательное'],
  }),
  topic({
    id: 'sp.articles',
    title: 'Artículos y género',
    section: 'Gramática',
    weight: 2,
    summary: 'Род существительных и артикли, включая исключения.',
    facts: ['el problema, el día, el mapa — мужской род на -a.', 'la mano — женский род на -o.', 'el agua — женский род, но el перед ударным a-.'],
    traps: ['Ставят la перед problema.'],
    keywords: ['artículo', 'género', 'род'],
  }),
]

const tasks = [
  a('s1', 'sp.ser_estar', 1, 'Minsk ___ la capital de Bielorrusia.', ['es', 'está', 'hay', 'son'], 'Определение, сущность — ser: es la capital.'),
  a('s2', 'sp.ser_estar', 2, 'Hoy ___ muy cansado.', ['estoy', 'soy', 'hay', 'tengo'], 'Временное состояние — estar.'),
  a('p1', 'sp.past', 3, 'Ayer ___ al cine. (yo, ir)', ['fui', 'iba', 'he ido', 'voy'], 'Ayer — законченное действие в определённый момент: pretérito indefinido.'),
  a('p2', 'sp.past', 3, 'Cuando era niño, ___ al fútbol todos los días.', ['jugaba', 'jugué', 'he jugado', 'juego'], 'Привычка в прошлом (todos los días) — imperfecto.'),
  a('sj1', 'sp.subjuntivo', 4, 'Quiero que tú ___ conmigo.', ['vengas', 'vienes', 'vendrás', 'venir'], 'После quiero que (разные подлежащие) — subjuntivo: vengas.'),
  a('ar1', 'sp.articles', 2, '___ problema es difícil.', ['El', 'La', 'Los', 'Una'], 'problema — мужского рода, несмотря на окончание -a.'),
  b('s3', 'sp.ser_estar', 2, 'Complete: Yo ___ de Bielorrusia. (ser)', ['soy'], 'Происхождение — ser: soy.'),
  b('ar2', 'sp.articles', 3, 'Escriba el artículo definido: ___ agua está fría.', ['el'], 'agua — женского рода, но перед ударным a- ставится el.'),
]

const content: SubjectContent = { topics, tasks }
export default content
