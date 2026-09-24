// 문장 고치기(대표 2026-09-26): 단계별 편집 경로가 수학·과학 fixture 에서 모두 칸으로 펼쳐지고, 고친 출력이 그 단계 zod 를 통과한다.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { EDITABLE_FIELDS, expandFields, groupFields, setAtPath, applyFieldEdits, validateEdited } from '@/lib/studio/editable-fields'
import { STAGE_SCHEMAS } from '@/lib/studio/schemas'
import { WIZARD_STAGES } from '@/lib/studio/wizard-stages'
import { app } from '@/content/site'

const copy = app.studio.wizard.fieldEditor
const fx = (name: string) => JSON.parse(readFileSync(`data/studio-fixtures/${name}.json`, 'utf8'))
const SETS = [{ subject: '수학', suffix: '' }, { subject: '과학', suffix: '-과학' }] as const
const issues = (stage: (typeof WIZARD_STAGES)[number], o: unknown) => STAGE_SCHEMAS[stage].safeParse(o).error?.issues.map((i) => `${i.path.join('.')}: ${i.message}`) ?? []
/** 길이를 바꾸지 않고 내용만 바꾼 문장(7단계 글자 수 상한·5단계 문두 끝 [N점]을 지킨다). */
const tweak = (v: string) => (v.length >= 4 ? `고침${v.slice(2)}` : v === '고침' ? '수정' : '고침')

for (const set of SETS) describe(`editable fields on the ${set.subject} fixtures`, () => {
  for (const stage of WIZARD_STAGES) {
    const output = fx(`stage${stage}-generate${set.suffix}`)

    it(`stage ${stage}: every pattern resolves to at least one field and each field reads its own value`, () => {
      const fields = expandFields(stage, output)
      const patterns = new Set(fields.map((f) => f.pattern))
      expect(EDITABLE_FIELDS[stage].map((s) => s.pattern).filter((p) => !patterns.has(p))).toEqual([])
      for (const f of fields) {
        const v = f.path.reduce<unknown>((o, k) => (o as Record<string | number, unknown>)[k], output)
        expect(v, f.id).toBe(f.value)
        expect(f.id).toBe(f.path.join('.'))
      }
      expect(new Set(fields.map((f) => f.id)).size).toBe(fields.length)
    })

    it(`stage ${stage}: changing any one field — or all of them — still validates with STAGE_SCHEMAS[${stage}]`, () => {
      const fields = expandFields(stage, output)
      for (const f of fields) {
        const next = setAtPath(output, f.path, tweak(f.value))
        expect(issues(stage, next), f.id).toEqual([])
      }
      const all = applyFieldEdits(output, fields, Object.fromEntries(fields.map((f) => [f.id, tweak(f.value)])))
      expect(issues(stage, all)).toEqual([])
      expect(expandFields(stage, all).every((f) => f.value === tweak(fields.find((x) => x.id === f.id)!.value))).toBe(true)
    })
  }
})

describe('labels and groups (content/site.ts)', () => {
  it('every editable pattern has a label and every group top has a heading', () => {
    for (const stage of WIZARD_STAGES) for (const { pattern } of EDITABLE_FIELDS[stage]) expect(typeof copy.labels[pattern], pattern).toBe('function')
    for (const set of SETS) for (const stage of WIZARD_STAGES) {
      for (const g of groupFields(expandFields(stage, fx(`stage${stage}-generate${set.suffix}`)))) {
        expect(typeof copy.groups[g.top], g.top).toBe('function')
        expect(copy.groups[g.top](g.tag)).not.toMatch(/undefined|NaN/)
        for (const f of g.fields) expect(copy.labels[f.pattern](f.indices, f.parent), f.id).not.toMatch(/undefined|NaN|\[object/)
      }
    }
  })

  it('groups by element for lessons/items/materials/per_lesson with readable tags', () => {
    const g3 = groupFields(expandFields(3, fx('stage3-generate')))
    expect(g3.map((g) => copy.groups[g.top](g.tag))).toEqual(fx('stage3-generate').lessons.map((l: { no: number }) => `${l.no}차시`))
    const g4 = groupFields(expandFields(4, fx('stage4-generate-과학')))
    expect(g4.map((g) => g.tag)).toEqual(['B', 'D', 'E'])
    const g5 = groupFields(expandFields(5, fx('stage5-generate')))
    expect(g5.map((g) => g.key)).toEqual(['items.0', 'items.1', 'feedback_templates'])
  })
})

describe('helpers', () => {
  const output = fx('stage3-generate')
  it('setAtPath does not touch the original and refuses unknown paths', () => {
    const before = JSON.stringify(output)
    const next = setAtPath(output, ['lessons', 0, 'topic'], '새 주제')
    expect(next.lessons[0].topic).toBe('새 주제')
    expect(JSON.stringify(output)).toBe(before)
    expect(() => setAtPath(output, ['lessons', 99, 'topic'], 'x')).toThrow(/no such path/)
    expect(() => setAtPath(output, ['lessons', 0, 'nope'], 'x')).toThrow(/no such path/)
  })

  it('skips null leaves (table materials have no body)', () => {
    const fields = expandFields(4, fx('stage4-generate'))
    for (const m of fx('stage4-generate').materials as { id: string; body: string | null }[]) {
      expect(fields.some((f) => f.group.tag === m.id && f.pattern === 'materials[].body')).toBe(m.body !== null)
    }
  })

  it('validateEdited points at the field whose sentence broke the schema', () => {
    const fields = expandFields(3, output)
    const next = applyFieldEdits(output, fields, { 'lessons.0.goal': '짧음' })
    expect(validateEdited(3, next, fields)?.fieldId).toBe('lessons.0.goal')
    expect(validateEdited(3, output, fields)).toBeNull()
  })
})
