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

/**
 * null 이면 "고친 것 없음" — 처음 확정이면 AI 초안을, 다시 고치기(reopen) 뒤면 기존 확정본(final_*)을 그대로 확정한다.
 * 트리거가 ai_* 변경을 막으므로 final_* 만 쓴다(원장 클라이언트).
 */
export async function confirmGrading(gradingId: string, input: ConfirmInput): Promise<ActionResult> {
  const s = await assertTeacher()
  const supabase = await createClient()
  const { data: g } = await supabase.from('gradings')
    .select('id, status, ai_criteria, ai_score, ai_strengths, ai_improvements, final_criteria, final_strengths, final_improvements, teacher_comment, adjust_note, confirmed_at')
    .eq('id', gradingId).maybeSingle()
  if (!g) return { ok: false, error: rev.saveFailed }
  if (g.status !== 'drafted' && g.status !== 'confirmed') return { ok: false, error: rev.notDrafted }
  const ai = g.ai_criteria as Criterion[] | null
  if (input === null && ai === null) return { ok: false, error: rev.notDrafted }
  // 이미 한 번 확정된 줄(final_criteria 있음)을 고치지 않고 다시 확정하면 원장이 고친 점수를 AI 값으로 되돌리지 않는다
  const prior = g.final_criteria !== null
  const criteria = (input?.criteria ?? (prior ? (g.final_criteria as Criterion[]) : ai) ?? []) as Criterion[]
  // 요소 수·만점은 AI 초안과 같아야 한다(만점 합 = 문항 배점이므로 요소별 max 검사로 총점 상한도 지켜진다)
  if (input && ai && (input.criteria.length !== ai.length || input.criteria.some((c, i) => c.max !== ai[i].max))) return { ok: false, error: rev.badScore }
  if (criteria.some((c) => !Number.isInteger(c.points) || c.points < 0 || c.points > c.max)) return { ok: false, error: rev.badScore }
  const score = criteria.reduce((sum, c) => sum + c.points, 0)
  const now = new Date().toISOString()
  const { error } = await supabase.from('gradings').update({
    status: 'confirmed', final_criteria: criteria, final_score: score,
    final_strengths: input?.strengths ?? (prior ? g.final_strengths : g.ai_strengths),
    final_improvements: input?.improvements ?? (prior ? g.final_improvements : g.ai_improvements),
    teacher_comment: input ? input.comment : (prior ? g.teacher_comment : null),
    adjust_note: input ? input.adjustNote || null : (prior ? g.adjust_note : null),
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

/**
 * AI 다시 채점: 확정 전(drafted/failed/pending)만. pending 은 멈춘 채점을 살리는 용도다.
 * 자격 확인은 원장 클라이언트(RLS)로, ai_*·final_* 비우기와 실행은 service role 로 한다(원장 클라이언트로 ai_* 를 쓰지 않는다).
 * 비우기는 조건부다 — 지금 실행 중인(임대 안의) pending 줄은 건드리지 않고, 실행기의 원자적 줄 잡기가 두 번째 실행을 막는다.
 * updated_at 을 비워 두면 실행기가 바로 잡을 수 있고, 잡는 순간·초안 쓰는 순간 updated_at 이 새로 찍혀 검수 카드가 다시 그려진다.
 */
export async function regradeAi(gradingId: string): Promise<ActionResult> {
  await assertTeacher()
  const supabase = await createClient()
  const { data: g } = await supabase.from('gradings').select('id, status').eq('id', gradingId).maybeSingle()
  if (!g || (g.status !== 'drafted' && g.status !== 'failed' && g.status !== 'pending')) return { ok: false, error: rev.notDrafted }
  const { createAdminClient } = await import('@/lib/supabase/admin')
  const { runGrading, claimableOr } = await import('@/lib/classroom/grade')
  const admin = createAdminClient()
  const { data: reset, error } = await admin.from('gradings').update({
    status: 'pending', ai_criteria: null, ai_score: null, ai_strengths: null, ai_improvements: null, model: null, input_tokens: null, output_tokens: null, error: null,
    final_criteria: null, final_score: null, final_strengths: null, final_improvements: null, updated_at: null,
  }).eq('id', gradingId).in('status', ['drafted', 'failed', 'pending']).or(claimableOr(['drafted', 'failed'])).select('id')
  if (error) return { ok: false, error: rev.saveFailed }
  // 비운 줄이 없으면 이미 다른 실행이 진행 중이다 — 두 번째 유료 호출을 만들지 않는다
  if (reset && reset.length > 0) await runGrading({ gradingId, db: admin })
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
