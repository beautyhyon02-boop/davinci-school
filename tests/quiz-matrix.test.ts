// 원장 퀴즈 O/X 표(QuizMatrix)를 서버 렌더로 확인한다(설계 2026-09-29 §4.1). 서버 액션 모듈은 DB 를 부르므로 가짜로 바꾼다.
import { describe, it, expect, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('@/app/teacher/assignments/[setId]/actions', () => ({ setQuizCell: vi.fn(), fillEmptyQuiz: vi.fn(), finalizeQuizLesson: vi.fn(), unfinalizeQuizLesson: vi.fn() }))
const { QuizMatrix } = await import('@/app/teacher/assignments/[setId]/QuizMatrix')
const { app } = await import('@/content/site')
const copy = app.classroom.review

const lessons = [{ no: 1, quizCount: 3, types: ['short', 'short', 'short'] as ('choice' | 'short')[] }, { no: 6, quizCount: 0, types: [] }]
const students = [{ assignmentId: 'a1', name: '김하늘', openLessons: 8 }, { assignmentId: 'a2', name: '이바다', openLessons: 8 }]
const row = (assignment_id: string, quiz_no: number, correct: boolean, source: 'student' | 'teacher') => ({ assignment_id, lesson_no: 1, quiz_no, response: source === 'teacher' ? '' : '답', correct, source })
const full = [row('a1', 1, true, 'student'), row('a1', 2, false, 'student'), row('a1', 3, true, 'teacher')]
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&quot;/g, '"').replace(/\s+/g, ' ')
const render = (p: Partial<Parameters<typeof QuizMatrix>[0]> = {}) => renderToStaticMarkup(createElement(QuizMatrix, { setId: 's1', lessons, students, responses: full, finalizations: [], finalizeAvailable: true, ...p }))

describe('QuizMatrix', () => {
  it('shows the cycle hint, the fill button, the finalise button and the students who still have empty cells', () => {
    const t = text(render())
    for (const h of copy.quizCell.hints) expect(t).toContain(h)
    expect(t).toContain(copy.fillEmpty)
    expect(t).toContain(copy.finalize.button)
    expect(t).toContain(copy.finalize.missingHeading)
    expect(t).toContain(copy.finalize.missingNote)
    expect(t.split(copy.finalize.missingHeading)[1]).toContain('이바다')
    expect(t.split(copy.finalize.missingHeading)[1]).not.toContain('김하늘')
    expect(t).toContain(copy.quizCell.paperMark)          // 원장이 넣은 칸 표시
    expect(t).not.toContain(copy.finalize.undo)
  })
  it('every cell is a button, empty ones included, and the finalise button is never disabled by empty cells', () => {
    const html = render()
    expect(html.split('aria-label="').length - 1).toBe(6)
    const finalizeButton = html.split('<button').find((b) => b.includes(`>${copy.finalize.button}<`))!
    expect(finalizeButton).not.toContain('disabled=""')
  })
  it('all students finalised → mint badge with the date and the undo link', () => {
    const fin = [{ assignment_id: 'a1', lesson_no: 1, finalized_at: '2026-09-29T03:00:00Z' }, { assignment_id: 'a2', lesson_no: 1, finalized_at: '2026-09-29T04:00:00Z' }]
    const t = text(render({ finalizations: fin }))
    expect(t).toContain(copy.finalize.done('2026-09-29'))
    expect(t).toContain(copy.finalize.undo)
  })
  it('one student un-finalised by an O/X change → the button comes back and that student is named', () => {
    const t = text(render({ finalizations: [{ assignment_id: 'a1', lesson_no: 1, finalized_at: '2026-09-29T03:00:00Z' }] }))
    expect(t).toContain(copy.finalize.pendingHeading)
    expect(t.split(copy.finalize.pendingHeading)[1]).toContain('이바다')
    expect(t).not.toContain(copy.finalize.undo)
  })
  it('migration 0014 not applied (finalizeAvailable false): the table still renders, the finalise block does not', () => {
    const t = text(render({ finalizeAvailable: false }))
    expect(t).toContain(copy.fillEmpty)
    expect(t).toContain('김하늘')
    expect(t).not.toContain(copy.finalize.button)
    expect(t).not.toContain(copy.finalize.missingHeading)
  })
})
