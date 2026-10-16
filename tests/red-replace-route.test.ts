// POST /api/red/replace/[id](PRD 2026-10-16 US-006 파일 교체): 본사만, docx 만, 새 경로에 올리고 줄을 고친 뒤 옛 파일을 지운다. 줄 갱신 실패면 새 파일을 지운다.
import { describe, it, expect, vi, beforeEach } from 'vitest'

type Call = [string, unknown[]]
const state: { session: Record<string, unknown> | null; row: Record<string, unknown> | null; updateError: unknown; calls: Call[]; taken: Set<string> } = { session: null, row: null, updateError: null, calls: [], taken: new Set() }
vi.mock('@/lib/auth/session', () => ({ getSessionProfileOrNull: vi.fn(async () => state.session) }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({ eq: (col: string, v: string) => ({ maybeSingle: async () => ({ data: col === 'filename' ? (state.taken.has(v) ? { id: 'other' } : null) : state.row }) }) }),
      update: (patch: unknown) => ({ eq: async () => { state.calls.push(['update', [patch]]); return { error: state.updateError } } }),
    }),
    storage: { from: () => ({
      upload: async (path: string) => { state.calls.push(['upload', [path]]); return { error: null } },
      remove: async (paths: string[]) => { state.calls.push(['remove', [paths]]); return { error: null } },
    }) },
  }),
}))
const { POST } = await import('@/app/api/red/replace/[id]/route')

const ID = '3f2a1c0e-1111-2222-3333-444455556666'
function request(name: string, contentLength = '5000', zip = true, type = 'application/octet-stream') {
  const fd = new FormData()
  const b = new Uint8Array(1200); if (zip) b.set([0x50, 0x4b, 0x03, 0x04])
  fd.append('file', new File([b], name, { type }))
  const req = new Request(`http://localhost/api/red/replace/${ID}`, { method: 'POST', body: fd })
  Object.defineProperty(req, 'headers', { value: new Headers({ 'content-length': contentLength }) })
  return req as never
}
const call = (name = '새 파일.docx', id = ID) => POST(request(name), { params: Promise.resolve({ id }) })
beforeEach(() => { state.session = { role: 'admin', userId: 'a1' }; state.row = { id: ID, category: 'BASIC', report_date: '2026-10-15', storage_path: 'red/BASIC/2026-10-15/old.docx' }; state.updateError = null; state.calls = []; state.taken = new Set() })

describe('POST /api/red/replace/[id]', () => {
  it('로그인 전 401, 원장 403, 없는 줄 404, docx 아니면 422', async () => {
    state.session = null; expect((await call()).status).toBe(401)
    state.session = { role: 'teacher', userId: 't1' }; expect((await call()).status).toBe(403)
    state.session = { role: 'admin', userId: 'a1' }; state.row = null; expect((await call()).status).toBe(404)
    state.row = { id: ID, category: 'BASIC', report_date: '2026-10-15', storage_path: 'red/old' }; expect((await call('x.pdf')).status).toBe(422)
    expect(state.calls).toEqual([])
  })
  it('본사: 새 경로에 올리고 줄(파일 이름·경로·크기)을 고친 뒤 옛 파일을 지운다', async () => {
    const res = await call()
    expect(res.status).toBe(200)
    expect(state.calls.map((c) => c[0])).toEqual(['upload', 'update', 'remove'])
    expect(String(state.calls[0][1][0])).toMatch(/^red\/BASIC\/2026-10-15\/[0-9a-f-]{36}\.docx$/)
    expect(state.calls[1][1][0]).toMatchObject({ filename: '새 파일.docx', storage_path: state.calls[0][1][0], size_bytes: 1200 })
    expect(state.calls[2][1][0]).toEqual(['red/BASIC/2026-10-15/old.docx'])
  })
  it('내용이 ZIP(docx)이 아니면 422 bad_content 와 받은 형식, 올리지 않는다; MIME 이 엉뚱해도 내용이 맞으면 통과', async () => {
    const bad = await POST(request('새 파일.docx', '5000', false, 'text/plain'), { params: Promise.resolve({ id: ID }) })
    expect(bad.status).toBe(422); expect(await bad.json()).toEqual({ error: 'bad_content', detail: 'text/plain' })
    expect(state.calls).toEqual([])
    expect((await POST(request('새 파일.docx', '5000', true, 'application/x-foo'), { params: Promise.resolve({ id: ID }) })).status).toBe(200)
  })
  it('같은 이름의 다른 줄이 이미 있으면 409, 올리지 않는다', async () => {
    state.taken.add('새 파일.docx')
    expect((await call()).status).toBe(409)
    expect(state.calls).toEqual([])
  })
  it('줄 갱신에 실패하면 새 파일을 지우고 옛 파일은 남긴다', async () => {
    state.updateError = { message: 'boom' }
    expect((await call()).status).toBe(500)
    expect(state.calls.map((c) => c[0])).toEqual(['upload', 'update', 'remove'])
    expect(state.calls[2][1][0]).toEqual([state.calls[0][1][0]])
  })
})
