// tests/compat.test.ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { upgradeSnapshot, isV1Snapshot, statesAnswer, upgradeLessonV1, upgradeAssessmentV1, splitMainV1, axisOf, buildReconstructionV2, upgradeTeacherGuideV1, splitMaterialsV1, evaluationElement, topicFromGoal, normalizeSnapshotV2, unitPlanFrom, cleanMaterialTitle } from '@/lib/studio/compat'
import { Reconstruction } from '@/lib/studio/schemas'
import { Lesson, Assessment, PublishedAssessment, PublishedLessonDesign, Materials, TeacherGuide } from '@/lib/studio/schemas'
import { structureOf } from '@/lib/studio/assessment-structure'
import { conditionHints, materialNumbers } from '@/lib/studio/checks'

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
    // 옛 판은 옛 구조 그대로 읽는다(스펙 §4.3): 게시 판 읽기 스키마는 통과하고, 새 세트 스키마(2문항)는 통과하지 않는다
    expect(PublishedLessonDesign.safeParse({ unit_plan: s.unit_plan, lessons: s.lessons }).error?.issues ?? []).toEqual([])
    expect(Materials.safeParse({ materials: s.materials }).success).toBe(true)
    expect(PublishedAssessment.safeParse(s.assessment).error?.issues ?? []).toEqual([])
    expect(Assessment.safeParse(s.assessment).success).toBe(false)
    expect(structureOf(s.assessment!.items)).toBe('legacy')
    expect(TeacherGuide.safeParse(s.teacher_guide).error?.issues ?? []).toEqual([])
    // 문항 번호·차시·배점은 그대로(학생 답안 item_no 1~3과 열린 차시가 그대로 맞는다), 차시 라벨만 배열로
    expect(s.assessment!.items.map((i) => [i.kind, i.lesson_no, i.points])).toEqual([['서술형', 2, 3], ['서술형', 4, 3], ['논술형', 5, 16]])
    expect(s.lessons.map((l) => [l.no, l.kind, l.assessment])).toEqual([[1, 'teaching', []], [2, 'teaching', ['서술형']], [3, 'teaching', []], [4, 'teaching', ['서술형']], [5, 'assessment', ['논술형']]])
    expect(s.unit_plan!.assessment_plan.summative_placement).toEqual([{ lesson_no: 2, kind: '서술형' }, { lesson_no: 4, kind: '서술형' }, { lesson_no: 5, kind: '논술형' }])
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
    expect(PublishedLessonDesign.safeParse({ unit_plan: s.unit_plan, lessons: s.lessons }).error?.issues ?? []).toEqual([])
    expect(Materials.safeParse({ materials: s.materials }).success).toBe(true)
    expect(PublishedAssessment.safeParse(s.assessment).error?.issues ?? []).toEqual([])
    expect(structureOf(s.assessment!.items)).toBe('legacy')
    expect(TeacherGuide.safeParse(s.teacher_guide).error?.issues ?? []).toEqual([])
    // JSON 왕복(DB 저장 후 다시 읽은 v2 판)도 그대로 둔다
    const again = upgradeSnapshot(JSON.parse(JSON.stringify(s)))
    expect(again).toEqual(s)
  })
})

