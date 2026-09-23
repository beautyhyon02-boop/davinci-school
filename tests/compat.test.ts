// tests/compat.test.ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { upgradeSnapshot, isV1Snapshot, upgradeLessonV1, upgradeAssessmentV1 } from '@/lib/studio/compat'
import { Lesson, Assessment, LessonDesign, Materials, TeacherGuide } from '@/lib/studio/schemas'

const fx = (k: string) => JSON.parse(readFileSync(`data/studio-fixtures/${k}.json`, 'utf8'))
// v1 fixture 는 T6 에서 v2 로 바뀌므로, 이 테스트는 git 에 남는 v1 사본(tests/fixtures/v1/*.json, Step 8에서 복사)을 읽는다
const v1 = (k: string) => JSON.parse(readFileSync(`tests/fixtures/v1/${k}.json`, 'utf8'))

describe('upgradeSnapshot (v1 → v2)', () => {
  const snapshotV1 = {
    cover: { title: '학교 축제, 일회용품을 줄이자', subject: '수학', level: '중', grade: 1, version: 1, published_at: '2026-09-20T00:00:00.000Z' },
    standards: JSON.parse(readFileSync('data/studio-fixtures/standards-math.json', 'utf8')),
    intro: '소개', reconstruction: v1('stage2-generate').reconstruction, learning_goals: v1('stage2-generate').learning_goals, key_question: '자료는 무엇을 먼저 줄이라고 말하는가?',
    lessons: v1('stage3-generate').lessons, materials: v1('stage4-generate').materials, assessment: v1('stage5-generate'), teacher_guide: v1('stage6-generate'),
    generated_with: { models: ['mock'] },
  }
  it('detects v1 and produces a snapshot whose parts validate against v2 schemas', () => {
    expect(isV1Snapshot(snapshotV1)).toBe(true)
    const s = upgradeSnapshot(snapshotV1)
    expect(s.schema_version).toBe(2)
    expect(isV1Snapshot(s)).toBe(false)
    expect(LessonDesign.safeParse({ unit_plan: s.unit_plan, lessons: s.lessons }).error?.issues ?? []).toEqual([])
    expect(Materials.safeParse({ materials: s.materials }).success).toBe(true)
    expect(Assessment.safeParse(s.assessment).error?.issues ?? []).toEqual([])
    expect(TeacherGuide.safeParse(s.teacher_guide).error?.issues ?? []).toEqual([])
    expect(s.learning_goals[0]).toEqual({ text: v1('stage2-generate').learning_goals[0], axis: '과정·기능' })
    expect(s.reconstruction_detail.map((r) => r.code)).toEqual(['[9수04-02]', '[9수04-03]', '[9수04-04]'])
    expect(s.notice_plan).toBeNull(); expect(s.references).toEqual([])
  })
  it('lesson: materials split into ids/needed, quiz moves under formative_check, flow becomes arrays', () => {
    const l = upgradeLessonV1(v1('stage3-generate').lessons[0], [])
    expect(l.materials_used).toEqual(['A', 'B']); expect(l.materials_needed).toEqual(['축제 삽화 3장'])
    expect(l.formative_check.quiz).toHaveLength(3); expect(l.flow.main[0].minutes).toBe(40)
    expect(l.teacher_script.questions).toHaveLength(3)
    expect(Lesson.safeParse(l).success).toBe(true)
  })
  it('assessment: [종이 답안] prefix → answer_mode paper, stems end with [N점], exemplars move per item', () => {
    const a = upgradeAssessmentV1(v1('stage5-generate'))
    expect(a.items[0].conditions.answer_mode).toBe('paper'); expect(a.items[1].conditions.answer_mode).toBe('screen')
    expect(a.items[0].conditions.format.startsWith('[종이 답안]')).toBe(false)
    expect(a.items.every((i) => i.stem.endsWith(`[${i.points}점]`))).toBe(true)
    expect(a.items[2].exemplar_answers.map((e) => e.level)).toEqual(['상', '중', '하'])
    expect(a.grade_boundaries.find((b) => b.grade === 7)?.level_ref).toBe('A')
    expect('exemplars' in a).toBe(false)
  })
  it('refuses input that is not a snapshot with a clear error', () => {
    for (const bad of [{}, null, undefined, [], 'x', { cover: null }]) expect(() => upgradeSnapshot(bad)).toThrow('snapshot has no cover')
    expect(isV1Snapshot(null)).toBe(false); expect(isV1Snapshot('x')).toBe(false); expect(isV1Snapshot([])).toBe(false)
  })
  it('returns a v2 snapshot untouched', () => {
    const s = upgradeSnapshot(snapshotV1)
    expect(upgradeSnapshot(s)).toBe(s)
  })
  it('a lesson without quiz (논술형) still gets 2 script questions and 3 worksheet tiers', () => {
    const essay = v1('stage3-generate').lessons.find((l: { assessment: string | null }) => l.assessment === '논술형')
    const l = upgradeLessonV1(essay, ['논술형 35분은 조용히'])
    expect(l.teacher_script.questions.length).toBeGreaterThanOrEqual(2)
    expect(new Set(l.worksheet.tasks.map((t) => t.tier)).size).toBe(3)
    expect(l.caution_notes).toEqual(['논술형 35분은 조용히'])
    expect(Lesson.safeParse(l).success).toBe(true)
  })
  it('fixture v1 copies exist for the tests above', () => { expect(fx('standards-math')).toHaveLength(3) })
  it('과학 v1 fixtures upgrade to a v2 snapshot whose parts validate', () => {
    const k = (stage: number) => v1(`stage${stage}-generate-과학`)
    const s = upgradeSnapshot({
      cover: { title: '학교 축제, 일회용품을 줄이자', subject: '과학', level: '중', grade: 1, version: 1, published_at: '2026-09-20T00:00:00.000Z' },
      standards: fx('standards-science'), intro: '소개', reconstruction: k(2).reconstruction, learning_goals: k(2).learning_goals, key_question: k(2).key_question_candidates[0],
      lessons: k(3).lessons, materials: k(4).materials, assessment: k(5), teacher_guide: k(6), generated_with: { models: ['mock'] },
    })
    expect(LessonDesign.safeParse({ unit_plan: s.unit_plan, lessons: s.lessons }).error?.issues ?? []).toEqual([])
    expect(Materials.safeParse({ materials: s.materials }).success).toBe(true)
    expect(Assessment.safeParse(s.assessment).error?.issues ?? []).toEqual([])
    expect(TeacherGuide.safeParse(s.teacher_guide).error?.issues ?? []).toEqual([])
    // JSON 왕복(DB 저장 후 다시 읽은 v2 판)도 그대로 둔다
    const again = upgradeSnapshot(JSON.parse(JSON.stringify(s)))
    expect(again).toEqual(s)
  })
})
