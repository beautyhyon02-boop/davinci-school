import type { SupabaseClient } from '@supabase/supabase-js'
import { isMissingTable } from '@/lib/classroom/quiz-entry'
import { InquiryReport, InquiryTask, Outline, DEFAULT_OUTLINE, emptyReport, type InquiryReport as Report } from './schema'
import { progressOf } from './outline'

/**
 * 탐구보고서 읽기(서버 전용 — 페이지·서버 동작이 부른다). db 는 로그인한 사람의 클라이언트(RLS)이고, 여기서도 원·본인을 먼저 확인한다 —
 * 통과하기 전에는 다른 표를 읽지 않는다(lib/classroom/report-data.ts 와 같은 원칙). 표 사이를 잇는 질의(embed)는 쓰지 않는다(가짜 DB 로 확인).
 *
 * 마이그레이션 0016 전(표 없음): 예외를 던지지 않고 available=false 로 돌려준다 — 화면은 차분한 안내 한 줄만 보인다.
 * 그 밖의 읽기 오류는 빈 목록으로 바꾸지 않고 loadFailed 로 돌려준다.
 */

export type InquiryViewer = { role: 'admin' | 'teacher' | 'student'; userId: string; academyId: string | null }
export type TaskStatus = 'draft' | 'published'
export type AssignmentStatus = 'assigned' | 'submitted' | 'reopened'

export type TaskRow = {
  id: string; theme_id: string | null; title: string; subtitle: string; subjects: unknown; level: string; questions: unknown; sources: unknown
  section_guides: unknown; teacher_tips: unknown; status: string; created_at: string | null; updated_at: string | null; published_at: string | null
}
export type AssignmentRow = { id: string; task_id: string; academy_id: string; student_id: string; outline: unknown; status: string; created_at: string | null; updated_at: string | null }
export type ReportRow = { assignment_id: string; academy_id: string; sections: unknown; questions: unknown; used_source_ids: unknown; career_field: string | null; updated_at: string | null; submitted_at: string | null }

export type TaskSummary = {
  id: string
  /** 모양이 맞지 않는 줄이면 null(관리자 화면에 안내 줄). */
  task: InquiryTask | null
  title: string
  status: TaskStatus
  publishedAt: string | null
  updatedAt: string | null
}

const TASK_COLUMNS = 'id, theme_id, title, subtitle, subjects, level, questions, sources, section_guides, teacher_tips, status, created_at, updated_at, published_at'
const ASSIGNMENT_COLUMNS = 'id, task_id, academy_id, student_id, outline, status, created_at, updated_at'
const REPORT_COLUMNS = 'assignment_id, academy_id, sections, questions, used_source_ids, career_field, updated_at, submitted_at'

export function taskFromRow(row: TaskRow): TaskSummary {
  const parsed = InquiryTask.safeParse(row)
  return {
    id: row.id, task: parsed.success ? parsed.data : null, title: String(row.title ?? ''),
    status: row.status === 'published' ? 'published' : 'draft', publishedAt: row.published_at ?? null, updatedAt: row.updated_at ?? null,
  }
}

export function outlineFromRow(row: Pick<AssignmentRow, 'outline'>): Outline {
  const p = Outline.safeParse(row.outline)
  return p.success ? p.data : { ...DEFAULT_OUTLINE }
}

export function reportFromRow(row: ReportRow | null): Report {
  if (!row) return emptyReport()
  const p = InquiryReport.safeParse({ ...row, career_field: row.career_field ?? '' })
  return p.success ? p.data : { ...emptyReport(), updated_at: row.updated_at ?? null, submitted_at: row.submitted_at ?? null }
}

/** 배정 상태: 보고서의 제출 시각이 있으면 제출함(배정 줄의 status 갱신이 실패했어도 화면은 맞게 보인다). */
export function assignmentStatusOf(row: Pick<AssignmentRow, 'status'>, report: Pick<Report, 'submitted_at'> | null): AssignmentStatus {
  if (report?.submitted_at) return 'submitted'
  return row.status === 'reopened' ? 'reopened' : 'assigned'
}

type ListResult<T> = { available: boolean; loadFailed: boolean; rows: T[] }

function unavailable<T>(error: unknown, table: string): ListResult<T> {
  if (isMissingTable(error)) return { available: false, loadFailed: false, rows: [] }
  console.error(`[${table}] read failed`, error)
  return { available: true, loadFailed: true, rows: [] }
}

// ── 과제 ─────────────────────────────────────────────────────────────

export async function loadTasks(db: SupabaseClient, opts: { publishedOnly: boolean }): Promise<ListResult<TaskSummary>> {
  try {
    let q = db.from('inquiry_tasks').select(TASK_COLUMNS)
    if (opts.publishedOnly) q = q.eq('status', 'published')
    const { data, error } = await q.order('created_at', { ascending: false })
    if (error) return unavailable(error, 'inquiry_tasks')
    return { available: true, loadFailed: false, rows: ((data ?? []) as TaskRow[]).map(taskFromRow) }
  } catch (e) {
    return unavailable(e, 'inquiry_tasks')
  }
}

