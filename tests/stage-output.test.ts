// 제작소 단계 탭 결과 보기(StageOutput) — 오너 규칙(2026-09-26): 탭은 요약이 아니라 학생·원장이 보는 완성본 그대로.
// 3단계 = 평가 계획 + 차시 카드 전부(6단계 지침서 메모가 그 차시 카드 안에), 4단계 = 자료 전부(표 모든 행) + 가리키는 공유 자료,
// 6단계 = 지침서 전체(차시 주제와 함께), 7단계 = 안내장 틀 전체. 5단계(Stage5Summary)·2단계는 그대로.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { StageOutput } from '@/app/admin/items/[themeId]/sets/[setId]/StageOutput'
import { stageMaterialsView } from '@/lib/studio/materials'
import { withMaterialDefaults } from '@/lib/studio/draft-defaults'
import type { WizardStage } from '@/lib/studio/wizard-stages'
import { app } from '@/content/site'

const fx = (k: string) => JSON.parse(readFileSync(`data/studio-fixtures/${k}.json`, 'utf8'))
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ')
const norm = (s: string) => s.replace(/\s+/g, ' ').trim()
const count = (s: string, needle: string) => s.split(needle).length - 1
const c = app.packageView
const w = app.studio.wizard

type Outputs = Partial<Record<WizardStage, unknown>>
const render = (stage: WizardStage, outputs: Outputs, sharedMaterials: Parameters<typeof StageOutput>[0]['sharedMaterials'] = []) =>
  renderToStaticMarkup(createElement(StageOutput, { stage, outputs, sharedMaterials }))

describe.each(['수학', '과학'] as const)('StageOutput (%s fixtures)', (subject) => {
  const sfx = subject === '과학' ? '-과학' : ''
  const outputs: Outputs = {
    2: fx(`stage2-generate${sfx}`), 3: fx(`stage3-generate${sfx}`), 4: fx(`stage4-generate${sfx}`),
    5: fx(`stage5-generate${sfx}`), 6: fx(`stage6-generate${sfx}`), 7: fx(`stage7-generate${sfx}`),
  }
  const s3 = outputs[3] as { lessons: { no: number; topic: string; caution_notes: string[]; teacher_script: { questions: { prompt: string; expected_answer: string }[] } }[] }
  const s6 = outputs[6] as { per_lesson: { no: number; notes: string[] }[]; glossary: { term: string }[] }

  it('stage 3 shows full lesson cards with the matching 지침서 notes inside each card', () => {
    const html = render(3, outputs)
    const t = text(html)
    expect(t).not.toMatch(/undefined|NaN|\[object Object\]/)
    expect(t).toContain(w.stage3.unitPlanHeading)
    expect(t).not.toContain(w.stage3.guidePending)
    for (const l of s3.lessons) {
      const start = html.indexOf(`data-lesson-no="${l.no}"`)
      const next = html.indexOf('data-lesson-no="', start + 1)
      const seg = text(html.slice(start, next < 0 ? undefined : next))
      expect(seg).toContain(norm(`${c.lessons.columns.no} ${l.no} · ${l.topic}`))
      expect(seg).toContain(c.lessons.teacherBlockHeading)
      for (const q of l.teacher_script.questions) expect(seg).toContain(norm(`${q.prompt} — ${c.lessons.scriptExpected}: ${q.expected_answer}`))
      for (const n of l.caution_notes) expect(seg).toContain(norm(n))
      for (const n of s6.per_lesson.find((p) => p.no === l.no)?.notes ?? []) expect(seg).toContain(norm(n))
    }
    // 예전 요약 표(퀴즈 수·병합 가능 열)는 없다
    expect(html).not.toContain('<table')
  })
  it('stage 3 before stage 6 exists: cards without 지침서 메모 and a one-line hint', () => {
    const html = render(3, { ...outputs, 6: undefined })
    expect(text(html)).toContain(w.stage3.guidePending)
    expect(html).not.toContain(`>${c.lessons.guideNotesHeading}<`)
  })
  it('stage 4 shows every material in full — every table row, bodies, no "상위 5행" preview', () => {
    const mats = (outputs[4] as { materials: { id: string; body: string | null; table: { rows: unknown[][] } | null }[] }).materials
    const html = render(4, outputs)
    expect(html).not.toContain('상위 5행')
    expect(count(html, 'data-print="material"')).toBe(mats.length)
    const rows = mats.reduce((s, m) => s + (m.table?.rows.length ?? 0), 0)
    expect(count(html, '<tr class="border-b border-ink-50">')).toBe(rows)
    for (const m of mats) if (m.body) expect(text(html)).toContain(norm(m.body))
  })
  it('stage 6 shows the whole guide with lesson topics; stage 7 the whole notice plan', () => {
    const g = text(render(6, outputs))
    for (const x of s6.glossary) expect(g).toContain(norm(x.term))
    for (const p of s6.per_lesson.filter((x) => x.notes.length > 0)) expect(g).toContain(norm(c.teacherGuide.lessonWithTopic(p.no, s3.lessons.find((l) => l.no === p.no)!.topic)))
    const n = text(render(7, outputs))
    for (const p of (outputs[7] as { per_lesson: { topic_summary: string }[] }).per_lesson) expect(n).toContain(norm(p.topic_summary))
    expect(n).toContain(norm((outputs[7] as { footer_disclaimer: string }).footer_disclaimer))
  })
  it('stages 2 and 5 keep their views; an empty stage says so', () => {
    expect(text(render(2, outputs))).toContain(w.stage2.candidatesLabel)
    expect(text(render(5, outputs))).toContain(w.stage5.commonHeading)
    expect(text(render(6, { ...outputs, 6: null }))).toContain(w.empty)
  })
})

