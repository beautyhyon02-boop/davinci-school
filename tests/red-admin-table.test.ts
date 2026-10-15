// 본사 RED 자료실 표(PRD 2026-10-16): 검수대기/게시됨/보류 탭(건수), 기본은 검수대기, 보류 사유 표시, 종류 R/E/D 배지. 서버 렌더로 초기 상태를 본다.
import { describe, it, expect, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('@/app/admin/red/actions', () => ({ publishRed: vi.fn(), holdRed: vi.fn(), unpublishRed: vi.fn(), updateRedMeta: vi.fn(), deleteRedReport: vi.fn() }))
const { RedAdminTable } = await import('@/app/admin/red/RedAdminTable')
const { app } = await import('@/content/site')
const { redRow } = await import('./fixtures/red-rows')
const copy = app.adminRed
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

const rows = [
  redRow({ id: 'p1', title: '검수 전', status: 'pending' }),
  redRow({ id: 'p2', title: '검수 전 둘', status: 'pending', red_type: 'R' }),
  redRow({ id: 'g1', title: '게시된 것', status: 'published' }),
  redRow({ id: 'h1', title: '보류된 것', status: 'hold', hold_note: '표가 깨짐' }),
]

describe('RedAdminTable', () => {
  it('탭에 건수가 붙고, 처음에는 검수대기 줄만 보인다', () => {
    const html = renderToStaticMarkup(createElement(RedAdminTable, { rows })); const t = text(html)
    expect(t).toContain(`${copy.tabs.pending} 2`); expect(t).toContain(`${copy.tabs.published} 1`); expect(t).toContain(`${copy.tabs.hold} 1`)
    expect(t).toContain('검수 전'); expect(t).toContain('검수 전 둘')
    expect(t).not.toContain('게시된 것'); expect(t).not.toContain('보류된 것')
    expect(t).toContain(copy.publish); expect(t).toContain(copy.hold)
  })
  it('보류 탭을 처음 탭으로 주면 사유가 보이고, 게시된 줄에는 [게시 취소]', () => {
    const t = text(renderToStaticMarkup(createElement(RedAdminTable, { rows, initialTab: 'hold' })))
    expect(t).toContain('보류된 것'); expect(t).toContain('표가 깨짐')
    const g = text(renderToStaticMarkup(createElement(RedAdminTable, { rows, initialTab: 'published' })))
    expect(g).toContain(copy.unpublish)
  })
  it('종류 배지는 R/E/D 이름으로', () => {
    const t = text(renderToStaticMarkup(createElement(RedAdminTable, { rows })))
    expect(t).toContain(copy.redType.R); expect(t).toContain(copy.redType.E)
  })
})
