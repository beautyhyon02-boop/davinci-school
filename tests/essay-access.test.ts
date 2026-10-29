import { describe, it, expect } from 'vitest'
import { isEssayPath, teacherNavFor, assertEssayAccess, ESSAY_PATHS } from '@/lib/auth/essay-access'
import { app } from '@/content/site'
describe('서논술 잠금', () => {
  it('서논술 경로 넷', () => {
    expect(ESSAY_PATHS).toEqual(['/teacher/students', '/teacher/items', '/teacher/assignments', '/teacher/reports'])
    expect(isEssayPath('/teacher/items/abc')).toBe(true); expect(isEssayPath('/teacher')).toBe(false); expect(isEssayPath('/teacher/inquiry')).toBe(false)
  })
  it('베이직 메뉴는 홈·탐구보고서만, 올은 전부', () => {
    expect(teacherNavFor('davinci_basic').map(n => n.href)).toEqual(['/teacher', '/teacher/inquiry'])
    expect(teacherNavFor('davinci')).toEqual(app.nav.teacher)
    expect(teacherNavFor(null).map(n => n.href)).toEqual(['/teacher', '/teacher/inquiry'])
  })
  it('assertEssayAccess 는 올·관리자만 통과', () => {
    expect(() => assertEssayAccess({ role: 'teacher', plan: 'davinci' })).not.toThrow()
    expect(() => assertEssayAccess({ role: 'admin', plan: null })).not.toThrow()
    expect(() => assertEssayAccess({ role: 'teacher', plan: 'davinci_basic' })).toThrow('essay_plan_required')
  })
})
