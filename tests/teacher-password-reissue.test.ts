// 원장 비밀번호 다시 발급(대표 2026-11-11: 발급 화면에서 초기 비밀번호를 복사하지 못했을 때) — 본사만, 그 학원의 원장 계정만.
import { describe, it, expect, vi, beforeEach } from 'vitest'

type Call = { method: string; args: unknown[] }
const state: { session: Record<string, unknown>; teacher: Record<string, unknown> | null; adminCalls: Call[]; updateError: { message: string } | null } = { session: {}, teacher: null, adminCalls: [], updateError: null }

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))
vi.mock('@/lib/auth/session', () => ({ getSessionProfile: vi.fn(async () => state.session) }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: state.teacher }) }) }) }) }) }),
  })),
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    auth: { admin: { updateUserById: async (...args: unknown[]) => { state.adminCalls.push({ method: 'updateUserById', args }); return { error: state.updateError } } } },
  }),
}))

const { reissueTeacherPassword } = await import('@/app/admin/academies/actions')
const { app } = await import('@/content/site')
const copy = app.adminAcademies.teacherAccount.reissue

beforeEach(() => {
  state.session = { role: 'admin', userId: 'a1', academyId: null, plan: null }
  state.teacher = { id: 't1', login_id: 'won@example.com' }
  state.adminCalls = []
  state.updateError = null
})

describe('reissueTeacherPassword', () => {
  it('본사가 누르면 새 비밀번호(10자)를 정해 주고 아이디와 함께 한 번 돌려준다', async () => {
    const r = await reissueTeacherPassword('ac1', 't1')
    expect(r.error).toBeUndefined()
    expect(r.issued?.email).toBe('won@example.com')
    expect(r.issued?.password).toMatch(/^[a-zA-Z2-9]{10}$/)
    expect(state.adminCalls).toEqual([{ method: 'updateUserById', args: ['t1', { password: r.issued!.password }] }])
  })
  it('누를 때마다 다른 비밀번호', async () => {
    const a = await reissueTeacherPassword('ac1', 't1')
    const b = await reissueTeacherPassword('ac1', 't1')
    expect(a.issued!.password).not.toBe(b.issued!.password)
  })
  it('그 학원의 원장이 아니면(다른 학원·학생·없는 계정) 아무것도 바꾸지 않는다', async () => {
    state.teacher = null
    expect(await reissueTeacherPassword('ac1', 'someone-else')).toEqual({ error: copy.notFound })
    expect(state.adminCalls).toEqual([])
  })
  it('본사가 아니면 거절', async () => {
    state.session = { role: 'teacher', userId: 't9', academyId: 'ac1', plan: 'davinci' }
    await expect(reissueTeacherPassword('ac1', 't1')).rejects.toThrow('forbidden')
    expect(state.adminCalls).toEqual([])
  })
  it('바꾸기 실패는 고정 문구로(오류 문장을 그대로 내보내지 않는다)', async () => {
    state.updateError = { message: 'boom secret detail' }
    expect(await reissueTeacherPassword('ac1', 't1')).toEqual({ error: copy.failed })
  })
})