export async function loadTask(db: SupabaseClient, taskId: string): Promise<{ available: boolean; loadFailed: boolean; row: TaskSummary | null }> {
  try {
    const { data, error } = await db.from('inquiry_tasks').select(TASK_COLUMNS).eq('id', taskId).maybeSingle()
    if (error) { const u = unavailable(error, 'inquiry_tasks'); return { available: u.available, loadFailed: u.loadFailed, row: null } }
    return { available: true, loadFailed: false, row: data ? taskFromRow(data as TaskRow) : null }
  } catch (e) {
    const u = unavailable(e, 'inquiry_tasks'); return { available: u.available, loadFailed: u.loadFailed, row: null }
  }
}

// ── 원장: 배정·현황 ────────────────────────────────────────────────────

export type AssignmentProgress = {
  assignmentId: string; studentId: string; studentName: string; outline: Outline; status: AssignmentStatus
  progress: { filled: number; total: number }; updatedAt: string | null; submittedAt: string | null
}

/** 원장은 자기 원의 배정만(질의에도 academy_id 를 건다), 본사는 전체. 학생 이름 순서. */
export async function loadTaskAssignments(db: SupabaseClient, viewer: InquiryViewer, taskId: string): Promise<ListResult<AssignmentProgress>> {
  if (viewer.role === 'student') return { available: true, loadFailed: false, rows: [] }
  if (viewer.role === 'teacher' && !viewer.academyId) return { available: true, loadFailed: false, rows: [] }
  try {
    let q = db.from('inquiry_assignments').select(ASSIGNMENT_COLUMNS).eq('task_id', taskId)
    if (viewer.role === 'teacher') q = q.eq('academy_id', viewer.academyId as string)
    const { data: asg, error } = await q.order('created_at')
    if (error) return unavailable(error, 'inquiry_assignments')
    const assignments = (asg ?? []) as AssignmentRow[]
    if (assignments.length === 0) return { available: true, loadFailed: false, rows: [] }
    const ids = assignments.map((a) => a.id)
    const studentIds = [...new Set(assignments.map((a) => a.student_id))]
    const [rp, pr] = await Promise.all([
      db.from('inquiry_reports').select(REPORT_COLUMNS).in('assignment_id', ids).order('assignment_id'),
      db.from('profiles').select('id, name').in('id', studentIds).order('id'),
    ])
    if (rp.error) return unavailable(rp.error, 'inquiry_reports')
    if (pr.error) return unavailable(pr.error, 'profiles')
    const reports = new Map(((rp.data ?? []) as ReportRow[]).map((r) => [r.assignment_id, r]))
    const names = new Map(((pr.data ?? []) as { id: string; name: string }[]).map((p) => [p.id, p.name]))
    const rows = assignments.map((a) => {
      const reportRow = reports.get(a.id) ?? null
      const report = reportFromRow(reportRow)
      const outline = outlineFromRow(a)
      return {
        assignmentId: a.id, studentId: a.student_id, studentName: names.get(a.student_id) ?? '', outline,
        status: assignmentStatusOf(a, reportRow ? report : null), progress: progressOf(outline, report),
        updatedAt: reportRow?.updated_at ?? null, submittedAt: reportRow?.submitted_at ?? null,
      }
    })
    rows.sort((a, b) => a.studentName.localeCompare(b.studentName, 'ko'))
    return { available: true, loadFailed: false, rows }
  } catch (e) {
    return unavailable(e, 'inquiry_assignments')
  }
}

/** 과제별 우리 원 배정 수(원장 목록용). 표가 없거나 읽지 못하면 빈 표. */
export async function countAssignmentsByTask(db: SupabaseClient, viewer: InquiryViewer): Promise<Map<string, number>> {
  const counts = new Map<string, number>()
  if (viewer.role !== 'teacher' || !viewer.academyId) return counts
  try {
    const { data, error } = await db.from('inquiry_assignments').select('task_id').eq('academy_id', viewer.academyId).order('task_id')
    if (error) return counts
    for (const r of (data ?? []) as { task_id: string }[]) counts.set(r.task_id, (counts.get(r.task_id) ?? 0) + 1)
  } catch { /* 안내는 loadTasks 가 한다 */ }
  return counts
}

// ── 배정 하나(원장 보고서 보기 · 학생 쓰기) ─────────────────────────────

export type AssignmentView = {
  assignment: { id: string; taskId: string; academyId: string; studentId: string; outline: Outline; status: AssignmentStatus }
  task: TaskSummary
  report: Report
  /** 저장된 보고서 줄이 있는가(없으면 학생이 아직 쓰기 전). */
  hasReport: boolean
  studentName: string
  academyName: string
}
export type AssignmentViewResult = { ok: true; view: AssignmentView } | { ok: false; reason: 'forbidden' | 'not-found' | 'load-failed' | 'unavailable' }

