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
    expect(count(html, '<textarea') + count(html, '<input')).toBe(fields.length)
    expect(count(html, '<textarea')).toBe(fields.filter((f) => f.multiline).length)
    expect(text(html)).toContain(copy.groups.items('1'))
    expect(text(html)).toContain(copy.groups.feedback_templates(''))
    expect(text(html)).toContain(copy.labels['items[].stem']([0], output.items[0]))
    expect(html).toContain('name="items.0.stem"')
    expect(text(html)).toContain(output.items[0].stem.slice(0, 20))
    expect(text(html)).toContain(copy.changedCount(0))
    expect(text(html)).not.toContain(copy.resetWarning(6))
  })

  it('asks before resetting later stages: warning line + confirm checkbox', () => {
    const html = render([6, 7])
    expect(text(html)).toContain(copy.resetWarning(6))
    expect(text(html)).toContain(copy.resetConfirm)
    expect(html).toContain('type="checkbox"')
  })
})
