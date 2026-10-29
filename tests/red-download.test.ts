// GET /api/red/download/[id](대표 2026-10-15 "파일명이 한글이 아니다" → 서명 URL 대신 라우트가 한글 이름 그대로 내려준다):
// 로그인 전·학생은 못 받고, 원장은 게시된 줄만, 본사는 검수대기·보류 줄도. Content-Disposition 은 filename*(UTF-8) + ASCII 대체 이름.
import { describe, it, expect, vi, beforeEach } from 'vitest'

type Row = { id: string; filename: string; storage_path: string; status: 'pending' | 'published' | 'hold' } | null
const state: { session: Record<string, unknown> | null; row: Row; downloads: string[] } = { session: null, row: null, downloads: [] }
vi.mock('@/lib/auth/session', () => ({ getSessionProfileOrNull: vi.fn(async () => state.session) }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: state.row }) }) }) }) })) }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ storage: { from: () => ({ download: async (path: string) => { state.downloads.push(path); return { data: new Blob(['PK-docx']), error: null } } }) } }) }))
const { GET } = await import('@/app/api/red/download/[id]/route')
const { contentDisposition } = await import('@/lib/red/reports')

const ID = '3f2a1c0e-1111-2222-3333-444455556666'
const visible = { id: ID, filename: 'RED Basic 사물놀이 물리_01 학생용 작성양식(초등).docx', storage_path: 'red/BASIC/2026-10-15/x.docx', status: 'published' as const }
const call = (id = ID) => GET(new Request(`http://localhost/api/red/download/${id}`) as never, { params: Promise.resolve({ id }) })
beforeEach(() => { state.session = null; state.row = visible; state.downloads = [] })

describe('contentDisposition', () => {
  it('한글 이름은 filename* 에 UTF-8 로, ASCII 대체 이름은 _ 로', () => {
    expect(contentDisposition('RED 보고서(초등).docx')).toBe(`attachment; filename="RED ___(__).docx"; filename*=UTF-8''${encodeURIComponent('RED 보고서(초등).docx')}`)
    expect(contentDisposition('a"b.docx')).toContain('filename="a_b.docx"')
  })
})

describe('GET /api/red/download/[id]', () => {
  it('로그인 전 401, 학생 403 — 파일을 읽지 않는다', async () => {
    expect((await call()).status).toBe(401)
    state.session = { role: 'student', userId: 's1' }
    expect((await call()).status).toBe(403)
    expect(state.downloads).toEqual([])
  })
  it('원장: 파일을 읽어 docx 로, 한글 파일 이름 그대로 내려준다', async () => {
    state.session = { role: 'teacher', userId: 't1', academyId: 'ac1', plan: 'davinci' }
    const res = await call()
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('wordprocessingml')
    expect(res.headers.get('content-disposition')).toBe(contentDisposition(visible.filename))
    expect(state.downloads).toEqual([visible.storage_path])
    expect(await res.text()).toBe('PK-docx')
  })
  it('원장은 게시 안 된 줄·없는 줄·이상한 id 는 404, 본사는 검수대기·보류 줄도 받는다', async () => {
    state.session = { role: 'teacher', userId: 't1', academyId: 'ac1', plan: 'davinci' }
    state.row = { ...visible, status: 'hold' }
    expect((await call()).status).toBe(404)
    state.row = { ...visible, status: 'pending' }
    expect((await call()).status).toBe(404)
    state.row = null
    expect((await call()).status).toBe(404)
    expect((await call('../etc')).status).toBe(404)
    expect(state.downloads).toEqual([])
    state.session = { role: 'admin', userId: 'a1' }; state.row = { ...visible, status: 'pending' }
    expect((await call()).status).toBe(200)
  })
})
