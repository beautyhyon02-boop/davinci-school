import type { SupabaseClient } from '@supabase/supabase-js'
import { isMissingTable } from '@/lib/classroom/quiz-entry'
import { InquiryTask, Outline, QUESTION_KEYS, SECTION_MAX_CHARS, QUESTION_MAX_CHARS, CAREER_MAX_CHARS, isTextSectionKey, type InquiryReport, type ReportQuestion, type TextSectionKey } from './schema'
import { publishGate, type GateMissing } from './publish-gate'
import { loadTask, loadAssignmentView, type InquiryViewer, type ReportRow } from './data'

/**
 * 탐구보고서 쓰기(서버 전용). db 는 로그인한 사람의 클라이언트(RLS) — 여기서도 역할·원·본인을 다시 확인한다.
 * 표가 없으면(0016 전) 'unavailable', 그 밖의 쓰기 실패는 'save-failed'. 예외를 던지지 않는다.
 */

export type SaveReason = 'forbidden' | 'not-found' | 'invalid' | 'save-failed' | 'unavailable' | 'gate' | 'not-published' | 'submitted' | 'no-students'
export type SaveResult<T = object> = ({ ok: true } & T) | { ok: false; reason: SaveReason; missing?: GateMissing[] }

const failure = (error: unknown, table: string): SaveResult<never> => {
  if (isMissingTable(error)) return { ok: false, reason: 'unavailable' }
  console.error(`[${table}] write failed`, error)
  return { ok: false, reason: 'save-failed' }
}

// ── 본사: 과제 ─────────────────────────────────────────────────────────

export async function createTask(db: SupabaseClient, createdBy: string): Promise<SaveResult<{ id: string }>> {
  try {
    const { data, error } = await db.from('inquiry_tasks').insert({
      title: '', subtitle: '', subjects: [], level: '중', theme_id: null,
      questions: QUESTION_KEYS.map((key) => ({ key, text: '', lens: '' })), sources: [], section_guides: {}, teacher_tips: [],
      status: 'draft', created_by: createdBy,
    }).select('id').single()
    if (error || !data) return failure(error, 'inquiry_tasks')
    return { ok: true, id: String(data.id) }
  } catch (e) { return failure(e, 'inquiry_tasks') }
}

/**
 * 과제 저장. 확인함 표시(verified)는 화면 값을 믿지 않는다: 이미 확인된 자료(같은 id)는 그 기록을 그대로 두고,
 * 새로 체크한 자료에만 지금 사람·시각을 적는다. 체크를 풀면 null. 게시된 과제도 저장된다(자료를 고치면 학생 화면에 바로 반영).
 */
export async function saveTask(db: SupabaseClient, taskId: string, input: unknown, by: { name: string; now: string }): Promise<SaveResult<{ task: InquiryTask }>> {
  const parsed = InquiryTask.safeParse(input)
  if (!parsed.success) return { ok: false, reason: 'invalid' }
  const current = await loadTask(db, taskId)
  if (!current.available) return { ok: false, reason: 'unavailable' }
  if (current.loadFailed) return { ok: false, reason: 'save-failed' }
  if (!current.row) return { ok: false, reason: 'not-found' }
  const existing = new Map((current.row.task?.sources ?? []).map((s) => [s.id, s.verified]))
  const task: InquiryTask = {
    ...parsed.data,
    sources: parsed.data.sources.map((s) => {
      if (!s.verified) return { ...s, verified: null }
      const before = existing.get(s.id)
      return { ...s, verified: before ?? { by: by.name, at: by.now } }
    }),
  }
  try {
    const { error } = await db.from('inquiry_tasks').update({ ...task, updated_at: by.now }).eq('id', taskId)
    if (error) return failure(error, 'inquiry_tasks')
    return { ok: true, task }
  } catch (e) { return failure(e, 'inquiry_tasks') }
}

/** [게시]: 저장된 줄로 관문을 다시 본다(화면 값이 아니라). [게시 취소]는 관문 없이. */
export async function setTaskStatus(db: SupabaseClient, taskId: string, status: 'published' | 'draft', now: string): Promise<SaveResult> {
  const current = await loadTask(db, taskId)
  if (!current.available) return { ok: false, reason: 'unavailable' }
  if (current.loadFailed) return { ok: false, reason: 'save-failed' }
  if (!current.row) return { ok: false, reason: 'not-found' }
  if (status === 'published') {
    if (!current.row.task) return { ok: false, reason: 'invalid' }
    const gate = publishGate(current.row.task)
    if (!gate.ok) return { ok: false, reason: 'gate', missing: gate.missing }
  }
  try {
    const patch = status === 'published' ? { status, published_at: now, updated_at: now } : { status, updated_at: now }
    const { error } = await db.from('inquiry_tasks').update(patch).eq('id', taskId)
    if (error) return failure(error, 'inquiry_tasks')
    return { ok: true }
  } catch (e) { return failure(e, 'inquiry_tasks') }
}

// ── 원장: 배정·목차·다시 쓰게 하기 ─────────────────────────────────────