/** 원장(자기 원)·본사·학생(본인) 공통: 배정의 원·학생을 먼저 확인하고 나서만 과제·보고서를 읽는다. */
export async function loadAssignmentView(db: SupabaseClient, viewer: InquiryViewer, assignmentId: string): Promise<AssignmentViewResult> {
  try {
    const { data: a, error } = await db.from('inquiry_assignments').select(ASSIGNMENT_COLUMNS).eq('id', assignmentId).maybeSingle()
    if (error) return { ok: false, reason: isMissingTable(error) ? 'unavailable' : 'load-failed' }
    const row = (a ?? null) as AssignmentRow | null
    if (!row) return { ok: false, reason: 'not-found' }
    if (!canViewAssignment(viewer, row)) return { ok: false, reason: 'forbidden' }

    const [t, r, p, ac] = await Promise.all([
      db.from('inquiry_tasks').select(TASK_COLUMNS).eq('id', row.task_id).maybeSingle(),
      db.from('inquiry_reports').select(REPORT_COLUMNS).eq('assignment_id', row.id).maybeSingle(),
      db.from('profiles').select('id, name').eq('id', row.student_id).maybeSingle(),
      db.from('academies').select('id, name').eq('id', row.academy_id).maybeSingle(),
    ])
    if (t.error || r.error || p.error || ac.error) return { ok: false, reason: 'load-failed' }
    if (!t.data) return { ok: false, reason: 'not-found' }
    const reportRow = (r.data ?? null) as ReportRow | null
    const task = taskFromRow(t.data as TaskRow)
    const report = reportFromRow(reportRow)
    return {
      ok: true,
      view: {
        assignment: { id: row.id, taskId: row.task_id, academyId: row.academy_id, studentId: row.student_id, outline: outlineFromRow(row), status: assignmentStatusOf(row, reportRow ? report : null) },
        task, report, hasReport: !!reportRow,
        studentName: (p.data as { name?: string } | null)?.name ?? '',
        academyName: (ac.data as { name?: string } | null)?.name ?? '',
      },
    }
  } catch (e) {
    return { ok: false, reason: isMissingTable(e) ? 'unavailable' : 'load-failed' }
  }
}

export function canViewAssignment(viewer: InquiryViewer, row: Pick<AssignmentRow, 'academy_id' | 'student_id'>): boolean {
  if (viewer.role === 'admin') return true
  if (viewer.role === 'teacher') return !!viewer.academyId && viewer.academyId === row.academy_id
  return viewer.userId === row.student_id
}

// ── 학생: 내 배정 목록 ─────────────────────────────────────────────────

export type StudentAssignmentCard = {
  assignmentId: string; title: string; subtitle: string; subjects: string[]; status: AssignmentStatus
  progress: { filled: number; total: number }; createdAt: string | null
}

export async function loadStudentAssignments(db: SupabaseClient, studentId: string): Promise<ListResult<StudentAssignmentCard>> {
  try {
    const { data: asg, error } = await db.from('inquiry_assignments').select(ASSIGNMENT_COLUMNS).eq('student_id', studentId).order('created_at', { ascending: false })
    if (error) return unavailable(error, 'inquiry_assignments')
    const assignments = (asg ?? []) as AssignmentRow[]
    if (assignments.length === 0) return { available: true, loadFailed: false, rows: [] }
    const taskIds = [...new Set(assignments.map((a) => a.task_id))]
    const [t, r] = await Promise.all([
      db.from('inquiry_tasks').select(TASK_COLUMNS).in('id', taskIds).order('id'),
      db.from('inquiry_reports').select(REPORT_COLUMNS).in('assignment_id', assignments.map((a) => a.id)).order('assignment_id'),
    ])
    if (t.error) return unavailable(t.error, 'inquiry_tasks')
    if (r.error) return unavailable(r.error, 'inquiry_reports')
    const tasks = new Map(((t.data ?? []) as TaskRow[]).map((row) => [row.id, taskFromRow(row)]))
    const reports = new Map(((r.data ?? []) as ReportRow[]).map((row) => [row.assignment_id, row]))
    const rows: StudentAssignmentCard[] = []
    for (const a of assignments) {
      const task = tasks.get(a.task_id)
      // 게시가 취소된 과제는 학생에게 보이지 않는다(RLS) — 목록에서도 뺀다
      if (!task || !task.task) continue
      const reportRow = reports.get(a.id) ?? null
      const report = reportFromRow(reportRow)
      const outline = outlineFromRow(a)
      rows.push({
        assignmentId: a.id, title: task.task.title, subtitle: task.task.subtitle, subjects: task.task.subjects,
        status: assignmentStatusOf(a, reportRow ? report : null), progress: progressOf(outline, report), createdAt: a.created_at,
      })
    }
    return { available: true, loadFailed: false, rows }
  } catch (e) {
    return unavailable(e, 'inquiry_assignments')
  }
}
