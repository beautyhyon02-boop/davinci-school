// 육각형 도형 계산(lib/classroom/radar.ts)과 RadarChart 정적 렌더(서버 렌더 = 정적 마크업).
import { describe, it, expect } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { radarPoints, radarVertex, radarAngle, pointsAttr } from '@/lib/classroom/radar'
import { RadarChart, type RadarChartAxis } from '@/components/classroom/RadarChart'
import { buildUnitReport } from '@/lib/classroom/report'
import { COMPETENCIES } from '@/lib/studio/competency'
import { reportCopy, fullSubject, student, theme, SIX_AXIS_TAGS } from './fixtures/unit-report'

describe('radarPoints', () => {
  it('first axis points up, then clockwise every 60°', () => {
    const p = radarPoints([1, 1, 1, 1, 1, 1], 100, 200, 150)
    expect(p).toHaveLength(6)
    expect(p[0]).toEqual({ x: 200, y: 50 })
    expect(p[1]).toEqual({ x: 286.6, y: 100 })
    expect(p[2]).toEqual({ x: 286.6, y: 200 })
    expect(p[3]).toEqual({ x: 200, y: 250 })
    expect(p[4]).toEqual({ x: 113.4, y: 200 })
    expect(p[5]).toEqual({ x: 113.4, y: 100 })
    expect(radarAngle(0, 6)).toBeCloseTo(-Math.PI / 2)
  })

  it('scales by ratio, puts null at the centre, and clamps out-of-range values', () => {
    const p = radarPoints([0.5, null, 0, 1.4, -0.2, Number.NaN], 100, 0, 0)
    expect(p[0]).toEqual({ x: 0, y: -50 })
    for (const i of [1, 2, 4, 5]) { expect(Math.abs(p[i].x)).toBe(0); expect(Math.abs(p[i].y)).toBe(0) }
    expect(p[3]).toEqual({ x: 0, y: 100 })
    expect(radarVertex(3, 6, 40, 10, 10)).toEqual({ x: 10, y: 50 })
  })

  it('pointsAttr joins the points for an SVG polygon', () => {
    expect(pointsAttr([{ x: 1, y: 2 }, { x: 3.5, y: 4 }])).toBe('1,2 3.5,4')
  })
})

const LABELS = [...COMPETENCIES]
const axesOf = (ratios: (number | null)[], sparse: number[] = []): RadarChartAxis[] => ratios.map((ratio, i) => ({ label: LABELS[i], ratio, sparse: sparse.includes(i) }))
const render = (axes: RadarChartAxis[], size?: number) => renderToStaticMarkup(createElement(RadarChart, { axes, sparseNote: '문항 수 적음', ariaLabel: '역량 육각형', size }))
const valuePolygon = (html: string) => html.match(/<polygon[^>]*data-series="value"[^>]*>/)?.[0] ?? ''
const pointsOf = (tag: string) => (tag.match(/points="([^"]*)"/)?.[1] ?? '').split(' ').filter(Boolean)

describe('RadarChart', () => {
  it('renders six labels with percentages and one value polygon with six points', () => {
    const html = render(axesOf([1, 0.75, 0.5, 0.25, 0.9, 0.333]))
    expect(html).toContain('role="img"'); expect(html).toContain('aria-label="역량 육각형"')
    for (const label of LABELS) expect(html).toContain(`>${label}</tspan>`)
    for (const pct of ['100%', '75%', '50%', '25%', '90%', '33%']) expect(html).toContain(`>${pct}</tspan>`)
    const poly = valuePolygon(html)
    expect(pointsOf(poly)).toHaveLength(6)
    expect(poly).toContain('fill="#f59e0b"'); expect(poly).toContain('fill-opacity="0.35"'); expect(poly).toContain('stroke="#c2410c"')
    // 눈금 육각형 넷(25·50·75·100%) + 값 하나, 축 선 여섯
    expect(html.match(/<polygon/g)).toHaveLength(5)
    expect(html.match(/data-grid=/g)).toHaveLength(4)
    expect(html.match(/<line/g)).toHaveLength(6)
    expect(html.match(/data-marker="solid"/g)).toHaveLength(6)
    expect(html).not.toContain('문항 수 적음')
  })

  it('sparse axes get a hollow dashed marker and the note; null axes get "–" and no marker', () => {
    const html = render(axesOf([0.8, 1, null, 0.5, null, 0.6], [1, 2, 4]))
    expect(html.match(/data-marker="sparse"/g)).toHaveLength(1)
    expect(html.match(/data-marker="solid"/g)).toHaveLength(3)
    expect(html).toContain('stroke-dasharray')
    expect(html.match(/>문항 수 적음<\/tspan>/g)).toHaveLength(1)
    expect(html.match(/>–<\/tspan>/g)).toHaveLength(2)
    // 자료 없는 축의 꼭짓점은 중심 — 다각형은 여전히 여섯 점
    const pts = pointsOf(valuePolygon(html))
    expect(pts).toHaveLength(6); expect(pts[2]).toBe('250,170'); expect(pts[4]).toBe('250,170')
  })

  it('draws no value polygon when no axis has data, but keeps the grid and labels', () => {
    const html = render(axesOf([null, null, null, null, null, null]))
    expect(valuePolygon(html)).toBe('')
    expect(html.match(/data-grid=/g)).toHaveLength(4)
    expect(html.match(/>–<\/tspan>/g)).toHaveLength(6)
  })

  it('leaves room for a 10-character Korean label on every side (nothing outside the viewBox)', () => {
    const long = '가나다라마바사아자차'
    const html = render(LABELS.map(() => ({ label: long, ratio: 0.5, sparse: true })), 420)
    const [, , w, h] = (html.match(/viewBox="([^"]*)"/)?.[1] ?? '').split(' ').map(Number)
    const texts = [...html.matchAll(/<text[^>]*data-axis="(\d)"[^>]*x="([\d.]+)"[^>]*y="([\d.]+)"[^>]*text-anchor="(\w+)"/g)]
    expect(texts).toHaveLength(6)
    const width = long.length * 12.5   // 12px 한글 글자 폭(넉넉히)
    for (const [, , x, y, anchor] of texts) {
      const left = anchor === 'start' ? Number(x) : anchor === 'end' ? Number(x) - width : Number(x) - width / 2
      expect(left).toBeGreaterThanOrEqual(0); expect(left + width).toBeLessThanOrEqual(w)
      expect(Number(y) - 12).toBeGreaterThanOrEqual(0); expect(Number(y) + 2 * 14 + 4).toBeLessThanOrEqual(h)
    }
    expect(html).toContain('max-width:420px')
  })

  it('draws a report radar end to end', () => {
    const body = buildUnitReport({ student, theme, subjects: [fullSubject('영어', { tags: SIX_AXIS_TAGS, drop: 1 }), fullSubject('수학', { wrong: ['1-1'] })] }, reportCopy)
    const html = render(body.radar.map((a) => ({ label: a.competency, ratio: a.ratio, sparse: a.sparse })))
    expect(pointsOf(valuePolygon(html))).toHaveLength(6)
    for (const a of body.radar) expect(html).toContain(`>${Math.round(a.ratio! * 100)}%</tspan>`)
  })
})
