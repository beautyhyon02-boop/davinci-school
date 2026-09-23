'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getSessionProfile } from '@/lib/auth/session'
import { app } from '@/content/site'
import type { Criterion } from '@/lib/classroom/types'
import { loadAssignmentSnapshot } from '@/lib/classroom/snapshot'
import { buildNoticeSkeleton, applyDraft, mergeEditable, noticeDataKey, todayKst, type NoticeGradingInput } from '@/lib/classroom/notice'
import { Notice, NoticeDraftOut, type NoticeT } from '@/lib/classroom/notice-schema'
import { buildNoticePrompt } from '@/lib/classroom/notice-prompt'
import { lintNotice } from '@/lib/classroom/notice-lint'
import { callStructured } from '@/lib/ai/claude'

const errors = app.classroom.assign.errors
const rev = app.classroom.review.errors
const nt = app.classroom.notice.errors
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

/**
 * 다시 고치기: 확정을 풀어 검수 대기로. confirmed_at 도 비운다 — confirmed_at 만 보는 곳(안내장 등)이 다시 고치는 중인 점수를 쓰지 않게(N-03).
 * 0009 gradings_guard 는 원장에게 confirmed_at 변경을 막지 않는다. 다시 확정하면 confirmGrading 이 새 시각을 찍는다.
 */
