// RED 보고서 내려받기 서버 액션(독립 검토 2026-10-15가 권한 시험을 권함): 로그인 전·학생은 주소를 못 받고, 원장은 보이는 줄만, 본사는 숨긴 줄도.
import { describe, it, expect, vi, beforeEach } from 'vitest'

type Row = { id: string; filename: string; storage_path: string; hidden: boolean } | null
const state: { session: Record<string, unknown> | null; row: Row; signed: unknown[] } = { session: null, row: null, signed: [] }
vi.mock('@/lib/auth/session', () => ({ getSessionProfileOrNull: vi.fn(async () => state.session) }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: state.row }) }) }) }) })) }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ storage: { from: () => ({ createSignedUrl: async (...args: unknown[]) => { state.signed.push(args); return { data: { signedUrl: 'https://signed/x' }, error: null } } }) } }) }))
const { redDownloadUrl } = await import('@/app/(public)/programs/inquiry/actions')
const { pages } = await import('@/content/site')
const { RED_SIGNED_URL_SECONDS } = await import('@/lib/red/reports')

const visible = { id: 'r1', filename: 'RED Basic 사물놀이 물리_01 학생용 작성양식(초등).docx', storage_path: 'red/BASIC/2026-10-15/f.docx', hidden: false }
beforeEach(() => { state.session = null; state.row = visible; state.signed = [] })

describe('redDownloadUrl', () => {
  it('로그인 전·학생 계정은 주소를 받지 못하고 서명 URL 을 만들지 않는다', async () => {
    expect(await redDownloadUrl('r1')).toEqual({ error: pages.redReports.studentOnly })
    state.session = { role: 'student', userId: 's1' }
    expect(await redDownloadUrl('r1')).toEqual({ error: pages.redReports.studentOnly })
    expect(state.signed).toEqual([])
  })
  it('원장은 보이는 줄의 60초 서명 URL(파일 이름으로 내려받기)을 받는다', async () => {
    state.session = { role: 'teacher', userId: 't1', academyId: 'ac1' }
    expect(await redDownloadUrl('r1')).toEqual({ url: 'https://signed/x' })
    expect(state.signed).toEqual([[visible.storage_path, RED_SIGNED_URL_SECONDS, { download: visible.filename }]])
  })
  it('원장은 숨긴 줄·없는 줄을 받지 못하고, 본사는 숨긴 줄도 받는다', async () => {
    state.session = { role: 'teacher', userId: 't1', academyId: 'ac1' }
    state.row = { ...visible, hidden: true }
    expect(await redDownloadUrl('r1')).toEqual({ error: pages.redReports.downloadFailed })
    state.row = null
    expect(await redDownloadUrl('r1')).toEqual({ error: pages.redReports.downloadFailed })
    expect(state.signed).toEqual([])
    state.session = { role: 'admin', userId: 'a1' }; state.row = { ...visible, hidden: true }
    expect(await redDownloadUrl('r1')).toEqual({ url: 'https://signed/x' })
  })
})
