// 관리자 미리보기(draftSnapshot)와 게시는 item_sets 열로 스냅샷을 만든다. 0011 이전에 만든 초안 열은 v1 모양일 수 있다 —
// buildSnapshot 이 v1 조각만 골라 v2 로 올려야 PackageView 가 터지지 않는다(Task 5 알려진 틈).
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { withMaterialDefaults, upgradeDraftColumns } from '@/lib/studio/draft-defaults'
import { buildSnapshot } from '@/lib/studio/publish'
import { Lesson, PublishedAssessment, TeacherGuide, Material } from '@/lib/studio/schemas'

const v1 = (f: string) => JSON.parse(readFileSync(`tests/fixtures/v1/${f}`, 'utf8'))
const v2 = (f: string) => JSON.parse(readFileSync(`data/studio-fixtures/${f}`, 'utf8'))

describe('withMaterialDefaults', () => {
  it('turns a v1 string source into the v2 object and fills role/images', () => {
    expect(withMaterialDefaults({ id: 'A', title: 't', kind: 'text', body: 'b', table: null, source: '자작' })).toEqual({ id: 'A', title: 't', kind: 'text', body: 'b', table: null, source: { kind: '자작', attribution: null, ai_assisted: false }, role: 'raw', images: [] })
  })
  it('keeps a v2 material as it is (context role, attribution, images)', () => {
    const m = { id: 'D', title: 't', kind: 'text', body: 'b', table: null, source: { kind: '공개', attribution: '통계청(2024)', ai_assisted: true }, role: 'context', images: ['https://x.test/a.png'] }
    expect(withMaterialDefaults(m)).toEqual(m)
  })
})

describe('upgradeDraftColumns', () => {
  const v1Cols = () => ({
    learning_goals: v1('stage2-generate.json').learning_goals, lessons: v1('stage3-generate.json').lessons,
    materials: v1('stage4-generate.json').materials, assessment: v1('stage5-generate.json'), teacher_guide: v1('stage6-generate.json'),
  })
  it('upgrades v1-shaped draft columns to v2 shapes', () => {
    const c = upgradeDraftColumns(v1Cols())
    expect(c.learning_goals.every((g) => typeof g === 'object' && g.axis)).toBe(true)
    for (const l of c.lessons) {
      expect(Array.isArray(l.flow.intro)).toBe(true)
      expect(l.flow.main.length).toBeGreaterThanOrEqual(1)
      expect(Array.isArray(l.formative_check.quiz)).toBe(true)
      expect(Array.isArray(l.worksheet.tasks)).toBe(true)
    }
    // v1 초안은 옛 구조(서술형 2 + 논술형) 그대로 올린다 — 게시 판 읽기 스키마로 확인, 새 5단계로는 다시 만든다
    expect(PublishedAssessment.safeParse(c.assessment).success).toBe(true)
    // 옛 판 정리(C-32): 서술형은 조건 없음, 논술형은 풀이 힌트를 지운 지침만 1~4개 남는다
    expect(c.assessment!.items[0].kind).toBe('서술형'); expect(c.assessment!.items[0].conditions.items.length).toBe(0)
    const essay = c.assessment!.items.find((it) => it.kind === '논술형')!
    expect(essay.conditions.items.length).toBeGreaterThan(0); expect(essay.conditions.items.length).toBeLessThanOrEqual(4)
    expect(c.teacher_guide!.grading_guide.review_tips.length).toBeGreaterThanOrEqual(2)
    expect(c.materials.every((m) => typeof m.source === 'object')).toBe(true)
  })
  it('leaves v2 columns untouched (same objects) and upgrades only the v1 parts of a mixed draft', () => {
    const lessons = v2('stage3-generate.json').lessons
    const assessment = v2('stage5-generate.json')
    const guide = v2('stage6-generate.json')
    const same = upgradeDraftColumns({ learning_goals: v2('stage2-generate.json').learning_goals, lessons, materials: v2('stage4-generate.json').materials, assessment, teacher_guide: guide })
    expect(same.lessons).toBe(lessons); expect(same.assessment).toBe(assessment); expect(same.teacher_guide).toBe(guide)
    const mixed = upgradeDraftColumns({ learning_goals: null, lessons, materials: null, assessment: v1('stage5-generate.json'), teacher_guide: v1('stage6-generate.json') })
    expect(mixed.lessons).toBe(lessons)
    expect(mixed.assessment!.items[2].rubric.criteria).toHaveLength(4)
    expect(TeacherGuide.safeParse(mixed.teacher_guide).success).toBe(true)
  })
  it('buildSnapshot runs the guard: a v1 draft becomes a v2 snapshot', () => {
    const cols = v1Cols()
    const snap = buildSnapshot({
      theme: { title: '축제', level: '중', grade: 1, intro: null, materials: [{ id: 'A', title: '공유', kind: 'text', body: 'b', table: null, source: '자작' }] as never },
      itemSet: { subject: '수학', level: '중', grade: 1, reconstruction: v1('stage2-generate.json').reconstruction, reconstruction_detail: null, key_question: 'q', unit_plan: null, notice_plan: null, stage_status: {}, ...cols } as never,
      standards: [], version: 1,
    })
    expect(snap.schema_version).toBe(2)
    expect(snap.lessons.every((l) => Array.isArray(l.flow.intro))).toBe(true)
    expect(snap.materials.every((m) => Material.safeParse(m).success)).toBe(true)
    expect(Lesson.safeParse(snap.lessons[0]).success || Array.isArray(snap.lessons[0].flow.main)).toBe(true)
    expect(snap.assessment!.items.every((i) => i.exemplar_answers.length > 0)).toBe(true)
  })
})
