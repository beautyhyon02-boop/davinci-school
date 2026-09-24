// 세트 자료 수(대표 2026-09-26): 게시 판에는 문항·차시가 참조하는 자료만 싣고(publish.ts), 4·5단계 [TS] 자문이 많거나 안 쓰는 자료를 짚는다.
import { describe, it, expect } from 'vitest'
import { mentionedMaterialIds, usedMaterialIds, MAX_SET_MATERIALS } from '@/lib/studio/materials'
import { selectUsedMaterials } from '@/lib/studio/publish'
import { staticIssues } from '@/lib/studio/checks'

describe('mentionedMaterialIds', () => {
  it('reads 자료 X mentions in the usual shapes', () => {
    expect(mentionedMaterialIds('자료 A를 보고')).toEqual(['A'])
    expect(mentionedMaterialIds('자료 A·B와 자료C')).toEqual(['A', 'B', 'C'])
    expect(mentionedMaterialIds('자료 D와 E를 비교')).toEqual(['D', 'E'])
    expect(mentionedMaterialIds('자료 F, G 중에서')).toEqual(['F', 'G'])
  })
  it('expands ranges (리뷰 2026-09-26: "자료 A~D"만 적힌 참조가 B·C·D를 빼면 안 된다)', () => {
    expect(mentionedMaterialIds('자료 A~D를 활용')).toEqual(['A', 'B', 'C', 'D'])
    expect(mentionedMaterialIds('자료 A-D 참고')).toEqual(['A', 'B', 'C', 'D'])
    expect(mentionedMaterialIds('자료 B–D 참고')).toEqual(['B', 'C', 'D'])
    expect(mentionedMaterialIds('자료 A부터 D까지 읽는다')).toEqual(['A', 'B', 'C', 'D'])
    expect(mentionedMaterialIds('자료 A ~ C와 E를 비교')).toEqual(['A', 'B', 'C', 'E'])
    expect(mentionedMaterialIds('자료 A-1번 칸')).toEqual(['A'])
  })
  it('ignores words that only start with a capital letter', () => {
    expect(mentionedMaterialIds('자료 AB는 없다')).toEqual([])
    expect(mentionedMaterialIds('자료를 읽는다 A')).toEqual([])
  })
})

describe('usedMaterialIds / selectUsedMaterials', () => {
  it('unions item and lesson materials_used with text mentions', () => {
    const used = usedMaterialIds({ lessons: [{ materials_used: ['A'] }], items: [{ materials_used: ['E'] }], texts: [{ note: '자료 H 참고' }, null] })
    expect([...used].sort()).toEqual(['A', 'E', 'H'])
  })
  it('keeps only used ids, reports the rest; no references → keeps all', () => {
    const ms = ['A', 'B', 'C'].map((id) => ({ id }))
    expect(selectUsedMaterials(ms, new Set(['B']))).toEqual({ materials: [{ id: 'B' }], omitted: ['A', 'C'] })
    expect(selectUsedMaterials(ms, new Set())).toEqual({ materials: ms, omitted: [] })
  })
})

const mat = (id: string) => ({ id, title: `자료 ${id}`, kind: 'text', body: '본문', table: null, source: { kind: '자작', attribution: null, ai_assisted: false }, role: 'raw', images: [] })
const lessons = (...used: string[][]) => used.map((u, i) => ({ no: i + 1, materials_used: u, flow: { main: [] } }))

describe('[TS] 자문: 세트 자료 수 (4·5단계)', () => {
  const ctx = (prior: Record<string, unknown>) => ({ standards: [], prior })
  const materialNotes = (stage: 4 | 5, output: unknown, prior: Record<string, unknown>) =>
    staticIssues(stage, output, ctx(prior)).map((i) => i.detail).filter((d) => /어느 (문항·)?차시도|세트 자료 \d+개/.test(d))

  it('stage 4: a set material no lesson uses is flagged (5단계 문항이 쓰면 괜찮다)', () => {
    const notes = materialNotes(4, { materials: [mat('E'), mat('F')] }, { stage3: { lessons: lessons(['E']) } })
    expect(notes).toEqual(['자료 F: 어느 차시도 쓰지 않음 — 5단계 문항도 쓰지 않으면 게시 판에서 빠진다'])
  })

  it(`stage 4: more than ${MAX_SET_MATERIALS} materials (set + used shared) is flagged`, () => {
    const set = ['E', 'F', 'G', 'H', 'I'].map(mat)
    const notes = materialNotes(4, { materials: set }, { stage3: { lessons: lessons(['A', 'E', 'F'], ['G', 'H', 'I']) }, shared_materials: [mat('A'), mat('B')] })
    expect(notes).toEqual([`세트 자료 6개(A, E, F, G, H, I) — 문항·차시가 실제로 쓰는 2~4개(많아도 ${MAX_SET_MATERIALS}개)만 둔다`])
  })

  it('stage 4: nothing to say when 3단계 is missing or every material is used', () => {
    expect(materialNotes(4, { materials: [mat('E')] }, {})).toEqual([])
    expect(materialNotes(4, { materials: [mat('E'), mat('F')] }, { stage3: { lessons: lessons(['E'], ['F']) } })).toEqual([])
  })

  it('stage 5: a set material neither items nor lessons use will be dropped at publish', () => {
    const items = [{ kind: '서술형', materials_used: ['E'], conditions: { items: [] }, rubric: { criteria: [], holistic: {} }, exemplar_answers: [] }]
    const notes = materialNotes(5, { items, grade_boundaries: [] }, { stage3: { lessons: lessons(['E']) }, stage4: { materials: [mat('E'), mat('F')] } })
    expect(notes).toEqual(['자료 F: 어느 문항·차시도 쓰지 않음 — 게시 판에서 빠진다'])
  })
})
