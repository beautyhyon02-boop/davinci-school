import type { Snapshot } from '@/lib/studio/publish'

export type AnswerSource = 'student' | 'photo' | 'teacher'
export type GradingStatus = 'pending' | 'drafted' | 'confirmed' | 'failed' | 'rejected'

/** 채점 요소 하나. 서술형은 1개(단일 채점표), 논술형은 4개. */
export type Criterion = { name: string; points: number; max: number; evidence: string; note: string }
export type GradingDraft = { criteria: Criterion[]; score: number; strengths: string[]; improvements: string[] }

export type AssignmentRow = {
  id: string; item_set_id: string; item_set_version: number; academy_id: string; student_id: string
  due_at: string | null; allow_retry: boolean; open_lessons: number; closed: boolean; created_at: string
}
export type QuizResponseRow = { assignment_id: string; lesson_no: number; quiz_no: number; response: string; correct: boolean; source: AnswerSource }
export type AnswerRow = {
  id: string; assignment_id: string; item_no: number; attempt: number; body: string; source: AnswerSource
  photo_path: string | null; saved_at: string; submitted_at: string | null
}
export type GradingRow = {
  id: string; answer_id: string; status: GradingStatus
  ai_criteria: Criterion[] | null; ai_score: number | null; ai_strengths: string[] | null; ai_improvements: string[] | null
  model: string | null; error: string | null
  final_criteria: Criterion[] | null; final_score: number | null; final_strengths: string[] | null; final_improvements: string[] | null
  teacher_comment: string | null; adjust_note: string | null; confirmed_at: string | null; updated_at: string | null; regrade_requested: boolean
}
export type AssessmentItem = NonNullable<Snapshot['assessment']>['items'][number]
