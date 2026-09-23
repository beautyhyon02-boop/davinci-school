# 문항 제작소 v2 핵심(3~4일) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 5과목(국·영·수·과·사) 세트가 v2 형식(재구조화 표 · 60분 지도안+활동지 · 2025식 문항 카드 · 안내장 틀)으로 생성·게시되고, 원장·학생 화면이 새 모양을 읽으며, 기존 게시본은 읽을 때 v2로 올라간다. 5일차 대표님 검토용 실행 순서서까지.

**Architecture:** (1) `lib/studio/schemas.ts`를 v2로 바꾸고 `lib/studio/compat.ts`의 순수 함수 `upgradeSnapshot`이 v1 판을 읽을 때 v2로 올린다(DB 재작성 없음). (2) 지식 베이스는 파일 로더 두 개 — `lib/reference/levels.ts`(성취수준, 코드로 조회)·`lib/reference/exemplars.ts`(예시 은행, 결정적 점수 선택) — 가 서버에서만 읽어 프롬프트 블록으로 붙는다. (3) 규칙은 `lib/studio/prompts/rules/`에 ID·출처 태그가 붙은 배열로 두고 `rulesFor(subject)`가 이어 붙인다(첫 system 블록 = 캐시). (4) 검토는 두 겹: `lib/studio/checks.ts`의 순수 [TS] 검사가 먼저, 통과 시에만 검토 AI. (5) 7단계(안내장 틀)는 마법사 단계로 추가되어 게시 전에 확정되고 스냅샷에 실린다; 학생별 안내장 초안은 확정 채점만 읽는 서버 액션 + 원장 화면(인쇄). (6) 마이그레이션 0011은 `item_sets`에 열 3개와 `notices` 표만 추가.

**Tech Stack:** Next.js 16.3 App Router, React 19, Tailwind 4(`@media print`), Supabase(RLS, service role), `@anthropic-ai/sdk` 0.127 구조화 출력, zod 4, Vitest, `tsx` 스크립트(top-level await 금지).

**Spec:** `docs/superpowers/specs/2026-09-25-item-studio-v2-design.md` (§2 단계별 JSON, §4 breaking 목록, §6.1 D1~D9, 부록 A 규칙). 요약: `…-v2-summary.md`. 대표님 잠정 결정(2026-09-25): 활동지는 한 장에 기본·표준·도전 / 안내장은 서·논술형 차시만, 원장 화면에서 보고 인쇄(발송 화면 없음) / 자료는 첫 5세트 전부 자작.

## Global Constraints

- 문구는 `content/site.ts`에서만 고친다(`app.packageView`·`app.classroom`·`app.studio` 확장). tsx 안 한글 리터럴 금지(주석·도메인 값 예외). `lib/**`의 규칙 문장·안내장 문장 패턴은 도메인 값이다.
- 성취기준 원문은 절대 변형하지 않는다. `ReconstructedStandard.original_text`는 서버가 DB 원문과 대조하고, `checkReconstructionFidelity`가 모든 `reconstructed_text`에 돈다.
- 원장·학생·채점·안내장은 게시 판 스냅샷(`item_set_versions.snapshot`)만 읽는다. 읽는 곳은 반드시 `upgradeSnapshot()`을 거친다(`lib/classroom/snapshot.ts`·`app/teacher/items/[setId]`·`lib/classroom/grade.ts`).
- 요청당 AI 호출 1회(`callStructured` 1번). 7단계도 생성/검토/확정 각 1회. 안내장 초안도 1회(`role: 'grade'` 모델).
- 가짜 응답(fixture): `AI_MOCK=1` 또는 키 없음(개발)이면 `data/studio-fixtures/*.json`. v2 fixture는 수학·과학만(국·영·사는 실제 키로 생성). fixture는 v2 zod와 [TS] 검사를 통과해야 한다(`tests/mock-fixtures.test.ts`).
- 안내장에는 확정(`confirmed_at` 있음) 채점만 넣는다 — 서버 액션이 `student_gradings`가 아니라 원장 RLS의 `gradings`를 `status='confirmed'`로 읽는다.
- `git add`는 명시 경로만. 커밋 트레일러 `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. 마이그레이션은 파일만 만든다(`supabase db push`는 대표님).
- `.env.local`·키 출력 금지. `npx tsc --noEmit`이 통과해야 각 Task를 마친 것이다.

---

## 파일 구조

```
lib/studio/schemas.ts                      (재작성) v2 스키마 0~7단계 (T1)
lib/studio/level-map.ts                    levelMapFor / levelRefFor 순수 함수 (T1)
lib/studio/compat.ts                       upgradeSnapshot + 부분 업그레이더 (T1)
lib/studio/checks.ts                       staticIssues(stage, output, ctx) [TS] 검사 (T1)
lib/reference/levels.ts                    getLevels / getDomainLevels (T2)
lib/reference/exemplars.ts                 selectExemplars / exemplarCard (T2)
lib/studio/enrich.ts                       enrichOutput: level_anchor·min_competency 서버 채움 (T2)
lib/studio/prompts/rules/{common,lesson,grading,notice}.ts, rules/subjects/{국어,수학,사회,역사,과학,영어}.ts, rules/index.ts (T3)
lib/studio/prompts/rules.ts                (재작성) rulesFor 재수출 (T3)
lib/studio/prompts/stages.ts               (수정) 과제문 v2 + levelsBlock + exemplarsBlock (T3)
lib/studio/stages.ts                       (수정) enrich 후 저장, [TS] 검사 선행 (T4)
lib/studio/prompts/stages.ts               (수정) REVIEW_FOCUS v2 (T4)
supabase/migrations/20260925000011_studio_v2.sql   item_sets 열 3개, notices 표 (T5)
lib/studio/repo.ts, app/admin/items/[themeId]/sets/[setId]/actions.ts, lib/studio/publish.ts,
lib/studio/edit-rules.ts, lib/studio/wizard-stages.ts, lib/studio/max-attempts.ts,
app/admin/items/[themeId]/sets/[setId]/useStageRunner.ts, StageWizard.tsx  (수정, 7단계) (T5)
scripts/upgrade-fixtures-v2.ts             v1 fixture → v2 fixture 변환·기록 (T6)
data/studio-fixtures/stage{2..7}-{generate,review}[-과학].json  (재생성) (T6)
components/studio/PackageView.tsx          (재작성) v2 카드 (T7)
lib/classroom/lessons.ts, snapshot.ts, grading-prompt.ts, grade.ts  (수정) (T7)
app/student/assignments/[id]/page.tsx, AnswerEditor.tsx  (수정) (T7)
app/teacher/items/[setId]/page.tsx         (수정) upgradeSnapshot (T7)
content/site.ts                            (수정) packageView v2·paperAnswer·notice 문구 (T7, T8)
lib/classroom/notice-schema.ts, notice.ts, notice-lint.ts   학생별 안내장 (T8)
app/teacher/assignments/[setId]/actions.ts (추가) draftNotice (T8)
app/teacher/assignments/[setId]/notices/[assignmentId]/[lessonNo]/page.tsx, components/classroom/NoticeView.tsx, PrintButton.tsx (T8)
data/studio-fixtures/notice-draft.json     (T8)
docs/runbooks/2026-09-29-five-subjects.md, docs/STATUS.md, README.md, data/studio-fixtures/README.md (T9)
tests/studio-schemas.test.ts(재작성), level-map.test.ts, compat.test.ts, checks.test.ts, levels.test.ts, exemplars-select.test.ts,
tests/enrich.test.ts, rules.test.ts, prompts.test.ts(재작성), stages.test.ts(수정), publish.test.ts(수정), edit-rules.test.ts(수정),
tests/mock-fixtures.test.ts(재작성), classroom-lessons.test.ts(수정), grading-prompt.test.ts(재작성), notice.test.ts, notice-lint.test.ts
```

---

### Task 1: 스키마 v2 + level-map + compat(upgradeSnapshot) + [TS] 검사

**Files:**
- Modify: `lib/studio/schemas.ts` (전면 재작성)
- Create: `lib/studio/level-map.ts`, `lib/studio/compat.ts`, `lib/studio/checks.ts`
- Test: `tests/studio-schemas.test.ts`(재작성), `tests/level-map.test.ts`, `tests/compat.test.ts`, `tests/checks.test.ts`

**Interfaces:**
- Produces (`schemas.ts`): `AXES`, `TIERS`, `ReconstructedStandard`, `LearningGoal`, `Reconstruction`, `ScriptQuestion`, `WorksheetTask`, `Worksheet`, `MainStep`, `Lesson`, `UnitPlan`, `LessonDesign`(= 3단계 출력), `Material`, `Materials`, `Condition`, `Conditions`, `ScaleStep`, `Criterion`, `Rubric`, `ExemplarAnswer`, `LevelExpectation`, `AssessmentItem`, `Assessment`, `TeacherGuide`, `NoticePlan`, `Review`(kind 9종), `STAGE_SCHEMAS`(0~7), `Stage`. 기존 이름 유지: `ThemeIntro`, `StandardsRecommendation`, `QuizItem`, `Lessons`(= `LessonDesign`의 별칭, 기존 import 호환).
- Produces (`level-map.ts`): `levelMapFor(points: number): LevelExpectation[]`, `levelRefFor(grade: 1|…|7): 'A'|'B'|'C'|'D'|'E'|'E 미만'`, `GRADE_TABLE_22: GradeBoundary[]`.
- Produces (`compat.ts`): `upgradeSnapshot(raw: unknown): Snapshot`(v2면 그대로), `upgradeLessonV1`, `upgradeMaterialV1`, `upgradeAssessmentV1`, `upgradeTeacherGuideV1`, `upgradeReconstructionV1`, `isV1Snapshot`.
- Produces (`checks.ts`): `staticIssues(stage: Stage, output: unknown, ctx: { standards: { code: string; text: string }[]; prior: Record<string, unknown> }): { kind: ReviewKind; detail: string }[]`.
- Consumes: `lib/studio/fidelity.ts` `checkReconstructionFidelity(text, sources)`.

- [ ] **Step 1: 실패 테스트 — 스키마**

```ts
// tests/studio-schemas.test.ts
import { describe, it, expect } from 'vitest'
import { Reconstruction, Lesson, LessonDesign, Lessons, Material, Assessment, NoticePlan, Review, STAGE_SCHEMAS, AXES } from '@/lib/studio/schemas'

const quiz = (q: string) => ({ q, type: 'choice' as const, choices: ['가', '나'], answer: '가', explanation: '표에서 센다.' })
export const lessonV2 = {
  no: 1, standards: ['[9수04-02]'], topic: '도수분포표 만들기',
  key_question: '자료를 계급으로 나누면 무엇이 보이는가?', goal: '자료를 계급으로 나누어 도수분포표로 나타낼 수 있다.',
  time_budget: { intro_min: 10, main_min: 40, wrapup_min: 10 },
  flow: { intro: ['자료 A 훑어보기'], main: [{ step_label: '계급 나누기', minutes: 20, activities: ['계급 크기 정하기'] }, { step_label: '표 완성', minutes: 20, activities: ['도수 세기'] }], wrapup: ['퀴즈'] },
  teacher_script: { questions: [{ prompt: '계급의 크기는?', expected_answer: '10', if_stuck: '표 왼쪽 칸을 보자' }, { prompt: '도수의 합은?', expected_answer: '20', if_stuck: '부스 수를 세어 보자' }] },
  materials_used: ['A'], materials_needed: ['활동지'], caution_notes: ['도수 합 검산'],
  worksheet: { tasks: [
    { no: 1, prompt: '계급 30~40의 도수는?', tier: '기본', level_ref: 'D~E', answer_space: 'short', expected: '6' },
    { no: 2, prompt: '표를 완성하시오', tier: '표준', level_ref: 'C', answer_space: 'table', expected: '6행' },
    { no: 3, prompt: '가장 많은 계급을 문장으로', tier: '도전', level_ref: 'A~B', answer_space: 'lines', expected: '30 이상 40 미만' } ], self_check: ['표를 혼자 완성했다'] },
  formative_check: { quiz: [quiz('1'), quiz('2'), quiz('3')] },
  assessment: null, mergeable_with: null, merge_note: null, images: [],
}
const criterion = (name: string, max: number) => ({ name, axis: '과정·기능', condition_nos: [1], max,
  scale: Array.from({ length: max + 1 }, (_, p) => ({ points: p, descriptor: p === 0 ? '무응답 또는 시도했으나 관련 내용 없음' : `${name} ${p}단계 충족`, example: null })) })
const short = (lesson_no: number) => ({ kind: '서술형', lesson_no, points: 3, evaluation_elements: ['상대도수 구하기'], situation: null, materials_used: ['A'],
  stem: '자료 A의 상대도수를 구하고 이유를 쓰시오. [3점]',
  conditions: { items: [{ no: 1, text: '값을 구할 것. (2점)', verb: '구하다', points: 2, category: '내용' }, { no: 2, text: '이유를 한 문장으로 쓸 것. (1점)', verb: '쓰다', points: 1, category: '형식' }],
    length: '문장 1개', format: '~다', answer_mode: 'screen', overflow_rule: null },
  rubric: { criteria: [{ ...criterion('계산', 2), condition_nos: [1] }, { ...criterion('이유', 1), condition_nos: [2] }], holistic: null, notes: ['반올림 오차 허용'] },
  exemplar_answers: [{ level: null, points: 3, scores: [2, 1], assumed_short_points: null, text: '0.24와 0.30이며 총합이 달라 비율로 비교한다.', rationale: '두 조건 모두 충족' }, { level: null, points: 2, scores: [2, 0], assumed_short_points: null, text: '0.24와 0.30이다. 그냥 비교했다.', rationale: '이유 없음' }],
  level_map: [{ level: 'A', min: 3, max: 3, trait: '모두 정확' }, { level: 'B', min: 2, max: 2, trait: '계산 정확' }, { level: 'C', min: 1, max: 1, trait: '부분' }, { level: 'D', min: 0, max: 0, trait: '시도' }, { level: 'E', min: 0, max: 0, trait: '미도달' }],
  min_competency: null, references: [] })
const essay = { ...short(5), kind: '논술형', points: 16, stem: '자료 A·B를 근거로 줄일 품목을 정하시오. [16점]',
  situation: { role: '학생회 위원', audience: '축제 준비위', purpose: '감축 품목 결정', product: '제안 글' },
  rubric: { criteria: [criterion('자료 정리', 4), criterion('근거', 4), criterion('제안', 4), criterion('구성', 4)], holistic: { 상: '수치 정확·근거 충분', 중: '수치 일부 오류', 하: '근거 없음' }, notes: ['표현 차이 감점 없음'] },
  exemplar_answers: [{ level: '상', points: 15, scores: [4, 4, 4, 3], assumed_short_points: 6, text: 'x'.repeat(40), rationale: '요소 대부분 충족' }, { level: '중', points: 10, scores: [3, 2, 3, 2], assumed_short_points: 5, text: 'y'.repeat(40), rationale: '근거 부족' }, { level: '하', points: 5, scores: [2, 1, 1, 1], assumed_short_points: 2, text: 'z'.repeat(40), rationale: '수치 오류' }],
  level_map: [{ level: 'A', min: 15, max: 16, trait: '' }, { level: 'B', min: 13, max: 14, trait: '' }, { level: 'C', min: 12, max: 12, trait: '' }, { level: 'D', min: 10, max: 11, trait: '' }, { level: 'E', min: 0, max: 9, trait: '' }] }
export const assessmentV2 = { items: [short(2), short(4), essay],
  grade_boundaries: [[7, 21, 22, '상', 'A'], [6, 18, 20, '상', 'B'], [5, 15, 17, '중', 'C'], [4, 11, 14, '중', 'D'], [3, 8, 10, '중', 'E'], [2, 5, 7, '하', 'E 미만'], [1, 0, 4, '하', 'E 미만']]
    .map(([grade, min, max, band, level_ref]) => ({ grade, min, max, band, level_ref })),
  feedback_templates: { 상: '잘했어요', 중: '조금만 더', 하: '함께 다시' } }

describe('schemas v2', () => {
  it('reconstruction needs all three axes and 유지 keeps the original text', () => {
    const base = { standards: [
      { code: '[9수04-02]', original_text: '자료를 나타내고 해석할 수 있다.', reconstruction_type: '유지', reconstructed_text: '자료를 나타내고 해석할 수 있다.', reason: ['4~6차시 압축'], learning_elements: ['도수분포표'] },
      { code: '[9수04-03]', original_text: '상대도수를 구할 수 있다.', reconstruction_type: '재조정', reconstructed_text: '학생은 자료를 가지고 상대도수를 구해 비교할 수 있다.', reason: ['학원 60분 최적화'], learning_elements: ['상대도수'] } ],
      reconstruction: '자료를 정리하고 상대도수로 비교할 수 있다.',
      learning_goals: [{ text: '도수분포표의 뜻을 설명할 수 있다.', axis: '지식·이해' }, { text: '상대도수를 구할 수 있다.', axis: '과정·기능' }, { text: '통계의 유용성을 인식한다.', axis: '가치·태도' }],
      key_question_candidates: ['자료는 무엇을 먼저 줄이라고 말하는가?', '왜 비율로 비교하는가?'] }
    expect(Reconstruction.safeParse(base).success).toBe(true)
    expect(Reconstruction.parse(base).level_anchor).toEqual([])
    expect(Reconstruction.safeParse({ ...base, learning_goals: base.learning_goals.slice(0, 2).concat({ text: 'x가 있다.', axis: '지식·이해' }) }).success).toBe(false)
    expect(Reconstruction.safeParse({ ...base, standards: [{ ...base.standards[0], reconstructed_text: '다른 문장이다.' }, base.standards[1]] }).success).toBe(false)
    expect(AXES).toEqual(['지식·이해', '과정·기능', '가치·태도'])
  })
  it('lesson: 60-minute budget, main minutes add up, three tiers, quiz 3/0', () => {
    expect(Lesson.safeParse(lessonV2).success).toBe(true)
    expect(Lesson.safeParse({ ...lessonV2, time_budget: { intro_min: 10, main_min: 45, wrapup_min: 10 } }).success).toBe(false)
    expect(Lesson.safeParse({ ...lessonV2, flow: { ...lessonV2.flow, main: [{ step_label: '전개', minutes: 30, activities: ['a'] }] } }).success).toBe(false)
    expect(Lesson.safeParse({ ...lessonV2, worksheet: { ...lessonV2.worksheet, tasks: lessonV2.worksheet.tasks.slice(0, 2) } }).success).toBe(false)
    expect(Lesson.safeParse({ ...lessonV2, assessment: '논술형' }).success).toBe(false)
    expect(Lesson.safeParse({ ...lessonV2, assessment: '논술형', formative_check: { quiz: [] } }).success).toBe(true)
  })
  it('lesson design = unit_plan + 4~6 lessons; Lessons alias kept', () => {
    const lessons = [1, 2, 3, 4, 5].map((no) => ({ ...lessonV2, no, assessment: no === 5 ? '논술형' : no === 3 ? '서술형1' : no === 4 ? '서술형2' : null, formative_check: { quiz: no === 5 ? [] : lessonV2.formative_check.quiz } }))
    const unit_plan = { set_title: '자료의 정리와 해석', set_key_question: '자료는 무엇을 말하는가?', lesson_map: lessons.map((l) => ({ lesson_no: l.no, standards: l.standards, topic: l.topic })),
      assessment_plan: { formative: '차시별 퀴즈 3문항', summative_placement: [{ lesson_no: 3, kind: '서술형1' }, { lesson_no: 4, kind: '서술형2' }, { lesson_no: 5, kind: '논술형' }], rubric_note: { 상: 'a', 중: 'b', 하: 'c' } } }
    expect(LessonDesign.safeParse({ unit_plan, lessons }).success).toBe(true)
    expect(Lessons).toBe(LessonDesign)
    expect(LessonDesign.safeParse({ unit_plan, lessons: lessons.slice(0, 3) }).success).toBe(false)
  })
  it('material source is an object and role defaults to raw', () => {
    const m = Material.parse({ id: 'A', title: 't', kind: 'table', body: null, table: { columns: ['부스', '개수'], rows: [[1, 18]] }, source: { kind: '자작', attribution: null, ai_assisted: false } })
    expect(m.role).toBe('raw'); expect(m.images).toEqual([])
    expect(Material.safeParse({ id: 'A', title: 't', kind: 'text', body: 'b', table: null, source: { kind: '공개', attribution: null, ai_assisted: false } }).success).toBe(false)
    expect(Material.safeParse({ id: 'A', title: 't', kind: 'text', body: 'b', table: null, source: '자작' }).success).toBe(false)
  })
  it('assessment: 3+3+16, unified rubric, scale continuity, condition refs, paper<=1, exemplar bands', () => {
    expect(Assessment.safeParse(assessmentV2).error?.issues ?? []).toEqual([])
    const bad = (patch: (a: typeof assessmentV2) => unknown) => Assessment.safeParse(patch(structuredClone(assessmentV2))).success
    expect(bad((a) => { a.items[0].points = 4; return a })).toBe(false)
    expect(bad((a) => { a.items[0].rubric.criteria[0].scale.splice(1, 1); return a })).toBe(false)
    expect(bad((a) => { a.items[0].rubric.criteria[1].condition_nos = [1]; return a })).toBe(false)
    expect(bad((a) => { a.items[0].conditions.answer_mode = 'paper'; a.items[1].conditions.answer_mode = 'paper'; return a })).toBe(false)
    expect(bad((a) => { a.items[2].rubric.holistic = null; return a })).toBe(false)
    expect(bad((a) => { a.items[2].exemplar_answers[0].points = 20; return a })).toBe(false)
    expect(bad((a) => { a.items[2].exemplar_answers[2].points = 15; a.items[2].exemplar_answers[2].scores = [4, 4, 4, 3]; return a })).toBe(false)
    expect(bad((a) => { a.items[0].stem = '자료 A의 상대도수를 구하시오. (3점)'; return a })).toBe(false)
    expect(bad((a) => { a.grade_boundaries[6].min = 1; return a })).toBe(false)
  })
  it('notice plan and review kinds and stage list', () => {
    const plan = { per_lesson: [1, 2, 3, 4].map((n) => ({ lesson_no: n, topic_summary: '표 만들기를 배웠습니다.', preview: '다음 시간에는 그래프를 배워요.', home_study_suggestion: '틀린 문항 하나를 다시 풀어 봅시다.', quiz_notes: [{ quiz_no: 1, wrong_note: '계급 폭을 다시 보면 됩니다' }], criteria_phrases: null })),
      footer_disclaimer: '본 안내장은 학교생활기록부가 아니며, 학원 자체 학습 기록입니다.' }
    expect(NoticePlan.safeParse(plan).success).toBe(true)
    expect(Review.parse({ pass: false, issues: [{ kind: 'level', detail: 'x' }, { kind: 'notice', detail: 'y' }] }).issues).toHaveLength(2)
    expect(Object.keys(STAGE_SCHEMAS)).toEqual(['0', '1', '2', '3', '4', '5', '6', '7'])
  })
})
```

- [ ] **Step 2: 실패 확인** — `npx vitest run tests/studio-schemas.test.ts` → FAIL (import 실패).

- [ ] **Step 3: `lib/studio/level-map.ts`**

```ts
import type { z } from 'zod'
import type { LevelExpectation as LevelExpectationSchema } from './schemas'

export type LevelExpectationT = z.infer<typeof LevelExpectationSchema>
export type LevelRef = 'A' | 'B' | 'C' | 'D' | 'E' | 'E 미만'
export type GradeBoundary = { grade: number; min: number; max: number; band: '상' | '중' | '하'; level_ref: LevelRef }

/** KICE 성취율 컷(총론 p.80): A 90 / B 80 / C 70 / D 60 / E 40 — 스펙 §1.1. */
const CUTS: [LevelExpectationT['level'], number][] = [['A', 0.9], ['B', 0.8], ['C', 0.7], ['D', 0.6], ['E', 0.4]]
const TRAITS: Record<LevelExpectationT['level'], string> = {
  A: '요구한 요소를 모두 정확히 충족하고 근거를 설명함',
  B: '요소를 대부분 충족하며 경미한 오류만 있음',
  C: '주어진 자료로 핵심 요소를 충족하나 설명이 부분적임',
  D: '일부 요소만 충족하고 해석이 부분적임',
  E: '시도했으나 핵심 요소가 빠짐(미응답 포함)',
}

/** 문항 배점을 A~E 예상 점수 구간으로 나눈다. 단조 감소, 0..points 전부 덮음, E는 0까지(E 미만을 흡수). */
export function levelMapFor(points: number): LevelExpectationT[] {
  const out: LevelExpectationT[] = []
  let hi = points
  for (const [level, ratio] of CUTS) {
    const min = level === 'E' ? 0 : Math.min(Math.ceil(ratio * points), Math.max(hi, 0))
    const max = Math.max(hi, min)
    out.push({ level, min, max, trait: TRAITS[level] })
    hi = min - 1
  }
  return out
}

/** 7등급(7이 최고, 대표님 확정) ↔ KICE 수준 참조열. 22점 기준 컷 A≥20 B≥18 C≥16 D≥14 E≥9 (스펙 §1.1). */
export function levelRefFor(grade: number): LevelRef {
  const map: Record<number, LevelRef> = { 7: 'A', 6: 'B', 5: 'C', 4: 'D', 3: 'E', 2: 'E 미만', 1: 'E 미만' }
  return map[grade] ?? 'E 미만'
}

export const GRADE_TABLE_22: GradeBoundary[] = [
  { grade: 7, min: 21, max: 22, band: '상', level_ref: 'A' },
  { grade: 6, min: 18, max: 20, band: '상', level_ref: 'B' },
  { grade: 5, min: 15, max: 17, band: '중', level_ref: 'C' },
  { grade: 4, min: 11, max: 14, band: '중', level_ref: 'D' },
  { grade: 3, min: 8, max: 10, band: '중', level_ref: 'E' },
  { grade: 2, min: 5, max: 7, band: '하', level_ref: 'E 미만' },
  { grade: 1, min: 0, max: 4, band: '하', level_ref: 'E 미만' },
]
```

- [ ] **Step 4: `lib/studio/schemas.ts` 전면 재작성**

```ts
import { z } from 'zod'

export const SUBJECTS = ['국어', '영어', '수학', '과학', '사회', '한국사', '세계사'] as const
export type Subject = (typeof SUBJECTS)[number]
export const LEVELS = ['초', '중', '고'] as const
export type Level = (typeof LEVELS)[number]
export const AXES = ['지식·이해', '과정·기능', '가치·태도'] as const
export const TIERS = ['기본', '표준', '도전'] as const
export const ASSESSMENT_KINDS = ['서술형1', '서술형2', '논술형'] as const

const issue = (ctx: z.RefinementCtx, message: string) => ctx.addIssue({ code: 'custom', message })

export const ThemeIntro = z.object({
  intro: z.string().min(20),
  subject_ideas: z.array(z.object({ subject: z.enum(SUBJECTS), idea: z.string().min(5) })).min(1),
})
export const StandardsRecommendation = z.object({
  recommended: z.array(z.object({ code: z.string(), reason: z.string() })).min(1).max(6),
})

// ── 2단계 ──────────────────────────────────────────────────────────────
export const ReconstructedStandard = z.object({
  code: z.string().min(3),
  original_text: z.string().min(5),
  reconstruction_type: z.enum(['통합', '재조정', '유지']),
  merged_with: z.array(z.string()).default([]),
  reconstructed_text: z.string().min(10),
  reason: z.array(z.enum(['학원 60분 최적화', '4~6차시 압축', '비전공 원장 진행 용이'])).min(1),
  learning_elements: z.array(z.string().min(1)).min(1).max(6),
})
export const LearningGoal = z.object({ text: z.string().min(5), axis: z.enum(AXES) })
export const LevelAnchor = z.object({ code: z.string(), level: z.enum(['B', 'C']), statement: z.string() })
export const Reconstruction = z.object({
  standards: z.array(ReconstructedStandard).min(2).max(6),
  reconstruction: z.string().min(10),
  learning_goals: z.array(LearningGoal).min(3).max(5),
  level_anchor: z.array(LevelAnchor).default([]),
  key_question_candidates: z.array(z.string().min(5)).min(2).max(3),
}).superRefine((r, ctx) => {
  for (const axis of AXES) if (!r.learning_goals.some((g) => g.axis === axis)) issue(ctx, `학습 목표에 ${axis} 축이 없음`)
  for (const s of r.standards) if (s.reconstruction_type === '유지' && s.reconstructed_text !== s.original_text) issue(ctx, `${s.code}: 유지는 원문과 같아야 함`)
})

// ── 3단계 ──────────────────────────────────────────────────────────────
export const QuizItem = z.object({
  q: z.string().min(3),
  type: z.enum(['choice', 'short']),
  choices: z.array(z.string()).min(2).max(5).nullable(),
  answer: z.string().min(1),
  explanation: z.string().min(3),
})
export const ScriptQuestion = z.object({ prompt: z.string().min(5), expected_answer: z.string().min(1), if_stuck: z.string().min(2) })
export const WorksheetTask = z.object({
  no: z.number().int().min(1), prompt: z.string().min(5), tier: z.enum(TIERS), level_ref: z.enum(['D~E', 'C', 'A~B']),
  answer_space: z.enum(['short', 'lines', 'table', 'draw']), expected: z.string().min(1),
})
export const Worksheet = z.object({ tasks: z.array(WorksheetTask).min(2).max(5), self_check: z.array(z.string().min(2)).min(1).max(3) })
export const MainStep = z.object({ step_label: z.string().min(1), minutes: z.number().int().min(5), activities: z.array(z.string().min(1)).min(1) })
export const Lesson = z.object({
  no: z.number().int().min(1).max(8),
  standards: z.array(z.string()).min(1).max(2),
  topic: z.string().min(2),
  key_question: z.string().min(5),
  goal: z.string().min(5),
  time_budget: z.object({ intro_min: z.number().int().min(0), main_min: z.number().int().min(0), wrapup_min: z.number().int().min(0) }),
  flow: z.object({ intro: z.array(z.string().min(1)).min(1), main: z.array(MainStep).min(1).max(4), wrapup: z.array(z.string().min(1)).min(1) }),
  teacher_script: z.object({ questions: z.array(ScriptQuestion).min(2).max(4) }),
  materials_used: z.array(z.string().regex(/^[A-Z]$/)).default([]),
  materials_needed: z.array(z.string()).default([]),
  caution_notes: z.array(z.string().min(2)).min(1).max(4),
  worksheet: Worksheet,
  formative_check: z.object({ quiz: z.array(QuizItem).max(3) }),
  assessment: z.enum(ASSESSMENT_KINDS).nullable(),
  mergeable_with: z.number().int().nullable(),
  merge_note: z.string().nullable().default(null),
  images: z.array(z.string().url()).default([]),
}).superRefine((l, ctx) => {
  const q = l.formative_check.quiz.length
  if (l.assessment === '논술형') { if (q !== 0) issue(ctx, '논술형 차시에는 퀴즈 없음') }
  else if (q !== 3) issue(ctx, '논술형 차시가 아니면 퀴즈 3문항')
  const t = l.time_budget
  if (t.intro_min + t.main_min + t.wrapup_min !== 60) issue(ctx, '차시 시간 합이 60분이 아님')
  if (l.flow.main.reduce((s, m) => s + m.minutes, 0) !== t.main_min) issue(ctx, '전개 소단계 분 합이 전개 시간과 다름')
  for (const tier of TIERS) if (!l.worksheet.tasks.some((w) => w.tier === tier)) issue(ctx, `활동지에 ${tier} 과제가 없음`)
})
export const UnitPlan = z.object({
  set_title: z.string().min(1),
  set_key_question: z.string().min(5),
  lesson_map: z.array(z.object({ lesson_no: z.number().int(), standards: z.array(z.string()).min(1).max(2), topic: z.string().min(1) })).min(4).max(6),
  assessment_plan: z.object({
    formative: z.string().min(2),
    summative_placement: z.array(z.object({ lesson_no: z.number().int(), kind: z.enum(ASSESSMENT_KINDS) })).length(3),
    rubric_note: z.object({ 상: z.string(), 중: z.string(), 하: z.string() }),
  }),
})
export const LessonDesign = z.object({ unit_plan: UnitPlan, lessons: z.array(Lesson).min(4).max(6) }).superRefine((d, ctx) => {
  const placed = d.lessons.filter((l) => l.assessment).map((l) => ({ lesson_no: l.no, kind: l.assessment! }))
  for (const p of d.unit_plan.assessment_plan.summative_placement) {
    if (!placed.some((x) => x.lesson_no === p.lesson_no && x.kind === p.kind)) issue(ctx, `평가 계획 ${p.kind}(${p.lesson_no}차시)가 차시 배치와 다름`)
  }
  if (d.unit_plan.lesson_map.length !== d.lessons.length) issue(ctx, 'lesson_map 수가 차시 수와 다름')
})
/** 기존 import 호환(`Lessons`). 3단계 출력은 이제 { unit_plan, lessons } 다. */
export const Lessons = LessonDesign

// ── 4단계 ──────────────────────────────────────────────────────────────
export const MaterialSource = z.object({
  kind: z.enum(['자작', '공개']),
  attribution: z.string().nullable(),
  ai_assisted: z.boolean().default(false),
}).superRefine((s, ctx) => { if (s.kind === '공개' && !s.attribution) issue(ctx, '공개 자료는 출처 문구 필수') })
export const Material = z.object({
  id: z.string().regex(/^[A-Z]$/),
  title: z.string(),
  kind: z.enum(['table', 'text', 'chart', 'image']),
  body: z.string().nullable(),
  table: z.object({ columns: z.array(z.string()), rows: z.array(z.array(z.union([z.string(), z.number()]))) }).nullable(),
  source: MaterialSource,
  role: z.enum(['raw', 'context']).default('raw'),
  images: z.array(z.string().url()).default([]),
})
export const Materials = z.object({ materials: z.array(Material).min(1).max(6) })

