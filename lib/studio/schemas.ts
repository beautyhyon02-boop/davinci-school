import { z } from 'zod'
import {
  SET_ORDER, SET_ITEMS, SET_ITEM_COUNT, SHORT_TOTAL, SHORT_CRITERIA, ESSAY_CRITERIA, CRITERION_MAX, LEGACY_ITEM_COUNT, LESSON_KINDS,
  structureIssues, structureOf, sessionPlacementIssues, isAssessmentSession,
} from './assessment-structure'

export const SUBJECTS = ['국어', '영어', '수학', '과학', '사회', '한국사', '세계사'] as const
export type Subject = (typeof SUBJECTS)[number]
export const LEVELS = ['초', '중', '고'] as const
export type Level = (typeof LEVELS)[number]
export const AXES = ['지식·이해', '과정·기능', '가치·태도'] as const
export const TIERS = ['기본', '표준', '도전'] as const
/**
 * 차시 평가 라벨(lessons[].assessment 원소·summative_placement.kind) = 문항 종류(대표 2026-09-26: 서술형 1 + 논술형 1).
 * 옛 판의 '서술형1'·'서술형2'(문자열 한 개)는 compat 이 ['서술형'] 배열로 올린다.
 */
export const ASSESSMENT_KINDS = SET_ORDER

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
  // 유지여도 reconstructed_text는 틀 문장(TASKS[2])이어야 하므로 원문과 같으라는 요구는 두지 않는다 —
  // 어휘가 원문(과 merged_with 원문)에서만 왔는지는 [TS] 원문 대조(checks.ts checkReconstructionFidelity)가 본다.
})

// ── 3단계 ──────────────────────────────────────────────────────────────
/**
 * 마무리 퀴즈 한 문항. 대표 2026-09-26: 서논술 과정이라 객관식은 없다 — 새 세트(LessonDesign = STAGE_SCHEMAS[3])는
 * type 'short'·choices null 만 받는다(lessonDesignOf superRefine, [TS] checks.ts). 'choice'는 그 전에 게시된 판을
 * 읽을 때(PublishedLessonDesign·학생 화면·채점)만 남겨 둔다 — 옛 판의 선택형 퀴즈는 바꾸지 않는다(발문이 보기에 기대기도 한다).
 */
/**
 * 퀴즈 수준(L-10, 대표 2026-09-26 "퀴즈가 너무 쉬운 수준이 아닌지"): 성취수준 A~E 틀(활동지 층 기본 D~E·표준 C·도전 A~B)에 묶는다 —
 * D~E 회상(용어·사실), C 이해·적용(도달점 수준의 적용·계산·설명 핵심어), B 관계·추론(두 개념의 관계, 이유, 새 사례 적용).
 * 교수 차시의 3문항은 이 셋을 하나씩 갖는다(3단계 프롬프트가 요구한다). 교사용 표시(원장 화면)이고 학생 화면에는 보이지 않는다.
 * 대표 결정(마법사는 아무것도 막지 않는다): zod 는 어느 경로에서도 수준을 요구하지 않는다 — 빠졌거나 고르지 않으면 [TS] 참고 메모만(checks.ts).
 */