/** 게시된 과제를 자기 원 학생에게 배정한다. 이미 배정된 학생은 건너뛴다(unique). 돌려주는 수 = 새로 배정한 학생 수. */
export async function assignStudents(db: SupabaseClient, a: { taskId: string; academyId: string; studentIds: string[]; outline: unknown; assignedBy: string; now: string }): Promise<SaveResult<{ assigned: number }>> {
  const ids = [...new Set(a.studentIds.filter((s) => typeof s === 'string' && s))]
  if (ids.length === 0) return { ok: false, reason: 'no-students' }
  const outline = Outline.safeParse(a.outline)
  if (!outline.success) return { ok: false, reason: 'invalid' }
  const task = await loadTask(db, a.taskId)
  if (!task.available) return { ok: false, reason: 'unavailable' }
  if (task.loadFailed) return { ok: false, reason: 'save-failed' }
  if (!task.row) return { ok: false, reason: 'not-found' }
  if (task.row.status !== 'published') return { ok: false, reason: 'not-published' }
  try {
    // 자기 원 학생만(RLS 도 검사하지만 다른 원 id 가 섞여 전체가 실패하지 않게 먼저 거른다)
    const { data: own, error: ownErr } = await db.from('students').select('profile_id').in('profile_id', ids).eq('academy_id', a.academyId)
    if (ownErr) return failure(ownErr, 'students')
    const ownIds = new Set((own ?? []).map((r) => String(r.profile_id)))
    const { data: done, error: doneErr } = await db.from('inquiry_assignments').select('student_id').eq('task_id', a.taskId).eq('academy_id', a.academyId)
    if (doneErr) return failure(doneErr, 'inquiry_assignments')
    const doneIds = new Set((done ?? []).map((r) => String(r.student_id)))
    const rows = ids.filter((id) => ownIds.has(id) && !doneIds.has(id)).map((studentId) => ({
      task_id: a.taskId, academy_id: a.academyId, student_id: studentId, outline: outline.data, status: 'assigned', assigned_by: a.assignedBy, created_at: a.now, updated_at: a.now,
    }))
    if (rows.length === 0) return { ok: true, assigned: 0 }
    const { error } = await db.from('inquiry_assignments').insert(rows)
    if (error) return failure(error, 'inquiry_assignments')
    return { ok: true, assigned: rows.length }
  } catch (e) { return failure(e, 'inquiry_assignments') }
}

/** 목차 [확인]: 고른 배정(자기 원·이 과제)에 같은 목차를 적용한다. 글은 지우지 않는다(숨김만 — 설계 §5). */
export async function applyOutline(db: SupabaseClient, a: { taskId: string; academyId: string; assignmentIds: string[]; outline: unknown; now: string }): Promise<SaveResult<{ applied: number }>> {
  const outline = Outline.safeParse(a.outline)
  if (!outline.success) return { ok: false, reason: 'invalid' }
  const ids = [...new Set(a.assignmentIds.filter((s) => typeof s === 'string' && s))]
  if (ids.length === 0) return { ok: true, applied: 0 }
  try {
    const { data, error } = await db.from('inquiry_assignments').update({ outline: outline.data, updated_at: a.now })
      .in('id', ids).eq('task_id', a.taskId).eq('academy_id', a.academyId).select('id')
    if (error) return failure(error, 'inquiry_assignments')
    return { ok: true, applied: (data ?? []).length }
  } catch (e) { return failure(e, 'inquiry_assignments') }
}

/** [다시 쓰게 하기]: 제출을 풀고(submitted_at 비움) 배정 상태를 reopened 로. 원장은 자기 원만. */
export async function reopenAssignment(db: SupabaseClient, viewer: InquiryViewer, assignmentId: string, now: string): Promise<SaveResult> {
  const v = await loadAssignmentView(db, viewer, assignmentId)
  if (!v.ok) return { ok: false, reason: v.reason === 'forbidden' ? 'forbidden' : v.reason === 'not-found' ? 'not-found' : v.reason === 'unavailable' ? 'unavailable' : 'save-failed' }
  try {
    if (v.view.hasReport) {
      const { error } = await db.from('inquiry_reports').update({ submitted_at: null, updated_at: now }).eq('assignment_id', assignmentId)
      if (error) return failure(error, 'inquiry_reports')
    }
    const { error } = await db.from('inquiry_assignments').update({ status: 'reopened', updated_at: now }).eq('id', assignmentId)
    if (error) return failure(error, 'inquiry_assignments')
    return { ok: true }
  } catch (e) { return failure(e, 'inquiry_assignments') }
}

// ── 학생: 쓰기·제출 ────────────────────────────────────────────────────

export type ReportPatch =
  | { kind: 'section'; key: string; text: string }
  | { kind: 'questions'; questions: unknown }
  | { kind: 'sources'; ids: unknown }
  | { kind: 'career'; text: string }

