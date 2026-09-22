'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getSessionProfile } from '@/lib/auth/session'
import { loadAssignmentSnapshot } from '@/lib/classroom/snapshot'
import { judgeQuiz } from '@/lib/classroom/quiz'
import { isLessonOpen } from '@/lib/classroom/lessons'
import { app } from '@/content/site'

const errors = app.classroom.student.errors
const MIN_ANSWER_CHARS = 50

async function loadOwnAssignment(assignmentId: string) {
  const s = await getSessionProfile()
  if (s.role !== 'student') throw new Error('forbidden')
  const supabase = await createClient()
  const { data: a } = await supabase.from('assignments').select('*').eq('id', assignmentId).eq('student_id', s.userId).maybeSingle()
  if (!a) throw new Error('forbidden')
  const snapshot = await loadAssignmentSnapshot(supabase, a.item_set_id, a.item_set_version)
  if (!snapshot) throw new Error('snapshot missing')
  return { s, supabase, a, snapshot }
}

export type QuizResult = { ok: true; results: { correct: boolean; answer: string; explanation: string }[] } | { ok: false; error: string }

export async function submitQuiz(assignmentId: string, lessonNo: number, responses: string[]): Promise<QuizResult> {
  const { supabase, a, snapshot } = await loadOwnAssignment(assignmentId)
  if (!isLessonOpen(a.open_lessons, lessonNo) || a.closed) return { ok: false, error: errors.notOpen }
  const lesson = snapshot.lessons.find((l) => l.no === lessonNo)
  if (!lesson || lesson.quiz.length === 0) return { ok: false, error: errors.notOpen }
  const { count } = await supabase.from('quiz_responses').select('id', { count: 'exact', head: true }).eq('assignment_id', assignmentId).eq('lesson_no', lessonNo)
  if ((count ?? 0) > 0) return { ok: false, error: errors.alreadySubmitted }

  const rows = lesson.quiz.map((q, i) => ({
    assignment_id: assignmentId, lesson_no: lessonNo, quiz_no: i + 1,
    response: responses[i] ?? '', correct: judgeQuiz(q, responses[i] ?? ''), source: 'student' as const,
  }))
  const { error } = await supabase.from('quiz_responses').insert(rows)
  if (error) return { ok: false, error: errors.saveFailed }
  revalidatePath(`/student/assignments/${assignmentId}`)
  return { ok: true, results: rows.map((r, i) => ({ correct: r.correct, answer: lesson.quiz[i].answer, explanation: lesson.quiz[i].explanation })) }
}

export async function saveDraft(assignmentId: string, itemNo: number, attempt: number, body: string): Promise<{ ok: boolean }> {
  const { s, supabase, a } = await loadOwnAssignment(assignmentId)
  if (a.closed) return { ok: false }
  const { error } = await supabase.from('answers').upsert(
    { assignment_id: assignmentId, item_no: itemNo, attempt, body, source: 'student', entered_by: s.userId, saved_at: new Date().toISOString() },
    { onConflict: 'assignment_id,item_no,attempt' },
  )
  return { ok: !error }
}

export type SubmitResult = { ok: true; gradingId: string } | { ok: false; error: string }

/** 50자 미만은 submitted_at 을 찍지 않고 돌려보낸다(스펙 §5.2). 성공하면 gradings(pending) 줄을 만들고 id 를 돌려준다. */
export async function submitAnswer(assignmentId: string, itemNo: number, attempt: number): Promise<SubmitResult> {
  const { supabase, a } = await loadOwnAssignment(assignmentId)
  const { data: ans } = await supabase.from('answers').select('id, body, submitted_at').eq('assignment_id', assignmentId).eq('item_no', itemNo).eq('attempt', attempt).maybeSingle()
  if (!ans) return { ok: false, error: errors.saveFailed }
  if (ans.submitted_at) return { ok: false, error: errors.alreadySubmitted }
  if (ans.body.trim().length < MIN_ANSWER_CHARS) return { ok: false, error: app.classroom.student.answer.tooShort }
  // RLS 가 걸러 0행이 갱신될 수 있다(예: select 와 update 사이에 배정이 닫힘) — 이때 error 는 null이므로
  // 갱신된 행을 직접 확인해야 한다. 확인 없이 넘어가면 submitted_at 이 비어 있는데 gradings(pending) 이
  // 생겨(answer_id unique) 이후 정상 제출까지 영구히 saveFailed 로 막힌다.
  const { data: updated, error } = await supabase.from('answers').update({ submitted_at: new Date().toISOString() }).eq('id', ans.id).select('id').maybeSingle()
  if (error || !updated) return { ok: false, error: errors.saveFailed }
  // gradings 는 학생 정책이 없으므로 service role 로 만든다
  const { createAdminClient } = await import('@/lib/supabase/admin')
  const { data: g, error: gErr } = await createAdminClient().from('gradings').insert({ answer_id: ans.id, academy_id: a.academy_id, status: 'pending' }).select('id').single()
  if (gErr || !g) return { ok: false, error: errors.saveFailed }
  revalidatePath(`/student/assignments/${assignmentId}`)
  return { ok: true, gradingId: g.id }
}
