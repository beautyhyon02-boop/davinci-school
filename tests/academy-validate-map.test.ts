import { describe, it, expect } from 'vitest'
import { parseAcademy, parseAcademyMap } from '@/lib/academies/validate'
import { app } from '@/content/site'

// 설계 2026-10-25 §5
const errors = app.adminAcademies.errors
const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f }

describe('parseAcademy 의 지도 칸', () => {
  it('비어 있으면 sido null·website ""·show_on_map true', () => {
    const r = parseAcademy(fd({ code: 'abc', name: '원' }))
    expect(r.ok && r.data).toMatchObject({ sido: null, website: '', show_on_map: true })
  })
  it('시·도·홈페이지를 정리해 받고 체크를 끄면 false', () => {
    const r = parseAcademy(fd({ code: 'abc', name: '원', sido: '경기', website: 'www.example.com', show_on_map: '' }))
    expect(r.ok && r.data).toMatchObject({ sido: '경기', website: 'https://www.example.com/', show_on_map: false })
    const on = parseAcademy(fd({ code: 'abc', name: '원', show_on_map: 'on' }))
    expect(on.ok && on.data.show_on_map).toBe(true)
  })
  it('브라우저가 체크했을 때 보내는 빈 값 + on 두 개는 true', () => {
    const f = fd({ code: 'abc', name: '원' })
    f.append('show_on_map', '')
    f.append('show_on_map', 'on')
    const r = parseAcademy(f)
    expect(r.ok && r.data.show_on_map).toBe(true)
  })
  it('틀린 시·도·주소는 거절', () => {
    expect(parseAcademy(fd({ code: 'abc', name: '원', sido: '평양' }))).toEqual({ ok: false, error: errors.sidoInvalid })
    expect(parseAcademy(fd({ code: 'abc', name: '원', website: 'javascript:x' }))).toEqual({ ok: false, error: errors.websiteInvalid })
  })
})

describe('parseAcademyMap(상세 화면 지도 정보 폼)', () => {
  it('세 칸만 받는다', () => {
    const r = parseAcademyMap(fd({ sido: '서울', website: 'blog.naver.com/x', show_on_map: 'on', code: 'zzz' }))
    expect(r).toEqual({ ok: true, data: { sido: '서울', website: 'https://blog.naver.com/x', show_on_map: true } })
  })
  it('빈 시·도는 null, 체크 없으면 false', () => {
    expect(parseAcademyMap(fd({}))).toEqual({ ok: true, data: { sido: null, website: '', show_on_map: false } })
  })
  it('틀린 주소는 거절', () => {
    expect(parseAcademyMap(fd({ website: 'not a url' }))).toEqual({ ok: false, error: errors.websiteInvalid })
  })
})
