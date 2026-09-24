// 학생 마무리 퀴즈(QuizForm)를 서버 렌더로 확인한다. 대표 2026-09-26: 퀴즈는 단답형만(객관식 폐지) — 새 세트는 입력 칸이 기본이고,
// 보기 단추는 그 전에 게시된 판의 선택형 퀴즈에만 남는다. 서버 액션 모듈은 DB 를 부르므로 가짜로 바꾼다(렌더만 본다).
import { describe, it, expect, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('@/app/student/assignments/[id]/actions', () => ({ submitQuiz: vi.fn() }))
const { QuizForm } = await import('@/app/student/assignments/[id]/QuizForm')

type Quiz = { q: string; type: 'choice' | 'short'; choices: string[] | null }
const render = (quiz: Quiz[]) => renderToStaticMarkup(createElement(QuizForm, { assignmentId: 'a1', lessonNo: 1, quiz, done: null }))
const count = (html: string, s: string) => html.split(s).length - 1

describe('QuizForm', () => {
  it('단답형(새 세트): 문항마다 입력 칸, 보기 단추 없음', () => {
    const html = render([1, 2, 3].map((n) => ({ q: `문항 ${n}`, type: 'short', choices: null })))
    expect(count(html, '<input')).toBe(3)
    expect(count(html, 'type="button"')).toBe(1)   // 제출 단추만
  })
  it('옛 판의 선택형은 보기 단추로 그대로 보인다; 보기가 없는 선택형은 입력 칸으로', () => {
    const legacy = render([{ q: '보기 문항', type: 'choice', choices: ['①', '②', '③'] }])
    expect(legacy).not.toContain('<input')
    for (const c of ['①', '②', '③']) expect(legacy).toContain(`>${c}</button>`)
    expect(render([{ q: '보기 없는 문항', type: 'choice', choices: null }])).toContain('<input')
  })
})