export async function reopenGrading(gradingId: string): Promise<ActionResult> {
  await assertTeacher()
  const supabase = await createClient()
  const { error } = await supabase.from('gradings').update({ status: 'drafted', confirmed_at: null, updated_at: new Date().toISOString() }).eq('id', gradingId).eq('status', 'confirmed')
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

// ── 학생별 차시 안내장(v2 T8) ──────────────────────────────────────────
export type NoticeResult = ActionResult & { issues?: string[] }
type ServerClient = Awaited<ReturnType<typeof createClient>>
const noticePath = (setId: string, assignmentId: string, lessonNo: number) => `/teacher/assignments/${setId}/notices/${assignmentId}/${lessonNo}`

/**
 * 안내장에 들어갈 데이터(원장 클라이언트 = RLS 로 자기 원만): 판 스냅샷, 이 차시 퀴즈 응답, 확정 채점(status='confirmed'·confirmed_at 있음),
 * 학생 이름, 같은 원 다른 학생 이름(N-01 린트용). AI 는 부르지 않는다.
 */
async function loadNoticeData(supabase: ServerClient, assignmentId: string, lessonNo: number) {
  if (!Number.isInteger(lessonNo) || lessonNo < 1 || lessonNo > 8) return { ok: false as const, error: nt.badLesson }
  const { data: a } = await supabase.from('assignments')
    .select('id, item_set_id, item_set_version, academy_id, students!assignments_student_id_fkey(profiles(name))')
    .eq('id', assignmentId).maybeSingle()
  if (!a) return { ok: false as const, error: nt.notFound }
  const snapshot = await loadAssignmentSnapshot(supabase, a.item_set_id, a.item_set_version)
  if (!snapshot) return { ok: false as const, error: nt.notFound }
  if (!snapshot.notice_plan) return { ok: false as const, error: nt.noPlan }
  if (!snapshot.lessons.some((l) => l.no === lessonNo)) return { ok: false as const, error: nt.badLesson }
  const itemNo = (snapshot.assessment?.items.findIndex((it) => it.lesson_no === lessonNo) ?? -1) + 1
  const [{ data: quiz }, { data: answers }, { data: others }] = await Promise.all([
    supabase.from('quiz_responses').select('quiz_no, response, correct').eq('assignment_id', assignmentId).eq('lesson_no', lessonNo),
    supabase.from('answers').select('id, attempt').eq('assignment_id', assignmentId).eq('item_no', itemNo),
    supabase.from('students').select('profiles(name)').eq('academy_id', a.academy_id),
  ])
  const rows = (answers ?? []) as { id: string; attempt: number }[]
  // N-03: 원장이 확정한 채점만(SQL 필터). buildNoticeSkeleton 도 status·confirmed_at 을 다시 본다(이중 검사).
  const { data: gr } = rows.length
    ? await supabase.from('gradings').select('answer_id, status, final_score, final_criteria, confirmed_at').in('answer_id', rows.map((r) => r.id)).eq('status', 'confirmed').not('confirmed_at', 'is', null)
    : { data: [] }
  const gradings: NoticeGradingInput[] = ((gr ?? []) as { answer_id: string; status: string; final_score: number | null; final_criteria: Criterion[] | null; confirmed_at: string | null }[])
    .map((g) => ({
      attempt: rows.find((r) => r.id === g.answer_id)?.attempt === 2 ? 2 : 1,
      final_score: g.final_score,
      final_criteria: g.final_criteria?.map((c) => ({ name: c.name, points: c.points, max: c.max, evidence: c.evidence })) ?? null,
      status: g.status,
      confirmed_at: g.confirmed_at,
    }))
  const studentName = (a.students as unknown as { profiles: { name: string } | null } | null)?.profiles?.name ?? ''
  const otherNames = ((others ?? []) as unknown as { profiles: { name: string } | null }[]).map((o) => o.profiles?.name ?? '').filter((n) => n && n !== studentName)
  const built = buildNoticeSkeleton({ snapshot, lessonNo, studentName, date: todayKst(), quiz: (quiz ?? []) as { quiz_no: number; response: string; correct: boolean }[], gradings })
  return { ok: true as const, setId: a.item_set_id as string, academyId: a.academy_id as string, snapshot, otherNames, ...built }
}

/**
 * 학생별 안내장 초안: 확정 채점·퀴즈·재도전 데이터 + (확정된 서·논술형 결과가 있으면) AI 호출 1회.
 * 린트를 통과해야만 저장한다(status 'draft', confirmed_at 비움). 다시 만들 때도 원장이 쓴 참여 관찰·원장 한마디는 남긴다.
 */
export async function draftNotice(assignmentId: string, lessonNo: number): Promise<NoticeResult> {
  const s = await assertTeacher()
  const supabase = await createClient()
  const d = await loadNoticeData(supabase, assignmentId, lessonNo)
  if (!d.ok) return d
  let body: NoticeT = d.skeleton
  if (d.needsAi) {
    const p = buildNoticePrompt({ snapshot: d.snapshot, lessonNo, skeleton: d.skeleton, evidence: d.evidence })
    try {
      const r = await callStructured({ stage: 10, role: 'grade', schema: NoticeDraftOut, system: p.system, user: p.user, effort: 'medium', fixtureKey: p.fixtureKey })
      body = applyDraft(d.skeleton, r.data)
    } catch {
      return { ok: false, error: nt.aiFailed }
    }
  }
  const { data: existing } = await supabase.from('lesson_notices').select('body').eq('assignment_id', assignmentId).eq('lesson_no', lessonNo).maybeSingle()
  const prev = existing ? Notice.safeParse(existing.body) : null
  if (prev?.success) body = { ...body, director_message: prev.data.director_message, participation: { ...body.participation, director_comment: prev.data.participation.director_comment } }
  const parsed = Notice.safeParse(body)
  if (!parsed.success) return { ok: false, error: nt.invalid }
  const issues = lintNotice(parsed.data, d.otherNames)
  if (issues.length) return { ok: false, error: nt.lint, issues }
  const now = new Date().toISOString()
  const { error } = await supabase.from('lesson_notices').upsert({
    assignment_id: assignmentId, academy_id: d.academyId, lesson_no: lessonNo, body: parsed.data,
    status: 'draft', drafted_by: s.userId, drafted_at: now, confirmed_at: null, updated_at: now,
  }, { onConflict: 'assignment_id,lesson_no' })
  if (error) return { ok: false, error: nt.saveFailed }
  revalidatePath(noticePath(d.setId, assignmentId, lessonNo))
  return { ok: true }
}

/**
 * 원장 확정(HITL): 화면에서 고친 문장 칸만 저장된 초안에 덮고(점수·정오·이름은 초안 그대로), 지금의 확정 채점·퀴즈와 다시 대조한 뒤
 * 린트를 통과하면 status 'confirmed' + confirmed_at. 린트 위반·데이터 변동이 있으면 저장하지 않는다.
 */
export async function confirmNotice(assignmentId: string, lessonNo: number, body: NoticeT): Promise<NoticeResult> {
  await assertTeacher()
  const supabase = await createClient()
  const { data: row } = await supabase.from('lesson_notices').select('body').eq('assignment_id', assignmentId).eq('lesson_no', lessonNo).maybeSingle()
  if (!row) return { ok: false, error: nt.noDraft }
  const stored = Notice.safeParse(row.body)
  const sent = Notice.safeParse(body)
  if (!stored.success || !sent.success) return { ok: false, error: nt.invalid }
  const merged = mergeEditable(stored.data, sent.data)
  if (!merged) return { ok: false, error: nt.invalid }
  const d = await loadNoticeData(supabase, assignmentId, lessonNo)
  if (!d.ok) return d
  if (noticeDataKey(merged) !== noticeDataKey(d.skeleton)) return { ok: false, error: nt.stale }
  const parsed = Notice.safeParse(merged)
  if (!parsed.success) return { ok: false, error: nt.invalid }
  const issues = lintNotice(parsed.data, d.otherNames)
  if (issues.length) return { ok: false, error: nt.lint, issues }
  const now = new Date().toISOString()
  const { error } = await supabase.from('lesson_notices').update({ body: parsed.data, status: 'confirmed', confirmed_at: now, updated_at: now })
    .eq('assignment_id', assignmentId).eq('lesson_no', lessonNo)
  if (error) return { ok: false, error: nt.saveFailed }
  revalidatePath(noticePath(d.setId, assignmentId, lessonNo))
  return { ok: true }
}