export const QUIZ_LEVELS = ['D~E', 'C', 'B'] as const
export type QuizLevel = (typeof QUIZ_LEVELS)[number]
export const QuizItem = z.object({
  q: z.string().min(3),
  type: z.enum(['choice', 'short']),
  choices: z.array(z.string()).min(2).max(5).nullable(),
  answer: z.string().min(1),
  explanation: z.string().min(3),
  // 선택(모든 경로): 2026-09-26 이전에 저장·게시된 퀴즈에는 없다. 분포는 [TS] 참고 메모가 본다(막지 않음).
  level_ref: z.enum(QUIZ_LEVELS).optional(),
})
/** 새 세트 퀴즈 규칙(L-09) 위반 사유 — zod(LessonDesign)와 [TS](checks.ts)가 같은 문장을 쓴다. */
export const QUIZ_SHORT_ONLY = '퀴즈는 단답형만(선택지 금지)'
/** 단답형(type 'short', choices null)인가. 새 세트의 퀴즈는 모두 이래야 한다. */
export const isShortQuiz = (q: { type: string; choices: unknown }) => q.type === 'short' && q.choices === null
/** 교수 차시 퀴즈의 level_ref 가 D~E·C·B 를 정확히 하나씩 갖는가(순서 무관, 빠진 level_ref 가 있으면 거짓). [TS](checks.ts)가 쓴다. */
export function quizLevelSpreadOk(quiz: { level_ref?: string | null }[]): boolean {
  const levels = quiz.map((q) => q.level_ref)
  return levels.length === QUIZ_LEVELS.length && QUIZ_LEVELS.every((lv) => levels.filter((x) => x === lv).length === 1)
}
// 설계(§2.3)는 expected_answer min(2) — 한 글자 정답('10' 아닌 '4' 같은 수·기호)을 받으려고 min(1)로 완화했다
export const ScriptQuestion = z.object({ prompt: z.string().min(5), expected_answer: z.string().min(1), if_stuck: z.string().min(2) })
export const WorksheetTask = z.object({
  no: z.number().int().min(1), prompt: z.string().min(5), tier: z.enum(TIERS), level_ref: z.enum(['D~E', 'C', 'A~B']),
  answer_space: z.enum(['short', 'lines', 'table', 'draw']), expected: z.string().min(1),
})
// 교수 차시는 과제 2~5개·자기평가 1~3문장(Lesson superRefine), 단원 평가 차시는 비워 둘 수 있다
export const Worksheet = z.object({ tasks: z.array(WorksheetTask).max(5), self_check: z.array(z.string().min(2)).max(3) })
export const MainStep = z.object({ step_label: z.string().min(1), minutes: z.number().int().min(5), activities: z.array(z.string().min(1)).min(1) })
/**
 * 차시. kind 'teaching'(기본) = 교수 차시 — 발문 2~4·활동지(기본/표준/도전)·마무리 퀴즈 3문항, 서·논술형 없음.
 * kind 'assessment' = 단원 평가 차시(마지막 교수 차시 뒤, 대표 2026-09-26 보완) — 퀴즈 0, assessment 에 서술형 → 논술형,
 * 발문·활동지는 비워도 된다(assessment-structure.ts ASSESSMENT_SESSION). 옛 판(v1·v2 초기)의 논술형 차시는 compat 이 'assessment'로 올린다.
 */
