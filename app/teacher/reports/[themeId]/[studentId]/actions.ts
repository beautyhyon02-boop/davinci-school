'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getSessionProfile } from '@/lib/auth/session'
import { app } from '@/content/site'
import { saveUnitReport, reopenUnitReport, type SaveReason } from '@/lib/classroom/report-save'
import type { ReportViewer } from '@/lib/classroom/report-data'

const copy = app.classroom.report
export type ReportActionResult = { ok: true } | { ok: false; error: string }

const ERRORS: Record<SaveReason, string> = {
  forbidden: copy.errors.forbidden, 'not-found': copy.errors.notFound, 'no-assignments': copy.errors.noAssignments,
  invalid: copy.errors.invalid, 'save-failed': copy.errors.saveFailed, 'no-report': copy.errors.noReport,
  'load-failed': copy.errors.loadFailed, 'already-confirmed': copy.errors.alreadyConfirmed,
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** 원장(자기 원이 있는) 또는 본사만. 학생의 원 확인은 lib/classroom/report-save.ts 가 읽기·쓰기 전에 한다. */
async function viewerOrNull(): Promise<ReportViewer | null> {
  const s = await getSessionProfile()
  if (s.role === 'admin') return { role: 'admin', userId: s.userId, academyId: null }
  if (s.role === 'teacher' && s.academyId) return { role: 'teacher', userId: s.userId, academyId: s.academyId }
  return null
}

async function save(themeId: string, studentId: string, subjects: string[], edits: Record<string, string>, status: 'draft' | 'confirmed'): Promise<ReportActionResult> {
  const viewer = await viewerOrNull()
  if (!viewer) return { ok: false, error: copy.errors.forbidden }
  if (!UUID.test(String(themeId)) || !UUID.test(String(studentId))) return { ok: false, error: copy.errors.notFound }
  const db = await createClient()
  // 숫자는 받지 않는다 — 넣을 과목과 고친 문장만. 본문은 서버가 DB 자료로 다시 만든다.
  const r = await saveUnitReport({ db, viewer, themeId, studentId, subjects, edits, status, copy: copy.build, now: new Date().toISOString() })
  if (!r.ok) return { ok: false, error: ERRORS[r.reason] }
  revalidatePath('/teacher/reports')
  revalidatePath(`/teacher/reports/${themeId}/${studentId}`)
  return { ok: true }
}

/** [초안 저장] */
export async function saveReportDraft(themeId: string, studentId: string, subjects: string[], edits: Record<string, string>): Promise<ReportActionResult> {
  return save(themeId, studentId, subjects, edits, 'draft')
}

/** [확정]: 지금 화면의 과목·문장으로 저장하면서 확정한다. */
export async function confirmReport(themeId: string, studentId: string, subjects: string[], edits: Record<string, string>): Promise<ReportActionResult> {
  return save(themeId, studentId, subjects, edits, 'confirmed')
}

/** [다시 고치기]: 확정을 풀어 초안으로. */
export async function reopenReport(themeId: string, studentId: string): Promise<ReportActionResult> {
  const viewer = await viewerOrNull()
  if (!viewer) return { ok: false, error: copy.errors.forbidden }
  if (!UUID.test(String(themeId)) || !UUID.test(String(studentId))) return { ok: false, error: copy.errors.notFound }
  const db = await createClient()
  const r = await reopenUnitReport({ db, viewer, themeId, studentId, now: new Date().toISOString() })
  if (!r.ok) return { ok: false, error: ERRORS[r.reason] }
  revalidatePath('/teacher/reports')
  revalidatePath(`/teacher/reports/${themeId}/${studentId}`)
  return { ok: true }
}
