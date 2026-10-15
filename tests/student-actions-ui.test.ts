// 학생 관리 「동작」 칸(대표 2026-10-15): 비밀번호 초기화 옆에 「반이동」·「퇴원」 상자 둘. 서버 렌더로 문구·상자를 확인한다.
import { describe, it, expect, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('@/app/teacher/students/actions', () => ({ resetStudentPassword: vi.fn(), withdrawStudent: vi.fn(), moveStudent: vi.fn() }))
const { StudentActions } = await import('@/app/teacher/students/StudentActions')
const { app } = await import('@/content/site')
const copy = app.classroom.students
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

describe('StudentActions', () => {
  it('비밀번호 초기화·반이동·퇴원 단추 셋이 한 줄에 있고, 반이동 폼은 접혀 있다', () => {
    const html = renderToStaticMarkup(createElement(StudentActions, { profileId: 'p1', name: '김하늘', level: '중', grade: 2 }))
    const t = text(html)
    expect(t).toContain(copy.reset.button); expect(t).toContain(copy.move.button); expect(t).toContain(copy.withdraw.button)
    expect(html).not.toContain('name="grade"')
    expect((html.match(/<button/g) ?? []).length).toBe(3)
  })
})
