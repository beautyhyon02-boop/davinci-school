// 문항 = 자료 + 문항 한 덩어리(대표 연수 2기 실습-2 p.18~20): 문항 안 자료 라벨 helper(순수 함수)와,
// 학생 단원 평가 탭·제작소 5단계 탭이 문항 안에 그 문항의 자료를 품는지(겹치는 따로 선 자료 칸 없이) 확인한다.
import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { itemMaterialLabels, embeddedMaterialIds } from '@/lib/studio/item-materials'
import { sectionMaterialIds, materialIdsForLesson, itemNosForLesson, studentConditions } from '@/lib/classroom/lessons'
import { ItemMaterials, MaterialsSection } from '@/components/studio/parts/MaterialsFull'
import { buildSnapshot, type Snapshot } from '@/lib/studio/publish'
import { app } from '@/content/site'

vi.mock('@/app/student/assignments/[id]/actions', () => ({ saveDraft: vi.fn(), submitAnswer: vi.fn() }))
const { AnswerEditor } = await import('@/app/student/assignments/[id]/AnswerEditor')
const { Stage5Summary } = await import('@/app/admin/items/[themeId]/sets/[setId]/Stage5Summary')
const { StageOutput } = await import('@/app/admin/items/[themeId]/sets/[setId]/StageOutput')

const c = app.packageView
const fx = (k: string) => JSON.parse(readFileSync(`data/studio-fixtures/${k}.json`, 'utf8'))
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ')
const norm = (s: string) => s.replace(/\s+/g, ' ').trim()
const boxesOf = (html: string) => [...html.matchAll(/data-print="item-material" data-material-id="([A-Z])" data-material-no="(\d+)"/g)].map((m) => `${m[2]}:${m[1]}`)

describe('itemMaterialLabels', () => {
  it('numbers the item\'s materials <자료 1>, <자료 2> … in materials_used order with the set-ID hint', () => {
    expect(itemMaterialLabels({ materials_used: ['F', 'B'] })).toEqual([
      { id: 'F', no: 1, label: '<자료 1>', hint: '자료 F' },
      { id: 'B', no: 2, label: '<자료 2>', hint: '자료 B' },
    ])
    expect(c.items.materialLabel(3)).toBe('<자료 3>')
    expect(c.items.materialHint('D')).toBe('자료 D')
  })
  it('skips duplicates and junk, and reads old/hand-edited items without materials_used', () => {
    expect(itemMaterialLabels({ materials_used: ['A', 'A', '', 3 as never, 'C'] }).map((l) => `${l.no}${l.id}`)).toEqual(['1A', '2C'])
    expect(itemMaterialLabels({})).toEqual([])
    expect(itemMaterialLabels({ materials_used: null })).toEqual([])
  })
  it('embeddedMaterialIds collects every item\'s materials', () => {
    expect([...embeddedMaterialIds([{ materials_used: ['B'] }, { materials_used: ['D', 'B'] }])].sort()).toEqual(['B', 'D'])
    expect(embeddedMaterialIds(undefined).size).toBe(0)
  })
})

describe('ItemMaterials / MaterialsSection parts', () => {
  const materials = fx('stage4-generate-과학').materials
  it('renders one labeled box per material, with title, body and table, in the item order', () => {
    const html = renderToStaticMarkup(createElement(ItemMaterials, { item: { materials_used: ['E', 'D'] }, materials }))
    expect(boxesOf(html)).toEqual(['1:E', '2:D'])
    const t = text(html)
    expect(t.indexOf(`${c.items.materialLabel(1)} ${c.items.materialHint('E')}`)).toBeLessThan(t.indexOf(`${c.items.materialLabel(2)} ${c.items.materialHint('D')}`))
    for (const id of ['D', 'E']) {
      const m = materials.find((x: { id: string }) => x.id === id)
      if (m.body) expect(t).toContain(norm(m.body).slice(0, 30))
      if (m.table) expect(t).toContain(norm(String(m.table.columns[0])))
    }
    expect(renderToStaticMarkup(createElement(ItemMaterials, { item: { materials_used: [] }, materials }))).toBe('')
  })
  it('MaterialsSection drops out of the print sheet when every material is embedded, and omits embedded ones otherwise', () => {
    const all = renderToStaticMarkup(createElement(MaterialsSection, { materials, embeddedIds: materials.map((m: { id: string }) => m.id) }))
    expect(all).not.toContain('data-print="keep"')
    expect(all).not.toContain('data-print="material"')
    const some = renderToStaticMarkup(createElement(MaterialsSection, { materials, embeddedIds: ['B'] }))
    expect(some).toContain('data-print="keep"')
    expect(some).toContain('data-print="omit" data-material-id="B"')
    expect(some).toContain('data-print="material" data-material-id="D"')
    // embeddedIds 없이 쓰면(예전 호출) 예전과 같다
    expect(renderToStaticMarkup(createElement(MaterialsSection, { materials }))).toContain('data-print="keep"')
  })
})

