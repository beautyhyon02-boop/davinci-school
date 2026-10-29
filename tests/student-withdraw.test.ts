// 학생 관리의 「퇴원」·「반이동」(대표 2026-10-15): 퇴원은 enrolled=false + 로그인 차단(기록은 남김), 반이동은 학교급·학년 바꾸기.
// 둘 다 원장 세션 + 자기 학원 학생일 때만. 배정 화면은 퇴원한 학생 줄을 뺀다(enrolledOnly).
import { describe, it, expect, vi, beforeEach } from 'vitest'

type Call = { method: string; args: unknown[] }
const state: { session: Record<string, unknown>; studentFound: boolean; updates: Call[]; adminCalls: Call[]; updateError: boolean; onUpdate?: () => void; onAdmin?: () => void } =
  { session: {}, studentFound: true, updates: [], adminCalls: [], updateError: false }

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/auth/session', () => ({ getSessionProfile: vi.fn(async () => state.session) }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    from: (table: string) => ({
      select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => (table === 'students' && state.studentFound ? { data: { profile_id: 'p1' } } : { data: null }) }) }) }),
      update: (patch: unknown) => ({ eq: (k1: string, v1: unknown) => ({ eq: async (k2: string, v2: unknown) => {
        state.updates.push({ method: `update ${table}`, args: [patch, { [k1]: v1, [k2]: v2 }] }); state.onUpdate?.()
        return { error: state.updateError ? { message: 'boom' } : null }
      } }) }),
    }),
  })),
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ auth: { admin: { updateUserById: async (...args: unknown[]) => { state.adminCalls.push({ method: 'updateUserById', args }); state.onAdmin?.(); return { error: null } } } } }),
}))

const { app } = await import('@/content/site')
const { withdrawStudent, moveStudent } = await import('@/app/teacher/students/actions')
const { enrolledOnly, WITHDRAW_BAN_DURATION } = await import('@/lib/students/withdraw')
const errors = app.classroom.students.errors

beforeEach(() => { state.session = { role: 'teacher', academyId: 'ac1', userId: 't1', plan: 'davinci' }; state.studentFound = true; state.updates = []; state.adminCalls = []; state.updateError = false; state.onUpdate = undefined; state.onAdmin = undefined })

describe('문구', () => {
  it('학생 관리 동작 칸에 퇴원·반이동 상자 문구가 있다', () => {
    const c = app.classroom.students
    expect(c.withdraw.button).toBe('퇴원'); expect(c.withdraw.confirm('김하늘')).toContain('김하늘'); expect(c.withdraw.confirm('김하늘')).toContain('로그인')
    expect(c.move.button).toBe('반이동'); expect(c.move.submit).toBeTruthy(); expect(c.move.done).toBeTruthy()
    expect('done' in c.withdraw).toBe(false)   // 줄이 사라지므로 완료 문구는 보일 자리가 없다(검토 2026-10-15)
  })
})

describe('withdrawStudent — 퇴원 처리', () => {
  it('자기 학원 학생: 로그인을 먼저 막고 enrolled=false 로 바꾼다(계정·기록은 지우지 않는다)', async () => {
    const order: string[] = []
    state.onUpdate = () => order.push('update'); state.onAdmin = () => order.push('ban')
    expect(await withdrawStudent('p1')).toEqual({ ok: true })
    expect(order).toEqual(['ban', 'update'])   // 검토 2026-10-15: 숨긴 뒤 차단이 실패하면 다시 누를 줄이 없다 — 차단이 먼저
    expect(state.updates).toEqual([{ method: 'update students', args: [{ enrolled: false }, { profile_id: 'p1', academy_id: 'ac1' }] }])
    expect(state.adminCalls).toEqual([{ method: 'updateUserById', args: ['p1', { ban_duration: WITHDRAW_BAN_DURATION }] }])
    expect(WITHDRAW_BAN_DURATION).toMatch(/^\d+h$/)
  })
  it('다른 학원 학생(RLS 로 안 보임)은 forbidden — 아무것도 바꾸지 않는다', async () => {
    state.studentFound = false
    expect(await withdrawStudent('p-other')).toEqual({ error: errors.forbidden })
    expect(state.updates).toEqual([]); expect(state.adminCalls).toEqual([])
  })
  it('DB 갱신이 실패하면 차단을 도로 풀고 오류를 돌려준다(학생은 목록에 그대로)', async () => {
    state.updateError = true
    expect(await withdrawStudent('p1')).toEqual({ error: errors.updateFailed })
    expect(state.adminCalls.map((c) => c.args[1])).toEqual([{ ban_duration: WITHDRAW_BAN_DURATION }, { ban_duration: 'none' }])
  })
})

describe('moveStudent — 반이동(학교급·학년)', () => {
  const fd = (level: string, grade: string) => { const f = new FormData(); f.set('level', level); f.set('grade', grade); return f }
  it('학교급·학년을 바꾼다', async () => {
    expect(await moveStudent('p1', fd('중', '2'))).toEqual({ ok: true })
    expect(state.updates).toEqual([{ method: 'update students', args: [{ level: '중', grade: 2 }, { profile_id: 'p1', academy_id: 'ac1' }] }])
  })
  it('학년·학교급이 이상하면 바꾸지 않고 같은 오류 문구를 쓴다', async () => {
    expect(await moveStudent('p1', fd('중', '9'))).toEqual({ error: errors.gradeInvalid })
    expect(await moveStudent('p1', fd('대', '1'))).toEqual({ error: errors.levelInvalid })
    expect(state.updates).toEqual([])
  })
  it('다른 학원 학생은 forbidden', async () => {
    state.studentFound = false
    expect(await moveStudent('p-other', fd('중', '2'))).toEqual({ error: errors.forbidden })
    expect(state.updates).toEqual([])
  })
})

describe('세션 제한', () => {
  it.each([
    ['학생', { role: 'student', academyId: 'ac1', userId: 's1' }],
    ['관리자', { role: 'admin', academyId: null, userId: 'a1' }],
  ])('%s 세션은 두 액션 모두 forbidden 으로 던진다', async (_who, session) => {
    state.session = session
    await expect(withdrawStudent('p1')).rejects.toThrow('forbidden')
    await expect(moveStudent('p1', new FormData())).rejects.toThrow('forbidden')
    expect(state.updates).toEqual([]); expect(state.adminCalls).toEqual([])
  })
  it('다빈치 베이직 원장은 essay_plan_required 로 막힌다(대표 2026-10-29)', async () => {
    state.session = { role: 'teacher', academyId: 'ac1', userId: 't1', plan: 'davinci_basic' }
    await expect(withdrawStudent('p1')).rejects.toThrow('essay_plan_required')
    await expect(moveStudent('p1', new FormData())).rejects.toThrow('essay_plan_required')
    expect(state.updates).toEqual([]); expect(state.adminCalls).toEqual([])
  })
})

describe('enrolledOnly — 배정 화면에서 퇴원 학생 줄 빼기', () => {
  it('students.enrolled 가 false 인 줄만 뺀다(없거나 null 이면 남긴다)', () => {
    const rows = [
      { id: 'a', students: { enrolled: true } }, { id: 'b', students: { enrolled: false } },
      { id: 'c', students: null }, { id: 'd', students: {} },
    ]
    expect(enrolledOnly(rows).map((r) => r.id)).toEqual(['a', 'c', 'd'])
  })
})
