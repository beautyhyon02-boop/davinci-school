// 문장 고치기 칸(FieldEditor)을 서버 렌더로 확인한다. 서버 액션 모듈은 DB 를 부르므로 가짜로 바꾼다(렌더만 본다).
import { describe, it, expect, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'

vi.mock('@/app/admin/items/[themeId]/sets/[setId]/actions', () => ({ saveStageEdit: vi.fn() }))
const { FieldEditor } = await import('@/app/admin/items/[themeId]/sets/[setId]/FieldEditor')
const { expandFields } = await import('@/lib/studio/editable-fields')
const { app } = await import('@/content/site')
const copy = app.studio.wizard.fieldEditor

const output = JSON.parse(readFileSync('data/studio-fixtures/stage5-generate.json', 'utf8'))
const render = (laterStages: number[]) => renderToStaticMarkup(createElement(FieldEditor, { setId: 's1', stage: 5, output, laterStages, onSaved: () => {} }))
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/\s+/g, ' ')
const count = (html: string, s: string) => html.split(s).length - 1

describe('FieldEditor (5단계)', () => {
  it('renders one input per editable sentence, prefilled, grouped by item', () => {
    const html = render([])
    const fields = expandFields(5, output)
    expect(count(html, '<textarea') + count(html, '<input') + count(html, '<select')).toBe(fields.length)
    // C-40: 역량 꼬리표는 고르기 칸(select) — 요소마다 하나, 지금 값이 골라져 있다. 값이 있으면 '고르지 않음' 줄은 없다
    const picks = fields.filter((f) => f.options)
    expect(count(html, '<select')).toBe(picks.length)
    expect(picks.length).toBe(output.items.reduce((n: number, it: { rubric: { criteria: unknown[] } }) => n + it.rubric.criteria.length, 0))
    expect(html).toContain('name="items.0.rubric.criteria.0.competency"')
    expect(html).toContain(`<option value="${output.items[0].rubric.criteria[0].competency}" selected="">`)
    expect(text(html)).toContain(copy.labels['items[].rubric.criteria[].competency']([0, 0], output.items[0].rubric.criteria[0]))
    expect(text(html)).not.toContain(copy.optionEmpty)
    expect(count(html, '<textarea')).toBe(fields.filter((f) => f.multiline).length)
    expect(text(html)).toContain(copy.groups.items('1'))
    expect(text(html)).toContain(copy.groups.feedback_templates(''))
    expect(text(html)).toContain(copy.labels['items[].stem']([0], output.items[0]))
    expect(html).toContain('name="items.0.stem"')
    expect(text(html)).toContain(output.items[0].stem.slice(0, 20))
    expect(text(html)).toContain(copy.changedCount(0))
    expect(text(html)).not.toContain(copy.resetWarning(6))
  })

  it('an old output without competency tags shows the pick field with 고르지 않음 selected', () => {
    const old = structuredClone(output)
    for (const it of old.items) for (const c of it.rubric.criteria) delete c.competency
    const html = renderToStaticMarkup(createElement(FieldEditor, { setId: 's1', stage: 5, output: old, laterStages: [], onSaved: () => {} }))
    const n = old.items.reduce((s: number, it: { rubric: { criteria: unknown[] } }) => s + it.rubric.criteria.length, 0)
    expect(count(html, '<select')).toBe(n)
    expect(count(html, `<option value="" selected="">${copy.optionEmpty}</option>`)).toBe(n)
  })

  it('asks before resetting later stages: warning line + confirm checkbox', () => {
    const html = render([6, 7])
    expect(text(html)).toContain(copy.resetWarning(6))
    expect(text(html)).toContain(copy.resetConfirm)
    expect(html).toContain('type="checkbox"')
  })
})