// ── 5단계 ──────────────────────────────────────────────────────────────
export const Condition = z.object({
  no: z.number().int().min(1), text: z.string().min(5), verb: z.string().min(1),
  points: z.number().int().min(0).nullable(), category: z.enum(['내용', '형식']),
})
export const Conditions = z.object({
  items: z.array(Condition).min(1).max(5),
  length: z.string().min(2),
  format: z.string().min(2),
  answer_mode: z.enum(['screen', 'paper']),
  overflow_rule: z.string().nullable(),
})
export const ScaleStep = z.object({ points: z.number().int().min(0), descriptor: z.string().min(5), example: z.string().nullable() })
export const Criterion = z.object({
  name: z.string().min(2), axis: z.enum(AXES), condition_nos: z.array(z.number().int()).min(1),
  max: z.number().int().min(1).max(4), scale: z.array(ScaleStep).min(2),
}).superRefine((c, ctx) => {
  const pts = [...c.scale].map((s) => s.points).sort((a, b) => a - b)
  const want = Array.from({ length: c.max + 1 }, (_, i) => i)
  if (pts.join(',') !== want.join(',')) issue(ctx, `${c.name}: 척도는 0..${c.max} 정수가 정확히 한 번씩`)
})
export const Rubric = z.object({
  criteria: z.array(Criterion).min(1).max(4),
  holistic: z.object({ 상: z.string().min(2), 중: z.string().min(2), 하: z.string().min(2) }).nullable(),
  notes: z.array(z.string().min(5)).min(1).max(4),
})
export const ExemplarAnswer = z.object({
  level: z.enum(['상', '중', '하']).nullable(), points: z.number().int().min(0), scores: z.array(z.number().int().min(0)),
  assumed_short_points: z.number().int().min(0).max(6).nullable(),   // 논술형 예시가 전제하는 서술형 두 문항 점수 합(등급 밴드 대조용), 서술형은 null
  text: z.string().min(20), rationale: z.string().min(10),
})
export const LevelExpectation = z.object({ level: z.enum(['A', 'B', 'C', 'D', 'E']), min: z.number().int().min(0), max: z.number().int().min(0), trait: z.string() })
export const AssessmentItem = z.object({
  kind: z.enum(['서술형', '논술형']),
  lesson_no: z.number().int(),
  points: z.number().int().positive(),
  evaluation_elements: z.array(z.string().min(3)).min(1).max(3),
  situation: z.object({ role: z.string().min(1), audience: z.string().min(1), purpose: z.string().min(1), product: z.string().min(1) }).nullable(),
  materials_used: z.array(z.string().regex(/^[A-Z]$/)).min(1),
  stem: z.string().min(10),
  conditions: Conditions,
  rubric: Rubric,
  exemplar_answers: z.array(ExemplarAnswer).min(2),
  level_map: z.array(LevelExpectation).length(5),
  min_competency: z.string().nullable(),
  references: z.array(z.object({ id: z.string(), source: z.string() })).default([]),
}).superRefine((it, ctx) => {
  const maxSum = it.rubric.criteria.reduce((s, c) => s + c.max, 0)
  if (maxSum !== it.points) issue(ctx, `요소 최댓값 합(${maxSum}) ≠ 배점(${it.points})`)
  if (!it.stem.trim().endsWith(`[${it.points}점]`)) issue(ctx, `문두는 "[${it.points}점]"으로 끝나야 함`)
  const nos = new Set(it.conditions.items.map((c) => c.no))
  const referenced = new Set(it.rubric.criteria.flatMap((c) => c.condition_nos))
  for (const n of referenced) if (!nos.has(n)) issue(ctx, `채점표가 없는 조건 ${n}을 가리킴`)
  for (const n of nos) if (!referenced.has(n)) issue(ctx, `조건 ${n}이 채점표에 반영되지 않음`)
  const condPts = it.conditions.items.reduce((s, c) => s + (c.points ?? 0), 0)
  if (condPts > it.points) issue(ctx, '조건 부분배점 합이 배점을 넘음')
  if (it.conditions.items.length >= 4 && new Set(it.conditions.items.map((c) => c.category)).size < 2) issue(ctx, '조건 4개 이상이면 내용/형식으로 묶어야 함')
  for (const ex of it.exemplar_answers) {
    if (ex.scores.length !== it.rubric.criteria.length) issue(ctx, '예시답안 요소 점수 수가 요소 수와 다름')
    if (ex.scores.reduce((s, v) => s + v, 0) !== ex.points) issue(ctx, '예시답안 요소 점수 합 ≠ 총점')
    ex.scores.forEach((v, i) => { if (it.rubric.criteria[i] && v > it.rubric.criteria[i].max) issue(ctx, '예시답안 요소 점수가 최댓값을 넘음') })
  }
  if (it.kind === '논술형') {
    if (it.rubric.criteria.length !== 4 || it.rubric.criteria.some((c) => c.max !== 4)) issue(ctx, '논술형은 4요소 × 0~4점')
    if (!it.rubric.holistic) issue(ctx, '논술형은 총체적 상/중/하 필수')
    if (it.conditions.answer_mode !== 'screen') issue(ctx, '논술형은 화면 입력')
    for (const lv of ['상', '중', '하'] as const) if (!it.exemplar_answers.some((e) => e.level === lv)) issue(ctx, `논술형 예시답안 ${lv} 없음`)
  } else {
    if (it.rubric.holistic) issue(ctx, '서술형은 총체적 기준 없음')
    if (!it.exemplar_answers.some((e) => e.points === it.points)) issue(ctx, '서술형 만점 예시답안 없음')
  }
  const lm = it.level_map
  if (lm[0].max !== it.points || lm[4].min !== 0) issue(ctx, 'A~E 구간이 0..배점을 덮지 않음')
  for (let i = 1; i < lm.length; i++) if (lm[i].max > lm[i - 1].max || lm[i].min > lm[i - 1].min) issue(ctx, 'A~E 구간이 단조 감소가 아님')
})
export const GradeBoundaryRow = z.object({
  grade: z.number().int().min(1).max(7), min: z.number().int().min(0), max: z.number().int().min(0),
  band: z.enum(['상', '중', '하']), level_ref: z.enum(['A', 'B', 'C', 'D', 'E', 'E 미만']),
})
export const Assessment = z.object({
  items: z.array(AssessmentItem).length(3),
  grade_boundaries: z.array(GradeBoundaryRow).length(7),
  feedback_templates: z.object({ 상: z.string(), 중: z.string(), 하: z.string() }),
}).superRefine((a, ctx) => {
  const essays = a.items.filter((i) => i.kind === '논술형'); const shorts = a.items.filter((i) => i.kind === '서술형')
  if (essays.length !== 1 || essays[0].points !== 16) issue(ctx, '논술형은 정확히 1개, 16점')
  if (shorts.length !== 2 || shorts.some((i) => i.points !== 3)) issue(ctx, '서술형은 정확히 2개, 각 3점')
  const total = a.items.reduce((s, i) => s + i.points, 0)
  const rows = [...a.grade_boundaries].sort((x, y) => x.min - y.min)
  if (rows[0]?.min !== 0 || rows[rows.length - 1]?.max !== total) issue(ctx, `등급표가 0..${total}을 덮지 않음`)
  for (let i = 1; i < rows.length; i++) if (rows[i].min !== rows[i - 1].max + 1) issue(ctx, '등급표 구간이 이어지지 않음')
  if (a.items.filter((i) => i.conditions.answer_mode === 'paper').length > 1) issue(ctx, '종이 답안 문항은 세트당 최대 1개')
  const bandOf = (pts: number) => a.grade_boundaries.find((b) => pts >= b.min && pts <= b.max)?.band
  for (const ex of essays[0]?.exemplar_answers ?? []) {
    // 논술형 예시 총점 + 전제한 서술형 점수 합(assumed_short_points, 없으면 6)을 세트 총점으로 보아 밴드를 대조한다(스펙 §2.5 [TS]-4)
    if (ex.level && bandOf(ex.points + (ex.assumed_short_points ?? 6)) !== ex.level) issue(ctx, `논술형 예시답안 ${ex.level}의 점수가 등급표의 ${ex.level} 밴드에 들지 않음`)
  }
})

// ── 6단계 ──────────────────────────────────────────────────────────────
export const TeacherGuide = z.object({
  general: z.object({ materials: z.array(z.string()), schedule_note: z.string(), purpose: z.string() }),
  glossary: z.array(z.object({ term: z.string(), explanation: z.string() })).min(3),
  merge_guide: z.array(z.object({
    lessons: z.tuple([z.number().int(), z.number().int()]), skip_activities: z.array(z.string().min(1)).min(1),
    time_budget_120: z.object({ intro_min: z.number().int(), main_min: z.number().int(), wrapup_min: z.number().int() }),
  })).default([]),
  grading_guide: z.object({
    common_errors: z.array(z.object({ item_no: z.number().int().min(1).max(3), error: z.string().min(2), how_to_read: z.string().min(2) })).min(3),
    review_tips: z.array(z.string().min(5)).min(2).max(5),
    retry_guidance: z.string().min(10),
  }),
  per_lesson: z.array(z.object({ no: z.number().int(), notes: z.array(z.string()).max(3) })).min(4),
}).superRefine((g, ctx) => {
  for (const m of g.merge_guide) { const t = m.time_budget_120; if (t.intro_min + t.main_min + t.wrapup_min !== 120) issue(ctx, '병합 차시 시간 합이 120분이 아님') }
})

// ── 7단계 ──────────────────────────────────────────────────────────────
export const NOTICE_DISCLAIMER = '본 안내장은 학교생활기록부가 아니며, 학원 자체 학습 기록입니다.'
export const NoticePlan = z.object({
  per_lesson: z.array(z.object({
    lesson_no: z.number().int(),
    topic_summary: z.string().min(5).max(60),
    preview: z.string().min(5).max(50),
    home_study_suggestion: z.string().min(5).max(60),
    quiz_notes: z.array(z.object({ quiz_no: z.number().int().min(1).max(3), wrong_note: z.string().min(2).max(40) })).max(3),
    criteria_phrases: z.array(z.object({ criterion_name: z.string().min(1), good: z.array(z.string().min(5).max(60)).min(2), improve: z.array(z.string().min(5).max(60)).min(2) })).nullable(),
  })).min(4).max(6),
  footer_disclaimer: z.literal(NOTICE_DISCLAIMER),
})

export const REVIEW_KINDS = ['fidelity', 'grade_level', 'coverage', 'quiz', 'rubric', 'level', 'source', 'notice', 'other'] as const
export type ReviewKind = (typeof REVIEW_KINDS)[number]
export const Review = z.object({
  pass: z.boolean(),
  issues: z.array(z.object({ kind: z.enum(REVIEW_KINDS), detail: z.string() })),
})

export const STAGE_SCHEMAS = {
  0: ThemeIntro, 1: StandardsRecommendation, 2: Reconstruction, 3: LessonDesign, 4: Materials, 5: Assessment, 6: TeacherGuide, 7: NoticePlan,
} as const
export type Stage = keyof typeof STAGE_SCHEMAS
export type ReviewT = z.infer<typeof Review>
```

- [ ] **Step 5: 통과 확인** — `npx vitest run tests/studio-schemas.test.ts` → PASS. (`npx tsc --noEmit`은 아직 실패한다 — 소비처는 T5·T7에서 고친다. 이 Task 안에서는 `compat.ts`·`checks.ts`가 새 타입만 쓰므로 그 둘은 컴파일된다.)

- [ ] **Step 6: 실패 테스트 — level-map · compat · checks**

```ts
// tests/level-map.test.ts
import { describe, it, expect } from 'vitest'
import { levelMapFor, levelRefFor, GRADE_TABLE_22 } from '@/lib/studio/level-map'

describe('levelMapFor', () => {
  it('splits 16 points by the KICE cuts, E reaches 0', () => {
    expect(levelMapFor(16).map((l) => [l.level, l.min, l.max])).toEqual([['A', 15, 16], ['B', 13, 14], ['C', 12, 12], ['D', 10, 11], ['E', 0, 9]])
  })
  it('handles 3 points without overlaps and covers 0..3', () => {
    expect(levelMapFor(3).map((l) => [l.level, l.min, l.max])).toEqual([['A', 3, 3], ['B', 2, 2], ['C', 1, 1], ['D', 0, 0], ['E', 0, 0]])
  })
  it('grade table is contiguous 0..22 with reference levels', () => {
    const rows = [...GRADE_TABLE_22].sort((a, b) => a.min - b.min)
    expect(rows[0].min).toBe(0); expect(rows[6].max).toBe(22)
    for (let i = 1; i < rows.length; i++) expect(rows[i].min).toBe(rows[i - 1].max + 1)
    expect(levelRefFor(7)).toBe('A'); expect(levelRefFor(3)).toBe('E'); expect(levelRefFor(1)).toBe('E 미만')
  })
})
```

```ts
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
})
```

```ts
// tests/checks.test.ts
import { describe, it, expect } from 'vitest'
import { staticIssues } from '@/lib/studio/checks'
import { assessmentV2, lessonV2 } from './studio-schemas.test'

const standards = [{ code: '[9수04-02]', text: '자료를 줄기와 잎 그림, 도수분포표, 히스토그램, 도수분포다각형으로 나타내고 해석할 수 있다.' }, { code: '[9수04-03]', text: '상대도수를 구하고, 상대도수의 분포를 표나 그래프로 나타내고 해석할 수 있다.' }]
const materials = [{ id: 'A', title: 't', kind: 'table', body: null, table: { columns: ['부스', '개수'], rows: [[1, 18]] }, source: { kind: '자작', attribution: null, ai_assisted: false }, role: 'raw', images: [] }]

describe('staticIssues', () => {
  it('stage 2: every reconstructed_text is fidelity-checked; original must match DB text', () => {
    const out = { standards: [
      { code: '[9수04-02]', original_text: standards[0].text, reconstruction_type: '유지', reconstructed_text: standards[0].text, reason: ['4~6차시 압축'], merged_with: [], learning_elements: ['도수분포표'] },
      { code: '[9수04-03]', original_text: '다른 원문', reconstruction_type: '재조정', reconstructed_text: '학생은 통계청 자료로 상대도수를 구할 수 있다.', reason: ['학원 60분 최적화'], merged_with: [], learning_elements: ['상대도수'] } ],
      reconstruction: '자료를 나타내고 상대도수를 구하고 해석할 수 있다.', learning_goals: [], level_anchor: [], key_question_candidates: [] }
    const issues = staticIssues(2, out, { standards, prior: {} })
    expect(issues.some((i) => i.kind === 'fidelity' && i.detail.includes('[9수04-03]'))).toBe(true)
    expect(issues.some((i) => i.detail.includes('원문 불일치'))).toBe(true)
  })
  it('stage 3: coverage, placement order, mergeable adjacency, quiz answer in choices, main ≥ 2 steps', () => {
    const lessons = [1, 2, 3, 4, 5].map((no) => ({ ...lessonV2, no, standards: ['[9수04-02]'], assessment: no === 3 ? '서술형1' : no === 4 ? '서술형2' : no === 5 ? '논술형' : null, formative_check: { quiz: no === 5 ? [] : lessonV2.formative_check.quiz }, mergeable_with: no === 1 ? 4 : null }))
    const out = { unit_plan: { set_title: 't', set_key_question: 'q?', lesson_map: [], assessment_plan: { formative: 'f', summative_placement: [{ lesson_no: 3, kind: '서술형1' }, { lesson_no: 4, kind: '서술형2' }, { lesson_no: 5, kind: '논술형' }], rubric_note: { 상: 'a', 중: 'b', 하: 'c' } } }, lessons }
    const issues = staticIssues(3, out, { standards, prior: {} })
    expect(issues.some((i) => i.kind === 'coverage' && i.detail.includes('[9수04-03]'))).toBe(true)
    expect(issues.some((i) => i.detail.includes('병합'))).toBe(true)
    const wrongQuiz = { ...out, lessons: out.lessons.map((l) => l.no === 1 ? { ...l, mergeable_with: 2, formative_check: { quiz: l.formative_check.quiz.map((q) => ({ ...q, answer: '없는 보기' })) } } : l) }
    expect(staticIssues(3, wrongQuiz, { standards, prior: {} }).some((i) => i.kind === 'quiz')).toBe(true)
  })
  it('stage 4: size conventions and raw-data leakage hints', () => {
    const big = { materials: [{ ...materials[0], table: { columns: ['a'], rows: Array.from({ length: 30 }, (_, i) => [i]) } }] }
    expect(staticIssues(4, big, { standards, prior: {} }).some((i) => i.detail.includes('25행'))).toBe(true)
    const pub = { materials: [{ ...materials[0], source: { kind: '공개', attribution: '통계청', ai_assisted: true } }] }
    expect(staticIssues(4, pub, { standards, prior: {} }).some((i) => i.kind === 'source')).toBe(true)
  })
  it('stage 5: materials referenced must exist and include raw; adverb-only scale steps are flagged; 서술형 needs a partial exemplar', () => {
    const prior = { stage4: { materials }, stage3: { lessons: [] } }
    expect(staticIssues(5, assessmentV2, { standards, prior })).toEqual([])
    const missing = structuredClone(assessmentV2); missing.items[0].materials_used = ['Z']
    expect(staticIssues(5, missing, { standards, prior }).some((i) => i.detail.includes('Z'))).toBe(true)
    const adverb = structuredClone(assessmentV2)
    adverb.items[2].rubric.criteria[0].scale = [0, 1, 2, 3, 4].map((p) => ({ points: p, descriptor: ['무응답', '다소 정확하게 인용함', '대체로 정확하게 인용함', '정확하게 인용함', '매우 정확하게 인용함'][p], example: null }))
    expect(staticIssues(5, adverb, { standards, prior }).some((i) => i.kind === 'level')).toBe(true)
    const noPartial = structuredClone(assessmentV2); noPartial.items[0].exemplar_answers = [noPartial.items[0].exemplar_answers[0], { ...noPartial.items[0].exemplar_answers[0] }]
    expect(staticIssues(5, noPartial, { standards, prior }).some((i) => i.detail.includes('부분점수'))).toBe(true)
  })
  it('stage 6/7: merge pairs must match lessons; notice plan lint', () => {
    const lessons = [1, 2, 3, 4].map((no) => ({ ...lessonV2, no, mergeable_with: no === 1 ? 2 : null }))
    const guide = { general: { materials: [], schedule_note: 's', purpose: 'p' }, glossary: [], merge_guide: [{ lessons: [3, 4], skip_activities: ['x'], time_budget_120: { intro_min: 10, main_min: 90, wrapup_min: 20 } }], grading_guide: { common_errors: [], review_tips: [], retry_guidance: '' }, per_lesson: [] }
    expect(staticIssues(6, guide, { standards, prior: { stage3: { lessons } } }).some((i) => i.detail.includes('병합'))).toBe(true)
    const plan = { per_lesson: [{ lesson_no: 1, topic_summary: '표를 못한다.', preview: '다음', home_study_suggestion: '더 열심히', quiz_notes: [], criteria_phrases: null }], footer_disclaimer: '' }
    const issues = staticIssues(7, plan, { standards, prior: {} })
    expect(issues.some((i) => i.kind === 'notice' && i.detail.includes('못한다'))).toBe(true)
    expect(issues.some((i) => i.detail.includes('청유형'))).toBe(true)
  })
})
```

- [ ] **Step 7: 실패 확인** — `npx vitest run tests/level-map.test.ts tests/compat.test.ts tests/checks.test.ts` → FAIL.

- [ ] **Step 8: v1 fixture 사본** — `mkdir -p tests/fixtures/v1 && for k in stage2-generate stage3-generate stage4-generate stage5-generate stage6-generate stage2-generate-과학 stage3-generate-과학 stage4-generate-과학 stage5-generate-과학 stage6-generate-과학; do cp "data/studio-fixtures/$k.json" "tests/fixtures/v1/$k.json"; done` (compat 테스트와 T6 변환 스크립트의 입력. v1 원본은 여기서만 유지.)

- [ ] **Step 9: `lib/studio/compat.ts`**

```ts
import type { z } from 'zod'
import { Lesson, Material, Assessment, TeacherGuide, AssessmentItem, type ReconstructedStandard, type LearningGoal, type UnitPlan, type NoticePlan } from './schemas'
import { levelMapFor, levelRefFor } from './level-map'

type LessonT = z.infer<typeof Lesson>
type MaterialT = z.infer<typeof Material>
type AssessmentT = z.infer<typeof Assessment>
type ItemT = z.infer<typeof AssessmentItem>
type GuideT = z.infer<typeof TeacherGuide>
export type ReconstructedStandardT = z.infer<typeof ReconstructedStandard>
export type LearningGoalT = z.infer<typeof LearningGoal>
export type UnitPlanT = z.infer<typeof UnitPlan>
export type NoticePlanT = z.infer<typeof NoticePlan>

/** v2 스냅샷(publish.ts 의 Snapshot 과 동일 — 순환 import 를 피하려 여기서 구조적으로 정의). */
export type SnapshotV2 = {
  schema_version: 2
  cover: { title: string; subject: string; level: string; grade: number; unit?: string; version: number; published_at: string }
  standards: { code: string; text: string }[]
  intro: string
  reconstruction: string
  reconstruction_detail: ReconstructedStandardT[]
  learning_goals: LearningGoalT[]
  key_question: string
  unit_plan: UnitPlanT | null
  lessons: LessonT[]
  materials: MaterialT[]
  assessment: AssessmentT | null
  teacher_guide: GuideT | null
  notice_plan: NoticePlanT | null
  references: { id: string; source: string }[]
  generated_with: { models: string[] }
}

// ── v1 모양(2주차 스키마) ──────────────────────────────────────────────
type QuizV1 = { q: string; type: 'choice' | 'short'; choices: string[] | null; answer: string; explanation: string }
type LessonV1 = { no: number; standards: string[]; key_question: string; goal: string; flow: { intro: string; main: string; wrapup: string }; materials: string[]; quiz: QuizV1[]; assessment: '서술형1' | '서술형2' | '논술형' | null; mergeable_with: number | null; images?: string[] }
type MaterialV1 = { id: string; title: string; kind: 'table' | 'text' | 'chart'; body: string | null; table: MaterialT['table']; source: '자작'; images?: string[] }
type ShortRubricV1 = { levels: { points: number; expectation: string; example: string | null }[] }
type ExtendedRubricV1 = { criteria: { name: string; bands: Record<'4' | '3' | '2' | '1' | '0', string> }[] }
type ItemV1 = { kind: '서술형' | '논술형'; lesson_no: number; stem: string; conditions: { length: string; required: string[]; format: string }; points: number; rubric: ShortRubricV1 | ExtendedRubricV1 }
type AssessmentV1 = { items: ItemV1[]; grade_boundaries: { grade: number; min: number; max: number; band: '상' | '중' | '하' }[]; exemplars: { level: '상' | '중' | '하'; text: string; scores: number[]; total: number; grade: number }[]; feedback_templates: { 상: string; 중: string; 하: string } }
type GuideV1 = { general: GuideT['general']; glossary: GuideT['glossary']; per_lesson: { no: number; notes: string[] }[] }

export function isV1Snapshot(raw: unknown): boolean {
  const s = raw as { schema_version?: number; lessons?: { flow?: { intro?: unknown } }[]; assessment?: { exemplars?: unknown } | null }
  if (s?.schema_version === 2) return false
  if (Array.isArray(s?.lessons) && s.lessons[0] && typeof s.lessons[0].flow?.intro === 'string') return true
  if (s?.assessment && 'exemplars' in s.assessment) return true
  return s?.schema_version === undefined
}

const PAPER_PREFIX = /^\[종이 답안\]\s*/
const MATERIAL_ID = /(?:^|[^A-Z])([A-Z])(?![A-Z])/

export function splitMaterialsV1(items: string[]): { used: string[]; needed: string[] } {
  const used = new Set<string>(); const needed: string[] = []
  for (const s of items) {
    const m = s.match(MATERIAL_ID)
    if (m && /자료/.test(s)) used.add(m[1]); else needed.push(s)
  }
  return { used: [...used].sort(), needed }
}

/** v1 차시 → v2. cautionNotes 는 v1 지침서 per_lesson.notes(있으면). 발문·활동지는 퀴즈·핵심질문에서 결정적으로 만든다. */
export function upgradeLessonV1(l: LessonV1, cautionNotes: string[]): LessonT {
  const { used, needed } = splitMaterialsV1(l.materials)
  const isEssay = l.assessment === '논술형'
  const fromQuiz = l.quiz.map((q) => ({ prompt: q.q, expected_answer: q.answer, if_stuck: q.explanation }))
  const questions = fromQuiz.length >= 2 ? fromQuiz.slice(0, 4) : [
    { prompt: l.key_question, expected_answer: l.goal, if_stuck: l.flow.intro },
    { prompt: `${l.key_question} — 자료에서 근거가 되는 수치 하나를 찾아보자.`, expected_answer: l.goal, if_stuck: l.flow.main },
  ]
  const q = l.quiz
  const tasks = q.length >= 2
    ? [
        { no: 1, prompt: q[0].q, tier: '기본' as const, level_ref: 'D~E' as const, answer_space: 'short' as const, expected: q[0].answer },
        { no: 2, prompt: q[1].q, tier: '표준' as const, level_ref: 'C' as const, answer_space: 'short' as const, expected: q[1].answer },
        { no: 3, prompt: l.key_question, tier: '도전' as const, level_ref: 'A~B' as const, answer_space: 'lines' as const, expected: l.goal },
      ]
    : [
        { no: 1, prompt: l.key_question, tier: '기본' as const, level_ref: 'D~E' as const, answer_space: 'short' as const, expected: l.goal },
        { no: 2, prompt: `${l.key_question} 근거가 되는 자료의 수치를 두 개 적어 보자.`, tier: '표준' as const, level_ref: 'C' as const, answer_space: 'lines' as const, expected: l.goal },
        { no: 3, prompt: `${l.key_question} 자신의 판단과 이유를 문단으로 써 보자.`, tier: '도전' as const, level_ref: 'A~B' as const, answer_space: 'lines' as const, expected: l.goal },
      ]
  return {
    no: l.no, standards: l.standards, topic: l.goal.slice(0, 40), key_question: l.key_question, goal: l.goal,
    time_budget: { intro_min: 10, main_min: 40, wrapup_min: 10 },
    flow: { intro: [l.flow.intro], main: [{ step_label: isEssay ? '논술형 작성' : '전개', minutes: 40, activities: [l.flow.main] }], wrapup: [l.flow.wrapup] },
    teacher_script: { questions },
    materials_used: used, materials_needed: needed,
    caution_notes: cautionNotes.length ? cautionNotes.slice(0, 4) : [l.goal],
    worksheet: { tasks, self_check: ['오늘 핵심질문에 내 말로 답할 수 있다.'] },
    formative_check: { quiz: l.quiz },
    assessment: l.assessment, mergeable_with: l.mergeable_with, merge_note: null, images: l.images ?? [],
  }
}

export function upgradeMaterialV1(m: MaterialV1): MaterialT {
  return { id: m.id, title: m.title, kind: m.kind, body: m.body, table: m.table, source: { kind: '자작', attribution: null, ai_assisted: false }, role: 'raw', images: m.images ?? [] }
}

const VERB_HINTS: [RegExp, string][] = [[/구해|구한다|구하/, '구하다'], [/적는다|적어|적을/, '적다'], [/쓴다|쓰시오|쓸/, '쓰다'], [/고른다|고르/, '고르다'], [/정한다|정하/, '정하다'], [/나눈다|나누/, '나누다'], [/정리/, '정리하다'], [/인용/, '인용하다'], [/비교/, '비교하다'], [/설명/, '설명하다'], [/판단/, '판단하다'], [/제안/, '제안하다']]
export function verbOf(text: string): string { return VERB_HINTS.find(([re]) => re.test(text))?.[1] ?? '서술하다' }

function stemV2(stem: string, points: number): string {
  const stripped = stem.replace(/\s*[\(\[]\s*\d+\s*점\s*[\)\]]\s*$/u, '').trim()
  return `${stripped} [${points}점]`
}
function evaluationElement(stem: string): string {
  const core = stem.replace(/\s*[\(\[]\s*\d+\s*점\s*[\)\]]\s*$/u, '').replace(/\.$/, '')
  return core.replace(/(하시오|쓰시오|서술하시오|구하시오|정하시오|고르시오)$/u, '기').replace(/시오$/u, '기')
}
function fillScale(levels: { points: number; expectation: string; example: string | null }[], max: number) {
  const byPts = new Map(levels.map((l) => [l.points, l]))
  const scale = []
  let last = levels[levels.length - 1]
  for (let p = 0; p <= max; p++) {
    const hit = byPts.get(p) ?? last
    scale.push({ points: p, descriptor: p === 0 && !byPts.get(0) ? '무응답 또는 시도했으나 관련 내용 없음' : hit.expectation, example: byPts.get(p)?.example ?? null })
    if (byPts.get(p)) last = byPts.get(p)!
  }
  return scale
}

export function upgradeItemV1(it: ItemV1, exemplars: AssessmentV1['exemplars']): ItemT {
  const paper = PAPER_PREFIX.test(it.conditions.format)
  const conditions = {
    items: it.conditions.required.map((text, i) => ({ no: i + 1, text, verb: verbOf(text), points: null, category: i === it.conditions.required.length - 1 && it.conditions.required.length >= 4 ? '형식' as const : '내용' as const })),
    length: it.conditions.length, format: it.conditions.format.replace(PAPER_PREFIX, ''), answer_mode: paper ? 'paper' as const : 'screen' as const, overflow_rule: null,
  }
  const allNos = conditions.items.map((c) => c.no)
  let rubric: ItemT['rubric']; let exemplar_answers: ItemT['exemplar_answers']
  if ('levels' in it.rubric) {
    const scale = fillScale(it.rubric.levels, it.points)
    rubric = { criteria: [{ name: `${it.kind} 채점표`, axis: '과정·기능', condition_nos: allNos, max: it.points, scale }], holistic: null, notes: ['예시답안과 표현이 달라도 의미가 같으면 인정한다.'] }
    exemplar_answers = it.rubric.levels.filter((l) => l.points > 0 && l.example).map((l) => ({
      level: null, points: l.points, scores: [l.points], assumed_short_points: null, text: l.example!.length >= 20 ? l.example! : `${l.example} — ${l.expectation}`, rationale: `채점표 ${l.points}점 단계의 기대 수행에 해당함`,
    }))
  } else {
    const criteria = it.rubric.criteria.map((c) => ({ name: c.name, axis: '과정·기능' as const, condition_nos: allNos, max: 4, scale: (['0', '1', '2', '3', '4'] as const).map((k) => ({ points: Number(k), descriptor: c.bands[k], example: null })) }))
    rubric = { criteria, holistic: { 상: criteria.map((c) => c.scale[4].descriptor).join(' / '), 중: criteria.map((c) => c.scale[2].descriptor).join(' / '), 하: criteria.map((c) => c.scale[1].descriptor).join(' / ') }, notes: ['예시답안과 표현이 달라도 의미가 같으면 인정한다.'] }
    exemplar_answers = exemplars.map((e) => {
      const sum = e.scores.reduce((s, v) => s + v, 0)
      // v1 total 은 서술형 두 문항의 가정 점수를 포함했다 → 그 차이를 assumed_short_points 로 남겨 등급 밴드 대조를 유지한다
      return { level: e.level, points: sum, scores: e.scores, assumed_short_points: Math.max(0, Math.min(6, e.total - sum)), text: e.text, rationale: `채점표로 채점한 요소별 점수 ${e.scores.join('·')} = ${sum}점(서술형 ${Math.max(0, Math.min(6, e.total - sum))}점 가정 시 ${e.total}점)` }
    })
  }
  const { used } = splitMaterialsV1(it.conditions.required.concat(it.stem))
  return {
    kind: it.kind, lesson_no: it.lesson_no, points: it.points, evaluation_elements: [evaluationElement(it.stem)], situation: null,
    materials_used: used.length ? used : ['A'], stem: stemV2(it.stem, it.points), conditions, rubric, exemplar_answers,
    level_map: levelMapFor(it.points), min_competency: null, references: [],
  }
}

export function upgradeAssessmentV1(a: AssessmentV1): AssessmentT {
  return {
    items: a.items.map((it) => upgradeItemV1(it, a.exemplars)),
    grade_boundaries: a.grade_boundaries.map((b) => ({ ...b, level_ref: levelRefFor(b.grade) })),
    feedback_templates: a.feedback_templates,
  }
}

export function upgradeTeacherGuideV1(g: GuideV1, lessons: LessonT[], assessment: AssessmentT | null): GuideT {
  const merge_guide = lessons.filter((l) => l.mergeable_with !== null).map((l) => {
    const other = lessons.find((x) => x.no === l.mergeable_with)
    return { lessons: [l.no, l.mergeable_with!] as [number, number], skip_activities: other ? other.flow.intro : l.flow.wrapup, time_budget_120: { intro_min: 10, main_min: 90, wrapup_min: 20 } }
  })
  const common_errors = (assessment?.items ?? []).map((it, i) => {
    const c = it.rubric.criteria[0]
    return { item_no: i + 1, error: c.scale[1]?.descriptor ?? c.scale[0].descriptor, how_to_read: c.scale[c.max].descriptor }
  })
  return {
    general: g.general, glossary: g.glossary, merge_guide,
    grading_guide: {
      common_errors: common_errors.length >= 3 ? common_errors : [...common_errors, ...Array.from({ length: 3 - common_errors.length }, (_, i) => ({ item_no: common_errors.length + i + 1, error: '관련 내용 없이 제출', how_to_read: '채점표 0점 서술을 적용' }))],
      review_tips: ['요소마다 인용된 근거 문장이 학생 답안에 실제로 있는지 먼저 확인한다.', '채점 시 유의점의 관용 범위(표현 차이·반올림)를 적용한 뒤 점수를 조정하고 조정 이유를 남긴다.'],
      retry_guidance: '확정 뒤 보완할 점을 읽고 스스로 고칠 수 있는 학생에게 재도전을 연다. 향상된 부분을 안내장에 적는다.',
    },
    per_lesson: g.per_lesson.map((p) => ({ no: p.no, notes: p.notes.slice(0, 3) })),
  }
}

export function upgradeReconstructionV1(standards: { code: string; text: string }[]): ReconstructedStandardT[] {
  return standards.map((s) => ({ code: s.code, original_text: s.text, reconstruction_type: '유지', merged_with: [], reconstructed_text: s.text, reason: ['4~6차시 압축'], learning_elements: [s.text] }))
}

function unitPlanFrom(title: string, keyQuestion: string, lessons: LessonT[], a: AssessmentT | null): UnitPlanT {
  return {
    set_title: title, set_key_question: keyQuestion || lessons[0]?.key_question || title,
    lesson_map: lessons.map((l) => ({ lesson_no: l.no, standards: l.standards, topic: l.topic })),
    assessment_plan: {
      formative: '차시별 마무리 퀴즈 3문항(논술형 차시는 0문항)',
      summative_placement: lessons.filter((l) => l.assessment).map((l) => ({ lesson_no: l.no, kind: l.assessment! })),
      rubric_note: a?.feedback_templates ?? { 상: '요구한 요소를 모두 충족', 중: '핵심 요소를 충족하나 설명이 부분적', 하: '일부 요소만 충족' },
    },
  }
}

