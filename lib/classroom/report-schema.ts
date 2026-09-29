import { z } from 'zod'
import { NOTICE_DISCLAIMER } from '@/lib/studio/schemas'
import { COMPETENCIES } from '@/lib/studio/competency'

/**
 * 단원 리포트 본문(unit_reports.body, jsonb) — 저장했다가 다시 읽을 때 이 스키마로 검증한다.
 * 설계: docs/superpowers/specs/2026-09-29-unit-report-design.md §5.1
 * 점수·정오·역량 같은 data 필드는 buildUnitReport 가 채우고, 문장 칸(wrong_note·phrase·summary·overall_lines)은 원장이 인쇄 전에 고칠 수 있다(R-8).
 * 2026-09-30 에 더한 칸(attitude·overall_lines·improve_tip·home_study)은 모두 선택 칸이다 — 그 전에 저장한 본문도 그대로 읽힌다.
 * 다른 학생과의 비교·등수 칸은 없다(R-7).
 */
const Competency = z.enum(COMPETENCIES)

export const ReportQuiz = z.object({
  lesson_no: z.number().int().min(1),
  quiz_no: z.number().int().min(1),
  question: z.string(),
  competency: Competency,
  correct: z.boolean(),
  /** 틀린 문항에만(안내장 틀 quiz_notes.wrong_note). 맞았거나 틀이 없는 옛 세트는 null. */
  wrong_note: z.string().nullable(),
})

export const ReportCriterion = z.object({
  name: z.string().min(1),
  points: z.number().min(0),
  max: z.number().min(1),
  competency: Competency,
  /** 고른 문구가 잘한 점(good)인지 보완할 점(improve)인지 — 점수 비율로 정한다(문구가 없어도 채운다). */
  phrase_kind: z.enum(['good', 'improve']),
  /** 안내장 틀 criteria_phrases 에서 고른 문구. 문구가 없는 옛 세트는 null(점수만 보인다). */
  phrase: z.string().nullable(),
  /** 종합 코멘트 「더 연습할 점」의 다음 할 일로 쓰는 문구(안내장 틀 criteria_phrases.improve 에서 고른 것). 문구가 없으면 null. */
  improve_tip: z.string().nullable().optional(),
})

export const ReportAssessmentItem = z.object({
  item_no: z.number().int().min(1),
  kind: z.enum(['서술형', '논술형']),
  lesson_no: z.number().int().min(1),
  points: z.number().min(0),
  max: z.number().min(1),
  criteria: z.array(ReportCriterion),
})

export const ReportMissing = z.object({
  /** 퀴즈가 있는데 최종 확인되지 않은 교수 차시 번호. */
  lessons: z.array(z.number().int().min(1)),
  /** 최종 확인된 차시인데 정오 기록이 없는 퀴즈 문항(틀린 것으로 세지 않고 뺀다). */
  quiz_answers: z.array(z.object({ lesson_no: z.number().int().min(1), quiz_no: z.number().int().min(1) })),
  /** 확정된 채점이 없는 평가 문항. */
  items: z.array(z.object({ item_no: z.number().int().min(1), kind: z.enum(['서술형', '논술형']) })),
})

export const ReportSubject = z.object({
  subject: z.string().min(1),
  key_question: z.string(),
  quizzes: z.array(ReportQuiz),
  quiz_correct: z.number().int().min(0),
  quiz_total: z.number().int().min(0),
  assessment: z.array(ReportAssessmentItem),
  assessment_points: z.number().min(0),
  assessment_max: z.number().min(0),
  summary: z.string(),
  missing: ReportMissing,
  /** 차시별 가정 학습 제안(안내장 틀 home_study_suggestion) — 종합 코멘트 「더 연습할 점」의 다음 할 일로 쓴다. */
  home_study: z.array(z.object({ lesson_no: z.number().int().min(1), text: z.string() })).optional(),
})

