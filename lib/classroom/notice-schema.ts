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
/** 서·논술형 결과 한 문항(확정 채점만). 단원 평가 차시는 서술형·논술형 두 개(대표 2026-09-26), 옛 판 차시는 한 개. */
export const EssayResult = z.object({
  kind: z.enum(['서술형', '논술형']), confirmed_score: z.number().int().min(0), total_points: z.number().int().min(1), band: z.enum(['상', '중', '하']),
  criteria_feedback: z.array(CriterionFeedback),
  retry: z.object({ attempted: z.boolean(), before_score: z.number().int(), after_score: z.number().int(), improvement_comment: z.string().max(70).nullable() }).nullable(),
})
const NoticeBody = z.object({
  student_name: z.string().min(1), lesson_no: z.number().int().min(1), date: z.string().min(8),
  lesson_context: z.object({ key_question: z.string(), goal: z.string(), topic_summary: z.string().max(60) }),
  participation: z.object({
    quiz: z.object({ correct: z.number().int().min(0), total: z.number().int().min(0), items: z.array(z.object({ q: z.string(), is_correct: z.boolean(), note: z.string().max(40).nullable() })) }),
    director_comment: z.string().max(80).nullable(),
  }),
  essay_results: z.array(EssayResult),   // 확정된 문항만, 문항 순서(서술형 → 논술형). 없으면 빈 배열
  next_lesson: z.object({ preview: z.string().max(50), home_study_suggestion: z.string().max(60) }),
  director_message: z.string().max(100).nullable(),
  footer_disclaimer: z.literal(NOTICE_DISCLAIMER),
})
/**
 * 저장된 안내장 읽기. 2026-09-26 이전 본문은 결과가 한 개(essay_result, 없으면 null)였다 — 읽을 때 essay_results 배열로 올린다.
 */
export const Notice = z.preprocess((v) => {
  if (!v || typeof v !== 'object' || Array.isArray(v) || 'essay_results' in v || !('essay_result' in v)) return v
  const { essay_result, ...rest } = v as Record<string, unknown>
  return { ...rest, essay_results: essay_result ? [essay_result] : [] }
}, NoticeBody)
export type NoticeT = z.infer<typeof NoticeBody>
export type EssayResultT = z.infer<typeof EssayResult>

/** AI 출력(안내장 초안 1회 호출): 빈 칸만 채운다 — 점수·정오·이름 같은 data 필드는 AI가 만들지 않는다. */
export const NoticeDraftOut = z.object({
  quiz_notes: z.array(z.object({ quiz_no: z.number().int().min(1), note: z.string().min(2).max(40) })),
  // 요소 이름은 세트 안에서 겹치지 않는다([TS]) — 단원 평가 차시의 두 문항 요소를 이름으로 가른다
  criteria_feedback: z.array(z.object({ criterion_name: z.string().min(1), good_point: z.string().min(5).max(60), improve_point: z.string().max(60).nullable() })),
  // 재도전 향상 문구: 재도전이 확정된 문항마다(종류로 가른다)
  improvement_comments: z.array(z.object({ kind: z.enum(['서술형', '논술형']), comment: z.string().min(5).max(70) })),
})
export type NoticeDraftOutT = z.infer<typeof NoticeDraftOut>
