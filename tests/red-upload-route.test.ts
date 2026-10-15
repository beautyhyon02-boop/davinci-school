// POST /api/red/upload(독립 검토 2026-10-15가 권한·되돌림 시험을 권함): 본사만, 같은 이름은 건너뜀, 줄 넣기 실패면 올린 파일을 지운다.
import { describe, it, expect, vi, beforeEach } from 'vitest'

type Call = [string, unknown[]]
const state: { session: Record<string, unknown> | null; existing: Set<string>; insertError: unknown; calls: Call[] } = { session: null, existing: new Set(), insertError: null, calls: [] }
vi.mock('@/lib/auth/session', () => ({ getSessionProfileOrNull: vi.fn(async () => state.session) }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({ eq: (_c: string, name: string) => ({ maybeSingle: async () => ({ data: state.existing.has(name) ? { id: 'dup' } : null }) }) }),
      insert: async (row: unknown) => { state.calls.push(['insert', [row]]); return { error: state.insertError } },
    }),
    storage: { from: () => ({
      upload: async (path: string) => { state.calls.push(['upload', [path]]); return { error: null } },
      remove: async (paths: string[]) => { state.calls.push(['remove', [paths]]); return { error: null } },
    }) },
  }),
}))
const { POST } = await import('@/app/api/red/upload/route')

const NAME = 'RED Basic 사물놀이 물리_01 줄로 떠 있는 구조물(텐세그리티) 교사용 완성보고서(초등).docx'
function request(files: { name: string; bytes?: number }[], date?: string, contentLength = '5000') {
  const fd = new FormData()
  for (const f of files) fd.append('files', new File([new Uint8Array(f.bytes ?? 1000)], f.name, { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }))
  if (date) fd.set('date', date)
  const req = new Request('http://localhost/api/red/upload', { method: 'POST', body: fd })
  // Request 가 content-length 를 스스로 정하지 않으므로 라우트가 보는 헤더를 흉내 낸다
  Object.defineProperty(req, 'headers', { value: new Headers({ 'content-length': contentLength }) })
  return req as never
}
beforeEach(() => { state.session = { role: 'admin', userId: 'a1' }; state.existing = new Set(); state.insertError = null; state.calls = [] })

describe('POST /api/red/upload', () => {
  it('로그인 전 401, 원장 403 — 아무것도 올리지 않는다', async () => {
    state.session = null
    expect((await POST(request([{ name: NAME }]))).status).toBe(401)
    state.session = { role: 'teacher', userId: 't1' }
    expect((await POST(request([{ name: NAME }]))).status).toBe(403)
    expect(state.calls).toEqual([])
  })
  it('본사: 저장소에 올리고 줄을 넣는다(구분·종류·시리즈·과목·제목·날짜)', async () => {
    const res = await POST(request([{ name: NAME }], '2026-10-15'))
    expect(await res.json()).toEqual({ outcomes: [{ name: NAME, status: 'uploaded' }] })
    expect(state.calls[0][0]).toBe('upload'); expect(String(state.calls[0][1][0])).toMatch(/^red\/BASIC\/2026-10-15\/[0-9a-f-]{36}\.docx$/)   // 키는 ASCII uuid — 한글 이름은 줄에만
    expect(state.calls[1][0]).toBe('insert')
    expect(state.calls[1][1][0]).toMatchObject({ filename: NAME, category: 'BASIC', kind: 'teacher', series: '사물놀이', subject: '물리', title: '01 줄로 떠 있는 구조물(텐세그리티)', report_date: '2026-10-15', status: 'pending', red_type: 'E', created_by: 'a1', audience: 'teacher' })   // PRD 2026-10-16: 올리면 검수대기, 본사가 [게시]
  })
  it('같은 이름은 duplicate 로 건너뛰고 올리지 않는다; 이름 틀이 다르면 failed(bad_name)', async () => {
    state.existing.add(NAME)
    const res = await POST(request([{ name: NAME }, { name: '보고서.docx' }]))
    expect(await res.json()).toEqual({ outcomes: [{ name: NAME, status: 'duplicate' }, { name: '보고서.docx', status: 'failed', error: 'bad_name' }] })
    expect(state.calls).toEqual([])
  })
  it('줄 넣기에 실패하면 올린 파일을 지우고 db_failed', async () => {
    state.insertError = { message: 'boom' }
    const res = await POST(request([{ name: NAME }], '2026-10-15'))
    expect(await res.json()).toEqual({ outcomes: [{ name: NAME, status: 'failed', error: 'db_failed' }] })
    expect(state.calls.map((c) => c[0])).toEqual(['upload', 'insert', 'remove'])
    expect(state.calls[2][1][0]).toEqual([state.calls[0][1][0]])   // 올린 그 경로를 지운다
  })
  it('너무 큰 요청(또는 길이 없는 요청)은 본문을 읽기 전에 413', async () => {
    expect((await POST(request([{ name: NAME }], undefined, String(20 * 1024 * 1024)))).status).toBe(413)
    expect((await POST(request([{ name: NAME }], undefined, ''))).status).toBe(413)
  })
})
