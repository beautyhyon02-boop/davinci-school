'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getSessionProfile } from '@/lib/auth/session'
import { app } from '@/content/site'
import type { Criterion } from '@/lib/classroom/types'

const errors = app.classroom.assign.errors
const rev = app.classroom.review.errors
export type ActionResult = { ok: true } | { ok: false; error: string }

async function assertTeacher() {
  const s = await getSessionProfile()
  if (s.role !== 'teacher' || !s.academyId) throw new Error('forbidden')
  return { ...s, academyId: s.academyId }
}

/** 반 전체(studentIds 생략) 또는 지정 학생의 열린 차시 수를 바꾼다. RLS 가 academy 를 검사한다. */
export async function setOpenLessons(setId: string, openLessons: number, studentIds?: string[]): Promise<ActionResult> {
  await assertTeacher()
  if (!Number.isInteger(openLessons) || openLessons < 1 || openLessons > 8) return { ok: false, error: errors.invalidLessons }
  const supabase = await createClient()
  let q = supabase.from('assignments').update({ open_lessons: openLessons }).eq('item_set_id', setId)
  if (studentIds?.length) q = q.in('student_id', studentIds)
  const { error } = await q
  if (error) return { ok: false, error: errors.saveFailed }
  revalidatePath(`/teacher/assignments/${setId}`)
  return { ok: true }
}

export type ConfirmInput = { criteria: Criterion[]; strengths: string[]; improvements: string[]; comment: string; adjustNote: string } | null

/** null 이면 AI 초안을 그대로 확정본으로 복사한다. 트리거가 ai_* 변경을 막으므로 final_* 만 쓴다. */
export async function confirmGrading(gradingId: string, input: ConfirmInput): Promise<ActionResult> {
  const s = await assertTeacher()
  const supabase = await createClient()
  const { data: g } = await supabase.from('gradings').select('id, status, ai_criteria, ai_score, ai_strengths, ai_improvements, confirmed_at').eq('id', gradingId).maybeSingle()
  if (!g) return { ok: false, error: rev.saveFailed }
  if (g.status !== 'drafted' && g.status !== 'confirmed') return { ok: false, error: rev.notDrafted }
  const criteria = (input?.criteria ?? (g.ai_criteria as Criterion[] | null) ?? []) as Criterion[]
  if (criteria.some((c) => !Number.isInteger(c.points) || c.points < 0 || c.points > c.max)) return { ok: false, error: rev.badScore }
  const score = criteria.reduce((sum, c) => sum + c.points, 0)
  const now = new Date().toISOString()
  const { error } = await supabase.from('gradings').update({
    status: 'confirmed', final_criteria: criteria, final_score: score,
    final_strengths: input?.strengths ?? g.ai_strengths, final_improvements: input?.improvements ?? g.ai_improvements,
    teacher_comment: input?.comment ?? null, adjust_note: input?.adjustNote || null,
    confirmed_by: s.userId, confirmed_at: g.confirmed_at ?? now, updated_at: now,
  }).eq('id', gradingId)
  if (error) return { ok: false, error: rev.saveFailed }
  revalidatePath('/teacher/assignments'); return { ok: true }
}

export async function reopenGrading(gradingId: string): Promise<ActionResult> {
  await assertTeacher()
  const supabase = await createClient()
  const { error } = await supabase.from('gradings').update({ status: 'drafted', updated_at: new Date().toISOString() }).eq('id', gradingId).eq('status', 'confirmed')
  if (error) return { ok: false, error: rev.saveFailed }
  revalidatePath('/teacher/assignments'); return { ok: true }
}

export async function requestRegrade(gradingId: string): Promise<ActionResult> {
  await assertTeacher()
  const supabase = await createClient()
  const { error } = await supabase.from('gradings').update({ regrade_requested: true, updated_at: new Date().toISOString() }).eq('id', gradingId)
  if (error) return { ok: false, error: rev.saveFailed }
  revalidatePath('/teacher/assignments'); return { ok: true }
}

/** AI 다시 채점: 확정 전(drafted/failed)만. service role 로 ai_* 를 비우고 pending 으로 되돌린 뒤 실행기를 부른다. */
export async function regradeAi(gradingId: string): Promise<ActionResult> {
  await assertTeacher()
  const supabase = await createClient()
  const { data: g } = await supabase.from('gradings').select('id, status').eq('id', gradingId).maybeSingle()
  if (!g || (g.status !== 'drafted' && g.status !== 'failed')) return { ok: false, error: rev.notDrafted }
  const { createAdminClient } = await import('@/lib/supabase/admin')
  const { runGrading } = await import('@/lib/classroom/grade')
  const admin = createAdminClient()
  await admin.from('gradings').update({ status: 'pending', ai_criteria: null, ai_score: null, ai_strengths: null, ai_improvements: null, model: null, input_tokens: null, output_tokens: null, error: null }).eq('id', gradingId)
  await runGrading({ gradingId, db: admin })
  revalidatePath('/teacher/assignments'); return { ok: true }
}

export async function overrideQuiz(assignmentId: string, lessonNo: number, quizNo: number, correct: boolean): Promise<ActionResult> {
  const s = await assertTeacher()
  const supabase = await createClient()
  const { error } = await supabase.from('quiz_responses').update({ correct, overridden_by: s.userId, overridden_at: new Date().toISOString() })
    .eq('assignment_id', assignmentId).eq('lesson_no', lessonNo).eq('quiz_no', quizNo)
  if (error) return { ok: false, error: rev.saveFailed }
  revalidatePath('/teacher/assignments'); return { ok: true }
}