export function upgradeSnapshot(raw: unknown): SnapshotV2 {
  if (!isV1Snapshot(raw)) return raw as SnapshotV2
  const s = raw as { cover: SnapshotV2['cover']; standards: SnapshotV2['standards']; intro: string; reconstruction: string; learning_goals: (string | LearningGoalT)[]; key_question: string; lessons: LessonV1[]; materials: MaterialV1[]; assessment: AssessmentV1 | null; teacher_guide: GuideV1 | null; generated_with: { models: string[] } }
  const notesFor = (no: number) => s.teacher_guide?.per_lesson.find((p) => p.no === no)?.notes ?? []
  const lessons = (s.lessons ?? []).map((l) => upgradeLessonV1(l, notesFor(l.no)))
  const assessment = s.assessment ? upgradeAssessmentV1(s.assessment) : null
  return {
    schema_version: 2, cover: s.cover, standards: s.standards, intro: s.intro,
    reconstruction: s.reconstruction, reconstruction_detail: upgradeReconstructionV1(s.standards),
    learning_goals: (s.learning_goals ?? []).map((g) => (typeof g === 'string' ? { text: g, axis: '과정·기능' as const } : g)),
    key_question: s.key_question,
    unit_plan: unitPlanFrom(s.cover.title, s.key_question, lessons, assessment),
    lessons, materials: (s.materials ?? []).map(upgradeMaterialV1), assessment,
    teacher_guide: s.teacher_guide ? upgradeTeacherGuideV1(s.teacher_guide, lessons, assessment) : null,
    notice_plan: null, references: [], generated_with: s.generated_with,
  }
}
```

- [ ] **Step 10: `lib/studio/checks.ts`**

```ts
import type { z } from 'zod'
import { checkReconstructionFidelity } from './fidelity'
import type { Stage, ReviewKind, Reconstruction, LessonDesign, Materials, Assessment, TeacherGuide, NoticePlan } from './schemas'

export type Issue = { kind: ReviewKind; detail: string }
export type CheckCtx = { standards: { code: string; text: string }[]; prior: Record<string, unknown> }
type ReconstructionT = z.infer<typeof Reconstruction>; type LessonDesignT = z.infer<typeof LessonDesign>; type MaterialsT = z.infer<typeof Materials>
type AssessmentT = z.infer<typeof Assessment>; type GuideT = z.infer<typeof TeacherGuide>; type NoticePlanT = z.infer<typeof NoticePlan>

const norm = (s: string) => s.replace(/[\s·,.]/g, '')
/** 부사만 다른 인접 척도 휴리스틱: 정도부사를 지운 뒤 같은 문장이면 참(스펙 §2.5 [TS]-9). */
const ADVERBS = /(매우|아주|다소|대체로|비교적|약간|조금|충분히|정확하게|정확히|적절하게|적절히|효과적으로|부분적으로|거의|상당히|명확하게|구체적으로)\s*/g
export const adverbOnlyDiff = (a: string, b: string) => norm(a.replace(ADVERBS, '')) === norm(b.replace(ADVERBS, '')) && norm(a) !== norm(b)

/** 안내장 문장 규칙(부록 A N-01·02·05·12)의 기계 검사 부분. lib/classroom/notice-lint.ts(T8)가 학생별 안내장에도 같은 목록을 쓴다. */
export const NOTICE_FORBIDDEN: [RegExp, string][] = [
  [/못한다|못했다|못함|실패|모른다|모릅니다/, '부정 서술어(못한다/실패/모른다) 대신 "~하는 데 어려움이 있다"'],
  [/등수|석차|상위\s*\d+%|백분위|평균보다/, '등수·백분위·비교 표현 금지'],
  [/(매우 우수|보통|미흡)\s*[.!]?$/, '단독 평어로 문장을 끝내지 않음'],
]
const SUGGEST_ENDINGS = /(봅시다|하세요|해요|하기 바랍니다|보세요)[.!]?$/

function reconstructionIssues(o: ReconstructionT, ctx: CheckCtx): Issue[] {
  const issues: Issue[] = []
  const byCode = new Map(ctx.standards.map((s) => [s.code, s.text]))
  for (const s of o.standards) {
    const original = byCode.get(s.code)
    if (!original) { issues.push({ kind: 'fidelity', detail: `${s.code}: 세트에 없는 성취기준` }); continue }
    if (norm(original) !== norm(s.original_text)) issues.push({ kind: 'fidelity', detail: `${s.code}: 원문 불일치` })
    const sources = [original, ...s.merged_with.map((c) => byCode.get(c) ?? '')]
    const f = checkReconstructionFidelity(s.reconstructed_text, sources)
    if (!f.ok) issues.push({ kind: 'fidelity', detail: `${s.code}: 원문에 없는 표현 ${f.unknownTokens.join(', ')}` })
  }
  const all = checkReconstructionFidelity(o.reconstruction, ctx.standards.map((s) => s.text))
  if (!all.ok) issues.push({ kind: 'fidelity', detail: `통합 문장: 원문에 없는 표현 ${all.unknownTokens.join(', ')}` })
  return issues
}

function lessonIssues(o: LessonDesignT, ctx: CheckCtx): Issue[] {
  const issues: Issue[] = []
  const covered = new Set(o.lessons.flatMap((l) => l.standards))
  for (const s of ctx.standards) if (!covered.has(s.code)) issues.push({ kind: 'coverage', detail: `${s.code}가 어느 차시에도 배정되지 않음` })
  const placed = o.lessons.filter((l) => l.assessment)
  const order = placed.map((l) => l.assessment)
  if (order.join(',') !== '서술형1,서술형2,논술형') issues.push({ kind: 'coverage', detail: `평가 배치 순서가 서술형1→서술형2→논술형이 아님(${order.join(',')})` })
  if (placed.length && placed[placed.length - 1].no !== o.lessons[o.lessons.length - 1].no) issues.push({ kind: 'coverage', detail: '논술형이 마지막 차시가 아님' })
  for (const l of o.lessons) {
    if (l.mergeable_with !== null) {
      const other = o.lessons.find((x) => x.no === l.mergeable_with)
      if (!other || Math.abs(other.no - l.no) !== 1) issues.push({ kind: 'other', detail: `${l.no}차시 병합 대상이 인접 차시가 아님` })
      else if (l.assessment && other.assessment) issues.push({ kind: 'other', detail: `${l.no}·${other.no}차시 병합: 둘 다 서·논술형 차시` })
    }
    if (l.flow.main.length < 2) issues.push({ kind: 'other', detail: `${l.no}차시 전개 소단계가 2개 미만` })
    for (const [i, q] of l.formative_check.quiz.entries()) {
      if (q.type === 'choice' && (!q.choices || !q.choices.includes(q.answer))) issues.push({ kind: 'quiz', detail: `${l.no}차시 퀴즈 ${i + 1}: 정답이 보기에 없음` })
    }
    for (const q of l.teacher_script.questions) if (norm(q.if_stuck) === norm(q.expected_answer)) issues.push({ kind: 'other', detail: `${l.no}차시 발문 힌트가 정답과 같음` })
  }
  return issues
}

function materialIssues(o: MaterialsT): Issue[] {
  const issues: Issue[] = []
  for (const m of o.materials) {
    if (m.table) {
      if (m.table.rows.length > 25) issues.push({ kind: 'other', detail: `자료 ${m.id}: 표가 25행을 넘음(${m.table.rows.length}행)` })
      if (m.table.columns.length > 6) issues.push({ kind: 'other', detail: `자료 ${m.id}: 열이 6개를 넘음` })
      for (const r of m.table.rows) if (r.length !== m.table.columns.length) { issues.push({ kind: 'other', detail: `자료 ${m.id}: 행 길이가 열 수와 다름` }); break }
    }
    if (m.source.kind === '공개') issues.push({ kind: 'source', detail: `자료 ${m.id}: 공개 자료(${m.source.attribution}) — 확정 전 출처 확인 필요` })
    if (m.source.ai_assisted) issues.push({ kind: 'source', detail: `자료 ${m.id}: AI 보조 자료 — 원장 확인 필요` })
    if (m.body && /(따라서|그러므로|결론적으로|가장 먼저 줄여야)/.test(m.body)) issues.push({ kind: 'other', detail: `자료 ${m.id}: 본문에 결론 문장이 있음` })
  }
  return issues
}

function assessmentIssues(o: AssessmentT, ctx: CheckCtx): Issue[] {
  const issues: Issue[] = []
  const materials = ((ctx.prior.stage4 as MaterialsT | undefined)?.materials ?? []).concat(((ctx.prior.shared_materials as MaterialsT['materials'] | undefined) ?? []))
  const byId = new Map(materials.map((m) => [m.id, m]))
  for (const [i, it] of o.items.entries()) {
    for (const id of it.materials_used) if (materials.length && !byId.has(id)) issues.push({ kind: 'other', detail: `문항 ${i + 1}: 없는 자료 ${id}` })
    if (materials.length && !it.materials_used.some((id) => byId.get(id)?.role === 'raw')) issues.push({ kind: 'other', detail: `문항 ${i + 1}: 원자료(raw)를 하나도 참조하지 않음` })
    for (const c of it.rubric.criteria) {
      const sorted = [...c.scale].sort((a, b) => a.points - b.points)
      for (let k = 1; k < sorted.length; k++) if (adverbOnlyDiff(sorted[k - 1].descriptor, sorted[k].descriptor)) issues.push({ kind: 'level', detail: `문항 ${i + 1} ${c.name}: ${sorted[k - 1].points}→${sorted[k].points}점이 부사만 다름` })
      if (!/무응답|미응답|미작성/.test(sorted[0].descriptor) || !/시도|일부|관련/.test(sorted[0].descriptor)) issues.push({ kind: 'rubric', detail: `문항 ${i + 1} ${c.name}: 0점 서술에 무응답·시도 구분이 없음` })
    }
    if (it.kind === '서술형' && !it.exemplar_answers.some((e) => e.points > 0 && e.points < it.points)) issues.push({ kind: 'rubric', detail: `문항 ${i + 1}: 부분점수 예시답안이 없음` })
    if (it.kind === '논술형' && !it.situation) issues.push({ kind: 'other', detail: '논술형에 과제 상황(역할·청중·목적·결과물)이 없음' })
    if (it.kind === '논술형' && !it.rubric.criteria.some((c) => c.axis === '가치·태도')) issues.push({ kind: 'level', detail: '논술형 4요소 중 가치·태도 축이 없음(정당화 가능성 기준으로 서술)' })
  }
  return issues
}

function guideIssues(o: GuideT, ctx: CheckCtx): Issue[] {
  const lessons = ((ctx.prior.stage3 as LessonDesignT | undefined)?.lessons ?? [])
  const issues: Issue[] = []
  for (const m of o.merge_guide) {
    const [a, b] = m.lessons
    const la = lessons.find((l) => l.no === a)
    if (lessons.length && la?.mergeable_with !== b && lessons.find((l) => l.no === b)?.mergeable_with !== a) issues.push({ kind: 'other', detail: `병합 안내 ${a}·${b}가 3단계 병합 표시와 다름` })
  }
  if (lessons.length && o.per_lesson.length !== lessons.length) issues.push({ kind: 'other', detail: '차시별 메모 수가 차시 수와 다름' })
  return issues
}

export function noticeTextIssues(text: string, where: string): Issue[] {
  const issues: Issue[] = []
  for (const [re, why] of NOTICE_FORBIDDEN) if (re.test(text)) issues.push({ kind: 'notice', detail: `${where}: "${text.match(re)?.[0]}" — ${why}` })
  return issues
}
function noticePlanIssues(o: NoticePlanT): Issue[] {
  const issues: Issue[] = []
  for (const p of o.per_lesson) {
    for (const [field, text] of [['topic_summary', p.topic_summary], ['preview', p.preview], ['home_study_suggestion', p.home_study_suggestion]] as const) issues.push(...noticeTextIssues(text, `${p.lesson_no}차시 ${field}`))
    if (!SUGGEST_ENDINGS.test(p.home_study_suggestion.trim())) issues.push({ kind: 'notice', detail: `${p.lesson_no}차시 가정 학습 제안이 청유형으로 끝나지 않음` })
    for (const q of p.quiz_notes) issues.push(...noticeTextIssues(q.wrong_note, `${p.lesson_no}차시 퀴즈 ${q.quiz_no}`))
    for (const c of p.criteria_phrases ?? []) for (const t of [...c.good, ...c.improve]) issues.push(...noticeTextIssues(t, `${p.lesson_no}차시 ${c.criterion_name}`))
  }
  return issues
}

/** 검토 AI를 부르기 전에 도는 순수 검사. 빈 배열이면 통과. zod 가 이미 거른 것은 다시 검사하지 않는다. */
export function staticIssues(stage: Stage, output: unknown, ctx: CheckCtx): Issue[] {
  switch (stage) {
    case 2: return reconstructionIssues(output as ReconstructionT, ctx)
    case 3: return lessonIssues(output as LessonDesignT, ctx)
    case 4: return materialIssues(output as MaterialsT)
    case 5: return assessmentIssues(output as AssessmentT, ctx)
    case 6: return guideIssues(output as GuideT, ctx)
    case 7: return noticePlanIssues(output as NoticePlanT)
    default: return []
  }
}
```

- [ ] **Step 11: 통과 확인** — `npx vitest run tests/studio-schemas.test.ts tests/level-map.test.ts tests/compat.test.ts tests/checks.test.ts` → PASS. compat 테스트의 논술형 예시답안 밴드 대조(상=15+6=21→상, 중=?+6, 하=?+6)가 v1 fixture 점수로 실패하면 `tests/fixtures/v1/stage5-generate.json`이 아니라 검사 규칙이 맞는지 먼저 확인하고, fixture 예시 점수가 v1 등급표와 어긋난 것이면 v1 사본의 `scores`만 밴드에 맞게 고친다(원본 fixture는 T6에서 어차피 재생성).

- [ ] **Step 12: Commit**

```bash
git add lib/studio/schemas.ts lib/studio/level-map.ts lib/studio/compat.ts lib/studio/checks.ts tests/studio-schemas.test.ts tests/level-map.test.ts tests/compat.test.ts tests/checks.test.ts tests/fixtures/v1
git commit -m "feat(studio): v2 스키마(0~7단계)·수준 구간·v1 스냅샷 업그레이드·정적 검사

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: 성취수준 로더 · 예시 은행 선택기 · enrich(서버 채움)

**Files:**
- Create: `lib/reference/levels.ts`, `lib/reference/exemplars.ts`, `lib/studio/enrich.ts`
- Test: `tests/levels.test.ts`, `tests/exemplars-select.test.ts`, `tests/enrich.test.ts`

**Interfaces:**
- Produces (`levels.ts`): `getLevels(code: string): LevelRecord | null` — `{ code, text, scheme: 'A-E' | 'ABC', levels: Record<string, string>, merged_levels: string[][], domain: string | null, unit: string | null, school_level: '초' | '중', subject: string }`; `getDomainLevels(code: string): DomainLevels | null` — `{ domain, levels: Record<string, { '지식·이해'?: string; '과정·기능'?: string; '가치·태도'?: string } | string> }`; `anchorLevel(scheme): 'C' | 'B'`; `minimumLevel(scheme): 'E' | 'C'`; `levelFileFor(code): string | null`. 파일은 `data/reference/levels/<과목>-<초|중>.json`, 처음 읽을 때 모듈 캐시.
- Produces (`exemplars.ts`): `selectExemplars(q: ExemplarQuery, n = 4): ExemplarRecord[]`, `scoreExemplar(r, q): number`, `exemplarCard(r): string`(≤ 900자), `exemplarsBlock(q, n): string`, `loadExemplarBank(): ExemplarRecord[]`. `ExemplarQuery = { subject: string; school_level: '초' | '중' | '고'; grade: number | null; codes: string[]; unit: string | null; kind: '서술형' | '논술형' | '수행' | 'any'; answerMode?: 'screen' | 'paper' }`.
- Produces (`enrich.ts`): `enrichOutput(stage: Stage, output: unknown, ctx: { standards: { code: string; text: string }[]; prior: Record<string, unknown> }): unknown` — 2단계 `level_anchor`(C 문장), 5단계 `min_competency`가 null이면 그 문항 차시의 첫 성취기준 E 문장. 그 외 단계는 그대로.
- Consumes: `data/reference/levels/*.json`, `data/reference/exemplars/**/*.json`(`_pagemap-2025.json` 제외).

- [ ] **Step 1: 실패 테스트**

```ts
// tests/levels.test.ts
import { describe, it, expect } from 'vitest'
import { getLevels, getDomainLevels, levelFileFor, anchorLevel, minimumLevel } from '@/lib/reference/levels'

describe('levels loader', () => {
  it('maps codes to files by subject letter and school digit', () => {
    expect(levelFileFor('[9수04-02]')).toMatch(/수학-중\.json$/)
    expect(levelFileFor('[6국02-01]')).toMatch(/국어-초\.json$/)
    expect(levelFileFor('[9역01-01]')).toMatch(/역사-중\.json$/)
    expect(levelFileFor('[9사(일사)01-03]')).toMatch(/사회-중\.json$/)
    expect(levelFileFor('[12화학Ⅰ01-02]')).toBeNull()
  })
  it('returns A~E statements for a middle-school code and the anchor/minimum levels', () => {
    const r = getLevels('[9수04-02]')!
    expect(r.scheme).toBe('A-E'); expect(Object.keys(r.levels).sort()).toEqual(['A', 'B', 'C', 'D', 'E'])
    expect(r.levels.C).toContain('주어진 자료')
    expect(anchorLevel(r.scheme)).toBe('C'); expect(minimumLevel(r.scheme)).toBe('E')
    expect(getLevels('[9수99-99]')).toBeNull()
  })
  it('returns domain-level three-axis statements', () => {
    const d = getDomainLevels('[9수04-03]')!
    expect(d.domain).toBe('자료와 가능성')
    const c = d.levels.C as Record<string, string>
    expect(c['가치·태도']).toBeTruthy()
  })
})
```

```ts
// tests/exemplars-select.test.ts
import { describe, it, expect } from 'vitest'
import { selectExemplars, scoreExemplar, exemplarCard, exemplarsBlock, loadExemplarBank, type ExemplarRecord } from '@/lib/reference/exemplars'

const rec = (over: Partial<ExemplarRecord>): ExemplarRecord => ({
  id: 'x', subject: '수학', school_level: '중', grade: 1, unit: '자료의 정리', standard_codes: ['[9수04-02]'], kind: '서술형', points: 3, context: 'c', materials: [],
  stem: '도수분포표를 완성하시오.', conditions: ['표를 채울 것'], answer_format: '표', rubric: { type: '분석적', criteria: [{ name: '표 완성', levels: [{ points: 3, desc: '정확' }] }], notes: '반올림 허용' },
  exemplar_answers: [{ level: '만점', text: 'a'.repeat(400) }], feedback: 'f', cognitive: ['과정·기능'], source: { file: 'x.pdf', pages: [1, 2] }, ...over,
})
const q = { subject: '수학', school_level: '중' as const, grade: 1, codes: ['[9수04-02]'], unit: '자료의 정리', kind: '서술형' as const }

describe('exemplar selection', () => {
  it('scores by code > domain prefix > unit > grade > kind > rubric/answers > 2025', () => {
    expect(scoreExemplar(rec({}), q)).toBe(4 + 3 + 2 + 2 + 3 + 1 + 1)
    expect(scoreExemplar(rec({ standard_codes: ['[9수04-05]'], unit: '다른' }), q)).toBe(3 + 2 + 3 + 1 + 1)
    expect(scoreExemplar(rec({ kind: '논술형' }), { ...q, kind: '논술형' })).toBe(4 + 3 + 2 + 2 + 3 + 1 + 1)
    expect(scoreExemplar(rec({ id: 'k25-과학-01', requires_drawing: true }), { ...q, answerMode: 'screen' })).toBe(4 + 3 + 2 + 2 + 3 + 1 + 1 + 1 - 2)
  })
  it('is deterministic (ties by id) and widens school level when fewer than 3 candidates', () => {
    const bank = [rec({ id: 'b', school_level: '고' }), rec({ id: 'a' }), rec({ id: 'c', school_level: '고' })]
    expect(selectExemplars(q, 3, bank).map((r) => r.id)).toEqual(['a', 'b', 'c'])
  })
  it('card is compact and cites the source; block lists 3~5 cards', () => {
    const card = exemplarCard(rec({}))
    expect(card.length).toBeLessThanOrEqual(900)
    expect(card).toContain('x.pdf p.1-2'); expect(card).toContain('반올림 허용')
    const block = exemplarsBlock(q, 4, [rec({ id: '1' }), rec({ id: '2' }), rec({ id: '3' })])
    expect(block.split('\n[예시 ').length - 1).toBe(3)
    expect(block).toMatch(/그대로 옮기지 않는다/)
  })
  it('loads the real bank once and finds 수학·중 records for [9수04-02] neighbours', () => {
    const bank = loadExemplarBank()
    expect(bank.length).toBeGreaterThan(400)
    const picked = selectExemplars(q, 4)
    expect(picked.length).toBeGreaterThanOrEqual(3)
    expect(picked.every((r) => r.subject === '수학')).toBe(true)
  })
})
```

```ts
// tests/enrich.test.ts
import { describe, it, expect } from 'vitest'
import { enrichOutput } from '@/lib/studio/enrich'
import { assessmentV2 } from './studio-schemas.test'

const standards = [{ code: '[9수04-02]', text: 't1' }, { code: '[9수04-03]', text: 't2' }]
describe('enrichOutput', () => {
  it('stage 2: fills level_anchor with C statements per standard', () => {
    const out = enrichOutput(2, { standards: [], reconstruction: 'r', learning_goals: [], level_anchor: [], key_question_candidates: [] }, { standards, prior: {} }) as { level_anchor: { code: string; level: string; statement: string }[] }
    expect(out.level_anchor.map((a) => [a.code, a.level])).toEqual([['[9수04-02]', 'C'], ['[9수04-03]', 'C']])
    expect(out.level_anchor[0].statement).toContain('주어진 자료')
  })
  it('stage 5: fills min_competency (E) from the lesson standard when null, keeps a given value', () => {
    const prior = { stage3: { lessons: [{ no: 2, standards: ['[9수04-02]'] }, { no: 4, standards: ['[9수04-03]'] }, { no: 5, standards: ['[9수04-03]'] }] } }
    const out = enrichOutput(5, structuredClone(assessmentV2), { standards, prior }) as typeof assessmentV2
    expect(out.items[0].min_competency).toContain('부분적으로')
    expect(out.items[1].min_competency).toContain('상대도수')
    const given = structuredClone(assessmentV2); given.items[0].min_competency = '이미 있음'
    expect((enrichOutput(5, given, { standards, prior }) as typeof assessmentV2).items[0].min_competency).toBe('이미 있음')
  })
  it('other stages pass through', () => { const o = { a: 1 }; expect(enrichOutput(4, o, { standards, prior: {} })).toBe(o) })
})
```

- [ ] **Step 2: 실패 확인** — `npx vitest run tests/levels.test.ts tests/exemplars-select.test.ts tests/enrich.test.ts` → FAIL.

- [ ] **Step 3: `lib/reference/levels.ts`**

```ts
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

export type LevelRecord = { code: string; text: string; scheme: 'A-E' | 'ABC'; levels: Record<string, string>; merged_levels: string[][]; domain: string | null; unit: string | null; school_level: '초' | '중'; subject: string }
export type DomainLevels = { domain: string; levels: Record<string, Record<string, string> | string> }
type LevelFile = { subject: string; school_level: '초' | '중'; scheme: 'A-E' | 'ABC'; standards: { code: string; text: string; domain?: string | null; unit?: string | null; levels: Record<string, string>; merged_levels?: string[][] }[]; domain_levels: { domain: string; levels: Record<string, Record<string, string> | string> }[] }

const DIR = ['data', 'reference', 'levels']
const SUBJECT_BY_LETTER: Record<string, string> = { '국': '국어', '수': '수학', '과': '과학', '사': '사회', '영': '영어', '역': '역사', '도': '도덕' }

/** 코드의 첫 숫자(2·4·6=초, 9=중)와 과목 글자로 파일을 정한다. 고등(10·12…)은 아직 파일이 없어 null. */
export function levelFileFor(code: string): string | null {
  const m = /^\[(\d+)([가-힣])/.exec(code)
  if (!m) return null
  const digit = Number(m[1]); const subject = SUBJECT_BY_LETTER[m[2]]
  if (!subject) return null
  const school = digit === 9 ? '중' : [2, 4, 6].includes(digit) ? '초' : null
  if (!school) return null
  return join(process.cwd(), ...DIR, `${subject}-${school}.json`)
}

const cache = new Map<string, LevelFile | null>()
function loadFile(path: string): LevelFile | null {
  if (!cache.has(path)) cache.set(path, existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as LevelFile) : null)
  return cache.get(path) ?? null
}

export function getLevels(code: string): LevelRecord | null {
  const path = levelFileFor(code); if (!path) return null
  const file = loadFile(path); if (!file) return null
  const s = file.standards.find((x) => x.code === code); if (!s) return null
  return { code: s.code, text: s.text, scheme: file.scheme, levels: s.levels, merged_levels: s.merged_levels ?? [], domain: s.domain ?? null, unit: s.unit ?? null, school_level: file.school_level, subject: file.subject }
}

export function getDomainLevels(code: string): DomainLevels | null {
  const r = getLevels(code); if (!r || !r.domain) return null
  const file = loadFile(levelFileFor(code)!)!
  const d = file.domain_levels.find((x) => x.domain === r.domain)
  return d ? { domain: d.domain, levels: d.levels } : null
}

export const anchorLevel = (scheme: LevelRecord['scheme']) => (scheme === 'A-E' ? 'C' : 'B') as 'C' | 'B'
export const minimumLevel = (scheme: LevelRecord['scheme']) => (scheme === 'A-E' ? 'E' : 'C') as 'E' | 'C'

/** 프롬프트용 블록: 성취기준마다 수준 문장 전부(병합 칸은 "A·B 동일"). */
export function levelsBlock(codes: string[]): string {
  const lines: string[] = []
  for (const code of codes) {
    const r = getLevels(code); if (!r) continue
    lines.push(`${code} 성취수준(도달점 = ${anchorLevel(r.scheme)}, 최소 = ${minimumLevel(r.scheme)}):`)
    const merged = new Map<string, string>()
    for (const group of r.merged_levels) for (const lv of group) merged.set(lv, group.join('·'))
    for (const [lv, text] of Object.entries(r.levels)) lines.push(`  ${merged.get(lv) ?? lv}: ${text}`)
  }
  return lines.join('\n')
}
```

- [ ] **Step 4: `lib/reference/exemplars.ts`**

```ts
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

export type ExemplarRecord = {
  id: string; subject: string; school_level: '초' | '중' | '고'; grade: number | null; unit: string | null; standard_codes: string[]
  kind: '서술형' | '논술형' | '수행' | '서·논술형'; points: number | null; context: string | null; materials: { type: string; summary: string }[]
  stem: string; conditions: string[]; answer_format: string | null
  rubric: { type: string; criteria: { name: string; levels: { points: number | null; desc: string }[] }[]; notes?: string | null; min_competency?: string | null }
  exemplar_answers: { level: string; text: string }[]; feedback: string | null; cognitive: string[]; source: { file: string; pages: number[] }
  strand?: string; evaluation_elements?: string[]; requires_drawing?: boolean
}
export type ExemplarQuery = { subject: string; school_level: '초' | '중' | '고'; grade: number | null; codes: string[]; unit: string | null; kind: '서술형' | '논술형' | '수행' | 'any'; answerMode?: 'screen' | 'paper' }

const ROOT = ['data', 'reference', 'exemplars']
const FOLDER_FOR: Record<string, string[]> = { '국어': ['국어'], '수학': ['수학'], '영어': ['영어'], '과학': ['과학', '2025'], '사회': ['사회', '2025'], '한국사': ['역사', '2025'], '세계사': ['역사', '2025'], '역사': ['역사', '2025'] }

let bank: ExemplarRecord[] | null = null
export function loadExemplarBank(): ExemplarRecord[] {
  if (bank) return bank
  const out: ExemplarRecord[] = []
  const root = join(process.cwd(), ...ROOT)
  for (const folder of readdirSync(root)) {
    const dir = join(root, folder)
    if (!statSync(dir).isDirectory()) continue
    for (const f of readdirSync(dir)) {
      if (!f.endsWith('.json') || f.startsWith('_') || f.startsWith('README')) continue
      const data = JSON.parse(readFileSync(join(dir, f), 'utf8')) as unknown
      const recs = Array.isArray(data) ? data : (Object.values(data as Record<string, unknown>).find((v) => Array.isArray(v)) as unknown[] | undefined) ?? []
      for (const r of recs as ExemplarRecord[]) if (r && typeof r.stem === 'string') out.push({ ...r, subject: r.subject === '역사' || r.subject === '한국사' ? '역사' : r.subject })
    }
  }
  bank = out
  return out
}

const prefix = (code: string) => code.replace(/^\[(\d+[가-힣]+(?:\([가-힣]+\))?\d{2}).*$/u, '$1')
const sameKind = (r: ExemplarRecord['kind'], k: ExemplarQuery['kind']) => k === 'any' || r === k || (k === '논술형' && r === '서·논술형')

export function scoreExemplar(r: ExemplarRecord, q: ExemplarQuery): number {
  let s = 0
  if (r.standard_codes.some((c) => q.codes.includes(c))) s += 4
  if (r.standard_codes.some((c) => q.codes.some((qc) => prefix(qc) === prefix(c)))) s += 3
  if (q.unit && r.unit && r.unit === q.unit) s += 2
  if (q.grade !== null && r.grade === q.grade) s += 2
  if (sameKind(r.kind, q.kind)) s += 3
  if (r.rubric?.criteria?.length) s += 1
  if (r.exemplar_answers?.length) s += 1
  if (r.id.startsWith('k25-')) s += 1
  if (r.requires_drawing && q.answerMode === 'screen') s -= 2
  return s
}

const subjectKey = (subject: string) => (subject === '한국사' || subject === '세계사' ? '역사' : subject)

export function selectExemplars(q: ExemplarQuery, n = 4, source: ExemplarRecord[] = loadExemplarBank()): ExemplarRecord[] {
  const folders = FOLDER_FOR[q.subject] ?? [q.subject]
  const bySubject = source.filter((r) => r.subject === subjectKey(q.subject) || folders.includes(r.subject))
  const rank = (list: ExemplarRecord[]) => [...list].sort((a, b) => scoreExemplar(b, q) - scoreExemplar(a, q) || a.id.localeCompare(b.id))
  let pool = bySubject.filter((r) => r.school_level === q.school_level)
  if (pool.length < 3) pool = bySubject
  let ranked = rank(pool.filter((r) => sameKind(r.kind, q.kind)))
  if (ranked.length < 3) ranked = rank(pool)
  return ranked.slice(0, n)
}

const cut = (s: string | null | undefined, n: number) => (s ?? '').replace(/\s+/g, ' ').slice(0, n)
export function exemplarCard(r: ExemplarRecord): string {
  const pages = r.source.pages.length ? ` p.${r.source.pages[0]}${r.source.pages.length > 1 ? `-${r.source.pages[r.source.pages.length - 1]}` : ''}` : ''
  const crit = r.rubric?.criteria?.map((c) => `${c.name}(${c.levels.map((l) => l.points ?? '-').join('/')})`).join(', ') ?? ''
  const lines = [
    `[예시 ${r.id}] ${r.subject} ${r.school_level}${r.grade ?? ''} ${r.kind} ${r.points ?? '-'}점 · ${cut(r.unit, 30)} · ${r.standard_codes.join(' ')}`,
    `자료: ${cut(r.context, 120)}`,
    `문두: ${cut(r.stem, 220)}`,
    r.conditions.length ? `조건: ${cut(r.conditions.join(' / '), 200)}` : '',
    crit ? `채점 요소: ${cut(crit, 150)}` : '',
    r.rubric?.notes ? `유의점: ${cut(r.rubric.notes, 100)}` : '',
    r.exemplar_answers[0] ? `예시답안(${r.exemplar_answers[0].level}): ${cut(r.exemplar_answers[0].text, 200)}` : '',
    `출처: ${r.source.file}${pages}`,
  ].filter(Boolean)
  return lines.join('\n').slice(0, 900)
}

export function exemplarsBlock(q: ExemplarQuery, n = 4, source?: ExemplarRecord[]): string {
  const picked = selectExemplars(q, n, source)
  if (!picked.length) return ''
  return ['참고 예시(공개 자료, 형식·조건·채점표의 패턴만 참고하고 문장·수치를 그대로 옮기지 않는다. 참고한 id를 references에 남긴다):', ...picked.map(exemplarCard)].join('\n')
}
```

- [ ] **Step 5: `lib/studio/enrich.ts`**

```ts
import type { Stage } from './schemas'
import { getLevels, anchorLevel, minimumLevel } from '@/lib/reference/levels'

type Ctx = { standards: { code: string; text: string }[]; prior: Record<string, unknown> }
type Stage2 = { level_anchor: { code: string; level: 'B' | 'C'; statement: string }[] }
type Stage5 = { items: { lesson_no: number; min_competency: string | null }[] }
type Stage3Prior = { lessons?: { no: number; standards: string[] }[] }

/** 서버가 채우는 값(AI가 짓지 않음): 2단계 도달점 문장, 5단계 최소 능력(E) 문장. */
export function enrichOutput(stage: Stage, output: unknown, ctx: Ctx): unknown {
  if (stage === 2) {
    const o = output as Stage2
    const level_anchor = ctx.standards.flatMap((s) => {
      const r = getLevels(s.code); if (!r) return []
      const level = anchorLevel(r.scheme)
      return [{ code: s.code, level, statement: r.levels[level] ?? '' }]
    })
    return { ...o, level_anchor }
  }
  if (stage === 5) {
    const o = output as Stage5
    const lessons = (ctx.prior.stage3 as Stage3Prior | undefined)?.lessons ?? []
    const items = o.items.map((it) => {
      if (it.min_competency) return it
      const code = lessons.find((l) => l.no === it.lesson_no)?.standards[0] ?? ctx.standards[0]?.code
      const r = code ? getLevels(code) : null
      return { ...it, min_competency: r ? r.levels[minimumLevel(r.scheme)] ?? null : null }
    })
    return { ...o, items }
  }
  return output
}
```

