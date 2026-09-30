'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getSessionProfile } from '@/lib/auth/session'
import { assignStudents, applyOutline, reopenAssignment, type SaveReason } from '@/lib/inquiry/save'
import type { InquiryViewer } from '@/lib/inquiry/data'
import { app } from '@/content/site'

const copy = app.inquiry.teacher
export type TeacherActionResult = { ok: true; count: number } | { ok: false; error: string }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ERRORS: Partial<Record<SaveReason, string>> = {
  forbidden: copy.errors.forbidden, 'not-found': copy.errors.notFound, invalid: copy.errors.saveFailed, 'save-failed': copy.errors.saveFailed,
  unavailable: app.inquiry.unavailable, 'not-published': copy.errors.notPublished, 'no-students': copy.errors.noStudents,
}

/** 원장(자기 원이 있는)만. 본사는 원이 없어 배정하지 않는다(/teacher/** 는 원장 레이아웃). */
async function teacherOrNull() {
  const s = await getSessionProfile()
  return s.role === 'teacher' && s.academyId ? { userId: s.userId, academyId: s.academyId } : null
}

function revalidate(taskId: string) {
  revalidatePath('/teacher/inquiry')
  revalidatePath(`/teacher/inquiry/${taskId}`)
  revalidatePath('/student/inquiry')
}

/** [배정]: 체크한 학생에게 과제를 연다(목차는 폼의 기본값 그대로). */
export async function assignInquiry(taskId: string, studentIds: string[], outline: unknown): Promise<TeacherActionResult> {
  const t = await teacherOrNull()
  if (!t) return { ok: false, error: copy.errors.forbidden }
  if (!UUID.test(String(taskId))) return { ok: false, error: copy.errors.notFound }
  const db = await createClient()
  const r = await assignStudents(db, { taskId, academyId: t.academyId, studentIds: Array.isArray(studentIds) ? studentIds.map(String) : [], outline, assignedBy: t.userId, now: new Date().toISOString() })
  if (!r.ok) return { ok: false, error: ERRORS[r.reason] ?? copy.errors.saveFailed }
  revalidate(taskId)
  return { ok: true, count: r.assigned }
}

/** 목차 [확인]: 고른 배정에 같은 목차를 적용한다. */
export async function confirmOutline(taskId: string, assignmentIds: string[], outline: unknown): Promise<TeacherActionResult> {
  const t = await teacherOrNull()
  if (!t) return { ok: false, error: copy.errors.forbidden }
  if (!UUID.test(String(taskId))) return { ok: false, error: copy.errors.notFound }
  const db = await createClient()
  const r = await applyOutline(db, { taskId, academyId: t.academyId, assignmentIds: Array.isArray(assignmentIds) ? assignmentIds.map(String) : [], outline, now: new Date().toISOString() })
  if (!r.ok) return { ok: false, error: ERRORS[r.reason] ?? copy.errors.saveFailed }
  revalidate(taskId)
  for (const id of assignmentIds) revalidatePath(`/student/inquiry/${id}`)
  return { ok: true, count: r.applied }
}

/** [다시 쓰게 하기] */
export async function reopenInquiry(taskId: string, assignmentId: string): Promise<TeacherActionResult> {
  const t = await teacherOrNull()
  if (!t) return { ok: false, error: copy.errors.forbidden }
  if (!UUID.test(String(taskId)) || !UUID.test(String(assignmentId))) return { ok: false, error: copy.errors.notFound }
  const viewer: InquiryViewer = { role: 'teacher', userId: t.userId, academyId: t.academyId }
  const db = await createClient()
  const r = await reopenAssignment(db, viewer, assignmentId, new Date().toISOString())
  if (!r.ok) return { ok: false, error: ERRORS[r.reason] ?? copy.errors.saveFailed }
  revalidate(taskId)
  revalidatePath(`/teacher/inquiry/${taskId}/${assignmentId}`)
  revalidatePath(`/student/inquiry/${assignmentId}`)
  return { ok: true, count: 1 }
}