export const RadarAxis = z.object({
  competency: Competency,
  earned: z.number().min(0),
  possible: z.number().min(0),
  /** 이 축에 들어간 문항 수(퀴즈 문항 + 채점 요소). */
  count: z.number().int().min(0),
  /** earned ÷ possible. 자료가 하나도 없는 축은 null(0점으로 그리지 않는다). */
  ratio: z.number().min(0).max(1).nullable(),
  /** 문항 수 2개 미만(자료 없는 축 포함). */
  sparse: z.boolean(),
})

/** 수업 태도 문장의 낱말 열쇠(문장은 화면 문구 content/site.ts 가 갖는다). 순서가 곧 화면에 늘어놓는 순서다. */
export const ATTITUDE_PARTICIPATION = ['active', 'steady', 'calm', 'growing'] as const
export const ATTITUDE_TRAITS = ['asks', 'speaks', 'listens', 'focuses', 'completes', 'retries'] as const
export const ATTITUDE_CLOSING = ['expect', 'steady', 'confidence', 'growth'] as const
export const MAX_ATTITUDE_TRAITS = 2

/** 원장이 고른 수업 태도 낱말. 글이 아니라 열쇠로 저장한다. 셋(참여·수업 모습 1~2개·마무리)을 모두 골라야 문장이 된다. */
export const ReportAttitude = z.object({
  participation: z.enum(ATTITUDE_PARTICIPATION).nullable(),
  traits: z.array(z.enum(ATTITUDE_TRAITS)).max(MAX_ATTITUDE_TRAITS).refine((t) => new Set(t).size === t.length),
  closing: z.enum(ATTITUDE_CLOSING).nullable(),
}).strict()

export const OVERALL_LINE_KINDS = ['attitude', 'strength', 'practice', 'subject'] as const

/** 종합 코멘트 한 줄. kind 는 자리(수업 태도·잘한 점·더 연습할 점·과목 한마디), ref 는 그 줄이 가리키는 것(역량·과목·요소). */
export const OverallLine = z.object({
  kind: z.enum(OVERALL_LINE_KINDS),
  /** 고친 문장은 kind 와 ref 가 같은 줄에만 다시 덮는다 — 가리키는 역량·요소가 바뀌면 옛 문장을 버린다. */
  ref: z.string().max(200),
  /** 빈 글이면 그 줄은 리포트에서 빠진다. */
  text: z.string(),
})

export const UnitReportBody = z.object({
  student_name: z.string().min(1),
  theme_title: z.string(),
  /** 리포트에 넣은 과목(subjects 와 같은 순서). */
  included_subjects: z.array(z.string()),
  subjects: z.array(ReportSubject),
  radar: z.array(RadarAxis).length(COMPETENCIES.length),
  /** overall_lines 의 글을 줄바꿈으로 이은 것(옛 본문은 이 칸만 있다). */
  overall_comment: z.string(),
  attitude: ReportAttitude.nullable().optional(),
  overall_lines: z.array(OverallLine).max(OVERALL_LINE_KINDS.length).optional(),
  footer_disclaimer: z.literal(NOTICE_DISCLAIMER),
})

export type ReportQuiz = z.infer<typeof ReportQuiz>
export type ReportCriterion = z.infer<typeof ReportCriterion>
export type ReportAssessmentItem = z.infer<typeof ReportAssessmentItem>
export type ReportMissing = z.infer<typeof ReportMissing>
export type ReportSubject = z.infer<typeof ReportSubject>
export type RadarAxis = z.infer<typeof RadarAxis>
export type UnitReportBody = z.infer<typeof UnitReportBody>
export type ReportAttitude = z.infer<typeof ReportAttitude>
export type OverallLine = z.infer<typeof OverallLine>
export type OverallLineKind = (typeof OVERALL_LINE_KINDS)[number]
export type AttitudeParticipation = (typeof ATTITUDE_PARTICIPATION)[number]
export type AttitudeTrait = (typeof ATTITUDE_TRAITS)[number]
export type AttitudeClosing = (typeof ATTITUDE_CLOSING)[number]