- [ ] **Step 6: 통과 확인** — `npx vitest run tests/levels.test.ts tests/exemplars-select.test.ts tests/enrich.test.ts` → PASS. `exemplars-select`의 실제 은행 테스트가 3개 미만이면 `FOLDER_FOR['수학']`과 파일 목록(`data/reference/exemplars/수학/*.json`)을 확인한다.

- [ ] **Step 7: Commit**

```bash
git add lib/reference/levels.ts lib/reference/exemplars.ts lib/studio/enrich.ts tests/levels.test.ts tests/exemplars-select.test.ts tests/enrich.test.ts
git commit -m "feat(reference): 성취수준 로더·예시 은행 선택기·서버 채움(enrich)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: 규칙 v2(부록 A → 코드) + 생성 프롬프트 v2(성취수준·예시 은행·서식 주입)

**Files:**
- Create: `lib/studio/prompts/rules/types.ts`, `rules/common.ts`, `rules/lesson.ts`, `rules/grading.ts`, `rules/notice.ts`, `rules/subjects/{국어,수학,사회,역사,과학,영어}.ts`, `rules/index.ts`
- Modify: `lib/studio/prompts/rules.ts`(재작성: 재수출), `lib/studio/prompts/stages.ts`(과제문·블록)
- Test: `tests/rules.test.ts`, `tests/prompts.test.ts`(재작성)

**Interfaces:**
- Produces: `type Rule = { id: string; text: string; tags: string[]; nature: 'P' | 'S' | 'O' | 'PS' | 'SO' }`; `COMMON_RULES`, `LESSON_RULES`, `GRADING_RULES_V2`, `NOTICE_RULES`, `SUBJECT_RULES: Record<Subject, Rule[]>`; `rulesFor(subject: string): string`(공통+차시+과목 규칙의 `text`를 ID와 함께 줄바꿈 연결, 성격 O는 제외); `allRuleIds(): string[]`; `RULES`(= `rulesFor('')`, 기존 import 호환).
- Produces (`stages.ts`): `buildPrompt(stage, ctx)`가 `{ system: rulesFor(ctx.subject), user, fixtureKey }`; user = header + 성취수준 블록(1·2·3·5·7단계) + 예시 블록(3·5단계) + 과제문 + 공유 자료 ID 안내(4단계) + prior. `Ctx`에 `unit?: string | null` 추가(선택, 예시 선택용).
- Consumes: `levelsBlock`(T2), `exemplarsBlock`(T2).

- [ ] **Step 1: 실패 테스트**

```ts
// tests/rules.test.ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { rulesFor, allRuleIds, COMMON_RULES, SUBJECT_RULES, NOTICE_RULES, GRADING_RULES_V2 } from '@/lib/studio/prompts/rules/index'

describe('rules v2', () => {
  it('every rule id is unique and appears exactly once in the spec appendix', () => {
    const ids = allRuleIds()
    expect(new Set(ids).size).toBe(ids.length)
    const spec = readFileSync('docs/superpowers/specs/2026-09-25-item-studio-v2-design.md', 'utf8')
    for (const id of ids) expect(spec.split(`| ${id} |`).length - 1, id).toBe(1)
    expect(ids.length).toBe(30 + 12 + 33 + 9 + 12)
  })
  it('rulesFor joins common + lesson + subject rules with ids, excludes 운영(O) rules, and stays stable', () => {
    const math = rulesFor('수학')
    expect(math).toMatch(/^C-01 /m); expect(math).toMatch(/^L-05 /m); expect(math).toMatch(/^S-수-01 /m)
    expect(math).not.toMatch(/S-국-01/); expect(math).not.toMatch(/^C-23 /m)
    expect(rulesFor('수학')).toBe(rulesFor('수학'))
    expect(rulesFor('한국사')).toMatch(/S-역-01/); expect(rulesFor('세계사')).toMatch(/S-역-01/)
    expect(rulesFor('')).not.toMatch(/^S-/m)
  })
  it('keeps the owner-bound numbers in the text', () => {
    const all = COMMON_RULES.concat(Object.values(SUBJECT_RULES).flat()).map((r) => r.text).join('\n')
    expect(all).toMatch(/서술형 2개\(각 3점\) \+ 논술형 1개\(16점\)/)
    expect(all).toMatch(/4요소 × 0~4점/)
    expect(NOTICE_RULES.map((r) => r.id)).toEqual(Array.from({ length: 12 }, (_, i) => `N-${String(i + 1).padStart(2, '0')}`))
    expect(GRADING_RULES_V2.map((r) => r.id)[0]).toBe('G-01')
  })
})
```

```ts
// tests/prompts.test.ts (재작성)
import { describe, it, expect } from 'vitest'
import { buildPrompt, buildReviewPrompt } from '@/lib/studio/prompts/stages'
import { rulesFor } from '@/lib/studio/prompts/rules/index'

const ctx = { theme: { title: '학교 축제 일회용품 줄이기', level: '중', grade: 1, subjects: ['수학'] }, subject: '수학',
  standards: [{ code: '[9수04-02]', text: '자료를 줄기와 잎 그림, 도수분포표, 히스토그램, 도수분포다각형으로 나타내고 해석할 수 있다.' }, { code: '[9수04-03]', text: '상대도수를 구하고, 상대도수의 분포를 표나 그래프로 나타내고 해석할 수 있다.' }], prior: {} }

