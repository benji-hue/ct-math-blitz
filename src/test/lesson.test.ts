import { describe, expect, it } from 'vitest'
import { lessonSegment } from '../lib/lesson'
import { normalizeState, type ChatMessage } from '../lib/store'

describe('урок «Объясни»', () => {
  const msg = (role: 'user' | 'assistant', mode?: ChatMessage['mode'], content = 'x'): ChatMessage => ({ id: Math.random().toString(36), role, content, at: 0, mode })

  it('урок — сообщения с конца чата в режиме урока', () => {
    const messages = [msg('user', 'tutor'), msg('assistant', 'tutor'), msg('user', 'lesson'), msg('assistant', 'lesson')]
    expect(lessonSegment(messages)).toHaveLength(2)
    expect(lessonSegment([...messages, msg('user', 'check')])).toHaveLength(0)
  })
})

describe('«Крок» — только для выпускников', () => {
  it('старые профили 9–10 класса становятся 11 классом, выпускник прошлых лет остаётся', () => {
    expect(normalizeState({ profile: { grade: '9', subjects: ['math'] } }).profile).toMatchObject({ grade: '11', subjects: ['math'] })
    expect(normalizeState({ profile: { grade: '10' } }).profile.grade).toBe('11')
    expect(normalizeState({ profile: { grade: 'grad' } }).profile.grade).toBe('grad')
    expect(normalizeState(null).profile.grade).toBe('11')
  })
})
