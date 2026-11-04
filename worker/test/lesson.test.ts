import { describe, expect, it } from 'vitest'
import { buildSystemPrompt } from '../src/ai/prompts'
import { screenTask } from '../src/ai/verify'

describe('ИИ — только для выпускников и ЦЭ/ЦТ', () => {
  it('ученики — 11 класс и выпускники прошлых лет, всё ради баллов на ЦЭ и ЦТ', () => {
    const prompt = buildSystemPrompt({ mode: 'tutor', profile: { grade: '11', exam: 'both' } })
    expect(prompt).toContain('выпускники: 11 класс и абитуриенты прошлых лет')
    expect(prompt).not.toContain('9–11')
    expect(prompt).toContain('Ученик: 11 класс, готовится к ЦЭ и ЦТ.')
    expect(buildSystemPrompt({ mode: 'tutor', profile: { grade: 'grad' } })).toContain('выпускник прошлых лет')
  })

  it('формат теста, без воды, с проверкой вычислений', () => {
    const prompt = buildSystemPrompt({ mode: 'tutor' })
    expect(prompt).toContain('часть A — выбор одного ответа')
    expect(prompt).toContain('часть B — краткий ответ')
    expect(prompt).toContain('Без вступлений, историй')
    expect(prompt).toContain('перепроверь вычисления')
  })
})

describe('промпт «Объясни»', () => {
  it('разбор по шагам в формате ЦТ: как спрашивают, план, пример, вопрос, ловушка, итог', () => {
    const prompt = buildSystemPrompt({ mode: 'lesson' })
    for (const part of ['как тема встречается на ЦТ', 'План', 'в формате задания ЦТ', 'Вопрос-проверка', 'наполовину решённый', 'Ловушка ЦТ', 'Задания ЦТ по теме']) {
      expect(prompt, part).toContain(part)
    }
  })

  it('без историй, «крючков» и школьной самостоятельной; фото — страница учебника', () => {
    const prompt = buildSystemPrompt({ mode: 'lesson', hasImage: true })
    expect(prompt).toContain('фото страницы учебника')
    for (const gone of ['Крючок', 'Историческая справка', 'самостоятельн', 'нормам оценки']) expect(prompt, gone).not.toContain(gone)
    expect(buildSystemPrompt({ mode: 'check', hasImage: true })).toContain('фото решения')
  })
})

describe('задания от ИИ', () => {
  it('задание, которое модель «переделала» прямо в решении, отбрасывается', () => {
    // Пробный вариант: в условии осталась старая задача, а ключ не подходил ни к старой, ни к новой.
    const draft = {
      q: 'Найдите внутреннее сопротивление источника тока. Ответ дайте в омах.',
      answer: '2',
      explain: 'Подставим данные: $3 = \\frac{E}{4 + r}$. (Стоп, полная цепь — это другой класс. Заменим задачу.) Переформулируем: …',
    }
    expect(screenTask(draft)).toBeNull()
    expect(screenTask({ ...draft, answer: '0', explain: '$3(4 + r) = 2(6 + r)$, откуда $r = 0$.' })).not.toBeNull()
  })
})
