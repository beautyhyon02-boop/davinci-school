// 문장 고치기(대표 2026-09-26): 단계별 편집 경로가 수학·과학 fixture 에서 모두 칸으로 펼쳐지고, 고친 출력이 그 단계 zod 를 통과한다.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { EDITABLE_FIELDS, expandFields, groupFields, setAtPath, applyFieldEdits, validateEdited } from '@/lib/studio/editable-fields'
import { STAGE_SCHEMAS } from '@/lib/studio/schemas'
import { WIZARD_STAGES } from '@/lib/studio/wizard-stages'
import { app } from '@/content/site'
import { englishGuide } from './fixtures/english-guide'

const copy = app.studio.wizard.fieldEditor
const fx = (name: string) => JSON.parse(readFileSync(`data/studio-fixtures/${name}.json`, 'utf8'))
const SETS = [{ subject: '수학', suffix: '' }, { subject: '과학', suffix: '-과학' }] as const
const issues = (stage: (typeof WIZARD_STAGES)[number], o: unknown) => STAGE_SCHEMAS[stage].safeParse(o).error?.issues.map((i) => `${i.path.join('.')}: ${i.message}`) ?? []
/** 길이를 바꾸지 않고 내용만 바꾼 문장(7단계 글자 수 상한·5단계 문두 끝 [N점]을 지킨다). */
const tweak = (v: string) => (v.length >= 4 ? `고침${v.slice(2)}` : v === '고침' ? '수정' : '고침')
/** 영어 세트에만 있는 칸(S-영-08 번역) — 한국어 시연 fixture 에는 없으므로 아래 영어 합성 예로 따로 시험한다. */
const ENGLISH_ONLY = (pattern: string) => pattern.startsWith('translations.')
/** 고르기 칸(역량 꼬리표)은 글을 고치지 않고 다른 값을 고른다. */
const tweakField = (f: { value: string; options?: readonly string[] }) => (f.options ? f.options.find((o) => o !== f.value)! : tweak(f.value))

