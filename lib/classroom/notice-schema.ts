import { z } from 'zod'
import { NOTICE_DISCLAIMER } from '@/lib/studio/schemas'

/**
 * 학생별 차시 안내장(data/reference/templates/notice.json 의 Notice 그대로, 스펙 §2.7).
 * 필드 출처: data(시스템 데이터 복사) / ai_draft(AI 초안 → 원장 확정) / director(원장 자유 서술).
 * 학원 자체 학습 기록이며 학교생활기록부가 아니다 — footer_disclaimer 는 고정 문구다.
 */
export const CriterionFeedback = z.object({
  criterion_name: z.string().min(1), band_score: z.number().int().min(0), max: z.number().int().min(1),
  good_point: z.string().max(60), improve_point: z.string().max(60).nullable(),
})
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

/** AI 출력(안내장 초안 1회 호출): 빈 칸만 채운다 — 점수·정오·이름 같은 data 필드는 AI가 만들지 않는다. */
export const NoticeDraftOut = z.object({
  quiz_notes: z.array(z.object({ quiz_no: z.number().int().min(1), note: z.string().min(2).max(40) })),
  criteria_feedback: z.array(z.object({ criterion_name: z.string().min(1), good_point: z.string().min(5).max(60), improve_point: z.string().max(60).nullable() })),
  improvement_comment: z.string().max(70).nullable(),
})
export type NoticeDraftOutT = z.infer<typeof NoticeDraftOut>