describe('stage 4 — theme shared materials the set references', () => {
  const outputs: Outputs = { 3: fx('stage3-generate'), 4: fx('stage4-generate'), 5: fx('stage5-generate'), 6: fx('stage6-generate'), 7: fx('stage7-generate') }
  // 공유 자료는 v1 모양(source 문자열, role·images 없음)으로 저장돼 있을 수 있다 — 서버가 v2 기본값을 입혀 넘긴다
  const shared = [
    { id: 'C', title: '공유 자료 C (자작)', kind: 'text', body: '부스 운영 안내문 전문', table: null, source: '자작' },
    { id: 'Z', title: '안 쓰는 공유 자료', kind: 'text', body: '이 세트와 무관', table: null, source: '자작' },
  ].map(withMaterialDefaults)

  it('shows referenced shared materials with the 공유 badge, hides unreferenced ones', () => {
    const lessons = structuredClone(outputs[3]) as { lessons: { materials_used: string[] }[] }
    lessons.lessons[0].materials_used = [...lessons.lessons[0].materials_used, 'C']
    const html = render(4, { ...outputs, 3: lessons }, shared)
    const t = text(html)
    expect(t).toContain('부스 운영 안내문 전문')
    expect(t).toContain('공유 자료 C')
    expect(t).not.toContain('(자작)')
    expect(count(html, `>${c.materials.sharedBadge}<`)).toBe(1)
    expect(t).toContain(w.stage4.sharedNote)
    expect(t).not.toContain('이 세트와 무관')
    // 자료는 ID 순(A, B, C)
    expect(html.indexOf('data-material-id="B"')).toBeLessThan(html.indexOf('data-material-id="C"'))
  })
  it('stageMaterialsView: shared wins on an ID clash (like the published version) and reports the dropped set material', () => {
    const set = [{ id: 'A', t: 'set A' }, { id: 'B', t: 'set B' }]
    const sh = [{ id: 'B', t: 'shared B' }, { id: 'D', t: 'shared D' }]
    const v = stageMaterialsView(set, sh, new Set(['B']))
    expect(v.materials.map((m) => m.t)).toEqual(['set A', 'shared B'])
    expect(v.sharedIds).toEqual(['B'])
    expect(v.overridden).toEqual(['B'])
    expect(text(render(4, { 4: { materials: [{ id: 'B', title: '세트 B', kind: 'text', body: '세트 본문', table: null }] }, 3: { lessons: [{ no: 1, materials_used: ['B'] }] } }, [withMaterialDefaults({ id: 'B', title: '공유 B', kind: 'text', body: '공유 본문', table: null })])))
      .toContain(w.stage4.overriddenNote(['B']))
  })
})

describe('StageOutput stays client-safe', () => {
  it('imports only the parts (never PackageView or the fs-backed levels module)', () => {
    const src = readFileSync('app/admin/items/[themeId]/sets/[setId]/StageOutput.tsx', 'utf8')
    expect(src).not.toMatch(/from '[^']*PackageView'|from '@\/lib\/reference\/levels'|from 'node:/)
    const wizard = readFileSync('app/admin/items/[themeId]/sets/[setId]/StageWizard.tsx', 'utf8')
    expect(wizard).not.toMatch(/previewHeading|slice\(0, 5\)/)
  })
})
