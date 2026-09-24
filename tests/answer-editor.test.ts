// 학생 답안 칸(AnswerEditor)을 서버 렌더로 확인한다. 종이 답안 문항은 입력칸·제출 버튼 없이 안내만, 화면 입력 문항은
// 문항·번호 붙인 조건·입력칸·제출 버튼. 서버 액션 모듈은 DB 를 부르므로 가짜로 바꾼다(렌더만 본다).
import { describe, it, expect, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('@/app/student/assignments/[id]/actions', () => ({ saveDraft: vi.fn(), submitAnswer: vi.fn() }))
const { AnswerEditor } = await import('@/app/student/assignments/[id]/AnswerEditor')
const { app } = await import('@/content/site')
const copy = app.classroom.student

const base = {
  assignmentId: 'a1', itemNo: 1, attempt: 1, initialBody: '', submitted: false, label: '서술형1', points: 3,
  stem: '자료 A를 도수분포표로 나타내시오. [3점]',
}
const conditions = (answer_mode: 'screen' | 'paper') => ({
  length: '표 1개와 문장 1개', format: '표 + 문장', answer_mode,
  items: [{ no: 1, text: '계급의 크기 10으로 나눈다' }, { no: 2, text: '합계를 적는다' }],
})
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

describe('AnswerEditor', () => {
  it('paper item: shows the stem, conditions and the paper-answer notice, with no input and no submit button', () => {
    const html = renderToStaticMarkup(createElement(AnswerEditor, { ...base, conditions: conditions('paper') }))
    expect(text(html)).toContain(copy.paperAnswer)
    expect(text(html)).toContain(base.stem)
    expect(text(html)).toContain(`${copy.conditionItem(1)} 계급의 크기 10으로 나눈다`)
    expect(html).not.toContain('<textarea')
    expect(html).not.toContain('<button')
  })
  it('screen item: stem, labeled numbered conditions, length/format, textarea and a submit button', () => {
    const html = renderToStaticMarkup(createElement(AnswerEditor, { ...base, conditions: conditions('screen') }))
    const t = text(html)
    expect(t).toContain(base.stem)
    expect(t).toContain(`${copy.conditionItem(1)} 계급의 크기 10으로 나눈다`)
    expect(t).toContain(`${copy.conditionItem(2)} 합계를 적는다`)
    expect(t).toContain('표 1개와 문장 1개'); expect(t).toContain('표 + 문장')
    expect(html).toContain('<textarea')
    expect(html).toContain(`>${copy.answer.submit}</button>`)
    expect(t).not.toContain(copy.paperAnswer)
  })
  it('submitted screen item: read-only textarea with the saved body and no submit button', () => {
    const html = renderToStaticMarkup(createElement(AnswerEditor, { ...base, initialBody: '제출한 답안', submitted: true, conditions: conditions('screen') }))
    expect(html).toMatch(/<textarea[^>]*readOnly=""/i)
    expect(html).toContain('제출한 답안')
    expect(html).not.toContain('<button')
  })
})
