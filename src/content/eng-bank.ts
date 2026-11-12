import type { Task } from '../domain/types'
import { kit } from './kit'

/**
 * Банк английского языка уровня РТ/ЦТ — по спецификации РИКЗ 2026: 40 заданий. Часть A (18):
 * лексика и грамматика — 12, социокультурная компетенция (реплики) — 2, чтение — 4.
 * Часть B (22): лексика и грамматика — слово или несколько слов.
 */
const { a, b } = kit('eng')

export const engBank: Task[] = [
  // ---------- Часть A: социокультурная компетенция ----------
  a('a.thanks', 'e.culture', 1, 'Choose the best response. — Thank you very much for your help! — ___', ["You're welcome.", 'Yes, I do.', 'Good luck!', "I'm afraid so.", 'Help yourself.'], 'На благодарность отвечают «You’re welcome» / «Don’t mention it». «Help yourself» — «угощайтесь».'),
  a('a.mind', 'e.culture', 2, 'Choose the remark that fits the response. — ___ — Not at all. Go ahead.', ['Do you mind if I open the window?', 'Could you open the window, please?', 'Why is the window open?', 'Have you opened the window?', 'Shall we go for a walk?'], 'На вопрос «Do you mind if…?» согласие выражают отрицанием: «Not at all» — «совсем не возражаю». «Go ahead» — «пожалуйста, давайте».', { trap: 'На «Could you…?» ответ «Not at all» означал бы отказ.' }),

  // ---------- Часть A: лексика и грамматика ----------
  a('a.little', 'e.vocab', 2, 'There is very ___ milk left in the fridge.', ['little', 'few', 'many', 'a few', 'several'], 'Milk — неисчисляемое: little (мало). Few, many, several — с исчисляемыми во множественном числе.'),
  a('a.compar', 'e.adjectives', 2, 'This task is ___ than the previous one.', ['more difficult', 'difficulter', 'the most difficult', 'most difficult', 'much difficult'], 'Многосложные прилагательные образуют сравнительную степень с more; than указывает на сравнение двух предметов.'),
  a('a.favour', 'e.vocab', 2, 'Could you ___ me a favour and post this letter?', ['do', 'make', 'give', 'take', 'have'], 'Устойчивое сочетание: do somebody a favour. Make — «создавать»: make a mistake, make a decision.'),
  a('a.told', 'e.vocab', 2, 'She ___ me that she was tired.', ['told', 'said', 'spoke', 'talked', 'explained'], 'Tell + кому (tell me that…). После say и explain нужен предлог to: said to me, explained to me.'),
  a('a.boring', 'e.vocab', 2, 'The film was so ___ that we left before the end.', ['boring', 'bored', 'bore', 'boringly', 'boredom'], 'Прилагательное на -ing описывает то, что вызывает чувство (фильм скучный); на -ed — того, кто его испытывает (we were bored).'),
  a('a.wish', 'e.conditionals', 3, 'I wish I ___ more time to prepare for the exam yesterday.', ['had had', 'had', 'have had', 'would have', 'have'], 'Сожаление о прошлом: wish + Past Perfect. «I wish I had» — о настоящем.', { trap: 'Yesterday указывает на прошлое — нужна форма had had, а не had.' }),

  // ---------- Часть A: чтение ----------
  a('a.read1', 'e.reading', 2, 'Read the text. «Tom had always been afraid of water. Last summer, however, his cousin persuaded him to take swimming lessons. After a month of practice he could cross the pool without stopping, and now he goes swimming twice a week.» Which statement is true?', ['Tom overcame his fear with practice.', 'Tom has loved swimming since childhood.', "Tom's cousin taught him to swim in one day.", 'Tom still avoids the pool.', 'Tom goes swimming every day.'], 'Он боялся воды, но после месяца занятий плавает дважды в неделю — страх преодолён. «Every day» противоречит «twice a week».'),
  a('a.read2', 'e.reading', 2, 'Read the text. «The town library is closing for repairs next Monday and will reopen in three weeks. Readers are asked to return borrowed books before Friday or to keep them until the library opens again; no fines will be charged for this period.» What can readers do with the books they have at home?', ['Return them before Friday or keep them until the library reopens.', 'They must return all of them on Monday.', 'They have to pay a fine for keeping them.', 'They should take them to another library.', 'They must buy them from the library.'], 'В тексте: «return … before Friday or keep them until the library opens again; no fines will be charged».'),
  a('a.read3', 'e.reading', 2, "Read the text. «Although electric cars produce no exhaust fumes, they are not completely 'green'. Producing their batteries requires a lot of energy and rare metals, and the electricity they use often comes from power stations that burn coal or gas.» What is the main idea of the text?", ['Electric cars still have an impact on the environment.', 'Electric cars are worse than petrol cars in every way.', 'Batteries for electric cars are cheap and easy to produce.', 'Electric cars burn coal in their engines.', 'Electric cars produce more exhaust fumes than petrol cars.'], 'Главная мысль — во втором предложении: «not completely green», дальше приведены причины. Остальные утверждения в тексте отсутствуют или искажают его.'),
  a('a.read4', 'e.reading', 2, "Read the text. «Maria was sure she had failed the interview: she arrived late, forgot the manager's name and spilled her coffee. So she could hardly believe her ears when the company phoned the next day and offered her the job.» The phrase «could hardly believe her ears» means that Maria was", ['very surprised', 'a little deaf', 'extremely angry', 'rather bored', 'deeply disappointed'], '«Not believe one’s ears» — «не верить своим ушам», то есть очень удивиться. Контекст: она была уверена, что провалилась, а ей предложили работу.'),

  // ---------- Часть B, уровень III ----------
  b('b.develop', 'e.word_formation', 3, 'Complete with the correct form of the word in brackets: Thanks to the ___ (DEVELOP) of technology, we can work from home.', ['development'], 'После артикля the нужно существительное: develop + -ment.'),
  b('b.famous', 'e.word_formation', 3, 'Complete with the correct form of the word in brackets: He is one of the most ___ (FAME) writers of the century.', ['famous'], 'Перед существительным нужно прилагательное: fame → famous (суффикс -ous).'),
  b('b.rains', 'e.conditionals', 3, 'Put the verb in the correct form: If it ___ (rain) tomorrow, we will stay at home.', ['rains'], 'Реальное условие (первый тип): в придаточном после if — Present Simple, хотя речь о будущем.', { trap: 'Ставят will rain — после if будущее время не употребляется.' }),
  b('b.written', 'e.passive', 3, 'Put the verb in the correct form: This letter ___ (write) by my grandfather in 1950.', ['was written'], 'Письмо было написано (кем-то) — Past Simple Passive: was + третья форма.'),
  b('b.forward', 'e.prepositions', 3, "Fill in ONE word: I'm looking forward ___ hearing from you.", ['to'], 'Look forward to + герундий: здесь to — предлог, а не частица инфинитива.'),
  b('b.since', 'e.prepositions', 3, 'Fill in ONE word: She has been working here ___ 2019.', ['since'], 'Since — с какого момента (since 2019); for — в течение какого периода (for five years).'),
  b('b.usedto', 'e.gerund_inf', 3, "Put the verb in the correct form: I'm not used to ___ (get) up so early.", ['getting'], 'Be used to + герундий — «быть привыкшим». Не путать с used to + инфинитив («раньше делал»).'),

  // ---------- Часть B, уровень IV ----------
  b('b.disappoint', 'e.word_formation', 4, 'Complete with the correct form of the word in brackets: Losing the final was a great ___ (DISAPPOINT) for the whole team.', ['disappointment'], 'После a great нужно существительное: disappoint + -ment.'),
  b('b.knowledge', 'e.word_formation', 4, 'Complete with the correct form of the word in brackets: Her ___ (KNOW) of history is really impressive.', ['knowledge'], 'Существительное от know — knowledge (неисчисляемое).'),
  b('b.unpopular', 'e.word_formation', 4, "Complete with the correct form of the word in brackets: The new law was highly ___ (POPULAR): thousands of people protested against it.", ['unpopular'], 'По смыслу нужно отрицательное прилагательное: приставка un-.', { trap: 'Не дочитывают предложение до конца и пишут popular.' }),
  b('b.would', 'e.reported', 4, 'Fill in ONE word: «I will call you tomorrow,» she said. → She said she ___ call me the next day.', ['would'], 'Согласование времён: will → would; tomorrow → the next day.'),
  b('b.beingcleaned', 'e.passive', 4, "Put the verb in the correct form: Don't go into the room: it ___ (clean) at the moment.", ['is being cleaned'], 'Действие совершается над предметом прямо сейчас — Present Continuous Passive: is being + третья форма.'),
  b('b.hadknown', 'e.conditionals', 4, 'Put the verb in the correct form: If I ___ (know) about the meeting, I would have come.', ['had known'], 'Нереальное условие в прошлом (третий тип): if + Past Perfect, would have + третья форма.'),
  b('b.whose', 'e.vocab', 4, 'Fill in ONE word: He is the man ___ car was stolen last week.', ['whose'], 'Whose — «чей, которого»: the man whose car… («человек, машину которого…»).'),
  b('b.nottell', 'e.modals', 4, "Put the words in brackets in the correct form: You'd better ___ (not / tell) him the truth yet.", ['not tell'], 'После had better — инфинитив без to; отрицание — had better not + глагол.', { trap: 'Пишут not to tell или don’t tell.' }),
  b('b.extra', 'e.gerund_inf', 4, 'One word in the sentence is extra. Write it out: She made me to promise that I would come back.', ['to'], 'После make somebody в активном залоге — инфинитив без to: made me promise.'),

  // ---------- Часть B, уровень V ----------
  b('b.never', 'e.tenses', 5, 'Fill in ONE word: Never before ___ I seen such a beautiful sunset.', ['have'], 'После never в начале предложения — инверсия: вспомогательный глагол перед подлежащим (Never have I seen…).'),
  b('b.wishwould', 'e.conditionals', 5, "Put the verb in the correct form: I wish you ___ (stop) making that noise — I can't concentrate!", ['would stop'], 'Раздражение из-за чужих действий и желание, чтобы они изменились: wish + would + инфинитив.'),
  b('b.hightime', 'e.conditionals', 5, "Put the verb in the correct form: It's high time we ___ (go) home.", ['went'], 'После it’s (high) time + подлежащее употребляется Past Simple, хотя речь о настоящем.'),
  b('b.sooner', 'e.vocab', 5, 'Fill in ONE word: No sooner had we sat down ___ the phone rang.', ['than'], 'Парная конструкция: no sooner … than (но hardly … when).', { trap: 'Пишут when — он употребляется с hardly/scarcely.' }),
]