describe('옛 v2 판(2026-09-26 이전)의 모양 맞추기', () => {
  // 구조 변경 전 v2 로 게시된 판: 차시 assessment 가 문자열('서술형1'·'서술형2'·'논술형')·null 이고 kind 가 없다
  const early = () => {
    const lessons = v1('stage3-generate').lessons.map((l: Parameters<typeof upgradeLessonV1>[0]) => {
      const up = upgradeLessonV1(l, []) as unknown as Record<string, unknown>
      delete up.kind
      return { ...up, assessment: l.assessment }
    })
    return {
      schema_version: 2 as const, cover: { title: 't', subject: '수학', level: '중', grade: 1, version: 1, published_at: '' }, standards: [], intro: '', reconstruction: '', reconstruction_detail: [], learning_goals: [], key_question: '',
      unit_plan: { set_title: 't', set_key_question: '자료는 무엇을 말하는가?', lesson_map: [], assessment_plan: { formative: '차시별 퀴즈', summative_placement: [{ lesson_no: 2, kind: '서술형1' }, { lesson_no: 4, kind: '서술형2' }, { lesson_no: 5, kind: '논술형' }], rubric_note: { 상: '', 중: '', 하: '' } } },
      lessons, materials: [], assessment: upgradeAssessmentV1(v1('stage5-generate')), teacher_guide: null, notice_plan: null, references: [], generated_with: { models: [] },
    }
  }
  it('labels become arrays, the old 논술형 lesson becomes kind "assessment", nothing else moves', () => {
    const s = upgradeSnapshot(early())
    expect(s.lessons.map((l) => [l.kind, l.assessment])).toEqual([['teaching', []], ['teaching', ['서술형']], ['teaching', []], ['teaching', ['서술형']], ['assessment', ['논술형']]])
    expect(s.unit_plan!.assessment_plan.summative_placement.map((p) => p.kind)).toEqual(['서술형', '서술형', '논술형'])
    expect(s.assessment!.items).toHaveLength(3)
    expect(PublishedLessonDesign.safeParse({ unit_plan: { ...s.unit_plan!, lesson_map: s.lessons.map((l) => ({ lesson_no: l.no, standards: l.standards, topic: l.topic })) }, lessons: s.lessons }).error?.issues ?? []).toEqual([])
  })
  it('a snapshot that is already in shape is returned as the same object', () => {
    const s = upgradeSnapshot(early())
    expect(normalizeSnapshotV2(s)).toBe(s); expect(upgradeSnapshot(s)).toBe(s)
  })
  it('채점표 척도가 만점부터(내림차순) 저장된 판은 0점부터 오름차순으로 맞춘다 — 고칠 것이 없으면 같은 객체(2026-09-25 영어 세트)', () => {
    const s = upgradeSnapshot(early())
    const desc = structuredClone(s)
    for (const it of desc.assessment!.items) for (const c of it.rubric.criteria) c.scale.reverse()
    expect(desc.assessment!.items[0].rubric.criteria[0].scale[0].points).toBeGreaterThan(0)
    const fixed = upgradeSnapshot(desc)
    expect(fixed).not.toBe(desc)
    for (const it of fixed.assessment!.items) for (const c of it.rubric.criteria) expect(c.scale.map((x) => x.points)).toEqual(Array.from({ length: c.max + 1 }, (_, p) => p))
    expect(fixed.assessment).toEqual(s.assessment)
    expect(upgradeSnapshot(fixed)).toBe(fixed)
  })
  it('unitPlanFrom writes one placement per assessed kind (단원 평가 차시 = two placements on one lesson)', () => {
    const lessons = v1('stage3-generate').lessons.map((l: Parameters<typeof upgradeLessonV1>[0]) => upgradeLessonV1(l, []))
    const session = { ...lessons[4], no: 6, kind: 'assessment' as const, assessment: ['서술형' as const, '논술형' as const] }
    const plan = unitPlanFrom('t', 'q', [...lessons.slice(0, 4).map((l: typeof lessons[number]) => ({ ...l, assessment: [] })), { ...lessons[4], kind: 'teaching' as const, assessment: [] }, session], null)
    expect(plan.assessment_plan.summative_placement).toEqual([{ lesson_no: 6, kind: '서술형' }, { lesson_no: 6, kind: '논술형' }])
    expect(plan.assessment_plan.formative).toMatch(/교수 차시마다/)
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

describe('compat v1 업그레이드 흔적 없애기 (fix wave I3)', () => {
  type V1L = Parameters<typeof upgradeLessonV1>[0]
  for (const sfx of ['', '-과학']) {
    it(`upgradeLessonV1${sfx}: 활동지 expected·발문 expected_answer 가 차시 목표 문장을 되쓰지 않고, if_stuck 에 "N분 —" 머리말이 없다`, () => {
      const lessons = v1(`stage3-generate${sfx}`).lessons as V1L[]
      const goals = lessons.map((l) => l.goal.trim())
      for (const raw of lessons) {
        const l = upgradeLessonV1(raw, [])
        expect(Lesson.safeParse(l).success).toBe(true)
        for (const t of l.worksheet.tasks) expect(goals, `${l.no}차시 활동지 ${t.no}`).not.toContain(t.expected.trim())
        for (const q of l.teacher_script.questions) {
          expect(goals, `${l.no}차시 발문 ${q.prompt}`).not.toContain(q.expected_answer.trim())
          expect(q.if_stuck).not.toMatch(/\d+\s*분\s*—/)
          // 힌트가 예상 답을 그대로 말하지 않는다(L-06)
          if (q.expected_answer.length >= 4) expect(q.if_stuck).not.toContain(q.expected_answer)
        }
      }
    })
  }
  it('도전 과제 기본값은 핵심질문에서 만든 교사 확인 문장이다(목표 문장 아님)', () => {
    const raw = (v1('stage3-generate').lessons as V1L[])[0]
    const challenge = upgradeLessonV1(raw, []).worksheet.tasks.find((t) => t.tier === '도전')!
    expect(challenge.expected).toMatch(/^교사 확인: /); expect(challenge.expected).toContain(raw.key_question.replace(/[?？]$/, ''))
  })
  it('upgradeItemV1: 서술형 예시답안 text 는 채점표 서술을 덧붙이지 않고, 그 서술은 rationale 로 간다', () => {
    for (const sfx of ['', '-과학']) {
      const src = v1(`stage5-generate${sfx}`)
      const a = upgradeAssessmentV1(src)
      expect(PublishedAssessment.safeParse(a).error?.issues ?? []).toEqual([])
      for (const [i, it] of a.items.entries()) {
        for (const e of it.exemplar_answers) expect(e.text, `${sfx} 문항 ${i + 1} ${e.points}점`).not.toContain(' — ')
        const levels = (src.items[i].rubric as { levels?: { points: number; expectation: string; example: string | null }[] }).levels
        for (const lv of (levels ?? []).filter((x) => x.points > 0 && x.example)) {
          const e = it.exemplar_answers.find((x) => x.points === lv.points)!
          expect(e.text).toContain(lv.example!); expect(e.rationale).toContain(lv.expectation)
        }
      }
    }
  })
})

describe('statesAnswer (L-06: 힌트가 정답을 그대로 말하는가)', () => {
  it('수는 한 글자라도 낱개로 나오면 말한 것, 다른 수의 일부는 아니다; 글자는 공백을 빼고 두 글자 이상', () => {
    expect(statesAnswer('상대도수는 도수 ÷ 도수의 총합이며, 그 총합은 항상 1이다.', '1')).toBe(true)
    expect(statesAnswer('계급의 크기 10일 때 도수는 30~40: 6으로 주어져 있다.', '6')).toBe(true)
    expect(statesAnswer('자료 A의 40번대 값 41·42·44·45·47', '1')).toBe(false)
    expect(statesAnswer('70 − 10 = 60을 5씩 나누면 60 ÷ 5 = 12개이다.', '12개')).toBe(true)
    expect(statesAnswer('240 ÷ 1,350 을 계산한 값이다.', '0.18')).toBe(false)
    expect(statesAnswer('자료 수집으로 가설을 확인한다.', '자료수집')).toBe(true)
    expect(statesAnswer('가설에 해당한다.', '가')).toBe(false)
  })
})

describe('topicFromGoal (v1 차시 목표 문장 → 짧은 주제, 원장 헤딩·안내장에 그대로 보임)', () => {
  it('대표님이 실제로 본 목표 문장: 마침표를 떼고 "~한다"를 "~하기"로 바꾼다("정한" 같은 관형사형으로 남기지 않는다)', () => {
    const goal = '축제 쓰레기 문제에서 통계적 탐구 문제를 세우고, 조사 항목·대상·방법을 정한다.'
    expect(topicFromGoal(goal)).toBe('축제 쓰레기 문제에서 통계적 탐구 문제를 세우고, 조사 항목·대상·방법을 정하기')
  })
  it('48자를 넘는 목표: 경계에서 잘라 "…"를 붙이고, 조사 하나만 남는 조각으로 끝나지 않는다', () => {
    const goal = '학생들은 지역 사회에서 발생하는 여러 환경 문제 가운데 하나를 스스로 선택해 원인과 현황을 조사하고, 조사한 자료를 근거로 해결 방안을 제안하는 보고서를 작성한다.'
    const topic = topicFromGoal(goal)
    expect(topic).toBe('학생들은 지역 사회에서 발생하는 여러 환경 문제 가운데 하나를 스스로 선택해…')
    expect(topic.length).toBeLessThanOrEqual(49) // 48자 + '…'
    expect(topic.replace(/…$/u, '')).not.toMatch(/(을|를|이|가|은|는|와|과|의|에|에서)$/u) // 조사로 끝나지 않는다(원래 버그 모양)
    expect(goal.startsWith(topic.replace(/…$/u, ''))).toBe(true) // 잘린 부분은 원문의 앞부분 그대로다(단어 중간 변형 없음)
    expect(goal[topic.replace(/…$/u, '').length]).toMatch(/[\s·,]/u) // 잘린 지점 바로 다음 글자가 경계문자다(어절 중간이 아니다)
  })
  it('"~한다"(하다 동사)는 "~하기"로, "~는다"(받침 있는 동사)는 "~기"로 바꾼다', () => {
    expect(topicFromGoal('둘레의 길이를 구한다')).toBe('둘레의 길이를 구하기') // 하다 동사: 구한다 → 구하기 (마침표 없어도 동작)
    expect(topicFromGoal('자료를 읽는다.')).toBe('자료를 읽기') // 받침 있는 동사: 읽는다 → 읽기
  })
  it('ㄹ 탈락 어간은 예외로만 되돌린다(만든다 → 만들기)', () => {
    expect(topicFromGoal('도수분포표를 만든다.')).toBe('도수분포표를 만들기')
  })
  it('그 밖의 "~다"로 끝나는 문장은 관형사형으로 자르지 않고 문장을 통째로 둔다(세운다·안다·그린다는 규칙으로 되돌릴 수 없다)', () => {
    expect(topicFromGoal('정삼각형의 뜻을 안다.')).toBe('정삼각형의 뜻을 안다')
    expect(topicFromGoal('그래프를 그린다.')).toBe('그래프를 그린다')
    expect(topicFromGoal('조사 항목·대상·방법을 세운다.')).toBe('조사 항목·대상·방법을 세운다')
  })
})

// 옛 판을 읽을 때 조건에서 풀이 힌트를 지운다(C-32, 2026-09-26 owner rule; fix wave): 서술형은 조건 없음,
// 논술형은 지침만 남긴다(풀이 절차·공식·수치·순서어가 없고, 참조 자료의 수치를 새로 흘리지 않는다).
describe('옛 판 조건 정리 — 풀이 힌트 제거(C-32)', () => {
  const buildV1 = (subject: '수학' | '과학') => {
    const sfx = subject === '과학' ? '-과학' : ''
    const k = (stage: number) => v1(`stage${stage}-generate${sfx}`)
    return {
      cover: { title: 't', subject, level: '중', grade: 1, version: 1, published_at: '2026-09-20T00:00:00.000Z' },
      standards: subject === '과학' ? fx('standards-science') : fx('standards-math'),
      intro: '소개', reconstruction: k(2).reconstruction, learning_goals: k(2).learning_goals, key_question: k(2).key_question_candidates[0],
      lessons: k(3).lessons, materials: k(4).materials, assessment: k(5), teacher_guide: k(6), generated_with: { models: ['mock'] },
    }
  }

  it.each(['수학', '과학'] as const)('%s: 서술형은 조건 0개, 논술형 조건은 풀이 힌트가 없고 자료 수치를 새로 흘리지 않는다', (subject) => {
    const s = upgradeSnapshot(buildV1(subject))
    const materials = s.materials
    let sawEssay = false
    for (const it of s.assessment!.items) {
      if (it.kind === '서술형') { expect(it.conditions.items).toEqual([]); continue }
      sawEssay = true
      const used = materials.filter((m) => it.materials_used.includes(m.id))
      const nums = materialNumbers(used)
      for (const c of it.conditions.items) {
        expect(conditionHints(c.text, nums), `${subject} ${it.lesson_no}차시 조건 ${c.no}: ${c.text}`).toEqual([])
        const numsInText = (c.text.match(/\d+(?:[.,]\d+)*/g) ?? []).map((n) => n.replace(/,/g, '')).filter((n) => n.includes('.') || n.length >= 2)
        for (const n of numsInText) expect(nums.has(n), `${subject} ${it.lesson_no}차시 조건 ${c.no}: 자료 수치 ${n}가 남음`).toBe(false)
      }
    }
    expect(sawEssay).toBe(true)
  })

  it('idempotent: 이미 정리된 판을 다시 올려도 조건이 더 바뀌지 않는다', () => {
    const s = upgradeSnapshot(buildV1('수학'))
    const again = upgradeSnapshot(JSON.parse(JSON.stringify(s)))
    expect(again.assessment).toEqual(s.assessment)
    expect(upgradeSnapshot(s)).toBe(s)   // 같은 객체(고칠 것이 없으면 새로 만들지 않는다)
  })

  it('2026-09-26 이전에 v2로 저장된 판(schema_version 2)에 남은 풀이 힌트 조건도 읽을 때 지운다', () => {
    const s = upgradeSnapshot(buildV1('수학'))
    const dirty = structuredClone(s)
    const essay = dirty.assessment!.items.find((it) => it.kind === '논술형')!
    const originalCount = essay.conditions.items.length
    const hinted = { no: originalCount + 1, text: '자료 A의 수치 290 ÷ 1200 을 계산해 적을 것', verb: '계산하다', points: null, category: '내용' as const }
    essay.conditions.items = [...essay.conditions.items, hinted]
    for (const cr of essay.rubric.criteria) cr.condition_nos = essay.conditions.items.map((x) => x.no)

    const cleaned = upgradeSnapshot(dirty)
    const cleanedEssay = cleaned.assessment!.items.find((it) => it.kind === '논술형')!
    expect(cleanedEssay.conditions.items.some((c) => c.text.includes('290'))).toBe(false)
    expect(cleanedEssay.conditions.items).toHaveLength(originalCount)
    expect(cleanedEssay.conditions.items.map((c) => c.no)).toEqual(cleanedEssay.conditions.items.map((_, i) => i + 1))
    for (const cr of cleanedEssay.rubric.criteria) expect(cr.condition_nos).toEqual(cleanedEssay.conditions.items.map((c) => c.no))
    // 서술형에 조건이 남아 있는 v2 판도 같은 자리에서 지워진다
    const dirtyShort = structuredClone(s)
    const short = dirtyShort.assessment!.items.find((it) => it.kind === '서술형')!
    short.conditions.items = [{ no: 1, text: '아무 조건', verb: '쓰다', points: null, category: '내용' as const }]
    for (const cr of short.rubric.criteria) cr.condition_nos = [1]
    const cleanedShort = upgradeSnapshot(dirtyShort).assessment!.items.find((it) => it.kind === '서술형')!
    expect(cleanedShort.conditions.items).toEqual([])
    for (const cr of cleanedShort.rubric.criteria) expect(cr.condition_nos).toEqual([])
  })

  it('math 논술형: v1 조건 4개 중 풀이 힌트 없는 3개만 남는다(순서 유지, 자리 다시 매김)', () => {
    const s = upgradeSnapshot(buildV1('수학'))
    const essay = s.assessment!.items.find((it) => it.kind === '논술형')!
    expect(essay.conditions.items.map((c) => c.text)).toEqual([
      '자료 A(도수분포표 또는 히스토그램)와 자료 B(상대도수)에서 수치를 두 개 이상 인용해 가장 먼저 줄일 일회용품 한 가지를 고른다',
      '예상되는 반대 의견 한 가지와 그에 대한 답',
      '계급·도수·상대도수 용어를 바르게 쓴다',
    ])
    expect(essay.conditions.items.map((c) => c.no)).toEqual([1, 2, 3])
  })
})

// 대표 지시(2026-09-26): 자료 제목의 자작·가상 같은 출처 표기는 화면 어디에도 보이지 않는다(출처는 source 필드에만) — 보여 줄 때 지운다.
describe('cleanMaterialTitle (자료 제목의 출처 표기 정리)', () => {
  it('단독 표기 낱말을 담은 괄호는 통째로 지운다', () => {
    expect(cleanMaterialTitle('영어권 중학교 축제 친환경 안내문 (가상)')).toBe('영어권 중학교 축제 친환경 안내문')
    expect(cleanMaterialTitle('학생회 설문 결과표(자작)')).toBe('학생회 설문 결과표')
    expect(cleanMaterialTitle('부스 운영 계획 (본사 자작)')).toBe('부스 운영 계획')
    expect(cleanMaterialTitle('공공누리 통계 자료 (공개 자료)')).toBe('공공누리 통계 자료')
  })
  it('표기 낱말과 설명이 함께 있으면 설명만 남긴다', () => {
    expect(cleanMaterialTitle('학생 설문 결과 (학생회 조사, 가상)')).toBe('학생 설문 결과 (학생회 조사)')
  })
  it('표기 낱말이 없는 제목은 그대로 둔다', () => {
    expect(cleanMaterialTitle('학생회 설문 결과')).toBe('학생회 설문 결과')
    expect(cleanMaterialTitle('일회용품 사용량 (2024년 기준)')).toBe('일회용품 사용량 (2024년 기준)')
  })
})