export const Lesson = z.object({
  no: z.number().int().min(1).max(8),
  kind: z.enum(LESSON_KINDS).default('teaching'),
  standards: z.array(z.string()).min(1).max(2),
  topic: z.string().min(2),
  key_question: z.string().min(5),
  goal: z.string().min(5),
  time_budget: z.object({ intro_min: z.number().int().min(0), main_min: z.number().int().min(0), wrapup_min: z.number().int().min(0) }),
  flow: z.object({ intro: z.array(z.string().min(1)).min(1), main: z.array(MainStep).min(1).max(4), wrapup: z.array(z.string().min(1)).min(1) }),
  teacher_script: z.object({ questions: z.array(ScriptQuestion).max(4) }),   // 교수 차시 2~4(superRefine), 평가 차시 0~4
  materials_used: z.array(z.string().regex(/^[A-Z]$/)).default([]),
  materials_needed: z.array(z.string()).default([]),
  caution_notes: z.array(z.string().min(2)).min(1).max(4),
  worksheet: Worksheet,
  formative_check: z.object({ quiz: z.array(QuizItem).max(3) }),
  assessment: z.array(z.enum(ASSESSMENT_KINDS)).max(SET_ITEM_COUNT).default([]),   // 이 차시에 보는 서·논술형(교수 차시는 빈 배열)
  mergeable_with: z.number().int().nullable(),
  merge_note: z.string().nullable().default(null),
  images: z.array(z.string().url()).default([]),
}).superRefine((l, ctx) => {
  const q = l.formative_check.quiz.length
  const t = l.time_budget
  if (t.intro_min + t.main_min + t.wrapup_min !== 60) issue(ctx, '차시 시간 합이 60분이 아님')
  if (l.flow.main.reduce((s, m) => s + m.minutes, 0) !== t.main_min) issue(ctx, '전개 소단계 분 합이 전개 시간과 다름')
  if (isAssessmentSession(l)) {
    if (q !== 0) issue(ctx, '단원 평가 차시에는 퀴즈 없음')
    if (l.assessment.length === 0) issue(ctx, '단원 평가 차시에 서·논술형이 없음')
    return
  }
  if (q !== 3) issue(ctx, '교수 차시는 마무리 퀴즈 3문항')
  if (l.teacher_script.questions.length < 2) issue(ctx, '교수 차시 발문은 2~4개')
  if (l.worksheet.tasks.length < 2) issue(ctx, '활동지 과제는 2~5개')
  if (l.worksheet.self_check.length < 1) issue(ctx, '활동지 자기평가 문장이 없음')
  for (const tier of TIERS) if (!l.worksheet.tasks.some((w) => w.tier === tier)) issue(ctx, `활동지에 ${tier} 과제가 없음`)
})
const Placement = z.object({ lesson_no: z.number().int(), kind: z.enum(ASSESSMENT_KINDS) })
/** 평가 계획. placements = summative_placement 개수 범위(새 세트는 정확히 SET_ITEM_COUNT, 게시 판 읽기는 옛 구조까지). */
const unitPlanOf = (placements: { min: number; max: number }) => z.object({
  set_title: z.string().min(1),
  set_key_question: z.string().min(5),
  lesson_map: z.array(z.object({ lesson_no: z.number().int(), standards: z.array(z.string()).min(1).max(2), topic: z.string().min(1) })).min(4).max(6),
  assessment_plan: z.object({
    formative: z.string().min(2),
    summative_placement: placements.min === placements.max ? z.array(Placement).length(placements.min) : z.array(Placement).min(placements.min).max(placements.max),
    rubric_note: z.object({ 상: z.string(), 중: z.string(), 하: z.string() }),
  }),
})
export const UnitPlan = unitPlanOf({ min: SET_ITEM_COUNT, max: SET_ITEM_COUNT })
const LEGACY_PLACEMENT = ['서술형', '서술형', '논술형'].join(',')
/**
 * legacy = 게시 판 읽기: 옛 구조(교수 차시에 서술형 2 → 마지막 논술형 차시)도 받는다.
 * 새 세트는 교수 차시 3~5개 + 마지막 단원 평가 차시 1개(서술형 → 논술형, sessionPlacementIssues).
 */