/** 화면에서 온 조각을 확인해 저장할 열로 바꾼다. 모양이 틀리면 null. */
export function normalizePatch(patch: ReportPatch, current: InquiryReport): Partial<Pick<ReportRow, 'sections' | 'questions' | 'used_source_ids' | 'career_field'>> | null {
  switch (patch.kind) {
    case 'section': {
      if (!isTextSectionKey(patch.key) || typeof patch.text !== 'string' || patch.text.length > SECTION_MAX_CHARS) return null
      const sections: Partial<Record<TextSectionKey, string>> = { ...current.sections, [patch.key]: patch.text }
      return { sections }
    }
    case 'questions': {
      if (!Array.isArray(patch.questions)) return null
      const out: ReportQuestion[] = []
      for (const key of QUESTION_KEYS) {
        const q = (patch.questions as { key?: unknown; text?: unknown }[]).find((x) => x && x.key === key)
        const text = typeof q?.text === 'string' ? q.text : ''
        if (text.length > QUESTION_MAX_CHARS) return null
        out.push({ key, text })
      }
      return { questions: out }
    }
    case 'sources': {
      if (!Array.isArray(patch.ids) || patch.ids.length > 30 || !patch.ids.every((x) => typeof x === 'string' && x.length <= 40)) return null
      return { used_source_ids: [...new Set(patch.ids as string[])] }
    }
    case 'career': {
      if (typeof patch.text !== 'string' || patch.text.length > CAREER_MAX_CHARS) return null
      return { career_field: patch.text }
    }
    default: return null
  }
}

/** 자동 저장: 본인 배정·제출 전에만. 저장된 줄을 읽어 조각을 합친 뒤 통째로 upsert 한다(칸마다 따로 오는 저장이 서로를 지우지 않게 화면이 차례로 보낸다). */
export async function saveReportPatch(db: SupabaseClient, viewer: InquiryViewer, assignmentId: string, patch: ReportPatch, now: string): Promise<SaveResult<{ updatedAt: string }>> {
  if (viewer.role !== 'student') return { ok: false, reason: 'forbidden' }
  const v = await loadAssignmentView(db, viewer, assignmentId)
  if (!v.ok) return { ok: false, reason: v.reason === 'forbidden' ? 'forbidden' : v.reason === 'not-found' ? 'not-found' : v.reason === 'unavailable' ? 'unavailable' : 'save-failed' }
  if (v.view.report.submitted_at) return { ok: false, reason: 'submitted' }
  if (!patch || typeof patch !== 'object') return { ok: false, reason: 'invalid' }
  const cols = normalizePatch(patch, v.view.report)
  if (!cols) return { ok: false, reason: 'invalid' }
  try {
    const { error } = await db.from('inquiry_reports').upsert(
      { assignment_id: assignmentId, academy_id: v.view.assignment.academyId, ...cols, updated_at: now },
      { onConflict: 'assignment_id' },
    )
    if (error) return failure(error, 'inquiry_reports')
    return { ok: true, updatedAt: now }
  } catch (e) { return failure(e, 'inquiry_reports') }
}

/**
 * [제출]: 보고서 줄에 제출 시각을 찍는다(학생 정책은 제출 전 줄만 고칠 수 있다). 배정 줄의 status 는 학생 정책이 없어
 * admin(service role)으로 바꾼다 — 본인 배정임을 위에서 확인한 뒤. 그 갱신이 실패해도 제출은 유효하다(화면은 보고서의 제출 시각으로 판단).
 */
export async function submitReport(db: SupabaseClient, admin: SupabaseClient | null, viewer: InquiryViewer, assignmentId: string, now: string): Promise<SaveResult> {
  if (viewer.role !== 'student') return { ok: false, reason: 'forbidden' }
  const v = await loadAssignmentView(db, viewer, assignmentId)
  if (!v.ok) return { ok: false, reason: v.reason === 'forbidden' ? 'forbidden' : v.reason === 'not-found' ? 'not-found' : v.reason === 'unavailable' ? 'unavailable' : 'save-failed' }
  if (v.view.report.submitted_at) return { ok: false, reason: 'submitted' }
  try {
    // 학생의 넣기 정책은 제출 전 줄만 허용한다 — 아직 줄이 없으면 빈 줄을 먼저 넣고, 그다음 제출 시각을 찍는다(고치기 정책)
    if (!v.view.hasReport) {
      const { error: insErr } = await db.from('inquiry_reports').insert({ assignment_id: assignmentId, academy_id: v.view.assignment.academyId, updated_at: now })
      if (insErr) return failure(insErr, 'inquiry_reports')
    }
    const { data, error } = await db.from('inquiry_reports').update({ submitted_at: now, updated_at: now }).eq('assignment_id', assignmentId).is('submitted_at', null).select('assignment_id')
    if (error || !data || data.length === 0) return failure(error ?? new Error('no row'), 'inquiry_reports')
    if (admin) {
      const { error: aErr } = await admin.from('inquiry_assignments').update({ status: 'submitted', updated_at: now }).eq('id', assignmentId)
      if (aErr) console.error('[inquiry_assignments] status update failed', aErr)
    }
    return { ok: true }
  } catch (e) { return failure(e, 'inquiry_reports') }
}
