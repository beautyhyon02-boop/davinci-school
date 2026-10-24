import { describe, it, expect, vi } from 'vitest'
import { groupBySido } from '@/lib/academies/map-group'
import { loadMapAcademies } from '@/lib/academies/public-map'

// 설계 2026-10-25 §4.3
const rows = [
  { name: '하늘원', sido: '경기' as const, website: 'https://a.example.com/' },
  { name: '가온원', sido: '경기' as const, website: '' },
  { name: '바다원', sido: '부산' as const, website: 'https://b.example.com/' },
]
describe('groupBySido', () => {
  it('시·도별 수와 이름 순 목록, 전체 수', () => {
    const g = groupBySido(rows)
    expect(g.total).toBe(3)
    expect(g.bySido.경기?.count).toBe(2)
    expect(g.bySido.경기?.items.map((a) => a.name)).toEqual(['가온원', '하늘원'])
    expect(g.bySido.부산?.count).toBe(1)
    expect(g.bySido.서울).toBeUndefined()
  })
  it('비어 있으면 total 0', () => {
    expect(groupBySido([])).toEqual({ total: 0, bySido: {} })
  })
  it('모르는 시·도 값은 버린다(지도에 자리가 없다)', () => {
    const g = groupBySido([{ name: 'x', sido: '평양' as never, website: '' }])
    expect(g.total).toBe(0)
  })
})

describe('loadMapAcademies', () => {
  const db = (rpc: () => Promise<{ data: unknown; error: unknown }>) => ({ rpc } as never)
  it('rpc 결과를 돌려주고 시·도가 틀린 줄은 버린다', async () => {
    const got = await loadMapAcademies(db(async () => ({ data: [{ name: 'a', sido: '서울', website: '' }, { name: 'b', sido: '없음', website: '' }], error: null })))
    expect(got).toEqual([{ name: 'a', sido: '서울', website: '' }])
  })
  it('함수가 없으면(0021 전, PGRST202) 빈 목록 — 기록 없이', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const got = await loadMapAcademies(db(async () => ({ data: null, error: { code: 'PGRST202', message: 'Could not find the function public.public_map_academies' } })))
    expect(got).toEqual([])
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })
  it('다른 오류도 빈 목록이지만 기록을 남긴다', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await loadMapAcademies(db(async () => ({ data: null, error: { code: '42501', message: 'permission denied' } })))).toEqual([])
    expect(spy).toHaveBeenCalledTimes(1)
    spy.mockRestore()
  })
  it('rpc 가 예외를 던져도 빈 목록이고 기록을 한 번 남긴다(공개 페이지가 깨지지 않게)', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await loadMapAcademies(db(async () => { throw new Error('boom') }))).toEqual([])
    expect(spy).toHaveBeenCalledTimes(1)
    spy.mockRestore()
  })
  it('data 가 배열이 아니면 빈 목록', async () => {
    expect(await loadMapAcademies(db(async () => ({ data: { oops: true }, error: null })))).toEqual([])
  })
})
