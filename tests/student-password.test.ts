// tests/student-password.test.ts
// 대표 2026-10-12: 학생 비밀번호는 외우기 쉬운 고정값 — 초기화도 새 계정 발급도 123456(Supabase 최소 길이 6 때문에 1111은 못 쓴다).
import { describe, it, expect, vi, beforeEach } from 'vitest'

type Call = { method: string; args: unknown[] }
const state: { session: Record<string, unknown>; calls: Call[]; adminCalls: Call[]; studentFound: boolean } = { session: {}, calls: [], adminCalls: [], studentFound: true }

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/auth/session', () => ({ getSessionProfile: vi.fn(async () => state.session) }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          single: async () => (table === 'academies' ? { data: { code: 'dgs' } } : { data: null }),
          // 원장 클라이언트의 students 조회는 RLS 로 자기 학원만 보인다 — 다른 학원 학생이면 null(state.studentFound 로 흉내)
          eq: () => ({ maybeSingle: async () => (table === 'students' && state.studentFound ? { data: { profile_id: 'p1' } } : { data: null }) }),
        }),
      }),
    }),
    rpc: async () => ({ data: 7, error: null }),
  })),
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    auth: { admin: {
      createUser: async (arg: unknown) => { state.adminCalls.push({ method: 'createUser', args: [arg] }); return { data: { user: { id: 'u-new' } }, error: null } },
      updateUserById: async (...args: unknown[]) => { state.adminCalls.push({ method: 'updateUserById', args }); return { error: null } },
      deleteUser: async () => ({ error: null }),
    } },
    from: () => ({ insert: async () => ({ error: null }) }),
  }),
}))

const { STUDENT_DEFAULT_PASSWORD } = await import('@/lib/auth/student-password')
const { app } = await import('@/content/site')

beforeEach(() => { state.session = { role: 'teacher', academyId: 'ac1', userId: 't1', plan: 'davinci' }; state.adminCalls = []; state.studentFound = true })

describe('STUDENT_DEFAULT_PASSWORD', () => {
  it('is 123456 (대표 2026-10-12) and satisfies the Supabase minimum length of 6', () => {
    expect(STUDENT_DEFAULT_PASSWORD).toBe('123456')
    expect(STUDENT_DEFAULT_PASSWORD.length).toBeGreaterThanOrEqual(6)
  })
  it('the reset confirm message tells the teacher the fixed password', () => {
    const c = app.classroom.students.reset
    expect(c.confirm(STUDENT_DEFAULT_PASSWORD)).toContain('123456')
    expect(app.classroom.students.issued.body).toContain('123456')
  })
})

describe('학생 계정 서버 액션 — 고정 비밀번호', () => {
  it('resetStudentPassword sets the fixed password and returns it', async () => {
    const { resetStudentPassword } = await import('@/app/teacher/students/actions')
    const r = await resetStudentPassword('p1')
    expect(r).toEqual({ password: '123456' })
    expect(state.adminCalls).toEqual([{ method: 'updateUserById', args: ['p1', { password: '123456' }] }])
  })
  it('createStudent issues the account with the fixed password', async () => {
    const { createStudent } = await import('@/app/teacher/students/actions')
    const fd = new FormData(); fd.set('name', '김하늘'); fd.set('level', '중'); fd.set('grade', '2')
    const r = await createStudent(undefined, fd)
    expect(r?.issued?.password).toBe('123456')
    const created = state.adminCalls.find((c) => c.method === 'createUser')!.args[0] as { password: string }
    expect(created.password).toBe('123456')
  })
})

describe('학생 계정 서버 액션 — 막는 것(검토 2026-10-12)', () => {
  it('다른 학원 학생(RLS 로 안 보임)은 초기화하지 않고 forbidden — 비밀번호를 바꾸는 호출이 없다', async () => {
    state.studentFound = false
    const { resetStudentPassword } = await import('@/app/teacher/students/actions')
    expect(await resetStudentPassword('p-other')).toEqual({ error: app.classroom.students.errors.forbidden })
    expect(state.adminCalls).toEqual([])
  })
  it.each([
    ['학생', { role: 'student', academyId: 'ac1', userId: 's1' }],
    ['관리자', { role: 'admin', academyId: null, userId: 'a1' }],
    ['학원 없는 원장', { role: 'teacher', academyId: null, userId: 't2', plan: 'davinci' }],
  ])('%s 세션은 두 액션 모두 forbidden 으로 던지고 admin 호출이 없다', async (_who, session) => {
    state.session = session
    const { resetStudentPassword, createStudent } = await import('@/app/teacher/students/actions')
    await expect(resetStudentPassword('p1')).rejects.toThrow('forbidden')
    const fd = new FormData(); fd.set('name', '김하늘'); fd.set('level', '중'); fd.set('grade', '2')
    await expect(createStudent(undefined, fd)).rejects.toThrow('forbidden')
    expect(state.adminCalls).toEqual([])
  })
})