describe('prompts v2', () => {
  it('system is the subject rule block (cacheable) and user carries the context', () => {
    const p = buildPrompt(2, ctx)
    expect(p.system).toBe(rulesFor('수학'))
    expect(p.user).toContain('[9수04-02]'); expect(p.user).toContain('중학교 1학년'); expect(p.fixtureKey).toBe('stage2-generate-수학')
  })
  it('stage 2 injects the C (anchor) statements and asks for the reconstruction table', () => {
    const u = buildPrompt(2, ctx).user
    expect(u).toMatch(/\[9수04-02\] 성취수준\(도달점 = C/); expect(u).toContain('주어진 자료')
    expect(u).toMatch(/통합\/재조정\/유지/); expect(u).toMatch(/지식·이해\/과정·기능\/가치·태도/)
  })
  it('stage 3 asks for unit_plan + lessons with 60-minute budgets, scripts, worksheet tiers, and includes exemplars', () => {
    const u = buildPrompt(3, ctx).user
    expect(u).toMatch(/도입 10·전개 40·정리 10/); expect(u).toMatch(/발문 2~4개/); expect(u).toMatch(/기본·표준·도전/)
    expect(u).toMatch(/논술형을 배치한 차시는 0문항/); expect(u).toMatch(/\[예시 /)
  })
  it('stage 5 asks for the item card fields, injects A~E and exemplars, and forbids copying', () => {
    const u = buildPrompt(5, ctx).user
    for (const f of ['evaluation_elements', 'situation', 'condition_nos', 'answer_mode', 'exemplar_answers', 'level_map', 'holistic', 'notes', 'references']) expect(u).toContain(f)
    expect(u).toMatch(/\[3점\]/); expect(u).toMatch(/\[16점\]/); expect(u).toMatch(/그대로 옮기지 않는다/); expect(u).toMatch(/E: /)
  })
  it('stage 7 asks for per-lesson notice plan for essay lessons only (owner default) and the fixed footer', () => {
    const u = buildPrompt(7, ctx).user
    expect(u).toMatch(/criteria_phrases/); expect(u).toMatch(/서·논술형이 있는 차시/); expect(u).toContain('본 안내장은 학교생활기록부가 아니며')
  })
  it('stage 4 tells the model to continue material lettering after the shared ids and needs source objects', () => {
    const shared = ['A', 'B'].map((id) => ({ id, title: `자료 ${id}`, kind: 'text', body: 'x', table: null, source: { kind: '자작', attribution: null, ai_assisted: false } }))
    const u = buildPrompt(4, { ...ctx, prior: { shared_materials: shared } }).user
    expect(u).toContain('A, B'); expect(u).toMatch(/C부터 이어서/); expect(u).toMatch(/source\.kind는 "자작"/)
    expect(buildPrompt(3, { ...ctx, prior: { shared_materials: shared } }).user).not.toMatch(/이어서 붙여라/)
  })
  it('review prompt keeps rules as the first block', () => {
    const r = buildReviewPrompt(5, ctx, { items: [] })
    expect(r.system[0]).toBe(rulesFor('수학')); expect(r.system[1]).toMatch(/검토자/); expect(r.fixtureKey).toBe('stage5-review-수학')
  })
  it('stage 0 prompt lists participating subjects', () => {
    const u = buildPrompt(0, { theme: { title: 't', level: '중', grade: 1, subjects: ['수학', '과학'] }, subject: '', standards: [], prior: {} }).user
    expect(u).toContain('참여 과목: 수학, 과학'); expect(u).not.toContain('과목: \n')
  })
})
```

- [ ] **Step 2: 실패 확인** — `npx vitest run tests/rules.test.ts tests/prompts.test.ts` → FAIL.

- [ ] **Step 3: 규칙 파일** — 문장은 스펙 부록 A와 1:1(ID·태그 동일). `nature`가 `O`인 규칙은 프롬프트에 넣지 않는다.

```ts
// lib/studio/prompts/rules/types.ts
export type Rule = { id: string; text: string; tags: string[]; nature: 'P' | 'S' | 'O' | 'PS' | 'SO' }
export const rule = (id: string, nature: Rule['nature'], text: string, ...tags: string[]): Rule => ({ id, nature, text, tags })
```

```ts
// lib/studio/prompts/rules/common.ts
import { rule } from './types'
export const COMMON_RULES = [
  rule('C-01', 'PS', '문항은 발문·자료·조건 세 요소로 구성하고, 조건에 담은 제약은 반드시 채점표 요소에 대응시킨다(condition_nos).', 'WP4-1', 'WP13-5'),
  rule('C-02', 'P', '발문 앞에 자료가 무엇을 담고 있는지 한 문장 전제문을 둔다("다음 자료를 읽고"만 쓰지 않는다).', 'WP4-2'),
  rule('C-03', 'PS', '자료는 해석·추론·판단의 단서만 주고, 결론·정답 문장이나 문항이 요구할 정리·계산 결과를 담지 않는다.', 'WP4-3', 'v1'),
  rule('C-04', 'P', '찬반·비교·다중 관점을 요구하면 양쪽 자료를 균형 있게(1차 자료면 2개 이상) 제시한다.', 'WP4-4', 'WP4-12'),
  rule('C-05', 'P', '발문의 사고 순서(이해→비교·분석→판단→서술)와 조건 순서를 일치시킨다.', 'WP4-5'),
  rule('C-06', 'PS', '조건이 4개 이상이면 내용/형식 같은 상위 범주로 묶어 제시한다.', 'WP4-6'),
  rule('C-07', 'P', '성취기준과 무관한 형식·문법 조건을 넣지 않는다.', 'WP4-7'),
  rule('C-08', 'P', '조건을 초과해 여러 개 쓴 답안은 "앞의 N개만 채점"을 조건에 명시한다(overflow_rule).', 'WP4-8', 'WP13-3'),
  rule('C-09', 'P', '오류 찾기형은 오류 지점과 이유를 함께 쓰게 하고 채점표에서 두 요소로 나눈다.', 'WP4-9', 'WP5-수-5'),
  rule('C-10', 'PS', '학생이 그래프·모식도·표를 직접 만드는 문항은 축·수치·형태(표는 구조·값·합계)로 분해해 배점하고, 세트에 최대 1개, answer_mode="paper"로 둔다.', 'WP4-10', '서울-2', 'WP5-수-1', '대표'),
  rule('C-11', 'PS', '조건은 행동 동사 단위로 쪼개고 필요한 조건 끝에 부분배점을 소괄호로 병기한다; 문항 배점은 문두 끝 대괄호 "[N점]".', '서울-3', 'WP5-수-2', 'WP5-사-2'),
  rule('C-12', 'PS', '채점표는 요소·척도·수행특성 3요소를 갖추고, "잘함/미흡" 같은 평어 대신 관찰 가능한 표현("근거 2개 이상")으로 쓴다; 척도는 1점 단위 연속(중간값 누락 금지).', 'WP4-13', 'WP4-15', '서울-4'),
  rule('C-13', 'PS', '최하위 척도(0점)는 무응답과 "시도했으나 부족"을 구분해 서술한다.', 'WP4-16'),
  rule('C-14', 'PS', '예시답안은 서술형은 0점을 뺀 총점 단계마다 1개, 논술형은 상/중/하 각 1개를 요소별 점수·채점자 의견(rationale)과 함께 만들고, "유일한 정답이 아님"을 유의점에 적는다.', '서울-5', 'WP4-17', 'WP13-7', 'WP5-영-5'),
  rule('C-15', 'PS', '논술형(고배점)은 분석적 채점표 + 총체적 상/중/하(holistic)를 함께, 서술형(저배점)은 분석적 하나만(holistic=null).', 'WP4-14', '서울-6', 'WP5-수-3'),
  rule('C-16', 'PS', '채점 시 유의점(notes) 1~4줄: 핵심 내용이 있으면 표현·단어 차이로 감점하지 않음, 맞춤법은 의미 전달되면 관용, 반올림 허용 범위, 그림 대신 말로 설명한 경우 인정 여부.', 'WP13-6', '서울-8', 'WP5-국-5', 'WP5-사-4'),
  rule('C-17', 'P', '반응 지시어(발문 동사)는 성취기준의 과정·기능에서 고른다 — 요약·설명·비교·분류·분석·해석·추론·예측·평가·판단·비판·제안·설계·정당화·구성·서술·논술·증명·적용·탐구·표현.', 'WP13-8'),
  rule('C-18', 'PS', '평가 요소(evaluation_elements)는 "~하기" 명사형 1~3개로 적는다.', 'WP13 §1'),
  rule('C-19', 'PS', '자료 크기는 한 화면: 표 5~10행(도수분포·상대도수 원자료 20~25개, 줄기와 잎 11~20개, 계급 6~7개), 그래프 1~2개, 그림 1~2개.', 'WP5-수-4', 'WP11-1'),
  rule('C-20', 'P', '표·그래프는 완성된 형태로 주고 읽게 하는 것이 기본값이다; 그리기는 C-10의 한 문항에만.', 'WP11-2', 'WP5-수-1'),
  rule('C-21', 'P', '실생활 맥락을 쓰되 그 안의 수치는 소규모로 정제한다; 사회·과학은 실제 자료(출처 표기)를 우선 고려한다.', 'WP5-수-4', 'WP5-사-1', '2025-3'),
  rule('C-22', 'PS', '자료마다 출처 종류(source.kind 자작/공개)와 공개 자료의 출처 문구(attribution)를 적는다; 예시 은행 문장을 그대로 옮기지 않는다.', 'WP4 §5 house', '대표'),
  rule('C-23', 'SO', 'AI가 만들거나 모은 자료는 ai_assisted로 표시하고 확정 전 원장(관리자) 확인을 거친다.', 'WP13-11'),
  rule('C-24', 'PS', '성취기준 원문은 절대 변형하지 않고, 어휘·자료·문항은 교육과정 학년 수준으로 쓴다. 학생 제시문은 "~다" 평서문, 지침·안내는 "~합니다/~하세요".', '대표', 'v1'),
  rule('C-25', 'PS', '수준 문장은 표시(A~E)+수행특성 세트로 다루고, 다섯 문장은 같은 과제의 도달 정도 차이여야 하며, C를 도달점으로 위·아래를 만든다; 부사·형용사만으로 단계를 가르지 않고 동사·범위·조건절로 가른다; 조건절("주어진 자료에서")은 최하위에서만; 최하위에 학습량을 더 얹지 않는다; 긍정문·간결체.', 'WP1-1', 'WP1-2', 'WP1-3', 'WP1-5', 'WP1-6', 'WP1-7', 'WP1-19'),
  rule('C-26', 'P', '서술어는 과목 안에서 하나로 통일("~할 수 있다"), 흥미·태도류만 "~을 가진다" 허용.', 'WP1-20'),
  rule('C-27', 'P', '정의적(가치·태도) 요소는 정오가 아니라 정당화 가능성으로 채점하고, 입장 자체에 점수를 주지 않는다.', 'WP1-13', 'WP5-사-5', 'WP5-과-5'),
  rule('C-28', 'PS', '척도 수와 성취수준 단계 수를 억지로 맞추지 않되, 문항마다 A~E 예상 점수 구간(level_map)과 응답 특성을 적는다.', 'WP1-11', 'WP4 §2'),
  rule('C-29', 'P', '동사는 매번 창작하지 않고 교과×축×등급 동사 뱅크(과학 5범주, 사회 탐구기능, 역사 인지 위계, Bloom 한국어판)에서 고른다.', 'WP1-14'),
  rule('C-30', 'S', '문항 개발 후 8문항 자가 점검(성취기준 부합·3범주 반영·상황맥락·고차 사고·채점기준 부합·변별·명료성·채점자 불변성)을 검토 초점으로 쓴다.', 'WP13-9'),
  rule('C-31', 'PS', '세트 평가는 서술형 2개(각 3점) + 논술형 1개(16점) = 22점, 논술형 채점표는 4요소 × 0~4점, 등급표는 7등급(21~22, 18~20, 15~17, 11~14, 8~10, 5~7, 0~4; 상=6~7, 중=3~5, 하=1~2)에 level_ref(7=A, 6=B, 5=C, 4=D, 3=E, 2·1=E 미만)를 병기한다. 논술형 예시답안 상/중/하는 채점표로 실제 채점했을 때 그 밴드가 나와야 한다.', '대표', 'v1'),
]
```

(주의: C-31은 대표님 확정값을 담기 위해 부록 A에 추가되는 규칙이다 — Step 6에서 스펙 부록 A.1 표 끝에 같은 문장의 행을 추가한다. `tests/rules.test.ts`의 개수는 31로 맞춘다.)

```ts
// lib/studio/prompts/rules/lesson.ts
import { rule } from './types'
export const LESSON_RULES = [
  rule('L-01', 'PS', '재구조화는 통합/재조정/유지 3유형만, 내용요소 삭제 금지, 원문(original_text) 병기 필수, 이유 태그는 "학원 60분 최적화"·"4~6차시 압축"·"비전공 원장 진행 용이" 중에서.', 'WP7 §1·§8'),
  rule('L-02', 'PS', '재구조화 문장은 "학생은 [자료]를 가지고 [수행]을 해서 [결과물]을 할 수 있다" 한 문장; 원문에 없는 수행·절차·특정 과제 상황(축제·일회용품 등)을 넣지 않는다.', 'WP4 §2 house', 'v1'),
  rule('L-03', 'PS', '학습 목표 3~5개에 지식·이해/과정·기능/가치·태도를 각 1개 이상 붙인다(axis); C 문장(도달점)의 어휘로 쓴다.', 'WP1 §3', 'WP1-3', 'WP1-8'),
  rule('L-04', 'P', '세트 핵심질문 1개 + 차시 핵심질문(사실 확인형 금지; 설명한다→"어떻게/왜 ~인가", 비교한다→"~과 ~은 무엇이 다르고 그 차이는 무엇을 뜻하는가", 추론한다→"~로 보아 ~라고 할 수 있는가", 주장한다→"~해야 하는가, 그 근거는", 파악한다→"자료는 ~에 대해 무엇을 말하는가"); 차시 핵심질문은 도입 제시·전개 상기·정리 재확인.', 'v1', 'WP7 §5'),
  rule('L-05', 'PS', '1차시 60분 = 도입 10·전개 40·정리 10 기본, 전개는 소단계 2~4개에 분 표시(합 = 전개 시간); 병합 가능 차시는 mergeable_with에 인접 번호를 적고 merge_note에 뺄 활동을 적는다(병합 시 120분을 10/90/20으로 재편성).', 'WP7 §8·§9-1'),
  rule('L-06', 'PS', '발문 2~4개마다 예상 답(expected_answer)과 막힐 때 힌트(if_stuck; 정답을 그대로 말하지 않음)를 적는다.', 'WP7 §5·§9-2'),
  rule('L-07', 'PS', '준비물(materials_needed: 오프라인 교구·출력물)과 지도상 유의점(caution_notes: 오개념 1개 이상)을 차시마다 적는다. 사용 자료는 materials_used에 ID(A~Z)만.', 'WP7 §3(d)'),
  rule('L-08', 'PS', '활동지(worksheet): 과제 2~5개를 기본(D~E)·표준(C)·도전(A~B) 층으로(각 1개 이상, 한 장에 함께), 자기평가 1~3문장.', 'WP7 §3(e)', 'WP1 §5'),
  rule('L-09', 'PS', '형성평가가 항상 선행한다: 논술형을 배치한 차시는 마무리 퀴즈 0문항(빈 배열), 그 외 차시는 정확히 3문항(선택형/단답형, 정답·해설). 서술형1·2는 세트 중후반 차시 정리 시간에, 논술형은 마지막 차시 전개 전체(35분 이상)에.', 'WP7 §6', '대표'),
  rule('L-10', 'P', '퀴즈는 워밍업 어투(짧은 "구하시오", 단일 조회)에 개념 관계 문항을 섞고, 해설은 한두 줄.', 'WP11-3', 'WP11-9'),
  rule('L-11', 'P', '압축으로 남은 시간은 새 활동이 아니라 피드백·정리·형성평가에 쓴다.', 'WP7 §4'),
  rule('L-12', 'S', '문항 카드에 차시 흐름(어느 차시가 어느 문항을 준비하는지)을 함께 담는다 — unit_plan.assessment_plan.summative_placement와 lessons[].assessment가 같아야 한다.', 'WP13-1'),
]
```

```ts
// lib/studio/prompts/rules/grading.ts
import { rule } from './types'
export const GRADING_RULES_V2 = [
  rule('G-01', 'SO', 'AI는 초안·근거만 낸다. 원장 확정(confirmed_at) 후 공개되며 AI 초안 열은 불변이다.', 'WP4-운4', '3주차 §3.4'),
  rule('G-02', 'PS', '요소마다 점수를 매기고 학생 답안에서 그 점수의 근거 문장을 그대로 인용한다(evidence). 답안에 근거가 없으면 "해당 내용 없음"이라고 쓴다.', '3A', 'WP4 §9'),
  rule('G-03', 'P', '채점표·채점 시 유의점·예시답안·A~E 예상 구간만 기준으로 하고 새 기준을 만들지 않는다. 학생 답안이 예시답안과 비슷하면 비슷한 점수를 준다.', '3A', 'C-14'),
  rule('G-04', 'P', '관용 원칙을 적용한다: 유의점에 적힌 범위에서 표현·단어 차이·맞춤법으로 감점하지 않는다.', 'C-16'),
  rule('G-05', 'P', '잘한 점 1~3개(근거 인용) → 보완할 점 1~3개(현재보다 한 단계 위 척도 기준으로 "다음 점수로 가려면 무엇을 더 쓰면 되는지"). 학생에게 말하듯 존댓말, 학생 학년 어휘.', 'WP4-18', '3A'),
  rule('G-06', 'P', '다른 학생과 비교하거나 평소 태도를 언급하지 않는다.', 'WP4-18', 'WP4-운5'),
  rule('G-07', 'P', '가치·태도 요소는 정오가 아니라 글에 드러난 관점·실천 진술의 정당화 가능성으로 판정한다.', 'C-27'),
  rule('G-08', 'P', '점수가 낮은 답안에는 이전 대비 향상(자기참조) 문구를, 높은 답안에는 확장 질문을 우선한다.', 'WP13-10', 'WP4 §7'),
  rule('G-09', 'SO', '50자 미만·무관 답안은 채점하지 않고 돌려보낸다. score는 요소 점수의 합이고 요소 점수는 max를 넘지 않는다.', '3A', 'WP4-운5'),
]
export const GRADING_PROMPT_RULES = GRADING_RULES_V2.filter((r) => r.nature !== 'O' && r.nature !== 'SO' || r.id === 'G-09').map((r) => `${r.id} ${r.text}`).join('\n')
```

```ts
// lib/studio/prompts/rules/notice.ts
import { rule } from './types'
export const NOTICE_RULES = [
  rule('N-01', 'S', '다른 학생의 이름·점수·순위를 언급하지 않는다.', 'WP8-1'),
  rule('N-02', 'S', '등수·백분위·"상위 n%" 표현을 쓰지 않는다.', 'WP8-2'),
  rule('N-03', 'S', '확정 전 AI 초안 점수·코멘트를 인용하지 않는다.', 'WP8-3'),
  rule('N-04', 'PS', '"매우 우수/보통/미흡" 같은 단독 평어로 문장을 끝내지 않고 근거(수행 내용)를 동반한다.', 'WP8-4'),
  rule('N-05', 'PS', '부정 서술어(못한다/실패했다/모른다) 대신 "~하는 데 어려움이 있다/~노력이 필요하다"로 쓴다.', 'WP8-5'),
  rule('N-06', 'PS', '개선점만 단독으로 제시하지 않는다 — 잘한 점을 1개 이상 먼저 쓴 뒤 개선점을 붙인다.', 'WP8-6'),
  rule('N-07', 'P', '평가와 무관한 개인정보(가족·경제·건강)를 언급하지 않는다.', 'WP8-7'),
  rule('N-08', 'P', '태도 코멘트는 구체 관찰 근거와 함께만 쓴다(원장 작성 필드).', 'WP8-8'),
  rule('N-09', 'P', '재도전은 이전 점수를 "실패"가 아니라 "출발점"으로 서술한다.', 'WP8-9'),
  rule('N-10', 'P', '문장은 활동명(과제명)으로 시작한다.', 'WP8-10'),
  rule('N-11', 'PS', '서·논술형 결과는 루브릭 요소명을 그대로 노출하고 요소와 무관한 인상평을 쓰지 않는다.', 'WP8-11'),
  rule('N-12', 'PS', '다음 단계 제안은 혼자 실행 가능한 구체 행동 1개 이상을 청유형("~해 봅시다")으로 쓴다.', 'WP8-12'),
]
export const NOTICE_PROMPT_RULES = NOTICE_RULES.map((r) => `${r.id} ${r.text}`).join('\n')
```

```ts
// lib/studio/prompts/rules/subjects/국어.ts
import { rule } from '../types'
export const KOREAN_RULES = [
  rule('S-국-01', 'P', '자료는 (가)(나) 복수 통합형을 기본으로 하되 중1은 각 200~400자, 총 2편 이내.', 'WP5-국-1', 'C-19'),
  rule('S-국-02', 'P', '조건 2~4개를 내용 조건/형식 조건으로 나누고 채점표도 그 구분을 따른다.', 'WP5-국-2'),
  rule('S-국-03', 'P', '논술형은 서론-본론-결론, 근거 2~3개, 인용 출처 "(가)에서" 표기, 분량 ±50자.', 'WP4 §8', 'WP4-11'),
  rule('S-국-04', 'P', '맞춤법·띄어쓰기는 오류 2개 이하 관용, 의미 전달되면 감점하지 않음.', 'WP4 §8', 'C-16'),
  rule('S-국-05', 'P', '두 자료 비교 문항의 비교 기준(관점·표현 방법 등)을 문두 전제문에 먼저 밝힌다.', 'WP4-운1'),
  rule('S-국-06', 'P', '"느낀 점"만 묻는 주관적 서술 금지, 발문이 단답형으로 축소되지 않게.', 'WP4 §8'),
]
```

```ts
// lib/studio/prompts/rules/subjects/수학.ts
import { rule } from '../types'
export const MATH_RULES = [
  rule('S-수-01', 'P', '통계 단원에서 표를 새로 작성하게 하는 문항은 서술형 중 최대 1개, 나머지는 정리된 표를 읽고 계산·비교·판단.', '서울-1'),
  rule('S-수-02', 'P', '저배점(3점) 서술형은 조건-점수 1점 단위 대응("무엇을 쓰면 몇 점"), 계산 정확성과 결론 문장을 별도 요소로.', '서울-4', 'WP5-수-2'),
  rule('S-수-03', 'P', '논술형은 자료 해석→판단·제안으로 끝내고 표·그래프를 새로 만들게 하지 않으며, "판단+제안"을 별도 요소로 둔다.', '서울-7', 'WP11-6'),
  rule('S-수-04', 'P', '서술형 "이유 서술"은 핵심 채점 포인트를 조건에 명시한다(예: 총합이 다르다는 점을 언급).', 'WP11-5'),
  rule('S-수-05', 'P', '오류 찾기형(가상 학생의 틀린 풀이)은 고등 위주 템플릿, 중1은 선택.', 'WP5-수-5', 'C-09'),
  rule('S-수-06', 'P', "중1 이하 수준 문장·채점표에 '정당화'를 쓰지 않는다; 안내된 절차·구체적 조작은 D/E 척도에서만.", 'WP1 §4'),
  rule('S-수-07', 'P', '정비례·도형 단원도 작도는 최소화하고 텍스트·표 조건으로 대체.', 'WP11-10'),
]
```

```ts
// lib/studio/prompts/rules/subjects/사회.ts
import { rule } from '../types'
export const SOCIAL_RULES = [
  rule('S-사-01', 'P', '자료는 제도 설명 + 실제(또는 유사) 사례 2~3개, 유형을 다양화(통계·지도·기사·인터뷰).', 'WP5-사-1'),
  rule('S-사-02', 'P', '조건 3~5개가 채점 요소와 1:1, 글자 수 조건은 ±50자.', 'WP5-사-2'),
  rule('S-사-03', 'P', '배점은 요구 항목 개수에 비례(3가지 중 2가지 → 부분점수).', 'WP5-사-3'),
  rule('S-사-04', 'P', '쟁점 문항은 입장이 아니라 근거의 논리성·자료 활용을 채점, 입장 선택엔 최대 1점.', 'WP5-사-5', 'C-27'),
  rule('S-사-05', 'P', '정치·사회 참여 단원은 역할 몰입 → 메타 성찰 2단계 구조를 짝지어 설계.', 'WP5-사-5'),
  rule('S-사-06', 'P', '"자료 내용을 그대로 옮기지 말 것"을 조건에 넣고 재진술을 채점.', '2025-2'),
]
```

```ts
// lib/studio/prompts/rules/subjects/역사.ts
import { rule } from '../types'
export const HISTORY_RULES = [
  rule('S-역-01', 'P', '사료는 상반된 행위자 관점의 1차 사료 2개 이상, "(가)에서 인용할 것" 조건과 인용 정확성 요소.', 'WP4-11', 'WP4-12', '2025-2'),
  rule('S-역-02', 'P', '인지 동사 위계(추론·분석 > 체계적 설명 > 제시·연결 > 사례 > 있었음)로 척도를 만든다.', 'WP1 §3'),
  rule('S-역-03', 'P', '정답이 여러 갈래인 문항은 채점 유의점에 인정 범위를 넓게 적고 검수 요령에 유의점 재확인을 넣는다.', '2025-4'),
]
```

```ts
// lib/studio/prompts/rules/subjects/과학.ts
import { rule } from '../types'
export const SCIENCE_RULES = [
  rule('S-과-01', 'P', '1차 자료는 표·그래프·도식(회로·구조·모형)을 우선, 실험 결과 예측형은 자료 해석→서술 순서.', 'WP5-과-1'),
  rule('S-과-02', 'P', '탐구 설계 문항은 독립·종속·통제 변인 구분을 채점 요소로.', 'WP5-과-2'),
  rule('S-과-03', 'P', '필수 용어(예: 항체·전기음성도)를 조건에 명시하고 충족 여부로 배점.', 'WP5-과-3'),
  rule('S-과-04', 'P', '계산 정확성과 논리성을 분리 채점, 그래프는 축·수치·형태 3분해.', 'WP4 §8', 'C-10'),
  rule('S-과-05', 'P', '사회적 쟁점(에너지·유전자 가위 등)은 찬반 영향을 모두 고려한 뒤 입장+근거+출처를 요구하고 찬반 각각의 모범 논거를 예시로.', 'WP5-과-5'),
  rule('S-과-06', 'P', "수준 문장·척도 서술어는 '~할 수 있다'로 통일, '안다'류 최소화, 교수법 표현 금지, 탐구활동과 연계.", 'WP1 §4'),
  rule('S-과-07', 'P', '자료가 문항과 무관하게 길면 요약·삭제, 오개념 진단 목적을 채점표에 반영.', 'WP4 §8'),
]
```

```ts
// lib/studio/prompts/rules/subjects/영어.ts
import { rule } from '../types'
export const ENGLISH_RULES = [
  rule('S-영-01', 'P', '읽기(지문·표·인포그래픽) + 쓰기 통합형을 기본 구조로.', 'WP5-영-1'),
  rule('S-영-02', 'P', '분량은 단어 수 구간으로(예: 40~60단어), 채점표에 구간별 점수.', 'WP5-영-2', 'WP4 §4'),
  rule('S-영-03', 'P', '채점 요소는 내용/구성/언어사용(+과제 완성), 언어사용은 오류 개수 구간으로 정량화.', 'WP5-영-3'),
  rule('S-영-04', 'P', '지시문·조건·채점표·피드백은 한국어, 답안만 영어(우리말 서술 요구 시 예외 명시).', 'WP5-영-4'),
  rule('S-영-05', 'P', '제시 어휘는 재배열만으로 풀리지 않을 최소한, 조건에 정답 어휘(비교급 등)를 노출하지 않음, 성취기준 무관 문법 조건 금지.', 'WP4-운2', 'WP4 §8', 'C-07'),
  rule('S-영-06', 'P', '예시답안에 만점 외 전형적 오류(관사·3인칭 단수·어순) 부분점수 예시를 포함하고 진단형 피드백을 적는다.', 'WP5-영-5'),
  rule('S-영-07', 'P', '중1 어휘 범위(1,500단어 학년군)를 넘는 지문 어휘는 각주 처리.', 'WP1 §4'),
]
```

```ts
// lib/studio/prompts/rules/index.ts
import type { Rule } from './types'
import { COMMON_RULES } from './common'
import { LESSON_RULES } from './lesson'
import { GRADING_RULES_V2 } from './grading'
import { NOTICE_RULES } from './notice'
import { KOREAN_RULES } from './subjects/국어'
import { MATH_RULES } from './subjects/수학'
import { SOCIAL_RULES } from './subjects/사회'
import { HISTORY_RULES } from './subjects/역사'
import { SCIENCE_RULES } from './subjects/과학'
import { ENGLISH_RULES } from './subjects/영어'

export { COMMON_RULES, LESSON_RULES, GRADING_RULES_V2, NOTICE_RULES }
export const SUBJECT_RULES: Record<string, Rule[]> = { '국어': KOREAN_RULES, '수학': MATH_RULES, '사회': SOCIAL_RULES, '역사': HISTORY_RULES, '한국사': HISTORY_RULES, '세계사': HISTORY_RULES, '과학': SCIENCE_RULES, '영어': ENGLISH_RULES }

const promptable = (r: Rule) => r.nature !== 'O' && r.nature !== 'SO'
const line = (r: Rule) => `${r.id} ${r.text}`
const cache = new Map<string, string>()

/** 생성·검토 system 첫 블록(캐시 대상). 같은 과목이면 항상 같은 문자열. */
export function rulesFor(subject: string): string {
  const key = subject || ''
  if (!cache.has(key)) {
    const parts = [
      '당신은 다빈치스쿨 본사의 서·논술형 문항 설계자다. 아래 규칙을 항상 지킨다. 출력은 요청된 JSON 형식만.',
      '[공통]', ...COMMON_RULES.filter(promptable).map(line),
      '[재구성·차시]', ...LESSON_RULES.filter(promptable).map(line),
      ...(SUBJECT_RULES[key] ? [`[${key === '한국사' || key === '세계사' ? '역사' : key}]`, ...SUBJECT_RULES[key].filter(promptable).map(line)] : []),
    ]
    cache.set(key, parts.join('\n'))
  }
  return cache.get(key)!
}

export function allRuleIds(): string[] {
  const uniq = new Map<string, Rule>()
  for (const r of [...COMMON_RULES, ...LESSON_RULES, ...KOREAN_RULES, ...MATH_RULES, ...SOCIAL_RULES, ...HISTORY_RULES, ...SCIENCE_RULES, ...ENGLISH_RULES, ...GRADING_RULES_V2, ...NOTICE_RULES]) uniq.set(r.id, r)
  return [...uniq.keys()]
}
```

```ts
// lib/studio/prompts/rules.ts (재작성 — 기존 import 호환)
export { rulesFor, allRuleIds } from './rules/index'
import { rulesFor } from './rules/index'
/** @deprecated 과목별 규칙은 rulesFor(subject). 과목 없는 호출(0·1단계)용. */
export const RULES = rulesFor('')
```

- [ ] **Step 4: `lib/studio/prompts/stages.ts` 수정** — `TASKS`·`buildPrompt`·헤더를 아래로 교체(`Ctx`·`fixtureKeyFor`·`sharedMaterialIds`·`sharedMaterialLettering`은 유지; `REVIEW_FOCUS`·`buildReviewPrompt`는 T4에서 교체).

```ts
import { rulesFor } from './rules/index'
import { levelsBlock } from '@/lib/reference/levels'
import { exemplarsBlock } from '@/lib/reference/exemplars'
import { NOTICE_DISCLAIMER, type Stage } from '@/lib/studio/schemas'

export type Ctx = {
  theme: { title: string; level: string; grade: number; subjects: string[] }
  subject: string
  standards: { code: string; text: string }[]
  prior: Record<string, unknown>
  unit?: string | null
}

const TASKS: Record<Stage, string> = {
  0: '대주제 소개문(3~4문장)과 참여 과목별로 이 대주제와 연결할 수 있는 수업 아이디어를 한 줄씩 제안하라.',
  1: '주어진 성취기준이 이 대주제와 학년에 적합한지 판단하고, 부적합한 것이 있으면 이유와 함께 표시하라. 해당 학년 교과서에서 다루는 내용만 적합으로 본다.',
  2: '재구조화 표(standards: 성취기준마다 통합/재조정/유지, original_text는 원문 그대로, reconstructed_text는 "학생은 [자료]를 가지고 [수행]을 해서 [결과물]을 할 수 있다", reason 태그, learning_elements)와 세트 통합 문장 1개(reconstruction), 학습 목표 3~5개(각각 axis=지식·이해/과정·기능/가치·태도, 세 축 모두 1개 이상), 세트 핵심질문 후보 2~3개를 만들어라. 위에 준 C 문장(도달점)보다 좁아지거나 다른 활동을 가리키지 않게 한다. level_anchor는 빈 배열로 둔다(서버가 채운다).',
  3: 'unit_plan(set_title, set_key_question, lesson_map, assessment_plan: formative·summative_placement 3건·rubric_note 상/중/하)과 4~6차시 lessons를 설계하라. 각 차시: 담당 성취기준 1~2개, topic, 차시 핵심질문, goal, time_budget(도입 10·전개 40·정리 10, 합 60), flow(intro 불릿, main 소단계 2~4개에 minutes 합 = 전개 시간, wrapup 불릿), teacher_script.questions 발문 2~4개(prompt·expected_answer·if_stuck), materials_used(자료 ID A~F만), materials_needed(준비물), caution_notes(오개념 1개 이상), worksheet(tasks 2~5개: 기본·표준·도전 각 1개 이상, tier·level_ref·answer_space·expected; self_check 1~3), formative_check.quiz(논술형을 배치한 차시는 0문항(빈 배열), 그 외 차시는 3문항), assessment(서술형1·서술형2·논술형 중 하나 또는 null; 서술형은 중후반, 논술형은 마지막 차시), mergeable_with·merge_note.',
  4: '차시와 문항에 필요한 가상 자료를 만들어라. 표는 열·행으로, 설명글은 본문으로. 수치는 합계와 비율이 맞아야 한다. 공유 자료가 주어지면 그 수치를 그대로 쓴다. 자료는 원자료만 담는다(role="raw") — 학생이 문항에서 만들어야 할 결과(정리된 도수분포표·계산된 상대도수·평균·결론 문장)를 body나 표에 미리 적지 않는다. 배경 설명글은 role="context". 이번 세트는 전부 자작이므로 source.kind는 "자작", attribution은 null, ai_assisted는 false. 표는 5~25행·열 6개 이하.',
  5: '문항 카드 3장을 만들어라: 서술형 2개(각 3점, 문두 끝 "[3점]") + 논술형 1개(16점, "[16점]"). 각 카드: evaluation_elements("~하기" 1~3개), situation(논술형은 role·audience·purpose·product 필수, 서술형은 null), materials_used(자료 ID, 원자료 1개 이상), stem(자료 한 줄 전제문 + 발문 + [N점]), conditions(items 1~5개: no·text(부분배점 소괄호 병기)·verb(행동 동사 원형)·points·category 내용/형식; length는 셀 수 있는 분량("제한 없음" 금지, 영어는 단어 수); format은 표/문장/문단·종결어미·단위; answer_mode: 표·그래프·수식 작성은 "paper"(세트당 최대 1개), 글은 "screen"; overflow_rule), rubric(criteria: 서술형은 1~3요소로 max 합 3, 논술형은 정확히 4요소 × max 4, 요소마다 axis와 condition_nos(모든 조건이 어느 요소엔가 대응), scale은 0..max 정수마다 descriptor(관찰 가능한 표현, 0점은 무응답/시도 구분, 인접 단계가 부사만 다르면 안 됨)·example; holistic은 논술형만 상/중/하; notes 1~4줄), exemplar_answers(서술형: 만점과 부분점수 예시 최소 1개씩, 논술형: 상/중/하 각 1개; points·scores·text·rationale), level_map(A~E 예상 점수 구간 + trait), min_competency는 null(서버가 E 문장을 채움), references(참고한 예시 id·출처). 그리고 grade_boundaries 7행(총 22점, level_ref 병기)과 feedback_templates 상/중/하(1~2문장, 존댓말). 학생은 stem과 conditions만 보고 답안을 쓴다.',
  6: '비전공 원장님이 그대로 진행할 수 있는 교사용 지침서를 만들어라: general(세트 준비물·일정(2시간 등원 = 2차시)·목적), glossary 3개 이상, merge_guide(3단계에서 mergeable_with로 표시된 쌍마다 lessons·skip_activities·time_budget_120 합 120), grading_guide(common_errors 문항별 흔한 오답 3개 이상과 검수 시 볼 곳, review_tips 2~5개, retry_guidance), per_lesson(차시마다 지도안에 없는 메모만 0~3개).',
  7: `차시별 피드백 안내장 틀(NoticePlan)을 만들어라. per_lesson: 차시마다 topic_summary(60자, "~활동에서 ~을 배웠습니다"), preview(50자, 다음 차시 예고; 마지막 차시는 세트 마무리), home_study_suggestion(60자, 혼자 실행 가능한 구체 행동 1개, "~해 봅시다" 청유형), quiz_notes(퀴즈 문항마다 틀렸을 때 줄 40자 코멘트: 부분 긍정 + 역접 + 완곡, 부정 서술어 금지; 퀴즈 없는 차시는 빈 배열), criteria_phrases(서·논술형이 있는 차시만: 5단계 채점표 요소명 그대로, good 2개 이상(정도부사+완성동사), improve 2개 이상(부분 긍정 + 역접 + 다음 행동); 그 외 차시는 null). footer_disclaimer는 정확히 "${NOTICE_DISCLAIMER}". 다른 학생 비교·등수·"못한다/실패" 금지.`,
}

const LEVEL_NAME: Record<string, string> = { '초': '초등학교', '중': '중학교', '고': '고등학교' }
function header(ctx: Ctx) {
  return [
    `대주제: ${ctx.theme.title}`,
    `학교급·학년: ${LEVEL_NAME[ctx.theme.level] ?? ctx.theme.level} ${ctx.theme.grade}학년 (모든 내용은 이 학년 수준)`,
    ...(ctx.theme.subjects.length > 0 ? [`참여 과목: ${ctx.theme.subjects.join(', ')}`] : []),
    ...(ctx.subject ? [`과목: ${ctx.subject}`] : []),
    `성취기준(원문, 절대 변형 금지):`,
    ...ctx.standards.map((s) => `${s.code} ${s.text}`),
  ].join('\n')
}

const LEVEL_STAGES = new Set<Stage>([1, 2, 3, 5, 7])
const EXEMPLAR_STAGES: Partial<Record<Stage, 'any' | '서술형' | '논술형'>> = { 3: 'any', 5: 'any' }
function schoolOf(level: string): '초' | '중' | '고' { return level === '초' || level === '고' ? level : '중' }

function knowledgeBlocks(stage: Stage, ctx: Ctx): string {
  const blocks: string[] = []
  if (LEVEL_STAGES.has(stage) && ctx.standards.length) {
    const lv = levelsBlock(ctx.standards.map((s) => s.code))
    if (lv) blocks.push(`성취수준(평가원 원문 — 재구성·목표·활동지 층·척도 어휘의 근거):\n${lv}`)
  }
  const kind = EXEMPLAR_STAGES[stage]
  if (kind && ctx.subject) {
    const ex = exemplarsBlock({ subject: ctx.subject, school_level: schoolOf(ctx.theme.level), grade: ctx.theme.grade, codes: ctx.standards.map((s) => s.code), unit: ctx.unit ?? null, kind, answerMode: 'screen' }, stage === 5 ? 5 : 2)
    if (ex) blocks.push(ex)
  }
  return blocks.length ? `\n\n${blocks.join('\n\n')}` : ''
}

export function buildPrompt(stage: Stage, ctx: Ctx) {
  const prior = Object.keys(ctx.prior).length ? `\n\n지금까지 확정된 내용:\n${JSON.stringify(ctx.prior, null, 1)}` : ''
  const lettering = stage === 4 ? sharedMaterialLettering(ctx) : ''
  return { system: rulesFor(ctx.subject), user: `${header(ctx)}${knowledgeBlocks(stage, ctx)}\n\n과제: ${TASKS[stage]}${lettering}${prior}`, fixtureKey: fixtureKeyFor(stage, 'generate', ctx) }
}
```

`sharedMaterialLettering`의 문장 끝에 ` 새 자료의 source.kind는 "자작"이다.`를 덧붙인다(테스트 `source\.kind는 "자작"`).

- [ ] **Step 5: 통과 확인** — `npx vitest run tests/rules.test.ts tests/prompts.test.ts` → PASS.

- [ ] **Step 6: 스펙 부록 A에 C-31 행 추가** — `docs/superpowers/specs/2026-09-25-item-studio-v2-design.md` A.1 표 C-30 행 아래에 `| C-31 | 세트 평가는 서술형 2개(각 3점) + 논술형 1개(16점) = 22점 … (Step 3의 C-31 text 그대로) | P+S | [대표][v1] |`를 넣고, `tests/rules.test.ts`의 개수 기대값을 `31 + 12 + 33 + 9 + 12`로 맞춘다.

- [ ] **Step 7: Commit**

```bash
git add lib/studio/prompts/rules.ts lib/studio/prompts/rules lib/studio/prompts/stages.ts tests/rules.test.ts tests/prompts.test.ts docs/superpowers/specs/2026-09-25-item-studio-v2-design.md
git commit -m "feat(prompts): 규칙 v2(ID·출처 태그) 분할과 성취수준·예시 은행 주입 프롬프트

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: 검토 v2 — 단계별 검토 초점, [TS] 검사 선행, enrich 후 저장

**Files:**
- Modify: `lib/studio/prompts/stages.ts`(`REVIEW_FOCUS`·`buildReviewPrompt`), `lib/studio/stages.ts`(`runStage` generate/review)
- Test: `tests/stages.test.ts`(추가), `tests/prompts.test.ts`(추가)

**Interfaces:**
- Produces: `buildReviewPrompt(stage, ctx, output)` → `{ system: [rulesFor(subject), REVIEWER], user, fixtureKey }`; `runStage` generate가 `enrichOutput` 결과를 저장; review가 `staticIssues`가 비어 있지 않으면 모델을 부르지 않고 `{ state: 'reviewed', review: { pass: false, issues } }` 저장 + `generation_log`(`model: 'static'`, `ok: false`).
- Consumes: `staticIssues`(T1), `enrichOutput`(T2).

- [ ] **Step 1: 실패 테스트**

```ts
// tests/prompts.test.ts 에 추가
import { buildReviewPrompt as brp } from '@/lib/studio/prompts/stages'
describe('review focus v2', () => {
  it('stage 5 review asks to actually grade the exemplars per item and to check level wording', () => {
    const u = brp(5, ctx, { items: [] }).user
    expect(u).toMatch(/예시답안을 채점표로 실제로 채점/); expect(u).toMatch(/부사만/); expect(u).toMatch(/8문항/)
  })
  it('stage 3 review checks scripts, worksheet tiers and quiz answers; stage 7 checks notice rules', () => {
    expect(brp(3, ctx, {}).user).toMatch(/if_stuck/); expect(brp(3, ctx, {}).user).toMatch(/기본·표준·도전/)
    expect(brp(7, ctx, {}).user).toMatch(/학부모/); expect(brp(2, ctx, {}).user).toMatch(/C 문장/)
  })
})
```

```ts
// tests/stages.test.ts 에 추가 (기존 Repo 가짜 패턴 재사용)
import { runStage, type Repo, type StageStatus } from '@/lib/studio/stages'
describe('runStage v2 hooks', () => {
  const standards = [{ code: '[9수04-02]', text: '자료를 줄기와 잎 그림, 도수분포표, 히스토그램, 도수분포다각형으로 나타내고 해석할 수 있다.' }, { code: '[9수04-03]', text: '상대도수를 구하고, 상대도수의 분포를 표나 그래프로 나타내고 해석할 수 있다.' }]
  function repoWith(outputs: Record<number, unknown>, statuses: Record<number, StageStatus>, logs: unknown[]): Repo {
    return {
      async loadContext() { return { theme: { title: 't', level: '중', grade: 1, subjects: ['수학'] }, subject: '수학', standards, prior: {}, outputs, statuses } },
      async saveOutput(_id, stage, out) { outputs[stage] = out },
      async saveStatus(_id, stage, st) { statuses[stage] = st },
      async log(e) { logs.push(e) },
    }
  }
  it('review runs static checks before the model and logs model:"static" on failure', async () => {
    process.env.AI_MOCK = '1'
    const bad = { standards: [{ code: '[9수04-02]', original_text: '틀린 원문', reconstruction_type: '유지', merged_with: [], reconstructed_text: '틀린 원문', reason: ['4~6차시 압축'], learning_elements: ['x'] }], reconstruction: '통계청 자료를 해석할 수 있다.', learning_goals: [], level_anchor: [], key_question_candidates: [] }
    const statuses: Record<number, StageStatus> = { 1: { state: 'accepted', attempt: 1, output: {}, updated_at: '' }, 2: { state: 'generated', attempt: 1, output: bad, updated_at: '' } }
    const logs: { model: string; ok: boolean }[] = []
    const r = await runStage({ itemSetId: 'x', stage: 2, action: 'review', repo: repoWith({ 2: bad }, statuses, logs) })
    expect(r.status.review?.pass).toBe(false)
    expect(r.status.review?.issues.some((i) => i.kind === 'fidelity')).toBe(true)
    expect(logs.at(-1)).toMatchObject({ model: 'static', ok: false })
  })
  it('generate stores the enriched output (level_anchor filled) in mock mode', async () => {
    process.env.AI_MOCK = '1'
    const outputs: Record<number, unknown> = {}
    const statuses: Record<number, StageStatus> = { 0: { state: 'accepted', attempt: 1, output: {}, updated_at: '' }, 1: { state: 'accepted', attempt: 1, output: {}, updated_at: '' } }
    await runStage({ itemSetId: 'x', stage: 2, action: 'generate', repo: repoWith(outputs, statuses, []) })
    expect((outputs[2] as { level_anchor: unknown[] }).level_anchor.length).toBe(2)
  })
})
```

- [ ] **Step 2: 실패 확인** — `npx vitest run tests/prompts.test.ts tests/stages.test.ts` → FAIL. (mock 2단계 fixture가 아직 v1이라 zod에서 먼저 실패한다 — T6까지는 `generate` 테스트를 `it.skip`으로 두고 T6에서 켠다.)

- [ ] **Step 3: `REVIEW_FOCUS`·`buildReviewPrompt` 교체**

```ts
const REVIEW_FOCUS: Record<Stage, string> = {
  0: '소개문이 학년 수준인지, 과목별 아이디어가 그 과목 성취기준으로 이어질 수 있는지.',
  1: '추천한 성취기준이 해당 학년 교과서 범위인지(다른 학년 내용이면 grade_level 이슈).',
  2: '재구조화 문장마다 원문에 없는 동사·대상·개념이 있는지(fidelity). 재구조화 문장이 위의 C 문장(도달점)보다 좁거나 다른 활동인지(level). 통합이면 원 성취기준의 학습요소가 남았는지. 핵심질문 후보가 사실 확인형인지. 학습 목표에 세 축이 다 있고 서술어가 통일됐는지. 재구성에 축제·일회용품 같은 맥락이 섞였는지.',
  3: '모든 성취기준이 어느 차시엔가 배정됐는지(coverage). 퀴즈가 차시 핵심질문을 점검하고 정답이 맞는지(quiz). 서술형1·2·논술형이 각 1회, 논술형이 마지막 차시인지. 발문이 원장이 읽고 그대로 진행할 만큼 구체적이고 if_stuck이 정답을 그대로 말하지 않는지. 활동지 기본·표준·도전이 실제로 난이도 차이가 나는지(level). caution_notes에 오개념이 있는지. 시간 배분이 활동량과 맞는지.',
  4: '수치 자료의 합계·비율이 맞는지. 자료가 답을 대신하지 않는지(문항이 요구할 정리·계산 결과나 결론 문장이 있으면 other). 찬반·비교 자료의 균형. 학년 어휘 수준. 표가 한 화면(25행·6열)인지. source가 자작인지.',
  5: '문항마다 예시답안을 채점표로 실제로 채점해 적힌 요소별 점수·총점이 나오는지, 논술형 상/중/하가 등급표에서 각 밴드에 떨어지는지(rubric; 불일치면 어느 요소가 몇 점 차이인지 detail에 적는다). 배점 합 22, 등급표 일치. 문두가 전제문+발문+[배점]이고 사고 순서 = 조건 순서인지. conditions가 학생 혼자 답안을 쓸 만큼 구체적인지(length가 셀 수 있는 분량인지, items에 행동 동사·부분배점이 있는지, "제한 없음" 같은 빈 조건이 없는지 — 있으면 other). 척도 descriptor가 관찰 가능한 표현인지, 인접 단계가 부사만 다른지(level). 논술형에 가치·태도 축 요소가 있으면 정당화 가능성 기준인지. 예시 은행 문장을 그대로 베끼지 않았는지(source). 성취기준 이탈 여부. 8문항 자가 점검(성취기준 부합·3범주 반영·상황맥락·고차 사고·채점기준 부합·변별·명료성·채점자 불변성).',
  6: '비전공자가 따라 할 수 있는 구체성. merge_guide가 3단계 병합 표시와 같은지, per_lesson 수가 차시 수와 같은지. common_errors가 채점표 요소와 연결되는지.',
  7: '문장이 활동명으로 시작하는지, 근거 없는 인성 평가가 없는지, 학부모가 읽어도 어색하지 않은지, 부정 서술어·비교·단독 평어가 없는지(notice). criteria_phrases의 요소명이 5단계 채점표와 같은지. home_study_suggestion이 혼자 실행 가능한 구체 행동인지.',
}
const REVIEWER = '당신은 이제 검토자다. 생성 결과가 규칙을 지켰는지 검사하고 pass/issues로만 답한다. 문제가 없으면 pass=true, issues=[]. issues[].kind는 fidelity·grade_level·coverage·quiz·rubric·level·source·notice·other 중 하나.'

export function buildReviewPrompt(stage: Stage, ctx: Ctx, output: unknown) {
  const system: string[] = [rulesFor(ctx.subject), REVIEWER]
  const user = `${header(ctx)}${knowledgeBlocks(stage, ctx)}\n\n검토 초점: ${REVIEW_FOCUS[stage]}\n\n생성 결과:\n${JSON.stringify(output, null, 1)}`
  return { system, user, fixtureKey: fixtureKeyFor(stage, 'review', ctx) }
}
```

- [ ] **Step 4: `lib/studio/stages.ts` 수정** — import에 `import { staticIssues } from './checks'`, `import { enrichOutput } from './enrich'` 추가. `runStage`의 generate 분기에서 `callStructured` 성공 뒤:

```ts
      const data = enrichOutput(stage, r.data, { standards: ctx.standards, prior: ctx.prior })
      const status: StageStatus = { state: 'generated', attempt, output: data, model: r.model, updated_at: now() }
      await repo.saveOutput(itemSetId, stage, data)
```

(기존 `r.data`를 쓰던 두 곳을 `data`로.) review 분기 첫머리(`buildReviewPrompt` 호출 전)에:

```ts
    const issues = staticIssues(stage, output, { standards: ctx.standards, prior: ctx.prior })
    if (issues.length > 0) {
      const review: ReviewT = { pass: false, issues }
      await repo.log({ itemSetId, stage, role: 'review', attempt: prev.attempt, model: 'static', input: 0, output: 0, cacheRead: 0, ok: false, issues: review })
      const exhausted = prev.attempt >= (MAX_ATTEMPTS[stage] ?? 1)
      const status: StageStatus = { state: 'reviewed', attempt: prev.attempt, output, review, updated_at: now(),
        ...(prev.model ? { model: prev.model } : {}), ...(exhausted ? { error: '검토 반복 한도 도달 — 관리자가 직접 수정' } : {}) }
      await repo.saveStatus(itemSetId, stage, status); return { status }
    }
```

`runThemeIntro`는 그대로(0단계는 정적 검사 없음).

- [ ] **Step 5: 통과 확인** — `npx vitest run tests/prompts.test.ts tests/stages.test.ts` → PASS(skip 1).

- [ ] **Step 6: Commit**

```bash
git add lib/studio/prompts/stages.ts lib/studio/stages.ts tests/prompts.test.ts tests/stages.test.ts
git commit -m "feat(studio): 검토 초점 v2와 정적 검사 선행, 서버 채움 출력 저장

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: 마이그레이션 0011 · 7단계 배선(repo·편집·마법사·게시) · 스냅샷 v2

**Files:**
- Create: `supabase/migrations/20260925000011_studio_v2.sql`
- Modify: `lib/studio/repo.ts`, `lib/studio/publish.ts`, `lib/studio/edit-rules.ts`, `lib/studio/wizard-stages.ts`, `lib/studio/max-attempts.ts`, `app/admin/items/[themeId]/sets/[setId]/actions.ts`, `app/admin/items/[themeId]/sets/[setId]/useStageRunner.ts`, `app/admin/items/[themeId]/sets/[setId]/page.tsx`, `app/admin/items/[themeId]/sets/[setId]/StageWizard.tsx`, `app/api/studio/item-sets/[id]/stages/[stage]/route.ts`, `content/site.ts`(`app.studio.wizard.stageNames[7]`), `docs/STATUS.md`
- Test: `tests/publish.test.ts`(수정), `tests/edit-rules.test.ts`(수정)

**Interfaces:**
- Produces (SQL): `item_sets.unit_plan jsonb`, `item_sets.reconstruction_detail jsonb`, `item_sets.notice_plan jsonb`; 표 `notices(id, assignment_id, lesson_no, body jsonb, status, drafted_by, drafted_at, confirmed_at, unique(assignment_id, lesson_no))` + RLS(원장 자기 원 rw, admin all, 학생 없음).
- Produces (`publish.ts`): `Snapshot` = `SnapshotV2`(compat.ts 재수출), `buildSnapshot`이 `schema_version: 2`, `unit_plan`, `reconstruction_detail`, `notice_plan`, `references`(문항 카드 `references` 합집합, id 기준 중복 제거)를 채움; `canPublish`가 2~7단계 accepted 요구(blocker `stageNotAccepted:7`).
- Produces (`repo.ts`): `loadContext` outputs[2] = `{ standards: reconstruction_detail, reconstruction, learning_goals, level_anchor, key_question_candidates }`, outputs[3] = `{ unit_plan, lessons }`, outputs[7] = `notice_plan`; `saveOutput` 2/3/7 열 저장; `buildStatuses` 0~7.
- `WIZARD_STAGES = [2,3,4,5,6,7]`, `EDITABLE_STAGES` 동일, `LAST_STAGE = 7`, `MAX_ATTEMPTS = { 5: 3, 7: 2 }`, API 라우트 stage 범위 0~7.

- [ ] **Step 1: 실패 테스트**

```ts
// tests/publish.test.ts — allAccepted 에 stage7 추가, 아래 케이스 추가/수정
it('blocks stageNotAccepted:7 when the notice plan is not accepted', () => {
  const r = canPublish({ statuses: { ...allAccepted, stage7: undefined }, standards: [], keyQuestion: 'q' })
  expect(r.blockers).toContain('stageNotAccepted:7')
})
it('buildSnapshot emits schema_version 2, unit_plan, reconstruction_detail, notice_plan and merged references', () => {
  const s = buildSnapshot({ theme: { ...baseTheme, materials: null }, standards: [{ code: '[9수04-02]', text: 't' }], version: 1,
    itemSet: { ...baseItemSet, unit_plan: { set_title: 'u' }, reconstruction_detail: [{ code: '[9수04-02]' }], notice_plan: { per_lesson: [] },
      assessment: { items: [{ references: [{ id: 'math-jaryojip-001', source: 'a.pdf p.1' }] }, { references: [{ id: 'math-jaryojip-001', source: 'a.pdf p.1' }, { id: 'k25-과학-01', source: 'b.pdf p.28' }] }], grade_boundaries: [], feedback_templates: { 상: '', 중: '', 하: '' } } } as never })
  expect(s.schema_version).toBe(2); expect(s.unit_plan).toEqual({ set_title: 'u' }); expect(s.notice_plan).toEqual({ per_lesson: [] })
  expect(s.reconstruction_detail).toHaveLength(1); expect(s.references.map((r) => r.id)).toEqual(['k25-과학-01', 'math-jaryojip-001'])
})
```

(기존 `canPublish` 다중 blocker 테스트의 기대 배열에 `'stageNotAccepted:7'`을 `6` 뒤에 추가. `tests/edit-rules.test.ts`의 `downstreamResets` 기대에 7단계 포함.)

- [ ] **Step 2: 실패 확인** — `npx vitest run tests/publish.test.ts tests/edit-rules.test.ts` → FAIL.

- [ ] **Step 3: SQL**

```sql
-- v2 제작소: 2·3·7단계 전용 열과 학생별 안내장 (스펙 §4.2)
alter table item_sets
  add column if not exists unit_plan jsonb,
  add column if not exists reconstruction_detail jsonb,
  add column if not exists notice_plan jsonb;

create table if not exists notices (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references assignments(id) on delete cascade,
  academy_id uuid not null references academies(id) on delete cascade,
  lesson_no int not null,
  body jsonb not null,
  status text not null default 'draft' check (status in ('draft', 'confirmed')),
  drafted_by uuid references profiles(id),
  drafted_at timestamptz not null default now(),
  confirmed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (assignment_id, lesson_no)
);
create index on notices(academy_id, status);
alter table notices enable row level security;
create policy admin_all_notices on notices for all using (current_user_role() = 'admin') with check (current_user_role() = 'admin');
create policy teacher_rw_notices on notices for all
  using (current_user_role() = 'teacher' and academy_id = current_academy_id())
  with check (current_user_role() = 'teacher' and academy_id = current_academy_id());
-- 학생 정책 없음: 안내장은 첫 주엔 원장 화면에서 보고 인쇄한다(대표님 잠정 결정 2026-09-25).
```

- [ ] **Step 4: `lib/studio/wizard-stages.ts` · `max-attempts.ts` · `edit-rules.ts`**

```ts
// wizard-stages.ts
export const WIZARD_STAGES = [2, 3, 4, 5, 6, 7] as const
export type WizardStage = (typeof WIZARD_STAGES)[number]
// max-attempts.ts
export const MAX_ATTEMPTS: Partial<Record<Stage, number>> = { 5: 3, 7: 2 }
// edit-rules.ts: EDITABLE_STAGES = [2, 3, 4, 5, 6, 7] as const; const LAST_STAGE = 7
```

`useStageRunner.ts`가 자체 `WIZARD_STAGES`를 갖고 있으면 `@/lib/studio/wizard-stages`에서 재수출하도록 바꾼다(값 중복 금지). `StageWizard.tsx`의 단계별 요약 렌더에 `stage === 7` 분기를 추가한다:

```tsx
  if (stage === 7) {
    const o = output as { per_lesson?: { lesson_no: number; criteria_phrases: unknown[] | null }[] }
    return <p className="mt-3 text-sm">{copy.stage7.summary(o.per_lesson?.length ?? 0, o.per_lesson?.filter((p) => p.criteria_phrases).length ?? 0)}</p>
  }
```

`content/site.ts`의 `app.studio.wizard`에 `stageNames[7]: '7단계 · 안내장 틀'`, `stage7: { summary: (lessons: number, essays: number) => `차시 ${lessons}개 · 서·논술형 차시 문구 ${essays}개` }`를 추가한다(기존 `stageNames`가 배열이면 인덱스 7, 객체면 키 7). 3단계 요약 렌더(`stage === 3`)는 `o.lessons`를 `(output as { lessons })`에서 그대로 읽으므로 그대로 두되, 5단계 요약의 `o.exemplars` 줄은 `o.items?.map((it) => it.exemplar_answers?.length)`로 바꾼다(`copy.stage5.exemplar` → `copy.stage5.exemplarCount(n)` 문구 추가).

- [ ] **Step 5: `lib/studio/repo.ts` 수정** — `buildStatuses` 루프를 `s <= 7`로. `loadContext` select에 `unit_plan, reconstruction_detail, notice_plan` 추가하고 outputs 조립을 교체:

```ts
      if (itemSet.reconstruction != null) {
        const st2 = stageStatus.stage2?.output as { key_question_candidates?: string[]; level_anchor?: unknown[] } | undefined
        outputs[2] = { standards: itemSet.reconstruction_detail ?? [], reconstruction: itemSet.reconstruction, learning_goals: itemSet.learning_goals ?? [],
          level_anchor: st2?.level_anchor ?? [], key_question_candidates: st2?.key_question_candidates ?? [] }
      }
      if (itemSet.lessons != null) outputs[3] = { unit_plan: itemSet.unit_plan ?? null, lessons: itemSet.lessons }
      if (itemSet.materials != null) outputs[4] = { materials: itemSet.materials }
      if (itemSet.assessment != null) outputs[5] = itemSet.assessment
      if (itemSet.teacher_guide != null) outputs[6] = itemSet.teacher_guide
      if (itemSet.notice_plan != null) outputs[7] = itemSet.notice_plan
```

`saveOutput`:

```ts
        case 2: {
          const o = output as { standards: unknown; reconstruction: string; learning_goals: unknown; key_question_candidates?: string[] }
          const { data: current } = await supabase.from('item_sets').select('key_question').eq('id', itemSetId).single()
          const keyQuestion = keyQuestionAfterStage2(current?.key_question as string | null | undefined, o.key_question_candidates ?? [])
          const { error } = await supabase.from('item_sets').update({ reconstruction: o.reconstruction, reconstruction_detail: o.standards, learning_goals: o.learning_goals, key_question: keyQuestion }).eq('id', itemSetId)
          if (error) throw new Error(error.message); return
        }
        case 3: {
          const o = output as { unit_plan: unknown; lessons: unknown }
          const { error } = await supabase.from('item_sets').update({ unit_plan: o.unit_plan, lessons: o.lessons }).eq('id', itemSetId)
          if (error) throw new Error(error.message); return
        }
        case 7: {
          const { error } = await supabase.from('item_sets').update({ notice_plan: output }).eq('id', itemSetId)
          if (error) throw new Error(error.message); return
        }
```

`app/admin/…/actions.ts`의 `stageColumns`도 같은 대응으로(2: `reconstruction, reconstruction_detail, learning_goals`; 3: `unit_plan, lessons`; 7: `notice_plan`), `publishItemSet`/`page.tsx`의 select에 세 열 추가. `applyImages`의 lessons 검증은 `Lessons.safeParse({ unit_plan: row.unit_plan, lessons: nextItems })`로(열 `unit_plan`도 select).

- [ ] **Step 6: `lib/studio/publish.ts`**

```ts
import type { z } from 'zod'
import { Materials, LessonDesign } from './schemas'
import type { Material as MaterialSchema, Lesson as LessonSchema, Assessment as AssessmentSchema, TeacherGuide as TeacherGuideSchema } from './schemas'
import type { StageStatus } from './stages'
import type { SnapshotV2, UnitPlanT, ReconstructedStandardT, LearningGoalT, NoticePlanT } from './compat'
export { upgradeSnapshot } from './compat'

export type Snapshot = SnapshotV2
export type PublishStandard = { code: string; text: string }
type MaterialT = z.infer<typeof MaterialSchema>; type LessonT = z.infer<typeof LessonSchema>; type AssessmentT = z.infer<typeof AssessmentSchema>; type TeacherGuideT = z.infer<typeof TeacherGuideSchema>

function materialsWithDefaults(items: MaterialT[] | null | undefined): MaterialT[] {
  const list = items ?? []
  const r = Materials.safeParse({ materials: list })
  return r.success ? r.data.materials : list.map((m) => ({ ...m, images: m.images ?? [], role: m.role ?? 'raw' }))
}
function lessonsWithDefaults(unitPlan: UnitPlanT | null, items: LessonT[] | null | undefined): LessonT[] {
  const list = items ?? []
  const r = LessonDesign.safeParse({ unit_plan: unitPlan, lessons: list })
  return r.success ? r.data.lessons : list.map((l) => ({ ...l, images: l.images ?? [], merge_note: l.merge_note ?? null }))
}

export const PUBLISH_STAGES = [2, 3, 4, 5, 6, 7] as const

export function canPublish({ statuses, standards, keyQuestion }: { statuses: Record<string, StageStatus | undefined>; standards: { code: string; verified: boolean }[]; keyQuestion: string | null | undefined }): { ok: boolean; blockers: string[] } {
  const blockers: string[] = []
  for (const stage of PUBLISH_STAGES) if (statuses[`stage${stage}`]?.state !== 'accepted') blockers.push(`stageNotAccepted:${stage}`)
  for (const standard of standards) if (!standard.verified) blockers.push(`unverifiedStandard:${standard.code}`)
  if (!keyQuestion || !keyQuestion.trim()) blockers.push('noKeyQuestion')
  return { ok: blockers.length === 0, blockers }
}

export function collectReferences(assessment: AssessmentT | null): { id: string; source: string }[] {
  const map = new Map<string, string>()
  for (const it of assessment?.items ?? []) for (const r of it.references ?? []) map.set(r.id, r.source)
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([id, source]) => ({ id, source }))
}

export function buildSnapshot({ theme, itemSet, standards, version }: {
  theme: { title: string; level: string; grade: number; intro: string | null; materials: MaterialT[] | null }
  itemSet: { subject: string; level: string; grade: number; reconstruction: string | null; reconstruction_detail: ReconstructedStandardT[] | null; learning_goals: LearningGoalT[] | null; key_question: string | null
    unit_plan: UnitPlanT | null; lessons: LessonT[] | null; materials: MaterialT[] | null; assessment: AssessmentT | null; teacher_guide: TeacherGuideT | null; notice_plan: NoticePlanT | null; stage_status: Record<string, StageStatus | undefined> | null }
  standards: PublishStandard[]; version: number
}): Snapshot {
  const merged = new Map<string, MaterialT>()
  for (const m of materialsWithDefaults(theme.materials)) merged.set(m.id, m)
  for (const m of materialsWithDefaults(itemSet.materials)) if (!merged.has(m.id)) merged.set(m.id, m)
  const materials = [...merged.values()].sort((a, b) => a.id.localeCompare(b.id))
  const models = Array.from(new Set(Object.values(itemSet.stage_status ?? {}).map((s) => s?.model).filter((m): m is string => !!m)))
  return {
    schema_version: 2,
    cover: { title: theme.title, subject: itemSet.subject, level: theme.level, grade: theme.grade, version, published_at: new Date().toISOString() },
    standards, intro: theme.intro ?? '',
    reconstruction: itemSet.reconstruction ?? '', reconstruction_detail: itemSet.reconstruction_detail ?? [],
    learning_goals: itemSet.learning_goals ?? [], key_question: itemSet.key_question ?? '',
    unit_plan: itemSet.unit_plan ?? null, lessons: lessonsWithDefaults(itemSet.unit_plan ?? null, itemSet.lessons), materials,
    assessment: itemSet.assessment ?? null, teacher_guide: itemSet.teacher_guide ?? null, notice_plan: itemSet.notice_plan ?? null,
    references: collectReferences(itemSet.assessment ?? null), generated_with: { models },
  }
}
```

API 라우트 `app/api/studio/item-sets/[id]/stages/[stage]/route.ts`의 stage 파싱 상한을 7로(`Number(stage) >= 0 && Number(stage) <= 7`). `docs/STATUS.md` "대표님이 하실 일"에 `- 마이그레이션 0011(v2 열·안내장 표) 적용: supabase db push` 한 줄.

- [ ] **Step 7: 통과 확인** — `npx vitest run tests/publish.test.ts tests/edit-rules.test.ts` → PASS. `npx tsc --noEmit` → 남는 오류는 `PackageView.tsx`·학생 page·`lessons.ts`·`grading-prompt.ts`·fixture 테스트뿐이어야 한다(T6·T7에서 해소). 오류 목록을 `npx tsc --noEmit 2>&1 | grep -c "error TS"`로 세어 T7 뒤 0이 되는지 본다.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/20260925000011_studio_v2.sql lib/studio/repo.ts lib/studio/publish.ts lib/studio/edit-rules.ts lib/studio/wizard-stages.ts lib/studio/max-attempts.ts "app/admin/items/[themeId]/sets/[setId]/actions.ts" "app/admin/items/[themeId]/sets/[setId]/useStageRunner.ts" "app/admin/items/[themeId]/sets/[setId]/page.tsx" "app/admin/items/[themeId]/sets/[setId]/StageWizard.tsx" "app/api/studio/item-sets/[id]/stages/[stage]/route.ts" content/site.ts docs/STATUS.md tests/publish.test.ts tests/edit-rules.test.ts
git commit -m "feat(studio): 0011 마이그레이션, 7단계(안내장 틀) 배선, 스냅샷 v2

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: fixture v2 — v1 fixture를 결정적으로 변환하는 스크립트, 안내장 틀 초안 함수, mock 종단 테스트

**Files:**
- Create: `lib/studio/notice-draft.ts`, `scripts/upgrade-fixtures-v2.ts`
- Modify: `lib/studio/compat.ts`(보강 3건), `data/studio-fixtures/stage{2,3,4,5,6,7}-generate.json`, `stage{2,3,4,5,6,7}-generate-과학.json`, `stage7-review.json`, `stage7-review-과학.json`(신설), `tests/compat.test.ts`(기대값 1건)
- Test: `tests/mock-fixtures.test.ts`(재작성), `tests/notice-draft.test.ts`, `tests/stages.test.ts`(skip 해제)

**Interfaces:**
- Produces (`notice-draft.ts`): `draftNoticePlan(lessons: LessonT[], assessment: AssessmentT | null): NoticePlanT` — 서·논술형 차시만 `criteria_phrases`(대표님 잠정 결정), 나머지 null.
- Produces (`compat.ts` 보강): `splitMainV1(main: string): MainStep[]`(①②③… 표식으로 나눠 2단계 20/20분, 표식이 없으면 1단계 40분), `axisOf(name: string)`, `fillScale`의 0점 서술에 무응답·시도 병기, `buildReconstructionV2(v1: { reconstruction; learning_goals; key_question_candidates }, standards): ReconstructionT`.
- Produces (script): `data/studio-fixtures/*.json` v2. 실행: `npx tsx scripts/upgrade-fixtures-v2.ts`.

- [ ] **Step 1: compat 보강** — `lib/studio/compat.ts`에 추가/수정:

```ts
export function splitMainV1(main: string): { step_label: string; minutes: number; activities: string[] }[] {
  const parts = main.split(/(?=[①②③④⑤⑥⑦⑧])/u).map((s) => s.trim()).filter(Boolean)
  if (parts.length < 2) return [{ step_label: '전개', minutes: 40, activities: [main] }]
  const half = Math.ceil(parts.length / 2)
  return [{ step_label: '개념·활동', minutes: 20, activities: parts.slice(0, half) }, { step_label: '적용·정리', minutes: 20, activities: parts.slice(half) }]
}
export function axisOf(name: string): '지식·이해' | '과정·기능' | '가치·태도' {
  if (/제안|판단|태도|입장|실천|가치|의견/.test(name)) return '가치·태도'
  if (/정확|정리|용어|개념|지식|계산/.test(name)) return '지식·이해'
  return '과정·기능'
}
```

`upgradeLessonV1`의 `flow.main`을 `isEssay ? [{ step_label: '논술형 작성', minutes: 40, activities: [l.flow.main] }] : splitMainV1(l.flow.main)`으로. `upgradeItemV1`의 요소 `axis`를 `axisOf(c.name)`(논술형)·`axisOf(`${it.kind} 채점표`)`(서술형 → 과정·기능)로. `fillScale`의 0점 descriptor를 `hit0 ? `${hit0.expectation} (무응답과 시도했으나 관련 내용이 없는 경우 모두 0점)` : '무응답 또는 시도했으나 관련 내용 없음'`으로, 논술형 `scale`의 0점도 같은 꼬리를 붙인다. 추가:

```ts
const AXIS_HINT: [RegExp, '지식·이해' | '가치·태도'][] = [[/뜻|의미|용어|설명할 수 있다|이해/, '지식·이해'], [/인식|태도|참여|실천|가치|필요성|유용성/, '가치·태도']]
export function buildReconstructionV2(v1: { reconstruction: string; learning_goals: string[]; key_question_candidates: string[] }, standards: { code: string; text: string }[]) {
  const goals = v1.learning_goals.map((text) => ({ text, axis: AXIS_HINT.find(([re]) => re.test(text))?.[1] ?? ('과정·기능' as const) }))
  const has = (a: string) => goals.some((g) => g.axis === a)
  if (!has('지식·이해')) goals[0] = { ...goals[0], axis: '지식·이해' }
  if (!has('가치·태도')) goals[goals.length - 1] = { ...goals[goals.length - 1], axis: '가치·태도' }
  if (!has('과정·기능')) goals[Math.min(1, goals.length - 1)] = { ...goals[Math.min(1, goals.length - 1)], axis: '과정·기능' }
  return { standards: upgradeReconstructionV1(standards), reconstruction: v1.reconstruction, learning_goals: goals, level_anchor: [], key_question_candidates: v1.key_question_candidates }
}
```

`tests/compat.test.ts`의 `expect(l.flow.main[0].minutes).toBe(40)`을 `expect(l.flow.main.reduce((s, m) => s + m.minutes, 0)).toBe(40)`으로.

- [ ] **Step 2: `lib/studio/notice-draft.ts`**

```ts
import type { z } from 'zod'
import { NOTICE_DISCLAIMER, type Lesson, type Assessment, type NoticePlan } from './schemas'
type LessonT = z.infer<typeof Lesson>; type AssessmentT = z.infer<typeof Assessment>; export type NoticePlanT = z.infer<typeof NoticePlan>
const cut = (s: string, n: number) => (s.length <= n ? s : `${s.slice(0, n - 1)}…`)

/** 안내장 틀의 결정적 초안(fixture·mock용). AI 생성본과 같은 모양이며 문장 규칙(N-05·N-12)을 지킨다. */
export function draftNoticePlan(lessons: LessonT[], assessment: AssessmentT | null): NoticePlanT {
  const sorted = [...lessons].sort((a, b) => a.no - b.no)
  return {
    per_lesson: sorted.map((l, i) => {
      const next = sorted[i + 1]
      const item = assessment?.items.find((it) => it.lesson_no === l.no) ?? null
      return {
        lesson_no: l.no,
        topic_summary: cut(`${l.topic} 활동에서 오늘의 핵심을 배웠습니다.`, 60),
        preview: next ? cut(`다음 시간에는 ${next.topic}을(를) 배워요.`, 50) : '이번 세트를 마무리했어요. 정리한 내용을 다시 읽어 봅시다.',
        home_study_suggestion: item ? '오늘 쓴 글의 보완할 점 한 가지를 고쳐 다시 써 봅시다.' : '오늘 퀴즈 중 틀린 문항과 같은 유형 1개를 다시 풀어 봅시다.',
        quiz_notes: l.formative_check.quiz.map((q, k) => ({ quiz_no: k + 1, wrong_note: cut(`다시 보면: ${q.explanation}`, 40) })),
        criteria_phrases: item ? item.rubric.criteria.map((c) => {
          const top = c.scale.find((s) => s.points === c.max)!; const mid = c.scale.find((s) => s.points === Math.max(1, c.max - 1))!; const low = c.scale.find((s) => s.points === 1) ?? mid
          return { criterion_name: c.name, good: [cut(top.descriptor, 60), cut(mid.descriptor, 60)],
            improve: [cut(`${low.descriptor}까지 해냈으나, ${top.descriptor}까지 써 봅시다`, 60), cut(`${c.name}에서 한 단계 더: ${top.descriptor}를 확인해 봅시다`, 60)] }
        }) : null,
      }
    }),
    footer_disclaimer: NOTICE_DISCLAIMER,
  }
}
```

- [ ] **Step 3: `scripts/upgrade-fixtures-v2.ts`**

```ts
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildReconstructionV2, upgradeLessonV1, upgradeMaterialV1, upgradeAssessmentV1, upgradeTeacherGuideV1, unitPlanFrom } from '../lib/studio/compat'
import { draftNoticePlan } from '../lib/studio/notice-draft'
import { enrichOutput } from '../lib/studio/enrich'
import { STAGE_SCHEMAS } from '../lib/studio/schemas'
import { staticIssues } from '../lib/studio/checks'

