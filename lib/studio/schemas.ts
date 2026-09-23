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
// 설계(§2.3)는 expected_answer min(2) — 한 글자 정답('10' 아닌 '4' 같은 수·기호)을 받으려고 min(1)로 완화했다
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
