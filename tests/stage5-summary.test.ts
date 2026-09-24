// 제작소 5단계 요약(Stage5Summary): 오너 지적(2026-09-25) — 문두·등급표·예시답안 개수만 보여 조건·채점표를 볼 수 없었다.
// 문항 카드마다 조건(번호)·분량·채점표(요소 × 점수, 0점부터)·총체적 기준·유의점·예시답안(접힘)·A~E를 보이고,
// 등급표·피드백 틀은 문항과 떨어진 "채점 기준표(공통)" 칸에 둔다.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Stage5Summary } from '@/app/admin/items/[themeId]/sets/[setId]/Stage5Summary'
import { app } from '@/content/site'

const copy = app.studio.wizard.stage5
const fx = JSON.parse(readFileSync('data/studio-fixtures/stage5-generate.json', 'utf8'))
const render = (output: unknown) => renderToStaticMarkup(createElement(Stage5Summary, { output }))
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ')
const norm = (s: string) => s.replace(/\s+/g, ' ').trim()

type Step = { points: number; descriptor: string }
type Crit = { name: string; max: number; scale: Step[] }

describe('Stage5Summary', () => {
  // 저장된 영어 세트처럼 척도를 만점부터(내림차순) 적은 출력 — 화면은 0점부터 보여야 한다
  const desc = structuredClone(fx)
  for (const it of desc.items) for (const c of it.rubric.criteria) c.scale.reverse()
  const html = render(desc)
  const t = text(html)

  it('renders without undefined/NaN/[object Object] leaks', () => {
    expect(t).not.toMatch(/undefined|NaN|\[object Object\]/)
  })
  it('shows every item: kind badge, points, stem, numbered 조건 (or 조건 없음(서술형)), length/format/answer mode', () => {
    for (const [i, it] of fx.items.entries()) {
      expect(t).toContain(norm(it.stem))
      expect(html).toContain(`>${it.kind}</span>`)
      expect(t).toContain(copy.pointsLabel(it.points))
      expect(t).toContain(norm(`${copy.lengthLabel}: ${it.conditions.length}`))
      expect(t).toContain(norm(`${copy.formatLabel}: ${it.conditions.format}`))
      expect(t).toContain(copy.answerMode[it.conditions.answer_mode])
      for (const c of it.conditions.items) expect(t).toContain(norm(`${copy.conditionNo(c.no)} ${c.text}`))
      if (it.conditions.items.length === 0) expect(t).toContain(copy.noConditions(it.kind))
      expect(t).toContain(norm(copy.exemplarCount(i + 1, it.exemplar_answers.length)))
    }
    expect(fx.items[0].kind).toBe('서술형'); expect(t).toContain('조건 없음(서술형)')
    expect(fx.items[1].conditions.items.length).toBeGreaterThanOrEqual(2)
  })
  it('shows each rubric as a criteria × points table, descriptors from 0점 upward even when stored descending', () => {
    for (const it of fx.items) {
      for (const c of it.rubric.criteria as Crit[]) {
        expect(t).toContain(norm(copy.criterionLabel(c.name, c.max)))
        const at = (p: number) => t.indexOf(norm(c.scale.find((s) => s.points === p)!.descriptor))
        for (let p = 1; p <= c.max; p++) {
          expect(at(p - 1)).toBeGreaterThan(-1)
          expect(at(p - 1)).toBeLessThan(at(p))
        }
      }
      for (const lv of ['상', '중', '하'] as const) expect(t).toContain(norm(it.rubric.holistic[lv]))
      for (const n of it.rubric.notes) expect(t).toContain(norm(n))
    }
    // 서술형 표(0~2점)에도 논술형과 같은 열 머리글이 있다
    expect(html).toContain(`>${copy.pointColumn(0)}</th>`)
  })
  it('keeps exemplars folded (<details> without open) with points, text and rationale', () => {
    expect(html).toMatch(/<details class="[^"]*">/)
    expect(html).not.toMatch(/<details[^>]* open/)
    for (const it of fx.items) for (const e of it.exemplar_answers) {
      expect(t).toContain(norm(e.text))
      expect(t).toContain(norm(e.rationale))
    }
    for (const it of fx.items) expect(t).toContain(it.level_map.map((l: { level: string; min: number; max: number }) => `${l.level} ${l.min}~${l.max}`).join(' / '))
  })
  it('puts 등급표(7행, level_ref) and 피드백 틀 in a separate 채점 기준표(공통) box after the items', () => {
    const common = html.indexOf('data-stage5-common')
    const lastItem = html.lastIndexOf('data-stage5-item')
    expect(common).toBeGreaterThan(lastItem)
    const box = text(html.slice(common))
    expect(box).toContain(copy.commonHeading)
    expect(box).toContain(copy.boundariesHeading)
    for (const b of fx.grade_boundaries) expect(box).toContain(`${b.grade} ${copy.boundaryRange(b.min, b.max)} ${b.band} ${b.level_ref}`)
    for (const lv of ['상', '중', '하'] as const) expect(box).toContain(norm(fx.feedback_templates[lv]))
    // 공통 칸은 문항 카드 밖이다 — 문항 카드 안에는 등급표가 없다
    expect(text(html.slice(0, common))).not.toContain(copy.boundariesHeading)
  })
  it('does not crash on an old or hand-edited output with only stems and a grade table', () => {
    const old = { items: [{ kind: '서술형', points: 3, stem: '옛 문두 [3점]' }], grade_boundaries: [{ grade: 1, min: 20, max: 22, band: '상' }] }
    const h = text(render(old))
    expect(h).toContain('옛 문두 [3점]'); expect(h).toContain(copy.noConditions('서술형'))
    expect(h).not.toMatch(/undefined|NaN/)
    expect(render({})).toContain(copy.itemsHeading)
  })
})