const V1 = join(process.cwd(), 'tests', 'fixtures', 'v1'); const OUT = join(process.cwd(), 'data', 'studio-fixtures')
const read = (name: string) => JSON.parse(readFileSync(join(V1, `${name}.json`), 'utf8'))
const write = (name: string, data: unknown) => writeFileSync(join(OUT, `${name}.json`), `${JSON.stringify(data, null, 1)}\n`, 'utf8')

function convert(suffix: '' | '-과학', standardsFile: string, title: string) {
  const standards = JSON.parse(readFileSync(join(OUT, standardsFile), 'utf8')) as { code: string; text: string }[]
  const s2 = read(`stage2-generate${suffix}`); const s3 = read(`stage3-generate${suffix}`); const s4 = read(`stage4-generate${suffix}`); const s5 = read(`stage5-generate${suffix}`); const s6 = read(`stage6-generate${suffix}`)
  const ctx = { standards, prior: {} as Record<string, unknown> }
  const stage2 = enrichOutput(2, buildReconstructionV2(s2, standards), ctx)
  const notesFor = (no: number) => (s6.per_lesson as { no: number; notes: string[] }[]).find((p) => p.no === no)?.notes ?? []
  const lessons = (s3.lessons as Parameters<typeof upgradeLessonV1>[0][]).map((l) => upgradeLessonV1(l, notesFor(l.no)))
  const assessment = upgradeAssessmentV1(s5)
  const stage3 = { unit_plan: unitPlanFrom(title, s2.key_question_candidates[0], lessons, assessment), lessons }
  const stage4 = { materials: (s4.materials as Parameters<typeof upgradeMaterialV1>[0][]).map(upgradeMaterialV1) }
  ctx.prior = { stage3, stage4, shared_materials: [] }
  const stage5 = enrichOutput(5, assessment, ctx)
  const stage6 = upgradeTeacherGuideV1(s6, lessons, assessment)
  const stage7 = draftNoticePlan(lessons, assessment)
  const outputs: Record<number, unknown> = { 2: stage2, 3: stage3, 4: stage4, 5: stage5, 6: stage6, 7: stage7 }
  let bad = 0
  for (const [stage, out] of Object.entries(outputs)) {
    const n = Number(stage) as 2 | 3 | 4 | 5 | 6 | 7
    const r = STAGE_SCHEMAS[n].safeParse(out)
    if (!r.success) { bad++; console.error(`stage${n}${suffix}: zod`, r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n  ')) }
    const issues = staticIssues(n, out, { standards, prior: ctx.prior })
    if (issues.length) { bad++; console.error(`stage${n}${suffix}: static`, issues.map((i) => `${i.kind}: ${i.detail}`).join('\n  ')) }
    write(`stage${n}-generate${suffix}`, out)
  }
  write(`stage7-review${suffix}`, { pass: true, issues: [] })
  return bad
}

const bad = convert('', 'standards-math.json', '자료의 정리와 해석') + convert('-과학', 'standards-science.json', '과학적 탐구와 지속가능한 삶')
if (bad > 0) { console.error(`${bad}개 산출물이 검증에 실패했다 — 위 메시지의 필드를 fixture에서 직접 고친 뒤 tests/mock-fixtures.test.ts 를 돌린다.`); process.exit(1) }
console.log('fixtures v2 written')
```

`unitPlanFrom`은 `compat.ts`에서 `export`로 바꾼다. 실행: `npx tsx scripts/upgrade-fixtures-v2.ts`. 실패 메시지가 나오면(예: 인접 척도가 부사만 다름, 과학 v1 fixture의 `main`에 ① 표식이 없어 소단계 1개) **생성된 v2 JSON 파일을 직접 고친다** — 척도 descriptor에는 구분되는 목적어·범위 명사구를 넣고(예: "수치 1개 인용" vs "수치 2개 이상 인용"), 소단계는 활동 문장을 둘로 나눠 20/20분으로 적는다. 고친 뒤 스크립트를 다시 돌리지 않는다(다시 돌리면 덮어쓴다) — 대신 Step 5 테스트가 검증한다.

- [ ] **Step 4: 테스트**

```ts
// tests/notice-draft.test.ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { draftNoticePlan } from '@/lib/studio/notice-draft'
import { NoticePlan } from '@/lib/studio/schemas'
import { staticIssues } from '@/lib/studio/checks'

describe('draftNoticePlan', () => {
  const s3 = JSON.parse(readFileSync('data/studio-fixtures/stage3-generate.json', 'utf8')); const s5 = JSON.parse(readFileSync('data/studio-fixtures/stage5-generate.json', 'utf8'))
  it('produces a valid plan with criteria phrases only on essay lessons', () => {
    const plan = draftNoticePlan(s3.lessons, s5)
    expect(NoticePlan.safeParse(plan).error?.issues ?? []).toEqual([])
    expect(plan.per_lesson.filter((p) => p.criteria_phrases).map((p) => p.lesson_no)).toEqual(s5.items.map((i: { lesson_no: number }) => i.lesson_no))
    expect(staticIssues(7, plan, { standards: [], prior: {} })).toEqual([])
    expect(plan.per_lesson.at(-1)?.preview).toMatch(/마무리/)
  })
})
```

```ts
// tests/mock-fixtures.test.ts (재작성)
import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { loadFixture } from '@/lib/ai/mock'
import { STAGE_SCHEMAS, Review } from '@/lib/studio/schemas'
import { staticIssues } from '@/lib/studio/checks'
import { runStage, type Repo, type StageStatus } from '@/lib/studio/stages'
import { buildPrompt, buildReviewPrompt } from '@/lib/studio/prompts/stages'

const STAGES = [2, 3, 4, 5, 6, 7] as const
const SETS = [{ suffix: '', subject: '수학', standards: 'standards-math.json' }, { suffix: '-과학', subject: '과학', standards: 'standards-science.json' }] as const
const std = (f: string) => JSON.parse(readFileSync(`data/studio-fixtures/${f}`, 'utf8')) as { code: string; text: string }[]

describe('fixture keys', () => {
  const ctx = { theme: { title: 't', level: '중', grade: 1, subjects: ['수학', '과학'] }, subject: '과학', standards: [], prior: {} }
  it('append the subject; stage 0 keeps the plain key', () => {
    expect(buildPrompt(7, ctx).fixtureKey).toBe('stage7-generate-과학'); expect(buildReviewPrompt(7, ctx, {}).fixtureKey).toBe('stage7-review-과학')
    expect(buildPrompt(0, { ...ctx, subject: '' }).fixtureKey).toBe('stage0-generate')
  })
  it('falls back to the base file when the subject file is missing', () => {
    expect(loadFixture('stage2-generate-국어')).toEqual(JSON.parse(readFileSync('data/studio-fixtures/stage2-generate.json', 'utf8')))
    expect(() => loadFixture('stage9-generate-과학')).toThrow(/fixture not found/)
  })
})

for (const set of SETS) describe(`${set.subject} fixtures (v2)`, () => {
  const standards = std(set.standards)
  const prior: Record<string, unknown> = {}
  for (const n of STAGES) it(`stage${n} validates against v2 zod and passes static checks`, () => {
    const gen = loadFixture(`stage${n}-generate${set.suffix}`)
    const parsed = STAGE_SCHEMAS[n].safeParse(gen)
    expect(parsed.error?.issues.map((i) => `${i.path.join('.')}: ${i.message}`) ?? []).toEqual([])
    expect(staticIssues(n, gen, { standards, prior }).map((i) => `${i.kind}: ${i.detail}`)).toEqual([])
    expect(Review.safeParse(loadFixture(`stage${n}-review${set.suffix}`)).success).toBe(true)
    prior[`stage${n}`] = gen
  })
  it('stage2 standards carry the verbatim originals', () => {
    const gen = loadFixture(`stage2-generate${set.suffix}`) as { standards: { code: string; original_text: string }[]; level_anchor: unknown[] }
    for (const s of gen.standards) expect(standards.find((x) => x.code === s.code)?.text).toBe(s.original_text)
    expect(gen.level_anchor.length).toBe(standards.length)
  })
  it('stage5 items reference raw materials, total 22, exemplar bands match', () => {
    const a = loadFixture(`stage5-generate${set.suffix}`) as { items: { points: number; min_competency: string | null; conditions: { answer_mode: string } }[] }
    expect(a.items.reduce((s, i) => s + i.points, 0)).toBe(22)
    expect(a.items.every((i) => i.min_competency)).toBe(true)
    expect(a.items.filter((i) => i.conditions.answer_mode === 'paper').length).toBeLessThanOrEqual(1)
  })
})

describe('runStage end-to-end in mock mode (과학, 2~7단계)', () => {
  beforeAll(() => { process.env.AI_MOCK = '1'; delete process.env.ANTHROPIC_API_KEY })
  it('generate → review → accept for every stage', async () => {
    const standards = std('standards-science.json'); const outputs: Record<number, unknown> = {}; const statuses: Record<number, StageStatus> = {}
    for (let s = 0; s < 2; s++) { outputs[s] = { placeholder: `stage${s}` }; statuses[s] = { state: 'accepted', attempt: 1, output: outputs[s], review: { pass: true, issues: [] }, updated_at: '' } }
    const repo: Repo = {
      async loadContext() { return { theme: { title: '학교 축제, 일회용품을 줄이자', level: '중', grade: 1, subjects: ['수학', '과학'] }, subject: '과학', standards, prior: {}, outputs, statuses } },
      async saveOutput(_id, stage, out) { outputs[stage] = out }, async saveStatus(_id, stage, st) { statuses[stage] = st }, async log() {},
    }
    for (const stage of STAGES) {
      const g = await runStage({ itemSetId: 'x', stage, action: 'generate', repo }); expect(g.status.state, `stage${stage} generate`).toBe('generated')
      const r = await runStage({ itemSetId: 'x', stage, action: 'review', repo }); expect(r.status.review?.issues ?? [], `stage${stage} review`).toEqual([])
      expect((await runStage({ itemSetId: 'x', stage, action: 'accept', repo })).status.state).toBe('accepted')
    }
    expect((outputs[7] as { per_lesson: unknown[] }).per_lesson.length).toBe((outputs[3] as { lessons: unknown[] }).lessons.length)
  })
})
```

`tests/stages.test.ts`의 `it.skip`을 `it`으로. `tests/studio-fixtures.test.ts`(있으면)의 v1 모양 기대를 v2로 바꾸거나 위 파일로 흡수하고 삭제한다.

- [ ] **Step 5: 통과 확인** — `npx vitest run tests/mock-fixtures.test.ts tests/notice-draft.test.ts tests/stages.test.ts tests/compat.test.ts` → PASS. 실패 항목은 그 fixture 필드를 직접 고친다(위 Step 3 지침).

- [ ] **Step 6: Commit**

```bash
git add lib/studio/compat.ts lib/studio/notice-draft.ts scripts/upgrade-fixtures-v2.ts data/studio-fixtures/stage2-generate.json data/studio-fixtures/stage3-generate.json data/studio-fixtures/stage4-generate.json data/studio-fixtures/stage5-generate.json data/studio-fixtures/stage6-generate.json data/studio-fixtures/stage7-generate.json data/studio-fixtures/stage7-review.json "data/studio-fixtures/stage2-generate-과학.json" "data/studio-fixtures/stage3-generate-과학.json" "data/studio-fixtures/stage4-generate-과학.json" "data/studio-fixtures/stage5-generate-과학.json" "data/studio-fixtures/stage6-generate-과학.json" "data/studio-fixtures/stage7-generate-과학.json" "data/studio-fixtures/stage7-review-과학.json" tests/mock-fixtures.test.ts tests/notice-draft.test.ts tests/stages.test.ts tests/compat.test.ts
git commit -m "feat(fixtures): v1 fixture를 v2로 변환(수학·과학 2~7단계), 안내장 틀 초안 함수

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: 화면·채점 v2 — PackageView, 학생 차시 화면, 원장 열람, 채점 프롬프트

**Files:**
- Modify: `components/studio/PackageView.tsx`(재작성), `lib/classroom/lessons.ts`, `lib/classroom/snapshot.ts`, `lib/classroom/grading-prompt.ts`, `lib/classroom/grade.ts`, `app/student/assignments/[id]/page.tsx`, `app/student/assignments/[id]/AnswerEditor.tsx`, `app/teacher/items/[setId]/page.tsx`, `app/admin/items/[themeId]/sets/[setId]/page.tsx`(draftSnapshot 인자), `content/site.ts`
- Test: `tests/classroom-lessons.test.ts`(수정), `tests/grading-prompt.test.ts`(재작성)

**Interfaces:**
- Produces (`lessons.ts`): `materialIdsForLesson(lesson: { materials_used: string[] })` — 정규식 파싱 제거; 나머지 함수 유지.
- Produces (`snapshot.ts`): `loadAssignmentSnapshot`이 `upgradeSnapshot(data.snapshot)`을 돌려줌.
- Produces (`grading-prompt.ts`): `buildGradingPrompt`가 문항의 `rubric.criteria`(max 가변)·`rubric.notes`·`exemplar_answers`·`level_map`·`conditions.items`를 넣고 규칙 블록은 `GRADING_PROMPT_RULES`; `GRADING_RULES` 이름은 그대로 두되 값 = `GRADING_PROMPT_RULES`.
- Produces (`AnswerEditor`): props `conditions: { length: string; format: string; answer_mode: 'screen' | 'paper'; items: { no: number; text: string }[] }`; `answer_mode === 'paper'`면 입력칸 대신 `copy.paperAnswer` 안내(제출 버튼 없음).
- Consumes: `Snapshot`(v2), `upgradeSnapshot`.

- [ ] **Step 1: 실패 테스트**

```ts
// tests/classroom-lessons.test.ts — materialIdsForLesson 블록 교체
describe('materialIdsForLesson', () => {
  it('returns the ids from materials_used sorted, ignoring preparation items', () => {
    expect(materialIdsForLesson({ materials_used: ['B', 'A'], materials_needed: ['축제 삽화 3장'] } as never)).toEqual(['A', 'B'])
    expect(materialIdsForLesson({ materials_used: [] } as never)).toEqual([])
  })
})
```

```ts
// tests/grading-prompt.test.ts (재작성)
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { buildGradingPrompt, GRADING_RULES } from '@/lib/classroom/grading-prompt'
import { GRADING_PROMPT_RULES } from '@/lib/studio/prompts/rules/grading'
import type { Snapshot } from '@/lib/studio/publish'

const assessment = JSON.parse(readFileSync('data/studio-fixtures/stage5-generate.json', 'utf8'))
const snapshot = { schema_version: 2, cover: { title: 'T', subject: '수학', level: '중', grade: 1, version: 1, published_at: '' }, standards: [], intro: '', reconstruction: '', reconstruction_detail: [],
  learning_goals: [], key_question: '', unit_plan: null, lessons: [], materials: [], assessment, teacher_guide: null, notice_plan: null, references: [], generated_with: { models: [] } } as unknown as Snapshot

describe('buildGradingPrompt v2', () => {
  it('rules block first; item, per-criterion scale with max, notes, conditions, and the item\'s own exemplars in user', () => {
    const p = buildGradingPrompt({ snapshot, itemNo: 1, studentGrade: 1, answer: '올해 플라스틱컵이 405개로 가장 많이 늘었다.' })
    expect(p.system[0]).toBe(GRADING_RULES); expect(GRADING_RULES).toBe(GRADING_PROMPT_RULES)
    expect(p.user).toContain(assessment.items[0].stem)
    expect(p.user).toContain(assessment.items[0].rubric.notes[0])
    expect(p.user).toContain(assessment.items[0].exemplar_answers[0].text.slice(0, 20))
    expect(p.user).not.toContain(assessment.items[2].exemplar_answers[0].text.slice(0, 20))
    expect(p.user).toMatch(/max=\d/); expect(p.user).toMatch(/A~E 예상 구간/); expect(p.fixtureKey).toBe('grading-서술형')
  })
  it('논술형 lists 4 criteria names with max=4 and the holistic bands', () => {
    const p = buildGradingPrompt({ snapshot, itemNo: 3, studentGrade: 1, answer: 'x'.repeat(60) })
    expect(p.fixtureKey).toBe('grading-논술형')
    for (const c of assessment.items[2].rubric.criteria) expect(p.user).toContain(`${c.name}(max=4)`)
    expect(p.user).toContain(assessment.items[2].rubric.holistic.상)
  })
})
```

- [ ] **Step 2: 실패 확인** — `npx vitest run tests/classroom-lessons.test.ts tests/grading-prompt.test.ts` → FAIL.

- [ ] **Step 3: `lib/classroom/lessons.ts`·`snapshot.ts`·`grade.ts`**

```ts
// lessons.ts — materialIdsForLesson 교체
export function materialIdsForLesson(lesson: { materials_used: string[] }): string[] { return [...new Set(lesson.materials_used)].sort() }
// snapshot.ts
import { upgradeSnapshot, type Snapshot } from '@/lib/studio/publish'
export async function loadAssignmentSnapshot(supabase: SupabaseClient, itemSetId: string, version: number): Promise<Snapshot | null> {
  const { data } = await supabase.from('item_set_versions').select('snapshot').eq('item_set_id', itemSetId).eq('version', version).maybeSingle()
  return data?.snapshot ? upgradeSnapshot(data.snapshot) : null
}
// grade.ts — `const snapshot = ver.snapshot as Snapshot` → `const snapshot = upgradeSnapshot(ver.snapshot)` (import 추가)
```

- [ ] **Step 4: `lib/classroom/grading-prompt.ts`**

```ts
import type { Snapshot } from '@/lib/studio/publish'
import { GRADING_PROMPT_RULES } from '@/lib/studio/prompts/rules/grading'

export const GRADING_RULES = GRADING_PROMPT_RULES
export type GradingPromptInput = { snapshot: Snapshot; itemNo: number; studentGrade: number; answer: string }

export function buildGradingPrompt({ snapshot, itemNo, studentGrade, answer }: GradingPromptInput) {
  const a = snapshot.assessment
  if (!a) throw new Error('snapshot has no assessment')
  const item = a.items[itemNo - 1]
  if (!item) throw new Error(`item ${itemNo} not found`)
  const rubric = item.rubric.criteria.map((c) => `- ${c.name}(max=${c.max}, ${c.axis}, 조건 ${c.condition_nos.join('·')}): ${[...c.scale].sort((x, y) => y.points - x.points).map((s) => `${s.points}=${s.descriptor}${s.example ? ` (예: ${s.example})` : ''}`).join(' / ')}`).join('\n')
  const holistic = item.rubric.holistic ? `총체적 기준: 상=${item.rubric.holistic.상} / 중=${item.rubric.holistic.중} / 하=${item.rubric.holistic.하}` : ''
  const exemplars = item.exemplar_answers.map((e) => `[${e.level ?? `${e.points}점`}] 요소별 ${e.scores.join('·')} = ${e.points}점 — ${e.rationale}\n${e.text}`).join('\n\n')
  const levels = item.level_map.map((l) => `${l.level}: ${l.min}~${l.max}점 — ${l.trait}`).join(' / ')
  const conditions = item.conditions.items.map((c) => `${c.no}. ${c.text}`).join('\n')
  const user = [
    `학생 학년: ${snapshot.cover.level} ${studentGrade}학년 · 과목: ${snapshot.cover.subject}`,
    `문항(${item.kind}, ${item.points}점):\n${item.stem}`,
    `조건:\n${conditions}\n분량 ${item.conditions.length} / 형식 ${item.conditions.format}${item.conditions.overflow_rule ? ` / ${item.conditions.overflow_rule}` : ''}`,
    `채점표(요소 ${item.rubric.criteria.length}개, 이름과 max를 그대로 쓴다):\n${rubric}`,
    holistic,
    `채점 시 유의점:\n${item.rubric.notes.map((n) => `- ${n}`).join('\n')}`,
    `A~E 예상 구간: ${levels}`,
    `예시 답안(이 문항):\n${exemplars}`,
    `학생 답안:\n${answer}`,
  ].filter(Boolean).join('\n\n')
  return { system: [GRADING_RULES], user, fixtureKey: `grading-${item.kind}` }
}
```

`data/studio-fixtures/grading-서술형.json`의 `criteria`를 v2 수학 fixture 서술형 1의 요소 이름·max와 맞춘다(요소 1개 `서술형 채점표` max 3이면 그대로).

- [ ] **Step 5: `content/site.ts` 문구 추가** — `app.packageView`에:

```ts
    unitPlanHeading: '평가 계획',
    unitPlan: { formativeLabel: '형성평가', placementLabel: '서·논술형 배치', rubricNoteLabel: '종합 도달 모습', placement: (kind: string, no: number) => `${kind} → ${no}차시` },
    reconstructionTable: { columns: { code: '코드', original: '원문', type: '유형', reconstructed: '재구조화', reason: '이유', elements: '학습요소' } },
    learningGoals: { axisLabel: (axis: string) => axis },
    levelsHeading: '성취수준(A~E)',
    levelsToggle: '성취수준 보기',
    lessons: { ...기존, topicLabel: '주제', timeLabel: (i: number, m: number, w: number) => `도입 ${i}분 · 전개 ${m}분 · 정리 ${w}분`, scriptHeading: '발문 대본', scriptExpected: '예상 답', scriptStuck: '막힐 때', needsLabel: '준비물', cautionHeading: '지도상 유의점', worksheetHeading: '활동지', worksheetTier: (tier: string, ref: string) => `${tier}(${ref})`, worksheetExpected: '기대 답', selfCheckHeading: '자기평가', mergeNoteLabel: '병합 시 생략' },
    assessment: { ...기존, elementsLabel: '평가 요소', situationLabel: '과제 상황', situation: (r: string, a: string, p: string, o: string) => `${r} → ${a} · ${p} · ${o}`, materialsLabel: '사용 자료', conditions: { heading: '조건', lengthLabel: '분량', formatLabel: '형식', answerMode: { screen: '화면 입력', paper: '종이 답안(사진 제출)' }, overflowLabel: '초과 응답', pointsLabel: (p: number) => `${p}점` }, notesHeading: '채점 시 유의점', exemplarsHeading: '예시답안', exemplarLabel: (level: string | null, points: number) => `${level ?? ''} ${points}점`.trim(), rationaleLabel: '채점자 의견', levelMapHeading: 'A~E 예상 점수', minCompetencyLabel: '최소 능력', referencesHeading: '참고한 공개 자료' },
    rubric: { criteriaLabel: '평가 요소', axisLabel: '축', conditionsLabel: '조건', pointLabel: (n: number) => `${n}점`, holisticHeading: '총체적 기준' },
    gradeBoundaries: { ...기존, levelRefLabel: '수준 참조' },
    teacherGuide: { ...기존, mergeHeading: '병합 안내', mergeLabel: (a: number, b: number) => `${a}·${b}차시 병합`, mergeSkip: '생략 활동', gradingHeading: '검수 요령', commonErrors: '흔한 오답', reviewTips: '검수 팁', retryLabel: '재도전 안내' },
    noticePlanHeading: '안내장 틀',
    noticePlan: { lessonLabel: (n: number) => `${n}차시`, summary: '학습 요약', preview: '다음 차시', home: '가정 학습', quizNotes: '퀴즈 오답 코멘트', phrases: '요소별 문구', good: '잘한 점', improve: '보완' },
    materials: { ...기존, sourceLabel: { 자작: '자작', 공개: '공개 자료' }, aiBadge: 'AI 보조 · 확인 필요', roleLabel: { raw: '원자료', context: '배경' } },
```

`app.classroom.student`에 `paperAnswer: '이 문항은 표·그래프를 직접 작성하는 문항이에요. 종이에 풀어 선생님께 내세요. 선생님이 사진으로 올려 주시면 결과가 여기에 보여요.'`, `conditionItem: (no: number) => `조건 ${no}`` 추가. `exemplars`·`shortRubric`·`extendedRubric`·`feedbackLevels` 키는 유지(사용처가 바뀌어도 `tests/site-content.test.ts`가 키 존재만 볼 수 있으므로 지우지 않는다).

- [ ] **Step 6: `components/studio/PackageView.tsx` 재작성** — `MaterialsSection`(export, 학생 화면이 씀)·`TableGrid`·`MaterialChart`는 유지하고 출처 배지만 추가. 나머지 섹션은 아래로 교체한다.

```tsx
import type { z } from 'zod'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Histogram } from './Histogram'
import { RelativeFreqBars } from './RelativeFreqBars'
import { detectChart } from '@/lib/studio/charts'
import type { Snapshot } from '@/lib/studio/publish'
import type { Lesson as LessonSchema, QuizItem as QuizItemSchema, Material as MaterialSchema, AssessmentItem as AssessmentItemSchema, Rubric as RubricSchema } from '@/lib/studio/schemas'
import { getLevels } from '@/lib/reference/levels'
import { app } from '@/content/site'

type Lesson = z.infer<typeof LessonSchema>; type QuizItem = z.infer<typeof QuizItemSchema>; type Material = z.infer<typeof MaterialSchema>
type AssessmentItem = z.infer<typeof AssessmentItemSchema>; type Rubric = z.infer<typeof RubricSchema>
const copy = app.packageView
function SectionHeading({ children }: { children: React.ReactNode }) { return <h2 className="text-lg font-bold">{children}</h2> }
const SPLIT_ROWS_OVER = 12

// TableGrid · MaterialTable · MaterialChart: 기존 코드 그대로 (생략 없이 유지)

export function MaterialsSection({ materials }: { materials: Material[] }) {
  if (materials.length === 0) return null
  return (
    <Card>
      <SectionHeading>{copy.materialsHeading}</SectionHeading>
      <div className="mt-3 space-y-6">
        {materials.map((m) => (
          <div key={m.id} className="rounded-xl border border-ink-100 bg-ink-100/30 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-mint-500 px-3 py-1 text-sm font-bold text-white">{copy.materials.idLabel} {m.id}</span>
              <p className="text-base font-bold">{m.title}</p>
              <Badge tone="gray">{copy.materials.sourceLabel[m.source.kind]}{m.source.attribution ? ` · ${m.source.attribution}` : ''}</Badge>
              <Badge tone="gray">{copy.materials.roleLabel[m.role]}</Badge>
              {m.source.ai_assisted && <Badge tone="lemon">{copy.materials.aiBadge}</Badge>}
            </div>
            {m.body && <p className="mt-1 whitespace-pre-wrap text-sm">{m.body}</p>}
            <MaterialTable material={m} />
            <MaterialChart material={m} />
            {(m.images ?? []).length > 0 && <div className="mt-2 flex flex-wrap gap-2">{m.images.map((src, i) => <img key={src} src={src} alt={copy.materials.imagesAlt(m.title, i + 1)} className="h-24 w-24 rounded-lg object-cover" />)}</div>}
          </div>
        ))}
      </div>
    </Card>
  )
}

function StandardsSection({ standards, showLevels }: { standards: Snapshot['standards']; showLevels: boolean }) {
  return (
    <Card>
      <SectionHeading>{copy.standardsHeading}</SectionHeading>
      <ul className="mt-2 space-y-2 text-sm">
        {standards.map((s) => {
          const lv = showLevels ? getLevels(s.code) : null
          return (
            <li key={s.code}>
              <span className="font-semibold">{s.code}</span> {s.text}
              {lv && (
                <details className="mt-1 rounded-lg bg-ink-100/40 p-2"><summary className="cursor-pointer text-ink-500">{copy.levelsToggle}</summary>
                  <ul className="mt-1 space-y-0.5">{Object.entries(lv.levels).map(([k, v]) => <li key={k}><span className="font-semibold">{k}</span> {v}</li>)}</ul>
                </details>
              )}
            </li>
          )
        })}
      </ul>
    </Card>
  )
}

function ReconstructionSection({ snapshot }: { snapshot: Snapshot }) {
  const c = copy.reconstructionTable.columns
  return (
    <Card>
      <SectionHeading>{copy.reconstructionHeading}</SectionHeading>
      <p className="mt-2 whitespace-pre-wrap text-sm">{snapshot.reconstruction}</p>
      {snapshot.reconstruction_detail.length > 0 && (
        <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm">
          <thead><tr className="border-b border-ink-100 text-ink-500"><th className="py-1 pr-3">{c.code}</th><th className="py-1 pr-3">{c.original}</th><th className="py-1 pr-3">{c.type}</th><th className="py-1 pr-3">{c.reconstructed}</th><th className="py-1 pr-3">{c.reason}</th><th className="py-1 pr-3">{c.elements}</th></tr></thead>
          <tbody>{snapshot.reconstruction_detail.map((r) => <tr key={r.code} className="border-b border-ink-50 align-top"><td className="py-1 pr-3 font-semibold">{r.code}</td><td className="py-1 pr-3">{r.original_text}</td><td className="py-1 pr-3"><Badge tone="gray">{r.reconstruction_type}</Badge></td><td className="py-1 pr-3">{r.reconstructed_text}</td><td className="py-1 pr-3">{r.reason.join(', ')}</td><td className="py-1 pr-3">{r.learning_elements.join(', ')}</td></tr>)}</tbody>
        </table></div>
      )}
    </Card>
  )
}

function UnitPlanSection({ plan }: { plan: Snapshot['unit_plan'] }) {
  if (!plan) return null
  const c = copy.unitPlan
  return (
    <Card>
      <SectionHeading>{copy.unitPlanHeading}</SectionHeading>
      <p className="mt-2 text-sm"><span className="font-semibold text-ink-500">{c.formativeLabel}:</span> {plan.assessment_plan.formative}</p>
      <p className="mt-1 text-sm"><span className="font-semibold text-ink-500">{c.placementLabel}:</span> {plan.assessment_plan.summative_placement.map((p) => c.placement(p.kind, p.lesson_no)).join(' · ')}</p>
      <p className="mt-1 text-sm"><span className="font-semibold text-ink-500">{c.rubricNoteLabel}:</span> 상 {plan.assessment_plan.rubric_note.상} / 중 {plan.assessment_plan.rubric_note.중} / 하 {plan.assessment_plan.rubric_note.하}</p>
    </Card>
  )
}

function QuizView({ quiz, showAnswers }: { quiz: QuizItem[]; showAnswers: boolean }) {
  if (quiz.length === 0) return null
  const c = copy.lessons.quiz
  return (
    <div className="mt-3"><p className="text-sm font-semibold text-ink-500">{copy.lessons.quizHeading}</p>
      <ol className="mt-1 list-decimal space-y-2 pl-5 text-sm">{quiz.map((q, i) => (
        <li key={i}><p>{q.q} <Badge tone="gray">{c.typeLabel[q.type]}</Badge></p>
          {q.choices && <ul className="mt-1 list-disc pl-5">{q.choices.map((ch, j) => <li key={j}>{ch}</li>)}</ul>}
          {showAnswers ? <p className="mt-1 text-mint-700">{c.answerLabel}: {q.answer} · {c.explanationLabel}: {q.explanation}</p> : <p className="mt-1 text-ink-500">{c.answersHidden}</p>}
        </li>))}</ol>
    </div>
  )
}

function LessonCard({ l, showAnswers }: { l: Lesson; showAnswers: boolean }) {
  const c = copy.lessons
  return (
    <div className="rounded-xl border border-ink-100 p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{c.columns.no} {l.no} · {l.topic}</p><Badge tone="gray">{l.standards.join(', ')}</Badge>{l.assessment && <Badge tone="mint">{l.assessment}</Badge>}<Badge tone="gray">{c.timeLabel(l.time_budget.intro_min, l.time_budget.main_min, l.time_budget.wrapup_min)}</Badge></div>
      <p className="mt-1"><span className="font-semibold text-ink-500">{c.columns.keyQuestion}:</span> {l.key_question}</p>
      <p><span className="font-semibold text-ink-500">{c.columns.goal}:</span> {l.goal}</p>
      <div className="mt-2 grid gap-2 sm:grid-cols-3">
        <div><p className="font-semibold text-ink-500">{c.flow.intro}</p><ul className="list-disc pl-5">{l.flow.intro.map((x, i) => <li key={i}>{x}</li>)}</ul></div>
        <div><p className="font-semibold text-ink-500">{c.flow.main}</p>{l.flow.main.map((m, i) => <div key={i}><p className="font-semibold">{m.step_label} ({m.minutes}분)</p><ul className="list-disc pl-5">{m.activities.map((x, j) => <li key={j}>{x}</li>)}</ul></div>)}</div>
        <div><p className="font-semibold text-ink-500">{c.flow.wrapup}</p><ul className="list-disc pl-5">{l.flow.wrapup.map((x, i) => <li key={i}>{x}</li>)}</ul></div>
      </div>
      {showAnswers && (
        <div className="mt-2 rounded-lg bg-lemon-100/40 p-2"><p className="font-semibold text-ink-500">{c.scriptHeading}</p>
          <ol className="list-decimal pl-5">{l.teacher_script.questions.map((q, i) => <li key={i}>{q.prompt} <span className="text-ink-500">— {c.scriptExpected}: {q.expected_answer} · {c.scriptStuck}: {q.if_stuck}</span></li>)}</ol>
        </div>
      )}
      <p className="mt-2"><span className="font-semibold text-ink-500">{c.materialsLabel}:</span> {l.materials_used.join(', ')} · <span className="font-semibold text-ink-500">{c.needsLabel}:</span> {l.materials_needed.join(', ')}</p>
      {showAnswers && <div className="mt-1"><p className="font-semibold text-ink-500">{c.cautionHeading}</p><ul className="list-disc pl-5">{l.caution_notes.map((x, i) => <li key={i}>{x}</li>)}</ul></div>}
      {l.merge_note && <p className="mt-1 text-ink-500">{c.mergeNoteLabel}: {l.merge_note}</p>}
      <div className="mt-2"><p className="font-semibold text-ink-500">{c.worksheetHeading}</p>
        <ol className="list-decimal pl-5">{l.worksheet.tasks.map((t) => <li key={t.no}><Badge tone="gray">{c.worksheetTier(t.tier, t.level_ref)}</Badge> {t.prompt}{showAnswers && <span className="text-ink-500"> — {c.worksheetExpected}: {t.expected}</span>}</li>)}</ol>
        <p className="text-ink-500">{c.selfCheckHeading}: {l.worksheet.self_check.join(' / ')}</p>
      </div>
      {(l.images ?? []).length > 0 && <div className="mt-2 flex flex-wrap gap-2">{l.images.map((src, i) => <img key={src} src={src} alt={c.imagesAlt(l.no, i + 1)} className="h-24 w-24 rounded-lg object-cover" />)}</div>}
      <QuizView quiz={l.formative_check.quiz} showAnswers={showAnswers} />
    </div>
  )
}

function RubricView({ rubric }: { rubric: Rubric }) {
  const c = copy.rubric
  return (
    <div className="mt-2 space-y-2">
      {rubric.criteria.map((cr, i) => (
        <table key={i} className="w-full min-w-[520px] text-left text-sm">
          <thead><tr className="border-b border-ink-100 text-ink-500"><th className="py-1 pr-3">{cr.name} <Badge tone="gray">{cr.axis}</Badge> <span className="font-normal">{c.conditionsLabel} {cr.condition_nos.join('·')}</span></th>{[...cr.scale].sort((a, b) => b.points - a.points).map((s) => <th key={s.points} className="py-1 pr-3">{c.pointLabel(s.points)}</th>)}</tr></thead>
          <tbody><tr className="align-top"><td className="py-1 pr-3" />{[...cr.scale].sort((a, b) => b.points - a.points).map((s) => <td key={s.points} className="py-1 pr-3">{s.descriptor}{s.example && <p className="text-ink-500">예: {s.example}</p>}</td>)}</tr></tbody>
        </table>
      ))}
      {rubric.holistic && <p className="text-sm"><span className="font-semibold text-ink-500">{c.holisticHeading}:</span> 상 {rubric.holistic.상} / 중 {rubric.holistic.중} / 하 {rubric.holistic.하}</p>}
    </div>
  )
}

function AssessmentItemView({ item, showAnswers }: { item: AssessmentItem; showAnswers: boolean }) {
  const c = copy.assessment
  return (
    <div className="rounded-xl border border-ink-100 p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2"><Badge tone="gray">{c.kindLabel[item.kind]}</Badge><Badge tone="gray">{c.lessonLabel(item.lesson_no)}</Badge><Badge tone="mint">{c.pointsLabel(item.points)}</Badge><Badge tone="gray">{c.conditions.answerMode[item.conditions.answer_mode]}</Badge></div>
      <p className="mt-2"><span className="font-semibold text-ink-500">{c.elementsLabel}:</span> {item.evaluation_elements.join(' · ')}</p>
      {item.situation && <p><span className="font-semibold text-ink-500">{c.situationLabel}:</span> {c.situation(item.situation.role, item.situation.audience, item.situation.purpose, item.situation.product)}</p>}
      <p><span className="font-semibold text-ink-500">{c.materialsLabel}:</span> {item.materials_used.join(', ')}</p>
      <p className="mt-2 whitespace-pre-wrap font-semibold">{item.stem}</p>
      <p className="mt-2 font-semibold text-ink-500">{c.conditions.heading}</p>
      <ol className="list-decimal pl-5">{item.conditions.items.map((cd) => <li key={cd.no}>{cd.text} <Badge tone="gray">{cd.category}</Badge>{cd.points !== null && <Badge tone="gray">{c.conditions.pointsLabel(cd.points)}</Badge>}</li>)}</ol>
      <p className="text-ink-500">{c.conditions.lengthLabel}: {item.conditions.length} · {c.conditions.formatLabel}: {item.conditions.format}{item.conditions.overflow_rule && ` · ${c.conditions.overflowLabel}: ${item.conditions.overflow_rule}`}</p>
      {showAnswers && (<>
        <p className="mt-3 font-semibold text-ink-500">{copy.rubricHeading}</p><RubricView rubric={item.rubric} />
        <p className="mt-2 font-semibold text-ink-500">{c.notesHeading}</p><ul className="list-disc pl-5">{item.rubric.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
        <p className="mt-2 font-semibold text-ink-500">{c.exemplarsHeading}</p>
        <div className="space-y-2">{item.exemplar_answers.map((e, i) => <div key={i} className="rounded-lg bg-ink-100/40 p-2"><Badge tone="gray">{c.exemplarLabel(e.level, e.points)}</Badge> <span className="text-ink-500">{e.scores.join('·')}</span><p className="mt-1 whitespace-pre-wrap">{e.text}</p><p className="text-ink-500">{c.rationaleLabel}: {e.rationale}</p></div>)}</div>
        <p className="mt-2"><span className="font-semibold text-ink-500">{c.levelMapHeading}:</span> {item.level_map.map((l) => `${l.level} ${l.min}~${l.max}`).join(' / ')}</p>
        {item.min_competency && <p><span className="font-semibold text-ink-500">{c.minCompetencyLabel}:</span> {item.min_competency}</p>}
      </>)}
    </div>
  )
}

function TeacherGuideSection({ guide }: { guide: Snapshot['teacher_guide'] }) {
  if (!guide) return null
  const c = copy.teacherGuide
  return (
    <Card><SectionHeading>{copy.teacherGuideHeading}</SectionHeading>
      <div className="mt-3 space-y-3 text-sm">
        <div><p className="font-semibold text-ink-500">{c.generalHeading}</p><p>{c.purposeLabel}: {guide.general.purpose}</p><p>{c.materialsLabel}: {guide.general.materials.join(', ')}</p><p>{c.scheduleLabel}: {guide.general.schedule_note}</p></div>
        <div><p className="font-semibold text-ink-500">{c.glossaryHeading}</p><ul className="list-disc pl-5">{guide.glossary.map((g, i) => <li key={i}>{g.term} — {g.explanation}</li>)}</ul></div>
        {guide.merge_guide.length > 0 && <div><p className="font-semibold text-ink-500">{c.mergeHeading}</p><ul className="list-disc pl-5">{guide.merge_guide.map((m, i) => <li key={i}>{c.mergeLabel(m.lessons[0], m.lessons[1])} — {c.mergeSkip}: {m.skip_activities.join(', ')} ({m.time_budget_120.intro_min}/{m.time_budget_120.main_min}/{m.time_budget_120.wrapup_min})</li>)}</ul></div>}
        <div><p className="font-semibold text-ink-500">{c.gradingHeading}</p>
          <p className="font-semibold">{c.commonErrors}</p><ul className="list-disc pl-5">{guide.grading_guide.common_errors.map((e, i) => <li key={i}>[{e.item_no}] {e.error} → {e.how_to_read}</li>)}</ul>
          <p className="font-semibold">{c.reviewTips}</p><ul className="list-disc pl-5">{guide.grading_guide.review_tips.map((t, i) => <li key={i}>{t}</li>)}</ul>
          <p>{c.retryLabel}: {guide.grading_guide.retry_guidance}</p></div>
        <div><p className="font-semibold text-ink-500">{c.perLessonHeading}</p><ul className="space-y-1">{guide.per_lesson.filter((l) => l.notes.length).map((l) => <li key={l.no}><span className="font-semibold">{c.lessonLabel(l.no)}</span><ul className="list-disc pl-5">{l.notes.map((n, i) => <li key={i}>{n}</li>)}</ul></li>)}</ul></div>
      </div></Card>
  )
}

function NoticePlanSection({ plan }: { plan: Snapshot['notice_plan'] }) {
  if (!plan) return null
  const c = copy.noticePlan
  return (
    <Card><SectionHeading>{copy.noticePlanHeading}</SectionHeading>
      <div className="mt-3 space-y-2 text-sm">{plan.per_lesson.map((p) => (
        <div key={p.lesson_no} className="rounded-xl border border-ink-100 p-3"><p className="font-semibold">{c.lessonLabel(p.lesson_no)}</p>
          <p>{c.summary}: {p.topic_summary}</p><p>{c.preview}: {p.preview}</p><p>{c.home}: {p.home_study_suggestion}</p>
          {p.quiz_notes.length > 0 && <p className="text-ink-500">{c.quizNotes}: {p.quiz_notes.map((q) => `${q.quiz_no}) ${q.wrong_note}`).join(' / ')}</p>}
          {p.criteria_phrases && <ul className="mt-1 list-disc pl-5">{p.criteria_phrases.map((cp) => <li key={cp.criterion_name}><span className="font-semibold">{cp.criterion_name}</span> — {c.good}: {cp.good.join(' / ')} · {c.improve}: {cp.improve.join(' / ')}</li>)}</ul>}
        </div>))}
        <p className="text-ink-500">{plan.footer_disclaimer}</p></div></Card>
  )
}

export function PackageView({ snapshot, mode, showAnswers = false }: { snapshot: Snapshot; mode: 'admin' | 'teacher'; showAnswers?: boolean }) {
  const c = copy; const gb = copy.gradeBoundaries
  return (
    <div className="space-y-4">
      <Card><div className="flex flex-wrap items-center gap-2"><h1 className="text-2xl font-bold">{snapshot.cover.title}</h1><Badge tone="mint">{c.cover.versionLabel(snapshot.cover.version)}</Badge></div>
        <p className="mt-1 text-sm text-ink-500">{c.cover.meta(snapshot.cover.level, snapshot.cover.grade, snapshot.cover.subject)}</p><p className="mt-1 text-xs text-ink-500">{c.cover.publishedAtLabel}: {snapshot.cover.published_at}</p></Card>
      {snapshot.intro.trim() !== '' && <Card><SectionHeading>{c.intro}</SectionHeading><p className="mt-2 whitespace-pre-wrap text-sm">{snapshot.intro}</p></Card>}
      <StandardsSection standards={snapshot.standards} showLevels={mode === 'admin'} />
      <ReconstructionSection snapshot={snapshot} />
      <Card><SectionHeading>{c.learningGoalsHeading}</SectionHeading><ul className="mt-2 list-disc space-y-1 pl-5 text-sm">{snapshot.learning_goals.map((g, i) => <li key={i}><Badge tone="gray">{c.learningGoals.axisLabel(g.axis)}</Badge> {g.text}</li>)}</ul></Card>
      <Card><SectionHeading>{c.keyQuestionHeading}</SectionHeading><p className="mt-2 text-sm">{snapshot.key_question}</p></Card>
      <UnitPlanSection plan={snapshot.unit_plan} />
      <Card><SectionHeading>{c.lessonsHeading}</SectionHeading><div className="mt-3 space-y-4">{snapshot.lessons.map((l) => <LessonCard key={l.no} l={l} showAnswers={showAnswers} />)}</div></Card>
      <MaterialsSection materials={snapshot.materials} />
      {snapshot.assessment && (<>
        <Card><SectionHeading>{c.assessmentHeading}</SectionHeading><div className="mt-3 space-y-3">{snapshot.assessment.items.map((it, i) => <AssessmentItemView key={i} item={it} showAnswers={showAnswers} />)}</div></Card>
        <Card><SectionHeading>{c.gradeBoundariesHeading}</SectionHeading><table className="mt-3 w-full min-w-[420px] text-left text-sm"><thead><tr className="border-b border-ink-100 text-ink-500"><th className="py-1 pr-3">{gb.gradeLabel}</th><th className="py-1 pr-3">{gb.rangeLabel}</th><th className="py-1 pr-3">{gb.bandLabel}</th>{mode === 'admin' && <th className="py-1 pr-3">{gb.levelRefLabel}</th>}</tr></thead>
          <tbody>{snapshot.assessment.grade_boundaries.map((b) => <tr key={b.grade} className="border-b border-ink-50"><td className="py-1 pr-3">{b.grade}</td><td className="py-1 pr-3">{b.min}~{b.max}</td><td className="py-1 pr-3">{b.band}</td>{mode === 'admin' && <td className="py-1 pr-3">{b.level_ref}</td>}</tr>)}</tbody></table></Card>
        <Card><SectionHeading>{c.feedbackTemplatesHeading}</SectionHeading><div className="mt-3 space-y-2 text-sm">{(['상', '중', '하'] as const).map((lv) => <p key={lv}><span className="font-semibold">{c.feedbackLevels[lv]}</span>: {snapshot.assessment!.feedback_templates[lv]}</p>)}</div></Card>
      </>)}
      <TeacherGuideSection guide={snapshot.teacher_guide} />
      <NoticePlanSection plan={snapshot.notice_plan} />
      {snapshot.references.length > 0 && <Card><SectionHeading>{c.assessment.referencesHeading}</SectionHeading><ul className="mt-2 list-disc pl-5 text-sm">{snapshot.references.map((r) => <li key={r.id}>{r.id} — {r.source}</li>)}</ul></Card>}
      {mode === 'admin' && <Card><SectionHeading>{c.generatedWithHeading}</SectionHeading><div className="mt-2 flex flex-wrap gap-2">{snapshot.generated_with.models.map((m) => <Badge key={m} tone="lavender">{m}</Badge>)}</div></Card>}
    </div>
  )
}
```

`getLevels`는 서버 전용(`node:fs`)이므로 `PackageView`는 서버 컴포넌트에서만 렌더된다(현재 사용처 3곳 모두 서버 컴포넌트 — `app/teacher/items/[setId]/page.tsx`, 관리자 세트 page, 학생 page의 `MaterialsSection`). 클라이언트 컴포넌트에서 import 하면 빌드가 실패하므로 그대로 둔다.

- [ ] **Step 7: 학생 화면·원장 열람·관리자 미리보기**

`app/student/assignments/[id]/page.tsx`: `lesson.quiz` → `lesson.formative_check.quiz`(두 곳), `AnswerEditor`에 `conditions={{ length: item.conditions.length, format: item.conditions.format, answer_mode: item.conditions.answer_mode, items: item.conditions.items.map((c) => ({ no: c.no, text: c.text })) }}`(재도전 칸도 동일). `AnswerEditor.tsx`: props 타입을 위 Interfaces대로 바꾸고, 조건 목록을 `conditions.items.map((c) => <li key={c.no}><span className="text-ink-500">{copy.conditionItem(c.no)}</span> {c.text}</li>)`로; 컴포넌트 첫머리에 `if (conditions.answer_mode === 'paper') return <section className="rounded-2xl bg-white p-5"><h3 className="text-lg font-bold">{label} · {points}점</h3><p className="mt-2 whitespace-pre-wrap">{stem}</p><p className="mt-3 rounded-xl bg-lemon-100 p-3">{copy.paperAnswer}</p></section>`.
`app/teacher/items/[setId]/page.tsx`: `const snapshot = upgradeSnapshot(data.snapshot)`(import from `@/lib/studio/publish`).
`app/admin/items/[themeId]/sets/[setId]/page.tsx`: `buildSnapshot` 인자에 `unit_plan, reconstruction_detail, notice_plan` 전달(select에 추가).
`app/teacher/assignments/[setId]/page.tsx`: `loadAssignmentSnapshot`이 이미 올린 판을 주므로 변경 없음; `ReviewCard`가 `it.points`만 쓰므로 그대로.

- [ ] **Step 8: 통과 확인** — `npx vitest run` 전체 PASS, `npx tsc --noEmit` 오류 0, `npm run build` 성공. 로컬 `AI_MOCK=1 npm run dev`로 관리자 세트 화면 → 마법사 2~7 [기본값으로 진행] → 미리보기에서 지도안 카드·문항 카드·안내장 틀이 보이는지, 원장 계정으로 열람, 학생 계정으로 2차시 서술형(종이 답안 안내)·4차시 서술형(입력칸) 확인.

- [ ] **Step 9: Commit**

```bash
git add components/studio/PackageView.tsx lib/classroom/lessons.ts lib/classroom/snapshot.ts lib/classroom/grading-prompt.ts lib/classroom/grade.ts "app/student/assignments/[id]/page.tsx" "app/student/assignments/[id]/AnswerEditor.tsx" "app/teacher/items/[setId]/page.tsx" "app/admin/items/[themeId]/sets/[setId]/page.tsx" content/site.ts "data/studio-fixtures/grading-서술형.json" "data/studio-fixtures/grading-논술형.json" tests/classroom-lessons.test.ts tests/grading-prompt.test.ts
git commit -m "feat(ui): 패키지·학생·원장 화면과 채점 프롬프트를 v2 모양으로

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: 학생별 안내장 초안 — 순수 조립 + 린트 + 원장 서버 액션 + 원장 화면(인쇄)

**Files:**
- Create: `lib/classroom/notice-schema.ts`, `lib/classroom/notice.ts`, `lib/classroom/notice-lint.ts`, `lib/classroom/notice-prompt.ts`, `data/studio-fixtures/notice-draft.json`, `components/classroom/NoticeView.tsx`, `components/classroom/PrintButton.tsx`, `app/teacher/assignments/[setId]/notices/[assignmentId]/[lessonNo]/page.tsx`
- Modify: `app/teacher/assignments/[setId]/actions.ts`(`draftNotice`·`confirmNotice`), `app/teacher/assignments/[setId]/page.tsx`(카드에 안내장 링크), `content/site.ts`(`app.classroom.notice`)
- Test: `tests/notice.test.ts`, `tests/notice-lint.test.ts`

**Interfaces:**
- Produces (`notice-schema.ts`): `Notice` zod = `data/reference/templates/notice.json`의 `Notice`(필드 동일: `student_name, lesson_no, date, lesson_context{key_question, goal, topic_summary}, participation{quiz{correct,total,items[{q,is_correct,note}]}, director_comment}, essay_result{kind, confirmed_score, total_points, band, criteria_feedback[{criterion_name, band_score, max, good_point, improve_point}], retry{attempted,before_score,after_score,improvement_comment}} | null, next_lesson{preview, home_study_suggestion}, director_message, footer_disclaimer`) + `NoticeDraftOut`(AI 출력: `{ quiz_notes: { quiz_no, note }[]; criteria_feedback: { criterion_name; good_point; improve_point }[]; improvement_comment: string | null }`).
- Produces (`notice.ts`): `buildNoticeSkeleton(input): { skeleton: Notice; needsAi: boolean }` — 순수. 입력: `{ snapshot, lessonNo, studentName, date, quiz: { quiz_no, response, correct }[], gradings: { attempt: 1 | 2; final_score; final_criteria: { name; points; max; evidence }[]; confirmed_at: string | null }[] }`. 확정되지 않은 채점(`confirmed_at` null)은 무시; 서·논술형 차시인데 확정 채점이 없으면 `essay_result: null`. `applyDraft(skeleton, out): Notice`.
- Produces (`notice-lint.ts`): `lintNotice(n: Notice, otherStudentNames: string[]): string[]` — N-01·02·04·05·06·12 + `essay_result`가 있으면 `confirmed_score ≤ total_points`.
- Produces (`notice-prompt.ts`): `buildNoticePrompt({ snapshot, lessonNo, skeleton })` → `{ system: [NOTICE_PROMPT_RULES], user, fixtureKey: 'notice-draft' }`.
- Produces (actions): `draftNotice(assignmentId: string, lessonNo: number): ActionResult`(원장 전용, 1 AI 호출, `notices` upsert status `draft`), `confirmNotice(assignmentId, lessonNo, body: Notice)`(원장이 고친 본문 저장 + `confirmed_at`).
- Consumes: `NOTICE_PROMPT_RULES`(T3), `noticeTextIssues`(T1 `checks.ts`), `upgradeSnapshot`.

- [ ] **Step 1: 실패 테스트**

```ts
// tests/notice.test.ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { buildNoticeSkeleton, applyDraft } from '@/lib/classroom/notice'
import { Notice } from '@/lib/classroom/notice-schema'
import { upgradeSnapshot } from '@/lib/studio/publish'

const s3 = JSON.parse(readFileSync('data/studio-fixtures/stage3-generate.json', 'utf8')); const s5 = JSON.parse(readFileSync('data/studio-fixtures/stage5-generate.json', 'utf8')); const s7 = JSON.parse(readFileSync('data/studio-fixtures/stage7-generate.json', 'utf8'))
const snapshot = upgradeSnapshot({ schema_version: 2, cover: { title: 'T', subject: '수학', level: '중', grade: 1, version: 1, published_at: '' }, standards: [], intro: '', reconstruction: '', reconstruction_detail: [], learning_goals: [], key_question: 'q', unit_plan: s3.unit_plan, lessons: s3.lessons, materials: [], assessment: s5, teacher_guide: null, notice_plan: s7, references: [], generated_with: { models: [] } })
const essayLesson = s5.items[0].lesson_no as number
const quiz = [{ quiz_no: 1, response: 'a', correct: true }, { quiz_no: 2, response: 'b', correct: false }, { quiz_no: 3, response: 'c', correct: true }]

describe('buildNoticeSkeleton', () => {
  it('copies lesson context and quiz results from data, uses plan phrases, and leaves essay null when nothing is confirmed', () => {
    const { skeleton, needsAi } = buildNoticeSkeleton({ snapshot, lessonNo: essayLesson, studentName: '김OO', date: '2026-09-29', quiz, gradings: [{ attempt: 1, final_score: 2, final_criteria: [], confirmed_at: null }] })
    expect(skeleton.lesson_context.key_question).toBe(s3.lessons.find((l: { no: number }) => l.no === essayLesson).key_question)
    expect(skeleton.participation.quiz).toMatchObject({ correct: 2, total: 3 })
    expect(skeleton.participation.quiz.items[1].note).toBe(s7.per_lesson.find((p: { lesson_no: number }) => p.lesson_no === essayLesson).quiz_notes[1].wrong_note)
    expect(skeleton.essay_result).toBeNull(); expect(needsAi).toBe(false)
    expect(skeleton.footer_disclaimer).toBe('본 안내장은 학교생활기록부가 아니며, 학원 자체 학습 기록입니다.')
  })
  it('fills essay_result from confirmed gradings only, band from the grade table, retry from attempt 2', () => {
    const crit = s5.items[0].rubric.criteria.map((c: { name: string; max: number }) => ({ name: c.name, points: c.max - 1, max: c.max, evidence: 'e' }))
    const { skeleton, needsAi } = buildNoticeSkeleton({ snapshot, lessonNo: essayLesson, studentName: '김OO', date: '2026-09-29', quiz,
      gradings: [{ attempt: 1, final_score: 2, final_criteria: crit, confirmed_at: '2026-09-29T00:00:00Z' }, { attempt: 2, final_score: 3, final_criteria: crit, confirmed_at: '2026-09-30T00:00:00Z' }] })
    expect(skeleton.essay_result?.confirmed_score).toBe(2); expect(skeleton.essay_result?.total_points).toBe(3)
    expect(skeleton.essay_result?.retry).toMatchObject({ attempted: true, before_score: 2, after_score: 3 })
    expect(skeleton.essay_result?.criteria_feedback.map((c) => c.criterion_name)).toEqual(crit.map((c: { name: string }) => c.name))
    expect(needsAi).toBe(true)
    const done = applyDraft(skeleton, { quiz_notes: [], criteria_feedback: crit.map((c: { name: string }) => ({ criterion_name: c.name, good_point: '표를 정확하게 완성함', improve_point: null })), improvement_comment: '해석 문장을 스스로 채워 재도전에서 만점' })
    expect(Notice.safeParse(done).error?.issues ?? []).toEqual([])
    expect(done.essay_result?.criteria_feedback[0].good_point).toBe('표를 정확하게 완성함')
  })
  it('a quiz-only lesson has essay_result null and never needs AI', () => {
    const r = buildNoticeSkeleton({ snapshot, lessonNo: 1, studentName: '김OO', date: '2026-09-29', quiz, gradings: [] })
    expect(r.skeleton.essay_result).toBeNull(); expect(r.needsAi).toBe(false)
  })
})
```

```ts
// tests/notice-lint.test.ts
import { describe, it, expect } from 'vitest'
import { lintNotice } from '@/lib/classroom/notice-lint'
import type { NoticeT } from '@/lib/classroom/notice-schema'

const base: NoticeT = { student_name: '김OO', lesson_no: 2, date: '2026-09-29',
  lesson_context: { key_question: 'q', goal: 'g', topic_summary: '도수분포표 활동에서 표 만들기를 배웠습니다.' },
  participation: { quiz: { correct: 2, total: 3, items: [{ q: 'a', is_correct: true, note: null }, { q: 'b', is_correct: false, note: '계급은 정확히 찾았으나 도수 세기가 헷갈렸어요' }, { q: 'c', is_correct: true, note: null }] }, director_comment: null },
  essay_result: { kind: '서술형', confirmed_score: 2, total_points: 3, band: '중', criteria_feedback: [{ criterion_name: '표 완성', band_score: 2, max: 3, good_point: '표 완성 활동에서 계급을 정확하게 나눔', improve_point: '도수는 세웠으나 합계를 빠뜨림 — 다음에는 합계를 먼저 확인해 봅시다' }], retry: null },
  next_lesson: { preview: '다음 시간에는 히스토그램을 배워요.', home_study_suggestion: '오늘 틀린 문항과 같은 유형 1개를 다시 풀어 봅시다.' },
  director_message: null, footer_disclaimer: '본 안내장은 학교생활기록부가 아니며, 학원 자체 학습 기록입니다.' }

describe('lintNotice', () => {
  it('passes a clean notice', () => { expect(lintNotice(base, ['박OO'])).toEqual([]) })
  it('flags negative verbs, rankings, other students, improve without good, non-suggestive home study, score over max', () => {
    const bad = structuredClone(base)
    bad.participation.quiz.items[1].note = '도수를 못 셌다'
    bad.essay_result!.criteria_feedback[0].good_point = ''
    bad.essay_result!.criteria_feedback[0].improve_point = '박OO보다 등수가 낮음'
    bad.next_lesson.home_study_suggestion = '더 열심히'
    bad.essay_result!.confirmed_score = 5
    const issues = lintNotice(bad, ['박OO'])
    expect(issues.some((i) => i.includes('못'))).toBe(true); expect(issues.some((i) => i.includes('등수'))).toBe(true)
    expect(issues.some((i) => i.includes('박OO'))).toBe(true); expect(issues.some((i) => i.includes('잘한 점'))).toBe(true)
    expect(issues.some((i) => i.includes('청유형'))).toBe(true); expect(issues.some((i) => i.includes('만점'))).toBe(true)
  })
})
```

- [ ] **Step 2: 실패 확인** — `npx vitest run tests/notice.test.ts tests/notice-lint.test.ts` → FAIL.

- [ ] **Step 3: `lib/classroom/notice-schema.ts`**

```ts
import { z } from 'zod'
import { NOTICE_DISCLAIMER } from '@/lib/studio/schemas'

export const CriterionFeedback = z.object({ criterion_name: z.string().min(1), band_score: z.number().int().min(0), max: z.number().int().min(1), good_point: z.string().max(60), improve_point: z.string().max(60).nullable() })
export const Notice = z.object({
  student_name: z.string().min(1), lesson_no: z.number().int().min(1), date: z.string().min(8),
  lesson_context: z.object({ key_question: z.string(), goal: z.string(), topic_summary: z.string().max(60) }),
  participation: z.object({
    quiz: z.object({ correct: z.number().int().min(0), total: z.number().int().min(0), items: z.array(z.object({ q: z.string(), is_correct: z.boolean(), note: z.string().max(40).nullable() })) }),
    director_comment: z.string().max(80).nullable(),
  }),
  essay_result: z.object({
    kind: z.enum(['서술형', '논술형']), confirmed_score: z.number().int().min(0), total_points: z.number().int().min(1), band: z.enum(['상', '중', '하']),
    criteria_feedback: z.array(CriterionFeedback),
    retry: z.object({ attempted: z.boolean(), before_score: z.number().int(), after_score: z.number().int(), improvement_comment: z.string().max(70).nullable() }).nullable(),
  }).nullable(),
  next_lesson: z.object({ preview: z.string().max(50), home_study_suggestion: z.string().max(60) }),
  director_message: z.string().max(100).nullable(),
  footer_disclaimer: z.literal(NOTICE_DISCLAIMER),
})
export type NoticeT = z.infer<typeof Notice>
export const NoticeDraftOut = z.object({
  quiz_notes: z.array(z.object({ quiz_no: z.number().int().min(1), note: z.string().min(2).max(40) })),
  criteria_feedback: z.array(z.object({ criterion_name: z.string().min(1), good_point: z.string().min(5).max(60), improve_point: z.string().max(60).nullable() })),
  improvement_comment: z.string().max(70).nullable(),
})
export type NoticeDraftOutT = z.infer<typeof NoticeDraftOut>
```

- [ ] **Step 4: `lib/classroom/notice.ts`**

```ts
import type { Snapshot } from '@/lib/studio/publish'
import { NOTICE_DISCLAIMER } from '@/lib/studio/schemas'
import { gradeFor } from './scoring'
import type { NoticeT, NoticeDraftOutT } from './notice-schema'

export type NoticeInput = {
  snapshot: Snapshot; lessonNo: number; studentName: string; date: string
  quiz: { quiz_no: number; response: string; correct: boolean }[]
  gradings: { attempt: 1 | 2; final_score: number | null; final_criteria: { name: string; points: number; max: number; evidence: string }[] | null; confirmed_at: string | null }[]
}

/** 밴드: 문항 점수를 세트 만점 비율로 등급표에 대응(문항 단위 밴드 근사). */
function bandForItem(snapshot: Snapshot, score: number, points: number): '상' | '중' | '하' {
  const a = snapshot.assessment!
  const total = a.items.reduce((s, i) => s + i.points, 0)
  const scaled = Math.round((score / points) * total)
  return gradeFor(a.grade_boundaries, Math.min(total, scaled))?.band ?? '하'
}

export function buildNoticeSkeleton(inp: NoticeInput): { skeleton: NoticeT; needsAi: boolean } {
  const lesson = inp.snapshot.lessons.find((l) => l.no === inp.lessonNo)
  if (!lesson) throw new Error(`lesson ${inp.lessonNo} not found`)
  const plan = inp.snapshot.notice_plan?.per_lesson.find((p) => p.lesson_no === inp.lessonNo) ?? null
  const items = lesson.formative_check.quiz.map((q, i) => {
    const r = inp.quiz.find((x) => x.quiz_no === i + 1)
    const is_correct = r?.correct ?? false
    return { q: q.q, is_correct, note: !is_correct && r ? plan?.quiz_notes.find((n) => n.quiz_no === i + 1)?.wrong_note ?? null : null }
  })
  const itemIdx = inp.snapshot.assessment?.items.findIndex((it) => it.lesson_no === inp.lessonNo) ?? -1
  const item = itemIdx >= 0 ? inp.snapshot.assessment!.items[itemIdx] : null
  const confirmed = inp.gradings.filter((g) => g.confirmed_at && g.final_score !== null).sort((a, b) => a.attempt - b.attempt)
  const first = confirmed.find((g) => g.attempt === 1) ?? null
  const second = confirmed.find((g) => g.attempt === 2) ?? null
  const essay_result = item && first ? {
    kind: item.kind, confirmed_score: first.final_score!, total_points: item.points, band: bandForItem(inp.snapshot, first.final_score!, item.points),
    criteria_feedback: (first.final_criteria ?? []).map((c) => ({ criterion_name: c.name, band_score: c.points, max: c.max, good_point: '', improve_point: null })),
    retry: second ? { attempted: true, before_score: first.final_score!, after_score: second.final_score!, improvement_comment: null } : null,
  } : null
  const skeleton: NoticeT = {
    student_name: inp.studentName, lesson_no: inp.lessonNo, date: inp.date,
    lesson_context: { key_question: lesson.key_question, goal: lesson.goal, topic_summary: plan?.topic_summary ?? lesson.topic.slice(0, 60) },
    participation: { quiz: { correct: items.filter((x) => x.is_correct).length, total: items.length, items }, director_comment: null },
    essay_result,
    next_lesson: { preview: plan?.preview ?? '', home_study_suggestion: plan?.home_study_suggestion ?? '' },
    director_message: null, footer_disclaimer: NOTICE_DISCLAIMER,
  }
  return { skeleton, needsAi: essay_result !== null }
}

export function applyDraft(skeleton: NoticeT, out: NoticeDraftOutT): NoticeT {
  const items = skeleton.participation.quiz.items.map((it, i) => ({ ...it, note: it.is_correct ? null : out.quiz_notes.find((n) => n.quiz_no === i + 1)?.note ?? it.note }))
  const essay_result = skeleton.essay_result ? {
    ...skeleton.essay_result,
    criteria_feedback: skeleton.essay_result.criteria_feedback.map((c) => { const d = out.criteria_feedback.find((x) => x.criterion_name === c.criterion_name); return d ? { ...c, good_point: d.good_point, improve_point: d.improve_point } : c }),
    retry: skeleton.essay_result.retry ? { ...skeleton.essay_result.retry, improvement_comment: out.improvement_comment } : null,
  } : null
  return { ...skeleton, participation: { ...skeleton.participation, quiz: { ...skeleton.participation.quiz, items } }, essay_result }
}
```

- [ ] **Step 5: `lib/classroom/notice-lint.ts` · `notice-prompt.ts` · fixture**

```ts
// notice-lint.ts
import { NOTICE_FORBIDDEN } from '@/lib/studio/checks'
import type { NoticeT } from './notice-schema'
const SUGGEST = /(봅시다|하세요|해요|하기 바랍니다|보세요)[.!]?$/
export function lintNotice(n: NoticeT, otherStudentNames: string[]): string[] {
  const issues: string[] = []
  const texts: [string, string | null][] = [
    ['학습 요약', n.lesson_context.topic_summary], ['다음 차시', n.next_lesson.preview], ['가정 학습', n.next_lesson.home_study_suggestion], ['원장 한마디', n.director_message], ['참여 코멘트', n.participation.director_comment],
    ...n.participation.quiz.items.map((it, i): [string, string | null] => [`퀴즈 ${i + 1}`, it.note]),
    ...(n.essay_result?.criteria_feedback.flatMap((c): [string, string | null][] => [[`${c.criterion_name} 잘한 점`, c.good_point], [`${c.criterion_name} 보완`, c.improve_point]]) ?? []),
    ['재도전', n.essay_result?.retry?.improvement_comment ?? null],
  ]
  for (const [where, text] of texts) {
    if (!text) continue
    for (const [re, why] of NOTICE_FORBIDDEN) if (re.test(text)) issues.push(`${where}: "${text.match(re)?.[0]}" — ${why}`)
    for (const name of otherStudentNames) if (name && text.includes(name)) issues.push(`${where}: 다른 학생 이름(${name}) 언급`)
  }
  if (!SUGGEST.test(n.next_lesson.home_study_suggestion.trim())) issues.push('가정 학습 제안이 청유형으로 끝나지 않음')
  for (const c of n.essay_result?.criteria_feedback ?? []) if (c.improve_point && !c.good_point.trim()) issues.push(`${c.criterion_name}: 잘한 점 없이 보완만 있음`)
  if (n.essay_result && n.essay_result.confirmed_score > n.essay_result.total_points) issues.push('확정 점수가 만점을 넘음')
  return issues
}
```

```ts
// notice-prompt.ts
import type { Snapshot } from '@/lib/studio/publish'
import { NOTICE_PROMPT_RULES } from '@/lib/studio/prompts/rules/notice'
import type { NoticeT } from './notice-schema'
export function buildNoticePrompt({ snapshot, lessonNo, skeleton }: { snapshot: Snapshot; lessonNo: number; skeleton: NoticeT }) {
  const plan = snapshot.notice_plan?.per_lesson.find((p) => p.lesson_no === lessonNo)
  const item = snapshot.assessment?.items.find((it) => it.lesson_no === lessonNo)
  const user = [
    `학생: ${skeleton.student_name} · ${snapshot.cover.level} ${snapshot.cover.grade}학년 · ${snapshot.cover.subject} ${lessonNo}차시`,
    `과제: 아래 안내장 뼈대의 빈 칸만 채워라 — 틀린 퀴즈의 note(40자, 부분 긍정+역접+완곡), 요소별 good_point(60자, 활동명+구체 행위+정도부사)와 improve_point(60자, 부분 긍정+역접+혼자 할 수 있는 다음 행동; 만점 요소는 null), 재도전이 있으면 improvement_comment(70자, 이전 점수를 출발점으로). 학부모와 학생이 함께 읽는다. 요소명은 채점표 그대로.`,
    plan ? `문구 은행(여기서 골라 다듬는다):\n${JSON.stringify(plan.criteria_phrases ?? [], null, 1)}` : '',
    item ? `채점표 요소와 척도:\n${item.rubric.criteria.map((c) => `- ${c.name}: ${[...c.scale].sort((a, b) => b.points - a.points).map((s) => `${s.points}=${s.descriptor}`).join(' / ')}`).join('\n')}` : '',
    `뼈대(확정 채점만 들어 있음):\n${JSON.stringify(skeleton, null, 1)}`,
  ].filter(Boolean).join('\n\n')
  return { system: [NOTICE_PROMPT_RULES], user, fixtureKey: 'notice-draft' }
}
```

`data/studio-fixtures/notice-draft.json`:

```json
{
 "quiz_notes": [{ "quiz_no": 2, "note": "계급은 정확히 찾았으나 도수를 세는 과정에서 헷갈렸어요" }],
 "criteria_feedback": [{ "criterion_name": "서술형 채점표", "good_point": "도수분포표 활동에서 계급을 정확하게 나누어 표를 완성함", "improve_point": "표는 맞게 그렸으나 가장 큰 계급 문장을 빠뜨림 — 표를 그린 뒤 한 문장으로 정리해 봅시다" }],
 "improvement_comment": "빠뜨렸던 해석 문장을 스스로 채워 넣어 재도전에서 점수를 올림"
}
```

(`criterion_name`은 v2 수학 fixture 서술형 1의 첫 요소 이름과 같아야 한다 — T6 결과가 `서술형 채점표`가 아니면 그 이름으로 맞춘다.)

- [ ] **Step 6: 서버 액션 (`app/teacher/assignments/[setId]/actions.ts`에 추가)**

```ts
import { loadAssignmentSnapshot } from '@/lib/classroom/snapshot'
import { buildNoticeSkeleton, applyDraft } from '@/lib/classroom/notice'
import { Notice, NoticeDraftOut, type NoticeT } from '@/lib/classroom/notice-schema'
import { buildNoticePrompt } from '@/lib/classroom/notice-prompt'
import { lintNotice } from '@/lib/classroom/notice-lint'
import { callStructured } from '@/lib/ai/claude'
const nt = app.classroom.notice.errors

/** 학생별 안내장 초안: 확정 채점·퀴즈·재도전 데이터 + (서·논술형 차시면) AI 호출 1회. 원장 RLS 로 읽으므로 자기 원만. */
export async function draftNotice(assignmentId: string, lessonNo: number): Promise<ActionResult & { issues?: string[] }> {
  const s = await assertTeacher()
  const supabase = await createClient()
  const { data: a } = await supabase.from('assignments').select('id, item_set_id, item_set_version, academy_id, students!assignments_student_id_fkey(profiles(name))').eq('id', assignmentId).maybeSingle()
  if (!a) return { ok: false, error: nt.notFound }
  const snapshot = await loadAssignmentSnapshot(supabase, a.item_set_id, a.item_set_version)
  if (!snapshot) return { ok: false, error: nt.notFound }
  if (!snapshot.notice_plan) return { ok: false, error: nt.noPlan }
  const [{ data: quiz }, { data: answers }] = await Promise.all([
    supabase.from('quiz_responses').select('quiz_no, response, correct').eq('assignment_id', assignmentId).eq('lesson_no', lessonNo),
    supabase.from('answers').select('id, item_no, attempt').eq('assignment_id', assignmentId),
  ])
  const itemNo = (snapshot.assessment?.items.findIndex((it) => it.lesson_no === lessonNo) ?? -1) + 1
  const rows = (answers ?? []).filter((r) => r.item_no === itemNo)
  const { data: gr } = rows.length ? await supabase.from('gradings').select('answer_id, status, final_score, final_criteria, confirmed_at').in('answer_id', rows.map((r) => r.id)).eq('status', 'confirmed') : { data: [] }
  const gradings = (gr ?? []).map((g) => ({ attempt: (rows.find((r) => r.id === g.answer_id)?.attempt ?? 1) as 1 | 2, final_score: g.final_score as number | null, final_criteria: g.final_criteria as { name: string; points: number; max: number; evidence: string }[] | null, confirmed_at: g.confirmed_at as string | null }))
  const studentName = ((a.students as unknown as { profiles: { name: string } | null } | null)?.profiles?.name) ?? ''
  const { skeleton, needsAi } = buildNoticeSkeleton({ snapshot, lessonNo, studentName, date: new Date().toISOString().slice(0, 10), quiz: (quiz ?? []) as { quiz_no: number; response: string; correct: boolean }[], gradings })
  let body: NoticeT = skeleton
  if (needsAi) {
    const p = buildNoticePrompt({ snapshot, lessonNo, skeleton })
    const r = await callStructured({ stage: 10, role: 'grade', schema: NoticeDraftOut, system: p.system, user: p.user, effort: 'medium', fixtureKey: p.fixtureKey })
    body = applyDraft(skeleton, r.data)
  }
  const { data: others } = await supabase.from('students').select('profiles(name)').eq('academy_id', a.academy_id)
  const otherNames = (others ?? []).map((o) => (o.profiles as unknown as { name: string } | null)?.name ?? '').filter((n) => n && n !== studentName)
  const issues = lintNotice(body, otherNames)
  const parsed = Notice.safeParse(body)
  if (!parsed.success) return { ok: false, error: nt.invalid }
  const { error } = await supabase.from('notices').upsert({ assignment_id: assignmentId, academy_id: a.academy_id, lesson_no: lessonNo, body: parsed.data, status: 'draft', drafted_by: s.userId, drafted_at: new Date().toISOString(), confirmed_at: null, updated_at: new Date().toISOString() }, { onConflict: 'assignment_id,lesson_no' })
  if (error) return { ok: false, error: nt.saveFailed }
  revalidatePath(`/teacher/assignments`)
  return { ok: true, issues }
}

/** 원장이 화면에서 고친 본문을 확정한다(director_comment·director_message 포함). 린트 위반이 있으면 저장하지 않는다. */
export async function confirmNotice(assignmentId: string, lessonNo: number, body: NoticeT): Promise<ActionResult & { issues?: string[] }> {
  await assertTeacher()
  const supabase = await createClient()
  const parsed = Notice.safeParse(body)
  if (!parsed.success) return { ok: false, error: nt.invalid }
  const issues = lintNotice(parsed.data, [])
  if (issues.length) return { ok: false, error: nt.lint, issues }
  const { error } = await supabase.from('notices').update({ body: parsed.data, status: 'confirmed', confirmed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('assignment_id', assignmentId).eq('lesson_no', lessonNo)
  if (error) return { ok: false, error: nt.saveFailed }
  revalidatePath(`/teacher/assignments`)
  return { ok: true }
}
```

`content/site.ts` `app.classroom.notice`: `{ title: (name: string, no: number) => `${name} · ${no}차시 안내장`, draft: '안내장 초안 만들기', redraft: '다시 만들기', confirm: '확정', print: '인쇄', status: { draft: '초안', confirmed: '확정' }, sections: { context: '이번 차시 학습 내용', participation: '참여·퀴즈 결과', essay: '서·논술형 결과', next: '다음 차시·가정 학습', director: '원장 한마디' }, quizResult: (c: number, t: number) => `${t}문항 중 ${c}개 정답`, score: (s: number, t: number, band: string) => `${s}/${t}점 · ${band}`, retry: (b: number, a: number) => `1회차 ${b}점 → 재도전 ${a}점`, directorCommentLabel: '참여 관찰(원장 작성)', directorMessageLabel: '원장 한마디', lintHeading: '문장 규칙 확인', noNotice: '아직 안내장이 없습니다. 초안을 만들어 주세요.', errors: { notFound: '배정을 찾을 수 없습니다.', noPlan: '이 세트에는 안내장 틀이 없습니다(v2 게시본만 지원).', invalid: '안내장 모양이 올바르지 않습니다.', lint: '문장 규칙 위반이 있어 저장하지 않았습니다.', saveFailed: '저장에 실패했습니다.' }, cardLink: (no: number) => `${no}차시 안내장` }`.

- [ ] **Step 7: 화면** — `components/classroom/PrintButton.tsx`(`'use client'`, `<Button variant="ghost" onClick={() => window.print()}>{label}</Button>`), `components/classroom/NoticeView.tsx`(서버 컴포넌트, `NoticeT`를 5개 섹션으로 그린다: 제목·날짜, ① 핵심질문·목표·요약, ② 퀴즈 표(문항·정오·코멘트)+참여 관찰, ③ 점수·밴드·요소별 잘한 점/보완/재도전(없으면 섹션 생략), ④ 다음 차시·가정 학습, ⑤ 원장 한마디, 하단 고지. `<div className="print:p-0 mx-auto max-w-[720px] rounded-2xl bg-white p-6">`), `app/teacher/assignments/[setId]/notices/[assignmentId]/[lessonNo]/page.tsx`(원장 전용 서버 페이지: `notices` 행을 읽어 없으면 `noNotice` + `NoticeDraftForm`(클라이언트: [초안 만들기] → `draftNotice`), 있으면 `NoticeView` + `NoticeEditForm`(클라이언트: `director_comment`·`director_message`·요소별 문구 textarea, [확정] → `confirmNotice`, 린트 이슈 표시) + `PrintButton`). `app/globals.css`에 `@media print { nav, aside, .no-print { display: none } }`. `app/teacher/assignments/[setId]/page.tsx`의 학생 카드에 서·논술형 차시마다 `<Link href={`/teacher/assignments/${setId}/notices/${a.id}/${it.lesson_no}`}>{app.classroom.notice.cardLink(it.lesson_no)}</Link>`(문항이 배치된 차시 = `it.lesson_no`; 대표님 잠정 결정대로 퀴즈만 있는 차시는 링크 없음).

- [ ] **Step 8: 통과 확인** — `npx vitest run tests/notice.test.ts tests/notice-lint.test.ts` → PASS, `npx tsc --noEmit`, `npm run build`. 로컬 mock으로 원장 계정: 배정 상세 → 서술형1 확정 → [2차시 안내장] → [초안 만들기] → 화면 확인 → 원장 한마디 입력 → [확정] → [인쇄] 미리보기에서 메뉴가 숨는지.

- [ ] **Step 9: Commit**

```bash
git add lib/classroom/notice-schema.ts lib/classroom/notice.ts lib/classroom/notice-lint.ts lib/classroom/notice-prompt.ts data/studio-fixtures/notice-draft.json components/classroom/NoticeView.tsx components/classroom/PrintButton.tsx "app/teacher/assignments/[setId]/notices/[assignmentId]/[lessonNo]/page.tsx" "app/teacher/assignments/[setId]/notices/[assignmentId]/[lessonNo]/NoticeDraftForm.tsx" "app/teacher/assignments/[setId]/notices/[assignmentId]/[lessonNo]/NoticeEditForm.tsx" "app/teacher/assignments/[setId]/actions.ts" "app/teacher/assignments/[setId]/page.tsx" app/globals.css content/site.ts tests/notice.test.ts tests/notice-lint.test.ts
git commit -m "feat(classroom): 학생별 안내장 초안(확정 채점만)·린트·원장 확정·인쇄 화면

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: 문서 — STATUS·README·fixture README, 5과목 생성 실행 순서서(대표님 12항목 체크리스트)

**Files:**
- Create: `docs/runbooks/2026-09-29-five-subjects.md`
- Modify: `docs/STATUS.md`, `README.md`, `data/studio-fixtures/README.md`

**Interfaces:** 없음(문서). `tests/no-placeholder.test.ts`를 추가해 게시 스냅샷 fixture(`data/studio-fixtures/stage*-generate*.json`)에 `추후 작성|TBD|예시 문장|lorem` 이 없는지 검사한다.

- [ ] **Step 1: `tests/no-placeholder.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
describe('no placeholder text in fixtures', () => {
  it('stage fixtures contain no filler phrases', () => {
    const files = readdirSync('data/studio-fixtures').filter((f) => /^stage\d-generate/.test(f))
    for (const f of files) expect(readFileSync(`data/studio-fixtures/${f}`, 'utf8'), f).not.toMatch(/추후 작성|TBD|lorem ipsum|예시 문장을 넣/)
  })
})
```

- [ ] **Step 2: `docs/runbooks/2026-09-29-five-subjects.md`**

```markdown
# 5과목 세트 생성·검토 실행 순서서 (v2, 발표 전)

대상: 본사 관리자(생성) · 대표님(5일차 검토). 전제: Vercel에 `ANTHROPIC_API_KEY` 등록, `AI_MOCK` 없음, 마이그레이션 0011 적용(`supabase db push`), main 배포 완료.

## A. 준비(관리자, 20분)
1. `/admin/standards`에서 5과목 소단원의 성취기준 원문 확인 체크(중1: 국어·영어·수학·과학·사회 각 2~6개). 검증 안 된 성취기준은 게시가 막힌다.
2. `/admin/items/new` 대주제 「학교 축제, 일회용품을 줄이자」(중, 1학년, 과목 5개) — 이미 있으면 그대로.
3. 대주제 화면: 소개 [생성]→[검토]→[확정]. 공유 자료 A~D [생성]→[검토]→[확정](3B). 자료 출처는 전부 "자작"(대표님 잠정 결정).

## B. 과목별 생성(관리자, 과목당 25~40분, 생성 대기 포함)
과목 순서: 수학 → 과학 → 국어 → 사회 → 영어(예시 은행이 큰 과목부터).
1. 대주제 화면 → [세트 만들기] → 과목·소단원 선택 → 성취기준 2~6개 체크 → 생성.
2. 세트 마법사에서 2단계부터 [생성]→[검토]→[다음]. 검토가 실패하면 이슈 목록을 읽고:
   - `fidelity`(원문에 없는 표현): [다시 생성]. 3회 실패 시 [JSON 편집]으로 해당 `reconstructed_text`만 원문 어휘로 고친다.
   - `coverage`/`quiz`: [다시 생성].
   - `level`(부사만 다른 척도, 가치·태도 축 없음): [다시 생성] 1회, 그래도 실패면 JSON 편집으로 descriptor에 목적어·범위를 넣는다.
   - `source`(공개·AI 보조 자료): 이번 세트는 자작만이므로 4단계를 다시 생성한다.
   - `notice`: 7단계 다시 생성.
3. 5단계는 최대 3회 자동 반복. 세 번 다 실패하면 이슈의 문항 번호·요소를 보고 JSON 편집 → [검토] → [다음].
4. 2단계 확정 뒤 핵심질문 후보 중 하나 선택.
5. 7단계까지 확정 → 미리보기에서 지도안 카드·문항 카드 3장·안내장 틀이 보이는지 확인 → [게시].
6. 원장 계정으로 `/teacher/items`에서 열어 정답이 접혀 있는지 확인.

## C. 5일차 대표님 검토(과목당 25분)
패키지 화면(관리자 모드)을 위에서 아래로 보며 12항목에 O/△/X. 결과는 `docs/review/2026-09-29-owner-review.md`에 과목×12 표로 남긴다(관리자가 받아 적음).
1. 성취기준 원문이 그대로이고 재구조화 표에 원문이 나란히 있다
2. 학습 목표에 지식·과정·태도 세 축이 다 있고 "~할 수 있다"로 끝난다
3. 핵심질문이 사실 확인형이 아니다
4. 차시 흐름을 보고 "이 대본이면 60분을 진행할 수 있겠다"
5. 발문의 예상 답과 힌트가 자연스럽다
6. 활동지 기본/표준/도전이 실제로 난이도 차이가 난다
7. 자료가 답을 미리 담지 않고, 표가 한 화면에 들어온다
8. 문항 조건만 읽어도 학생이 무엇을 쓸지 알 수 있고 배점이 조건 옆에 있다
9. 채점표 단계가 부사만 바뀐 것이 아니다
10. 논술형 예시답안 상/중/하를 직접 채점해 보면 적힌 점수가 나온다
11. 채점 주의점이 실제로 애매한 경우(반올림, 다른 표현)를 다룬다
12. 안내장 틀 문장이 학부모에게 보내도 될 톤이다

X 항목은 그 단계만 재생성(관리자가 해당 단계의 [다시 생성] → 이후 단계는 자동으로 idle → 다시 [기본값으로 진행] → 새 판 게시). 전체 재생성 금지.

## D. "설명회용으로 충분" 기준
(a) 5과목 게시 (b) 성취기준 전부 검증됨 (c) 차시 4~6개 모두 대본·유의점·활동지·퀴즈, 시간 합 60 (d) 문항 카드 3장이 정적 검사 통과, 논술형 예시답안 상/중/하 밴드 일치 (e) 자료 출처 표시(자작) (f) 안내장 틀 차시마다 존재 (g) 체크리스트 X 과목당 2개 이하 (h) 자리 채움 문장 0건(`npx vitest run tests/no-placeholder.test.ts`).

## E. 시연 흐름(원장·학생, 3A 순서 + 안내장)
3A 시연 절차 1~7 그대로 → 서술형1 확정 뒤 [2차시 안내장] → [초안 만들기] → 원장 한마디 입력 → [확정] → [인쇄].
```

- [ ] **Step 3: `docs/STATUS.md`** — "3주차-A 완료" 아래에 절 추가:

```markdown
## 제작소 v2 핵심 완료 (2026-09-2x)
브랜치 `studio-v2-core`. 스펙 `docs/superpowers/specs/2026-09-25-item-studio-v2-design.md`, 계획 `docs/superpowers/plans/2026-09-25-item-studio-v2-core.md`.
- 스키마 v2(0~7단계, `lib/studio/schemas.ts`), v1 판은 읽을 때 `upgradeSnapshot`(`lib/studio/compat.ts`)으로 올림 — DB 재작성 없음.
- 지식 베이스 로더: `lib/reference/levels.ts`(성취수준, 코드 조회), `lib/reference/exemplars.ts`(예시 은행 선택). 파일 기반, DB는 발표 뒤.
- 규칙 `lib/studio/prompts/rules/`(ID·출처 태그, 스펙 부록 A와 1:1), 검토는 [TS] 정적 검사(`lib/studio/checks.ts`) → 검토 AI.
- 7단계 안내장 틀(마법사·게시 필수), 학생별 안내장 초안·확정·인쇄(`/teacher/assignments/[set]/notices/...`). 발송 화면·학생 열람은 발표 뒤.
- fixture v2는 수학·과학만(`scripts/upgrade-fixtures-v2.ts`). 국·영·사는 실제 키로 생성.
- 실행 순서서: `docs/runbooks/2026-09-29-five-subjects.md`.

**대표님이 하실 일**
- 마이그레이션 0011 적용: `supabase db push`
- 5일차 검토(순서서 C절)
```

- [ ] **Step 4: `README.md`·`data/studio-fixtures/README.md`** — README 운영 체크리스트에 "v2 게시본만 안내장 지원, 기존 판은 자동 업그레이드 표시" 한 줄; fixture README의 "지금 들어 있는 것" 표를 v2(2~7단계, `stage7-*`, `notice-draft.json`)로 갱신하고 "새 fixture는 `scripts/upgrade-fixtures-v2.ts`가 아니라 실제 생성 결과를 복사해 만든다(스크립트는 v1 변환 전용)"를 적는다.

- [ ] **Step 5: 확인·Commit** — `npx vitest run` 전체 PASS, `npx tsc --noEmit`, `npm run build`.

```bash
git add docs/runbooks/2026-09-29-five-subjects.md docs/STATUS.md README.md data/studio-fixtures/README.md tests/no-placeholder.test.ts
git commit -m "docs: v2 핵심 상태·5과목 생성 실행 순서서·fixture 안내

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## 실행 뒤 남는 것(발표 뒤, 스펙 §6.2)
`standard_levels`·`exemplars` DB 적재, 안내장 발송·학생/학부모 열람, 활동지 수준별 세 장, 초등·고등 분기, 역사 세트, 2025 국·수·영 예시 파일 반영, 동사 뱅크 파일화, 난이도 실측 루프, 복붙·외부 AI 탐지, 검수 QA 루틴, 3B 교재 인쇄(`lib/print/booklet.ts`)는 v2 `Snapshot` 타입으로 착수.
