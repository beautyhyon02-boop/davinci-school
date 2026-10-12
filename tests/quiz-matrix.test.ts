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

// 대표 2026-10-12: AI 뜻 판정 — 맞음은 O 에 작은 AI 표시, 부분은 노란 칸 + "확인 필요"(이유는 칸 제목에), 차시 탭 옆에 확인 필요 개수
describe('QuizMatrix — AI 판정 표시 (대표 2026-10-12)', () => {
  const ai = (quiz_no: number, correct: boolean, verdict: '맞음' | '부분' | '틀림', reason: string) => ({ ...row('a1', quiz_no, correct, 'student'), ai_verdict: verdict, ai_reason: reason })
  const rows = [ai(1, true, '맞음', '같은 뜻의 다른 표현'), ai(2, false, '부분', '근거는 맞지만 목적이 빠짐'), row('a1', 3, false, 'student'), ...full.filter((r) => r.assignment_id !== 'a1')]
  it('맞음 칸에는 AI 표시, 부분 칸에는 확인 필요 표시와 노란색, 이유는 title 에', () => {
    const html = render({ responses: rows }); const t = text(html)
    expect(t).toContain(copy.quizCell.aiMark)
    expect(t).toContain(copy.quizCell.needsCheck)
    expect(html).toContain('bg-lemon-100')
    expect(html).toContain(copy.quizCell.aiTitle('답', '부분', '근거는 맞지만 목적이 빠짐').replace(/&/g, '&amp;'))
  })
  it('확인 필요 개수가 보이고, 부분이 없으면 개수 문구가 없다', () => {
    expect(text(render({ responses: rows }))).toContain(copy.quizCell.needsCheckCount(1))
    expect(text(render())).not.toContain(copy.quizCell.needsCheck)
  })
})

// 독립 검토 2026-10-12: 핵심어로 맞은 칸도 원장이 알아볼 수 있게 표시한다(핵심어 오탐을 눈으로 잡을 수 있게)
describe('QuizMatrix — 핵심어 일치 표시', () => {
  it('match_kind keyword 인 O 칸에는 핵심어 표시와 title 이 붙고, aria-label 에도 들어간다', () => {
    const rows = [{ ...row('a1', 1, true, 'student'), match_kind: 'keyword' as const }, ...full.filter((r) => !(r.assignment_id === 'a1' && r.quiz_no === 1))]
    const html = render({ responses: rows }); const t = text(html)
    expect(t).toContain(copy.quizCell.keywordMark)
    expect(html).toContain(copy.quizCell.keywordTitle('답'))
    expect(html).toContain(copy.quizCell.aria('김하늘', 1, `${copy.quizCell.labels.O} · ${copy.quizCell.keywordMark}`))
  })
})
