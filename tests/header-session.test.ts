// 공개 홈페이지 머리말(대표 2026-10-15: "원장으로 로그인한 뒤 홈으로 가면 자동 로그아웃이 된다" — 실제로는 로그인이 남아 있지만 머리말이 늘 [로그인]만 보여 그렇게 보였다).
// 로그인돼 있으면 [내 화면] + [로그아웃], 아니면 [로그인]. RED 보고서는 원장이 홈페이지를 오가도 그대로 보인다.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

const state: { session: Record<string, unknown> | null } = { session: null }
vi.mock('@/lib/auth/session', () => ({ getSessionProfileOrNull: vi.fn(async () => state.session) }))
const { Header } = await import('@/components/site/Header')
const { site } = await import('@/content/site')
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

beforeEach(() => { state.session = null })

describe('Header — 로그인 상태에 따라', () => {
  it('로그인 전: [로그인]·[가맹문의]', async () => {
    const html = renderToStaticMarkup(await Header())
    expect(html).toContain('href="/login"'); expect(text(html)).toContain(site.header.login)
    expect(html).not.toContain('/auth/signout')
  })
  it('원장으로 로그인: [원장 화면](/teacher) + [로그아웃] 폼, [로그인]은 없다', async () => {
    state.session = { userId: 't1', role: 'teacher', name: '김원장', academyId: 'ac1' }
    const html = renderToStaticMarkup(await Header())
    expect(html).toContain('href="/teacher"'); expect(text(html)).toContain(site.header.home.teacher)
    expect(html).toContain('action="/auth/signout"'); expect(text(html)).toContain(site.header.logout)
    expect(html).not.toContain('href="/login"')
  })
  it('학생·본사도 자기 화면으로', async () => {
    state.session = { userId: 's1', role: 'student', name: '학생', academyId: 'ac1' }
    expect(renderToStaticMarkup(await Header())).toContain('href="/student"')
    state.session = { userId: 'a1', role: 'admin', name: '본사', academyId: null }
    expect(renderToStaticMarkup(await Header())).toContain('href="/admin"')
  })
})
