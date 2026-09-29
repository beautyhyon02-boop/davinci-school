import type { SupabaseClient } from '@supabase/supabase-js'
import { buildUnitReport, type UnitReportCopy } from './report'
import { UnitReportBody } from './report-schema'
import { applyEdits, sanitizeEdits } from './report-edit'
import { loadReportSource, canViewStudent, type ReportViewer } from './report-data'

/**
 * 단원 리포트 저장·확정·다시 고치기(설계 §5.4). 서버 동작이 역할을 확인한 뒤 부른다. db 는 로그인한 사람의 클라이언트
 * (RLS 0014: 원장은 자기 원 학생의 리포트만, 본사는 전체).
 *
 * 화면에서 온 숫자는 쓰지 않는다 — 받는 것은 넣을 과목 이름과 고친 문장뿐이고, 본문은 여기서 DB 자료로 다시 만든다.
 * 학생의 원 확인은 loadReportSource 가 가장 먼저 한다(통과 전에는 아무것도 읽거나 쓰지 않는다).
 */

/** 'already-confirmed' = 이미 확정한 리포트(다른 창에서 확정했을 수 있다) — 덮어쓰지 않고 [다시 고치기]를 안내한다. */
export type SaveReason = 'forbidden' | 'not-found' | 'no-assignments' | 'load-failed' | 'invalid' | 'save-failed' | 'no-report' | 'already-confirmed'
export type SaveResult = { ok: true; body: UnitReportBody } | { ok: false; reason: SaveReason }

export async function saveUnitReport(a: {
  db: SupabaseClient; viewer: ReportViewer; themeId: string; studentId: string
  /** 넣을 과목(R-4). 배정되지 않은 과목 이름은 버린다. 남는 과목이 없으면 배정된 과목 전부. */
  subjects: unknown; edits: unknown
  status: 'draft' | 'confirmed'; copy: UnitReportCopy; now: string
}): Promise<SaveResult> {
  const loaded = await loadReportSource(a.db, a.viewer, a.themeId, a.studentId)
  if (!loaded.ok) return loaded
  const src = loaded.source
  if (!src.reportsAvailable) return { ok: false, reason: 'save-failed' }
  // 이미 확정한 리포트는 저장으로 덮어쓰지 않는다 — 확정을 푸는 길은 [다시 고치기] 하나뿐이다.
  // 저장된 본문을 읽지 못한 줄(body null)은 화면이 「저장 전」으로 보여 주므로 새 본문으로 덮어쓴다.
  if (src.stored?.status === 'confirmed' && src.stored.body) return { ok: false, reason: 'already-confirmed' }
  const asked = Array.isArray(a.subjects) ? a.subjects.filter((s): s is string => typeof s === 'string') : []
  const chosen = src.subjects.filter((s) => asked.includes(s))
  const include = chosen.length ? chosen : src.subjects

  const fresh = buildUnitReport({ ...src.input, includeSubjects: include }, a.copy)
  const parsed = UnitReportBody.safeParse(applyEdits(fresh, sanitizeEdits(a.edits)))
  if (!parsed.success) return { ok: false, reason: 'invalid' }

  const confirmed = a.status === 'confirmed'
  const row = {
    academy_id: src.student.academyId, student_id: a.studentId, theme_id: a.themeId,
    subjects: parsed.data.included_subjects, body: parsed.data, status: a.status,
    drafted_by: a.viewer.userId, drafted_at: a.now,
    confirmed_by: confirmed ? a.viewer.userId : null, confirmed_at: confirmed ? a.now : null,
    updated_at: a.now,
  }
  try {
    if (!src.stored) {
      // 그 사이 다른 창이 먼저 저장했으면 unique(student_id, theme_id) 에 걸려 실패한다 — 덮어쓰지 않는다
      const { error } = await a.db.from('unit_reports').insert(row)
      if (error) return { ok: false, reason: 'save-failed' }
    } else {
      let q = a.db.from('unit_reports').update(row).eq('student_id', a.studentId).eq('theme_id', a.themeId)
      // 읽은 뒤 저장하기 전에 다른 창이 확정했으면 고쳐지는 줄이 없다(confirmed_at 이 비어 있는 줄만 고친다)
      if (src.stored.body) q = q.is('confirmed_at', null)
      const { data, error } = await q.select('id')
      if (error || !data) return { ok: false, reason: 'save-failed' }
      if (data.length === 0) return { ok: false, reason: src.stored.body ? 'already-confirmed' : 'save-failed' }
    }
  } catch {
    return { ok: false, reason: 'save-failed' }
  }
  return { ok: true, body: parsed.data }
}

/** [다시 고치기]: 확정을 풀어 초안으로. 본문은 그대로 둔다. */
export async function reopenUnitReport(a: { db: SupabaseClient; viewer: ReportViewer; themeId: string; studentId: string; now: string }): Promise<{ ok: true } | { ok: false; reason: SaveReason }> {
  const { data: st } = await a.db.from('students').select('profile_id, academy_id').eq('profile_id', a.studentId).maybeSingle()
  const student = (st ?? null) as { profile_id: string; academy_id: string } | null
  if (!student) return { ok: false, reason: 'not-found' }
  if (!canViewStudent(a.viewer, student.academy_id)) return { ok: false, reason: 'forbidden' }
  try {
    const { data, error } = await a.db.from('unit_reports').update({ status: 'draft', confirmed_by: null, confirmed_at: null, updated_at: a.now })
      .eq('student_id', a.studentId).eq('theme_id', a.themeId).eq('academy_id', student.academy_id).select('id')
    if (error || !data) return { ok: false, reason: 'save-failed' }
    if (data.length === 0) return { ok: false, reason: 'no-report' }
    return { ok: true }
  } catch {
    return { ok: false, reason: 'save-failed' }
  }
}
