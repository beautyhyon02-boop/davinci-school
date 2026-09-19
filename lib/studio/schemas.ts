import { z } from 'zod'

export const SUBJECTS = ['국어', '영어', '수학', '과학', '사회', '한국사', '세계사'] as const
export type Subject = (typeof SUBJECTS)[number]

export const ThemeIntro = z.object({
  intro: z.string().min(20),
  subject_ideas: z.array(z.object({ subject: z.enum(SUBJECTS), idea: z.string().min(5) })).min(1),
})

export const StandardsRecommendation = z.object({
  recommended: z.array(z.object({ code: z.string(), reason: z.string() })).min(1).max(6),
})

export const Reconstruction = z.object({
  reconstruction: z.string().min(10),
  learning_goals: z.array(z.string().min(5)).min(3).max(4),
  key_question_candidates: z.array(z.string().min(5)).min(2).max(3),
})

export const QuizItem = z.object({
  q: z.string().min(3),
  type: z.enum(['choice', 'short']),
  choices: z.array(z.string()).min(2).max(5).nullable(),
  answer: z.string().min(1),
  explanation: z.string().min(3),
})

export const Lesson = z.object({
  no: z.number().int().min(1).max(8),
  standards: z.array(z.string()).min(1).max(2),
  key_question: z.string().min(5),
  goal: z.string().min(5),
  flow: z.object({ intro: z.string(), main: z.string(), wrapup: z.string() }),
  materials: z.array(z.string()),
  quiz: z.array(QuizItem).max(3),
  assessment: z.enum(['서술형1', '서술형2', '논술형']).nullable(),
  mergeable_with: z.number().int().nullable(),
}).superRefine((l, ctx) => {
  if (l.assessment === '논술형') {
    if (l.quiz.length !== 0) ctx.addIssue({ code: 'custom', message: '논술형 차시에는 퀴즈 없음' })
  } else {
    if (l.quiz.length !== 3) ctx.addIssue({ code: 'custom', message: '논술형 차시가 아니면 퀴즈 3문항' })
  }
})
export const Lessons = z.object({ lessons: z.array(Lesson).min(4).max(6) })

export const Material = z.object({
  id: z.string().regex(/^[A-Z]$/),
  title: z.string(),
  kind: z.enum(['table', 'text', 'chart']),
  body: z.string().nullable(),
  table: z.object({ columns: z.array(z.string()), rows: z.array(z.array(z.union([z.string(), z.number()]))) }).nullable(),
  source: z.literal('자작'),
})
export const Materials = z.object({ materials: z.array(Material).min(1).max(6) })

export const ShortRubric = z.object({
  levels: z.array(z.object({ points: z.number().int().min(0), expectation: z.string(), example: z.string().nullable() })).min(2).max(4),
})
export const ExtendedRubric = z.object({
  criteria: z.array(z.object({
    name: z.string(),
    bands: z.object({ '4': z.string(), '3': z.string(), '2': z.string(), '1': z.string(), '0': z.string() }),
  })).length(4),
})
export const AssessmentItem = z.object({
  kind: z.enum(['서술형', '논술형']),
  lesson_no: z.number().int(),
  stem: z.string().min(10),
  conditions: z.object({ length: z.string(), required: z.array(z.string()), format: z.string() }),
  points: z.number().int().positive(),
  rubric: z.union([ShortRubric, ExtendedRubric]),
})
export const Assessment = z.object({
  items: z.array(AssessmentItem).min(2).max(4),
  grade_boundaries: z.array(z.object({ grade: z.number().int().min(1).max(7), min: z.number().int(), max: z.number().int(), band: z.enum(['상', '중', '하']) })).length(7),
  exemplars: z.array(z.object({ level: z.enum(['상', '중', '하']), text: z.string().min(30), scores: z.array(z.number().int()), total: z.number().int(), grade: z.number().int() })).length(3),
  feedback_templates: z.object({ 상: z.string(), 중: z.string(), 하: z.string() }),
}).superRefine((a, ctx) => {
  const ext = a.items.filter(i => i.kind === '논술형')
  if (ext.length !== 1) ctx.addIssue({ code: 'custom', message: '논술형은 정확히 1개' })
  for (const i of ext) if (!('criteria' in i.rubric)) ctx.addIssue({ code: 'custom', message: '논술형은 4요소 루브릭' })
  const total = a.items.reduce((s, i) => s + i.points, 0)
  const top = Math.max(...a.grade_boundaries.map(b => b.max))
  if (top !== total) ctx.addIssue({ code: 'custom', message: `등급표 최댓값(${top}) ≠ 총점(${total})` })
})

export const TeacherGuide = z.object({
  general: z.object({ materials: z.array(z.string()), schedule_note: z.string(), purpose: z.string() }),
  glossary: z.array(z.object({ term: z.string(), explanation: z.string() })),
  per_lesson: z.array(z.object({ no: z.number().int(), notes: z.array(z.string()).min(1) })).min(4),
})

export const Review = z.object({
  pass: z.boolean(),
  issues: z.array(z.object({ kind: z.enum(['fidelity', 'grade_level', 'coverage', 'quiz', 'rubric', 'other']), detail: z.string() })),
})

export const STAGE_SCHEMAS = {
  0: ThemeIntro, 1: StandardsRecommendation, 2: Reconstruction, 3: Lessons, 4: Materials, 5: Assessment, 6: TeacherGuide,
} as const
export type Stage = keyof typeof STAGE_SCHEMAS
export type ReviewT = z.infer<typeof Review>
