// 홈페이지 탐구보고서 페이지의 RED 보고서 칸(대표 2026-10-15): 로그인 전·학생은 안내만, 원장·본사는 BASIC/ADVANCED 목록. 서버 렌더로 확인한다.
import { describe, it, expect } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { RedLibrary } from '@/components/site/RedLibrary'
import { RedGate } from '@/components/site/RedGate'
import { pages } from '@/content/site'
import type { RedReportRow } from '@/lib/red/reports'

const copy = pages.redReports
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&quot;/g, '"').replace(/\s+/g, ' ')
const row = (over: Partial<RedReportRow>): RedReportRow => ({
  id: 'r', filename: 'f.docx', category: 'BASIC', kind: 'teacher', series: '사물놀이', subject: '물리', title: '01 줄로 떠 있는 구조물(텐세그리티)',
  report_date: '2026-10-15', storage_path: 'red/x', hidden: false, size_bytes: 1, uploaded_at: '2026-10-15T00:00:00Z', ...over,
})
const rows = [row({ id: 't1' }), row({ id: 's1', kind: 'student' }), row({ id: 'a1', category: 'ADVANCED', series: '과학뉴스', subject: '생명', title: '수면과 기억' })]

describe('RedGate', () => {
  it('로그인 전: 안내 + 로그인 단추(돌아올 경로 포함), 파일 이름은 없다', () => {
    const html = renderToStaticMarkup(createElement(RedGate, { role: null }))
    expect(text(html)).toContain(copy.gatedBody); expect(html).toContain('href="/login?next=%2Fprograms%2Finquiry"')
  })
  it('학생 계정: 원장 계정 안내만, 로그인 단추 없음', () => {
    const html = renderToStaticMarkup(createElement(RedGate, { role: 'student' }))
    expect(text(html)).toContain(copy.studentOnly); expect(html).not.toContain('/login')
  })
})

describe('RedLibrary', () => {
  it('BASIC 탭이 기본: 세트 한 줄에 날짜·시리즈·과목·제목과 학생용·교사용 단추, ADVANCED 세트는 보이지 않는다', () => {
    const html = renderToStaticMarkup(createElement(RedLibrary, { rows })); const t = text(html)
    expect(t).toContain(copy.tabs.BASIC); expect(t).toContain(copy.tabs.ADVANCED)
    expect(t).toContain('01 줄로 떠 있는 구조물(텐세그리티)'); expect(t).toContain('사물놀이 · 물리'); expect(t).toContain('2026-10-15')
    expect(t).toContain(copy.download.student); expect(t).toContain(copy.download.teacher)
    expect(html).toContain('href="/api/red/download/s1"'); expect(html).toContain('href="/api/red/download/t1"')   // 내려받기는 라우트 링크(한글 이름 그대로)
    expect(t).not.toContain('수면과 기억')
    expect(t).toContain(copy.count(1))
  })
  it('한쪽 파일만 있으면 "준비 중"으로 표시하고, 숨긴 줄은 빠진다', () => {
    const only = [row({ id: 't1' }), row({ id: 'h', kind: 'student', hidden: true })]
    const t = text(renderToStaticMarkup(createElement(RedLibrary, { rows: only })))
    expect(t).toContain(copy.missing.student); expect(t).toContain(copy.download.teacher)
  })
  it('세트가 없으면 빈 안내', () => {
    expect(text(renderToStaticMarkup(createElement(RedLibrary, { rows: [] })))).toContain(copy.empty)
  })
})