const lessonDesignOf = (legacy: boolean) => z.object({
  unit_plan: legacy ? unitPlanOf({ min: SET_ITEM_COUNT, max: LEGACY_ITEM_COUNT }) : UnitPlan,
  lessons: z.array(Lesson).min(4).max(6),
}).superRefine((d, ctx) => {
  const placed = d.lessons.flatMap((l) => l.assessment.map((kind) => `${l.no}:${kind}`)).sort()
  const plan = d.unit_plan.assessment_plan.summative_placement
  for (const p of plan) {
    if (!placed.includes(`${p.lesson_no}:${p.kind}`)) issue(ctx, `평가 계획 ${p.kind}(${p.lesson_no}차시)가 차시 배치와 다름`)
  }
  if (plan.map((p) => `${p.lesson_no}:${p.kind}`).sort().join(',') !== placed.join(',')) issue(ctx, '차시에 배치한 서·논술형과 평가 계획이 다름')
  const kinds = plan.map((p) => p.kind).join(',')
  if (kinds !== SET_ORDER.join(',') && !(legacy && kinds === LEGACY_PLACEMENT)) issue(ctx, `평가 배치는 ${SET_ORDER.join(' → ')} 각 1개(지금 ${kinds || '없음'})`)
  if (!legacy || kinds === SET_ORDER.join(',')) for (const m of sessionPlacementIssues(d.lessons)) issue(ctx, m)
  if (d.unit_plan.lesson_map.length !== d.lessons.length) issue(ctx, 'lesson_map 수가 차시 수와 다름')
  // L-09(대표 2026-09-26): 새 세트의 퀴즈는 단답형만. 게시 판 읽기(legacy)는 옛 선택형을 그대로 받는다.
  // L-10 퀴즈 수준(D~E·C·B)은 여기서 보지 않는다 — 옛 3단계 초안(level_ref 없음)의 이미지 첨부·문장 고치기가 막히지 않게 [TS] 참고 메모로만.
  if (!legacy) for (const l of d.lessons) {
    for (const [i, q] of l.formative_check.quiz.entries()) if (!isShortQuiz(q)) issue(ctx, `${l.no}차시 퀴즈 ${i + 1}: ${QUIZ_SHORT_ONLY}`)
  }
})
export const LessonDesign = lessonDesignOf(false)
/** 게시 판(item_set_versions)에 실린 3단계 모양 — 2026-09-26 이전 판(서술형 2개, 선택형 퀴즈)까지. 생성·검토에는 LessonDesign 을 쓴다. */
export const PublishedLessonDesign = lessonDesignOf(true)
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
  items: z.array(Condition).min(0).max(4),   // C-32: 서술형 0개(조건 없음), 논술형 2~4개 — 종류별 개수는 [TS] 검사(checks.ts)가 본다
  length: z.string().min(2),
  format: z.string().min(2),
  answer_mode: z.enum(['screen', 'paper']),
  overflow_rule: z.string().nullable(),
})
export const ScaleStep = z.object({ points: z.number().int().min(0), descriptor: z.string().min(5), example: z.string().nullable() })
export const Criterion = z.object({
  name: z.string().min(2), axis: z.enum(AXES), condition_nos: z.array(z.number().int()),   // 조건을 가리키지 않는 요소(서술형 전부 포함)는 빈 배열
  max: z.number().int().min(1).max(CRITERION_MAX), scale: z.array(ScaleStep).min(2),
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
  assumed_short_points: z.number().int().min(0).max(SHORT_TOTAL).nullable(),   // 논술형 예시가 전제하는 서술형 문항 점수(0~6, 등급 밴드 대조용; 옛 판은 서술형 두 문항 합), 서술형은 null
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
    if (it.rubric.criteria.length !== ESSAY_CRITERIA.count || it.rubric.criteria.some((c) => c.max !== ESSAY_CRITERIA.max)) issue(ctx, `논술형은 ${ESSAY_CRITERIA.count}요소 × 0~${ESSAY_CRITERIA.max}점`)
    if (!it.rubric.holistic) issue(ctx, '논술형은 총체적 상/중/하 필수')
    if (it.conditions.answer_mode !== 'screen') issue(ctx, '논술형은 화면 입력')
    for (const lv of ['상', '중', '하'] as const) if (!it.exemplar_answers.some((e) => e.level === lv)) issue(ctx, `논술형 예시답안 ${lv} 없음`)
  } else {
    // 서술형 총체적 기준은 세트 구조가 정한다(Assessment: 필수, C-15 · 옛 판은 없을 수 있음) — 여기서는 요소 수와 만점 예시만 본다
    if (it.rubric.criteria.length > SHORT_CRITERIA.max) issue(ctx, `서술형 채점 요소는 ${SHORT_CRITERIA.max}개 이하`)
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
const assessmentBase = (items: z.ZodArray<typeof AssessmentItem>) => z.object({
  items,
  grade_boundaries: z.array(GradeBoundaryRow).length(7),
  feedback_templates: z.object({ 상: z.string(), 중: z.string(), 하: z.string() }),
})
type AssessmentShape = z.infer<ReturnType<typeof assessmentBase>>
/** 구조와 무관한 세트 검사: 등급표가 0..총점을 빈틈 없이 덮음, 종이 답안 ≤ 1, 논술형 예시답안 상/중/하가 등급표의 그 밴드에 듦. */
function assessmentSetIssues(a: AssessmentShape, ctx: z.RefinementCtx) {
  const essays = a.items.filter((i) => i.kind === '논술형')
  const total = a.items.reduce((s, i) => s + i.points, 0)
  const rows = [...a.grade_boundaries].sort((x, y) => x.min - y.min)
  if (rows[0]?.min !== 0 || rows[rows.length - 1]?.max !== total) issue(ctx, `등급표가 0..${total}을 덮지 않음`)
  for (let i = 1; i < rows.length; i++) if (rows[i].min !== rows[i - 1].max + 1) issue(ctx, '등급표 구간이 이어지지 않음')
  if (a.items.filter((i) => i.conditions.answer_mode === 'paper').length > 1) issue(ctx, '종이 답안 문항은 세트당 최대 1개')
  const bandOf = (pts: number) => a.grade_boundaries.find((b) => pts >= b.min && pts <= b.max)?.band
  for (const ex of essays[0]?.exemplar_answers ?? []) {
    // 논술형 예시 총점 + 전제한 서술형 점수(assumed_short_points, 없으면 서술형 만점)를 세트 총점으로 보아 밴드를 대조한다(스펙 §2.5 [TS]-4)
    if (ex.level && bandOf(ex.points + (ex.assumed_short_points ?? SHORT_TOTAL)) !== ex.level) issue(ctx, `논술형 예시답안 ${ex.level}의 점수가 등급표의 ${ex.level} 밴드에 들지 않음`)
  }
}
/** 지금 구조(대표 2026-09-26): 서술형 1(6점) → 논술형 1(16점), 두 문항 모두 분석적 + 총체적 채점표(C-15·C-31). */
function currentStructureIssues(a: AssessmentShape, ctx: z.RefinementCtx) {
  for (const m of structureIssues(a.items)) issue(ctx, m)
  for (const it of a.items) if (it.kind === '서술형' && !it.rubric.holistic) issue(ctx, '서술형도 총체적 상/중/하 필수(C-15)')
}
/** 5단계 출력(생성·검토). 정확히 SET_ITEM_COUNT 문항 — assessment-structure.ts 가 구조를 정한다. */
export const Assessment = assessmentBase(z.array(AssessmentItem).length(SET_ITEM_COUNT)).superRefine((a, ctx) => {
  currentStructureIssues(a, ctx)
  assessmentSetIssues(a, ctx)
})
/**
 * 게시 판(item_set_versions)에 실린 평가 — 지금 구조이거나 2026-09-26 이전 구조(서술형 3점 × 2 + 논술형, 서술형 총체적 기준 없음 허용).
 * 옛 판은 학생 답안·채점이 문항 번호와 3점 만점에 묶여 있어 고쳐 쓰지 않는다. 생성·검토에는 Assessment 를 쓴다.
 */
export const PublishedAssessment = assessmentBase(z.array(AssessmentItem).min(SET_ITEM_COUNT).max(LEGACY_ITEM_COUNT)).superRefine((a, ctx) => {
  const structure = structureOf(a.items)
  if (!structure) issue(ctx, `문항 구조가 지금 구조(${SET_ORDER.map((k) => `${k} ${SET_ITEMS[k].points}점`).join(' + ')})도 옛 구조도 아님`)
  else if (structure === 'current') currentStructureIssues(a, ctx)
  assessmentSetIssues(a, ctx)
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
    // item_no 는 5단계 문항 번호 — 문항 수(지금 2, 옛 판 3) 안인지는 [TS](checks.ts guideIssues)가 5단계와 대조한다
    common_errors: z.array(z.object({ item_no: z.number().int().min(1), error: z.string().min(2), how_to_read: z.string().min(2) })).min(3),
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