for (const set of SETS) describe(`editable fields on the ${set.subject} fixtures`, () => {
  for (const stage of WIZARD_STAGES) {
    const output = fx(`stage${stage}-generate${set.suffix}`)

    it(`stage ${stage}: every pattern resolves to at least one field and each field reads its own value`, () => {
      const fields = expandFields(stage, output)
      const patterns = new Set(fields.map((f) => f.pattern))
      expect(EDITABLE_FIELDS[stage].map((s) => s.pattern).filter((p) => !patterns.has(p) && !ENGLISH_ONLY(p))).toEqual([])
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
        const next = setAtPath(output, f.path, tweakField(f))
        expect(issues(stage, next), f.id).toEqual([])
      }
      const all = applyFieldEdits(output, fields, Object.fromEntries(fields.map((f) => [f.id, tweakField(f)])))
      expect(issues(stage, all)).toEqual([])
      expect(expandFields(stage, all).every((f) => f.value === tweakField(fields.find((x) => x.id === f.id)!))).toBe(true)
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

  // C-40(단원 리포트 6축): 역량 꼬리표는 고르기 칸 — 꼬리표가 없는 옛 출력에도 빈 칸을 내어 새로 붙일 수 있다
  it('competency is a pick field (six options); old outputs without the key get an empty field that can be filled, never cleared', () => {
    const s5 = fx('stage5-generate')
    const picks = expandFields(5, s5).filter((f) => f.options)
    expect(picks.map((f) => f.pattern)).toEqual(picks.map(() => 'items[].rubric.criteria[].competency'))
    expect(picks).toHaveLength(s5.items.reduce((n: number, it: { rubric: { criteria: unknown[] } }) => n + it.rubric.criteria.length, 0))
    expect(picks[0].options).toEqual(['지식·이해', '자료 읽기', '근거 들어 설명하기', '글로 표현하기', '과정·기능', '가치·태도'])
    expect(picks[0].value).toBe(s5.items[0].rubric.criteria[0].competency)
    expect(expandFields(3, output).filter((f) => f.options)).toHaveLength(15)

    const old = structuredClone(s5)
    for (const it of old.items) for (const c of it.rubric.criteria) delete c.competency
    const fields = expandFields(5, old)
    const empty = fields.filter((f) => f.options)
    expect(empty).toHaveLength(picks.length)
    expect(empty.every((f) => f.value === '')).toBe(true)
    // 아무것도 고르지 않으면 출력은 그대로(키가 생기지 않는다)
    expect(applyFieldEdits(old, fields, Object.fromEntries(fields.map((f) => [f.id, f.value])))).toEqual(old)
    const next = applyFieldEdits(old, fields, { [empty[1].id]: '자료 읽기' })
    expect(next.items[0].rubric.criteria[1].competency).toBe('자료 읽기')
    expect(next.items[0].rubric.criteria[0]).not.toHaveProperty('competency')
    expect(validateEdited(5, next, fields)).toBeNull()
    // 빈 값으로는 되돌리지 않는다, 목록 밖의 값은 형식 검사가 그 칸을 짚는다
    expect(applyFieldEdits(s5, expandFields(5, s5), { [picks[0].id]: '' })).toEqual(s5)
    const bad = applyFieldEdits(s5, expandFields(5, s5), { [picks[0].id]: '창의성' })
    expect(validateEdited(5, bad, expandFields(5, s5))?.fieldId).toBe(picks[0].id)
    // 글 칸은 여전히 없는 키를 만들지 않는다
    expect(() => setAtPath(s5, ['items', 0, 'nope'], 'x')).toThrow(/no such path/)
  })

  it('validateEdited points at the field whose sentence broke the schema', () => {
    const fields = expandFields(3, output)
    const next = applyFieldEdits(output, fields, { 'lessons.0.goal': '짧음' })
    expect(validateEdited(3, next, fields)?.fieldId).toBe('lessons.0.goal')
    expect(validateEdited(3, output, fields)).toBeNull()
  })
})

// S-영-08(대표 2026-09-29): 관리자가 번역 문장(자료 제목·본문, 예시답안)을 「문장 고치기」로 고친다(HITL)
describe('stage 6 translations on an English guide (S-영-08)', () => {
  const output = englishGuide()
  const fields = expandFields(6, output)
  it('title_ko·body_ko·text_ko become fields (null body_ko is skipped), grouped under translations with readable labels', () => {
    const tr = fields.filter((f) => ENGLISH_ONLY(f.pattern))
    expect(tr.map((f) => f.id)).toEqual([
      'translations.materials.0.title_ko', 'translations.materials.0.body_ko', 'translations.materials.1.title_ko',
      'translations.exemplar_answers.0.text_ko', 'translations.exemplar_answers.1.text_ko', 'translations.exemplar_answers.2.text_ko',
    ])
    expect(tr.map((f) => copy.labels[f.pattern](f.indices, f.parent))).toEqual([
      '자료 E 제목 번역', '자료 E 본문 번역', '자료 F 제목 번역', '1번 문항 예시답안 6점 번역', '2번 문항 예시답안 상 번역', '2번 문항 예시답안 중 번역',
    ])
    const group = groupFields(fields).find((g) => g.top === 'translations')!
    expect(copy.groups[group.top](group.tag)).toBe('영문 자료·예시답안 번역 (교사용)')
  })
  it('editing every translation field still validates with STAGE_SCHEMAS[6]', () => {
    const tr = fields.filter((f) => ENGLISH_ONLY(f.pattern))
    const next = applyFieldEdits(output, tr, Object.fromEntries(tr.map((f) => [f.id, tweak(f.value)])))
    expect(issues(6, next)).toEqual([])
    expect(next.translations.materials[0].title_ko).toBe(tweak(output.translations.materials[0].title_ko))
    expect(output.translations.materials[0].title_ko).toBe('친환경 부스 안내')
  })
})
