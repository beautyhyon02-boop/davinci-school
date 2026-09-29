// 학생 답안 칸(AnswerEditor)을 서버 렌더로 확인한다. 종이 답안 문항은 입력칸·제출 버튼 없이 안내만, 화면 입력 문항은
// 문항·번호 붙인 조건·입력칸·제출 버튼. 서버 액션 모듈은 DB 를 부르므로 가짜로 바꾼다(렌더만 본다).
import { describe, it, expect, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('@/app/student/assignments/[id]/actions', () => ({ saveDraft: vi.fn(), submitAnswer: vi.fn() }))
const { AnswerEditor } = await import('@/app/student/assignments/[id]/AnswerEditor')
const { app } = await import('@/content/site')
const { visibleCriteria } = await import('@/components/studio/parts/ItemCriteria')
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
  it('a 서술형 without conditions (C-32): no "작성 조건" heading and no numbered 조건 lines — only 분량·형식', () => {
    const html = renderToStaticMarkup(createElement(AnswerEditor, { ...base, label: '서술형', points: 6, conditions: { ...conditions('screen'), items: [] } }))
    const t = text(html)
    expect(t).not.toContain(copy.answer.conditions)
    expect(t).not.toContain(copy.conditionItem(1))
    expect(t).toContain(copy.answer.lengthFormat)
    expect(t).toContain('표 1개와 문장 1개'); expect(t).toContain('표 + 문장')
    expect(html).toContain('<textarea')
  })
  it('an item with conditions keeps the "작성 조건" heading', () => {
    expect(text(renderToStaticMarkup(createElement(AnswerEditor, { ...base, conditions: conditions('screen') })))).toContain(copy.answer.conditions)
  })
  // 대표 2026-09-29 "평가 요소에 나와 있는 것들이 조건이라고 보면 된다": 채점되는 것은 학생에게 보여야 한다 — 요소 이름·만점만, 한 줄에 하나씩,
  // 조건·분량·형식 다음(입력칸 위). 척도 서술·예시답안은 학생 화면으로 보내지 않는다(visibleCriteria).
  describe('평가 요소 (student-visible criteria)', () => {
    const rubric = {
      criteria: [
        { name: '자료의 사실적 정보 설명하기', max: 3, axis: '지식·이해', condition_nos: [], scale: [{ points: 0, descriptor: '무응답이거나 시도했으나 관련 없음' }, { points: 3, descriptor: '세 가지 사실을 모두 정확히 씀' }] },
        { name: '수치 표현 활용하기', max: 2, axis: '과정·기능', condition_nos: [], scale: [{ points: 2, descriptor: '대략·비교 표현을 서로 다르게 씀' }] },
        { name: '언어 형식과 분량 지키기', max: 1, axis: '과정·기능', condition_nos: [], scale: [] },
      ],
    }
    const criteria = visibleCriteria(rubric)
    it('visibleCriteria keeps only name and max (no scale, axis, condition_nos, taught_in)', () => {
      expect(criteria).toEqual([{ name: '자료의 사실적 정보 설명하기', max: 3 }, { name: '수치 표현 활용하기', max: 2 }, { name: '언어 형식과 분량 지키기', max: 1 }])
      expect(visibleCriteria(null)).toEqual([]); expect(visibleCriteria({})).toEqual([])
    })
    it('a 서술형 (no conditions) shows 평가 요소 with each criterion name + max on its own line, after 분량·형식 and before the answer box — no descriptors', () => {
      const html = renderToStaticMarkup(createElement(AnswerEditor, { ...base, label: '서술형', points: 6, conditions: { ...conditions('screen'), items: [] }, criteria }))
      const t = text(html)
      expect(t).toContain(app.packageView.items.criteriaHeading)
      for (const c of criteria) expect(html).toContain(`<li>${app.packageView.items.criterionLine(c.name, c.max)}</li>`)
      expect(t).toContain('자료의 사실적 정보 설명하기 (3점)')
      for (const c of rubric.criteria) for (const s of c.scale) expect(t).not.toContain(s.descriptor)
      expect(t).not.toContain('조건 없음')
      const at = html.indexOf('data-item-criteria')
      expect(at).toBeGreaterThan(html.indexOf('표 + 문장'))
      expect(at).toBeLessThan(html.indexOf('<textarea'))
    })
    it('a 논술형 shows the numbered conditions first, then 평가 요소; the paper item shows them too', () => {
      for (const mode of ['screen', 'paper'] as const) {
        const html = renderToStaticMarkup(createElement(AnswerEditor, { ...base, label: '논술형', points: 16, conditions: conditions(mode), criteria }))
        expect(html.indexOf(copy.conditionItem(2))).toBeLessThan(html.indexOf('data-item-criteria'))
        expect(text(html)).toContain('언어 형식과 분량 지키기 (1점)')
      }
    })
    it('without criteria (old callers) nothing extra is drawn', () => {
      expect(renderToStaticMarkup(createElement(AnswerEditor, { ...base, conditions: conditions('screen') }))).not.toContain('data-item-criteria')
    })
  })
  it('submitted screen item: read-only textarea with the saved body and no submit button', () => {
    const html = renderToStaticMarkup(createElement(AnswerEditor, { ...base, initialBody: '제출한 답안', submitted: true, conditions: conditions('screen') }))
    expect(html).toMatch(/<textarea[^>]*readOnly=""/i)
    expect(html).toContain('제출한 답안')
    expect(html).not.toContain('<button')
  })
})
