// tests/compat.test.ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { upgradeSnapshot, isV1Snapshot, upgradeLessonV1, upgradeAssessmentV1, splitMainV1, axisOf, buildReconstructionV2, upgradeTeacherGuideV1, splitMaterialsV1, evaluationElement } from '@/lib/studio/compat'
import { Reconstruction } from '@/lib/studio/schemas'
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
    expect(l.formative_check.quiz).toHaveLength(3); expect(l.flow.main.reduce((s, m) => s + m.minutes, 0)).toBe(40)
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

describe('compat 보강 (T6)', () => {
  it('splitMainV1: ①② 표식으로 나눠 20/20분 두 소단계, 표식 앞머리("전개 40분 —")는 버림, 표식이 없으면 40분 한 단계', () => {
    const two = splitMainV1('① 가 ② 나 ③ 다 ④ 라')
    expect(two).toEqual([{ step_label: '개념·활동', minutes: 20, activities: ['① 가', '② 나'] }, { step_label: '적용·정리', minutes: 20, activities: ['③ 다', '④ 라'] }])
    const headed = splitMainV1('전개 40분 — ① 가 ② 나 ③ 다')
    expect(headed.map((m) => m.activities)).toEqual([['① 가', '② 나'], ['③ 다']])
    expect(splitMainV1('표식 없는 전개')).toEqual([{ step_label: '전개', minutes: 40, activities: ['표식 없는 전개'] }])
  })
  it('axisOf: 요소 이름의 낱말로 축을 고른다', () => {
    expect(axisOf('제안과 근거의 연결')).toBe('가치·태도')
    expect(axisOf('실천 가능성(개인·사회 구분)')).toBe('가치·태도')
    expect(axisOf('자료 정리의 정확성')).toBe('지식·이해')
    expect(axisOf('해석의 타당성')).toBe('과정·기능')
    expect(axisOf('서술형 채점표')).toBe('과정·기능')
  })
  it('upgradeLessonV1: 논술형 차시는 안내 5분 + 논술형 작성 35분 두 소단계', () => {
    const essay = v1('stage3-generate').lessons.find((l: { assessment: string | null }) => l.assessment === '논술형')
    const l = upgradeLessonV1(essay, [])
    expect(l.flow.main.length).toBe(2)
    expect(l.flow.main.some((m) => m.step_label.includes('논술형') && m.minutes >= 35)).toBe(true)
    expect(l.flow.main.reduce((s, m) => s + m.minutes, 0)).toBe(l.time_budget.main_min)
    expect(Lesson.safeParse(l).success).toBe(true)
  })
  it('upgradeAssessmentV1: 0점 서술에 무응답·시도 구분, 논술형 요소 축에 가치·태도가 있다', () => {
    const a = upgradeAssessmentV1(v1('stage5-generate'))
    for (const it of a.items) for (const c of it.rubric.criteria) {
      const zero = c.scale.find((s) => s.points === 0)!.descriptor
      expect(zero).toMatch(/무응답/); expect(zero).toMatch(/시도/)
    }
    expect(a.items[2].rubric.criteria.map((c) => c.axis)).toContain('가치·태도')
    expect(a.items[0].rubric.criteria[0].axis).toBe('과정·기능')
  })
  it('splitMaterialsV1: 한 문장에 자료가 여럿이면 모두 잡는다(PET·PP 같은 약어는 자료가 아님)', () => {
    expect(splitMaterialsV1(['자료 D와 자료 E를 근거로 쓴다', 'PET·PP 컵', '자료 B'])).toEqual({ used: ['B', 'D', 'E'], needed: ['PET·PP 컵'] })
    const a = upgradeAssessmentV1(v1('stage5-generate-과학'))
    expect(a.items.map((i) => i.materials_used)).toEqual([['D', 'E'], ['D', 'E'], ['B', 'D']])
  })
  it('evaluationElement: 문두 끝의 "~시오"를 "~기" 명사형으로(동사 어간은 남김, C-18)', () => {
    const cases: [string, string][] = [
      ['도수가 가장 큰 계급을 쓰시오. (3점)', '도수가 가장 큰 계급을 쓰기'],
      ['상대도수를 구하시오.', '상대도수를 구하기'],
      ['판단한 이유를 서술하시오. [16점]', '판단한 이유를 서술하기'],
      ['제안서를 작성하시오.', '제안서를 작성하기'],
      ['알맞은 방안을 고르시오.', '알맞은 방안을 고르기'],
      ['감축 목표를 정하시오.', '감축 목표를 정하기'],
      ['도수분포표로 나타내시오.', '도수분포표로 나타내기'],
      ['히스토그램을 만드시오.', '히스토그램을 만들기'],
    ]
    for (const [stem, want] of cases) expect(evaluationElement(stem)).toBe(want)
  })
  it('upgradeTeacherGuideV1: 병합 쌍은 한 번씩만(1↔2 를 [1,2]·[2,1] 두 번 적지 않음)', () => {
    const lessons = v1('stage3-generate').lessons.map((l: Parameters<typeof upgradeLessonV1>[0]) => upgradeLessonV1(l, []))
    const g = upgradeTeacherGuideV1(v1('stage6-generate'), lessons, null)
    expect(g.merge_guide.map((m) => m.lessons)).toEqual([[1, 2], [3, 4]])
  })
  it('buildReconstructionV2: 세 축이 모두 있는 학습 목표와 원문 그대로의 재구조화 표', () => {
    const standards = fx('standards-math')
    const r = buildReconstructionV2(v1('stage2-generate'), standards)
    expect(Reconstruction.safeParse(r).error?.issues ?? []).toEqual([])
    expect(new Set(r.learning_goals.map((g) => g.axis)).size).toBe(3)
    expect(r.standards.map((s) => s.original_text)).toEqual(standards.map((s: { text: string }) => s.text))
    expect(r.level_anchor).toEqual([])
  })
})
