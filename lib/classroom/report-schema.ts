import { z } from 'zod'
import { NOTICE_DISCLAIMER } from '@/lib/studio/schemas'
import { COMPETENCIES } from '@/lib/studio/competency'

/**
 * 단원 리포트 본문(unit_reports.body, jsonb) — 저장했다가 다시 읽을 때 이 스키마로 검증한다.
 * 설계: docs/superpowers/specs/2026-09-29-unit-report-design.md §5.1
 * 점수·정오·역량 같은 data 필드는 buildUnitReport 가 채우고, 문장 칸(wrong_note·phrase·summary·overall_comment)은 원장이 인쇄 전에 고칠 수 있다(R-8).
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

export const UnitReportBody = z.object({
  student_name: z.string().min(1),
  theme_title: z.string(),
  /** 리포트에 넣은 과목(subjects 와 같은 순서). */
  included_subjects: z.array(z.string()),
  subjects: z.array(ReportSubject),
  radar: z.array(RadarAxis).length(COMPETENCIES.length),
  overall_comment: z.string(),
  footer_disclaimer: z.literal(NOTICE_DISCLAIMER),
})

export type ReportQuiz = z.infer<typeof ReportQuiz>
export type ReportCriterion = z.infer<typeof ReportCriterion>
export type ReportAssessmentItem = z.infer<typeof ReportAssessmentItem>
export type ReportMissing = z.infer<typeof ReportMissing>
export type ReportSubject = z.infer<typeof ReportSubject>
export type RadarAxis = z.infer<typeof RadarAxis>
export type UnitReportBody = z.infer<typeof UnitReportBody>
