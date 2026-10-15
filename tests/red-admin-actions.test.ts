// RED 자료실 본사 액션(PRD 2026-10-16): 게시·보류(사유)·게시 취소(검수대기로)·메타 수정. 본사만, 참고 링크는 http(s) 만.
import { describe, it, expect, vi, beforeEach } from 'vitest'

type Call = { table: string; patch: Record<string, unknown>; id: string }
const state: { session: Record<string, unknown>; updates: Call[]; updateError: boolean; row: Record<string, unknown> | null } = { session: {}, updates: [], updateError: false, row: null }
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/auth/session', () => ({ getSessionProfile: vi.fn(async () => state.session) }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => ({
      update: (patch: Record<string, unknown>) => ({ eq: async (_c: string, id: string) => { state.updates.push({ table, patch, id }); return { error: state.updateError ? { message: 'boom' } : null } } }),
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: { storage_path: 'red/x' } }) }),
        // updateRedMeta 가 읽는 줄: 세트 열쇠(구분·종류·시리즈·과목·제목)와 kind
        match: (q: Record<string, unknown>) => ({ maybeSingle: async () => ({ data: !state.row ? null : 'id' in q ? state.row : { id: 'sibling' } }) }),
      }),
      delete: () => ({ eq: async () => ({ error: null }) }),
    }),
    storage: { from: () => ({ remove: async () => ({ error: null }) }) },
  }),
}))
const { publishRed, holdRed, unpublishRed, updateRedMeta } = await import('@/app/admin/red/actions')
const { parseSourceLinks } = await import('@/lib/red/meta')
const { app } = await import('@/content/site')

const OLD = { id: 'r1', category: 'BASIC', red_type: 'E', series: '사물놀이', subject: '물리', title: '텐세그리티', kind: 'teacher' }
beforeEach(() => { state.session = { role: 'admin', userId: 'a1' }; state.updates = []; state.updateError = false; state.row = { ...OLD } })

describe('상태 바꾸기', () => {
  it('게시: status=published, published_at 기록, 보류 사유는 지운다', async () => {
    expect(await publishRed('r1')).toEqual({ ok: true })
    expect(state.updates).toHaveLength(1)
    expect(state.updates[0]).toMatchObject({ table: 'resources', id: 'r1', patch: { status: 'published', hold_note: '' } })
    expect(typeof state.updates[0].patch.published_at).toBe('string')
  })
  it('보류: status=hold 와 사유(빈 사유도 됨, 200자까지)', async () => {
    expect(await holdRed('r1', ' 표가 깨짐 ')).toEqual({ ok: true })
    expect(state.updates[0].patch).toEqual({ status: 'hold', hold_note: '표가 깨짐' })
    expect(await holdRed('r1', 'x'.repeat(300))).toEqual({ ok: false, error: app.adminRed.errors.invalid })
  })
  it('게시 취소: 검수대기로 돌아간다(published_at 은 지운다)', async () => {
    expect(await unpublishRed('r1')).toEqual({ ok: true })
    expect(state.updates[0].patch).toEqual({ status: 'pending', published_at: null })
  })
  it('원장·학생 세션은 forbidden 으로 던지고 아무것도 바꾸지 않는다', async () => {
    state.session = { role: 'teacher', userId: 't1' }
    await expect(publishRed('r1')).rejects.toThrow('forbidden')
    await expect(updateRedMeta('r1', new FormData())).rejects.toThrow('forbidden')
    expect(state.updates).toEqual([])
  })
})

describe('updateRedMeta — 구분·종류·시리즈·과목·제목·요약·날짜·참고 링크', () => {
  const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f }
  const good = { category: 'ADVANCED', red_type: 'R', series: '독서', subject: '국어', title: '어린 왕자', summary: '요약 두 줄', report_date: '2026-10-16', source_links: '원문 | https://example.com/a\nhttps://example.com/b' }
  it('올바르면 그 줄과 짝(같은 세트의 다른 파일)을 함께 고친다 — 세트가 둘로 갈라지지 않게(검토 2026-10-16); 참고 링크는 "이름 | 주소" 또는 주소만', async () => {
    expect(await updateRedMeta('r1', fd(good))).toEqual({ ok: true })
    expect(state.updates).toHaveLength(2)
    expect(state.updates[0].id).toBe('r1'); expect(state.updates[1].id).toBe('sibling')   // 짝은 옛 열쇠 + 다른 kind 로 찾는다
    expect(state.updates[1].patch).toEqual(state.updates[0].patch)
    expect(state.updates[0].patch).toEqual({
      category: 'ADVANCED', red_type: 'R', series: '독서', subject: '국어', title: '어린 왕자', summary: '요약 두 줄', report_date: '2026-10-16',
      source_links: [{ label: '원문', url: 'https://example.com/a' }, { label: 'https://example.com/b', url: 'https://example.com/b' }],
    })
  })
  it('줄을 못 찾으면 db_failed', async () => {
    state.row = null
    expect(await updateRedMeta('r1', fd(good))).toEqual({ ok: false, error: app.adminRed.errors.db_failed })
    expect(state.updates).toEqual([])
  })
  it('종류·구분·날짜가 이상하거나 제목이 비거나 링크가 http 가 아니면 invalid, 저장하지 않는다', async () => {
    for (const bad of [{ red_type: 'X' }, { category: 'MID' }, { report_date: '2026-13-01' }, { title: ' ' }, { source_links: '메모 | ftp://x' }]) {
      expect(await updateRedMeta('r1', fd({ ...good, ...bad }))).toEqual({ ok: false, error: app.adminRed.errors.invalid })
    }
    expect(state.updates).toEqual([])
  })
  it('parseSourceLinks: 빈 줄은 건너뛰고 10개까지', () => {
    expect(parseSourceLinks('\n a | https://a.kr \n\nhttps://b.kr\n')).toEqual({ ok: true, links: [{ label: 'a', url: 'https://a.kr' }, { label: 'https://b.kr', url: 'https://b.kr' }] })
    expect(parseSourceLinks(Array.from({ length: 11 }, (_, i) => `https://x.kr/${i}`).join('\n')).ok).toBe(false)
    expect(parseSourceLinks('')).toEqual({ ok: true, links: [] })
  })
})
