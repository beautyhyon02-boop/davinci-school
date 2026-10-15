// POST /api/red/intake(PRD 2026-10-16 US-007): 생성기가 키 헤더(X-RED-INTAKE-KEY)로 파일을 검수대기로 넣는다. 키 없음·틀림 → 401, 맞으면 201 + id.
import { describe, it, expect, vi, beforeEach } from 'vitest'

type Call = [string, unknown[]]
const state: { calls: Call[] } = { calls: [] }
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }),
      insert: async (row: unknown) => { state.calls.push(['insert', [row]]); return { error: null } },
    }),
    storage: { from: () => ({ upload: async (path: string) => { state.calls.push(['upload', [path]]); return { error: null } }, remove: async () => ({ error: null }) }) },
  }),
}))
const { POST } = await import('@/app/api/red/intake/route')

const NAME = 'RED E Advanced_과학뉴스 생명과학_걸을 때마다 혈액순환을 읽는 스마트 신발 교사용 완성보고서.docx'
function request(key: string | null, names = [NAME]) {
  const fd = new FormData()
  for (const n of names) fd.append('files', new File([new Uint8Array(1000)], n, { type: 'application/octet-stream' }))
  fd.set('date', '2026-10-16')
  const req = new Request('http://localhost/api/red/intake', { method: 'POST', body: fd })
  const headers = new Headers({ 'content-length': '5000' })
  if (key !== null) headers.set('x-red-intake-key', key)
  Object.defineProperty(req, 'headers', { value: headers })
  return req as never
}
beforeEach(() => { state.calls = []; process.env.RED_INTAKE_KEY = 'secret-key' })

describe('POST /api/red/intake', () => {
  it('키가 없거나 틀리면 401, 아무것도 올리지 않는다', async () => {
    expect((await POST(request(null))).status).toBe(401)
    expect((await POST(request('wrong'))).status).toBe(401)
    expect(state.calls).toEqual([])
  })
  it('서버에 키가 설정되지 않았으면 어떤 키로도 401 — 문이 열렸는지조차 알려 주지 않는다(검토 2026-10-16)', async () => {
    delete process.env.RED_INTAKE_KEY
    expect((await POST(request('secret-key'))).status).toBe(401)
    expect((await POST(request(null))).status).toBe(401)
  })
  it('맞는 키: 검수대기 줄을 넣고 201 + id, created_by 는 auto', async () => {
    const res = await POST(request('secret-key'))
    expect(res.status).toBe(201)
    const body = await res.json() as { outcomes: { name: string; status: string; id?: string }[] }
    expect(body.outcomes[0]).toMatchObject({ name: NAME, status: 'uploaded' })
    expect(body.outcomes[0].id).toMatch(/^[0-9a-f-]{36}$/)
    expect(state.calls.find((c) => c[0] === 'insert')![1][0]).toMatchObject({ status: 'pending', created_by: 'auto', red_type: 'E', category: 'ADVANCED', report_date: '2026-10-16' })
  })
  it('이름 틀이 모두 틀리면 올린 것이 없어 422', async () => {
    expect((await POST(request('secret-key', ['보고서.docx']))).status).toBe(422)
  })
})