function snapshotFor(subject: '수학' | '과학'): Snapshot {
  const sfx = subject === '과학' ? '-과학' : ''
  const s2 = fx(`stage2-generate${sfx}`); const s3 = fx(`stage3-generate${sfx}`)
  return buildSnapshot({
    theme: { title: '학교 축제, 일회용품을 줄이자', level: '중', grade: 1, intro: '', materials: null },
    itemSet: {
      subject, level: '중', grade: 1, reconstruction: s2.reconstruction, reconstruction_detail: s2.standards, learning_goals: s2.learning_goals,
      key_question: s2.key_question_candidates[0], unit_plan: s3.unit_plan, lessons: s3.lessons, materials: fx(`stage4-generate${sfx}`).materials,
      assessment: fx(`stage5-generate${sfx}`), teacher_guide: fx(`stage6-generate${sfx}`), notice_plan: fx(`stage7-generate${sfx}`),
      stage_status: {},
    },
    standards: s2.standards.map((s: { code: string; original_text: string }) => ({ code: s.code, text: s.original_text })),
    version: 1,
  })
}

// 학생 단원 평가 탭(app/student/assignments/[id]/page.tsx): 답안 칸 안에 그 문항의 자료, 따로 선 자료 칸에는 겹치지 않는 것만.
describe.each(['수학', '과학'] as const)('student 단원 평가 tab embeds each item\'s materials (%s)', (subject) => {
  const snap = snapshotFor(subject)
  const session = snap.lessons.find((l) => l.kind === 'assessment')!
  const itemNos = itemNosForLesson(snap, session.no)
  const lessonItems = itemNos.map((n) => snap.assessment!.items[n - 1])

  it('the separate 자료 section of the session holds no material an item already embeds (demo sets: none left)', () => {
    const ids = sectionMaterialIds(session, lessonItems)
    for (const it of lessonItems) for (const id of it.materials_used) expect(ids).not.toContain(id)
    expect(ids).toEqual([])
    // 교수 차시는 예전처럼 자기 자료 전부
    const teaching = snap.lessons[0]
    expect(sectionMaterialIds(teaching, [])).toEqual(materialIdsForLesson(teaching, []))
  })
  it('each answer card shows stem → <자료 n> boxes (full material) → conditions', () => {
    for (const it of lessonItems) {
      const html = renderToStaticMarkup(createElement(AnswerEditor, {
        assignmentId: 'a1', itemNo: 1, attempt: 1, initialBody: '', submitted: false, label: it.kind, points: it.points, stem: it.stem,
        conditions: studentConditions(it), materials: createElement(ItemMaterials, { item: it, materials: snap.materials }),
      }))
      expect(boxesOf(html)).toEqual(it.materials_used.map((id, k) => `${k + 1}:${id}`))
      const t = text(html)
      const stemAt = t.indexOf(norm(it.stem))
      const box1 = t.indexOf(c.items.materialLabel(1))
      const lengthAt = t.indexOf(norm(it.conditions.length))
      expect(stemAt).toBeGreaterThan(-1); expect(box1).toBeGreaterThan(stemAt); expect(lengthAt).toBeGreaterThan(box1)
      for (const id of it.materials_used) {
        const m = snap.materials.find((x) => x.id === id)!
        if (m.body) expect(t).toContain(norm(m.body).slice(0, 30))
      }
      expect(t).not.toMatch(/undefined|NaN|\[object Object\]/)
    }
  })
  it('the page wires it: section = sectionMaterialIds, first answer card gets ItemMaterials', () => {
    const src = readFileSync('app/student/assignments/[id]/page.tsx', 'utf8')
    expect(src).toContain('sectionMaterialIds(lesson, lessonItems)')
    expect(src).toMatch(/materials=\{<ItemMaterials item=\{item\} materials=\{snapshot\.materials\} \/>\}/)
    expect(src.match(/<ItemMaterials /g)).toHaveLength(1)   // 재도전 답안 칸에는 다시 싣지 않는다(바로 위에 있다)
  })
})

// 제작소 5단계 탭(Stage5Summary, StageOutput 경유): 문항 카드 안에 그 문항의 자료(4단계 출력 + 가리키는 공유 자료)
describe.each(['수학', '과학'] as const)('wizard stage 5 item cards embed their materials (%s)', (subject) => {
  const sfx = subject === '과학' ? '-과학' : ''
  const s5 = fx(`stage5-generate${sfx}`)
  const s4 = fx(`stage4-generate${sfx}`)
  const cards = (html: string) => html.split('data-stage5-item').slice(1)

  it('StageOutput passes stage-4 materials so each card shows its <자료 n> boxes in order', () => {
    const html = renderToStaticMarkup(createElement(StageOutput, { stage: 5, outputs: { 3: fx(`stage3-generate${sfx}`), 4: s4, 5: s5 } }))
    const cs = cards(html)
    expect(cs).toHaveLength(s5.items.length)
    s5.items.forEach((it: { materials_used: string[]; stem: string }, i: number) => {
      expect(boxesOf(cs[i])).toEqual(it.materials_used.map((id, k) => `${k + 1}:${id}`))
      const t = text(cs[i])
      expect(t.indexOf(c.items.materialLabel(1))).toBeGreaterThan(t.indexOf(norm(it.stem)))
      expect(t.indexOf(app.studio.wizard.stage5.conditionsHeading)).toBeGreaterThan(t.indexOf(c.items.materialLabel(1)))
    })
    expect(text(html)).not.toMatch(/undefined|NaN|\[object Object\]/)
  })
  it('before stage 4 exists the boxes say the material is missing instead of crashing; the plain Stage5Summary call still works', () => {
    const t = text(renderToStaticMarkup(createElement(StageOutput, { stage: 5, outputs: { 5: s5 } })))
    expect(t).toContain(norm(c.items.materialMissing(s5.items[0].materials_used[0])))
    expect(text(renderToStaticMarkup(createElement(Stage5Summary, { output: s5 })))).toContain(norm(s5.items[0].stem))
  })
})
