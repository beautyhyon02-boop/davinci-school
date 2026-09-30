'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getSessionProfile } from '@/lib/auth/session'
import { saveReportPatch, submitReport, type ReportPatch, type SaveReason } from '@/lib/inquiry/save'
import type { InquiryViewer } from '@/lib/inquiry/data'
import { app } from '@/content/site'

const copy = app.inquiry.student
export type StudentSaveResult = { ok: true; updatedAt: string } | { ok: false; error: string }
export type StudentSubmitResult = { ok: true } | { ok: false; error: string }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ERRORS: Partial<Record<SaveReason, string>> = {
  forbidden: copy.errors.forbidden, 'not-found': copy.errors.notFound, invalid: copy.errors.invalid, 'save-failed': copy.errors.saveFailed,
  unavailable: app.inquiry.unavailable, submitted: copy.errors.submitted,
}

async function studentOrNull(): Promise<InquiryViewer | null> {
  const s = await getSessionProfile()
  return s.role === 'student' ? { role: 'student', userId: s.userId, academyId: s.academyId } : null
}

/** 자동 저장(칸 하나·탐구 문제·읽은 자료·희망 진로). 본인 배정·제출 전에만(lib/inquiry/save.ts 가 확인). */
export async function saveInquiryPatch(assignmentId: string, patch: ReportPatch): Promise<StudentSaveResult> {
  const viewer = await studentOrNull()
  if (!viewer) return { ok: false, error: copy.errors.forbidden }
  if (!UUID.test(String(assignmentId))) return { ok: false, error: copy.errors.notFound }
  const db = await createClient()
  const r = await saveReportPatch(db, viewer, assignmentId, patch, new Date().toISOString())
  if (!r.ok) return { ok: false, error: ERRORS[r.reason] ?? copy.errors.saveFailed }
  return { ok: true, updatedAt: r.updatedAt }
}

/** [제출]: 그 뒤로는 읽기 전용(원장이 [다시 쓰게 하기]로 연다). */
export async function submitInquiry(assignmentId: string): Promise<StudentSubmitResult> {
  const viewer = await studentOrNull()
  if (!viewer) return { ok: false, error: copy.errors.forbidden }
  if (!UUID.test(String(assignmentId))) return { ok: false, error: copy.errors.notFound }
  const db = await createClient()
  // 배정 줄의 상태는 학생 정책이 없어 service role 로 바꾼다(본인 배정 확인은 submitReport 안에서 먼저 한다)
  const { createAdminClient } = await import('@/lib/supabase/admin')
  const r = await submitReport(db, createAdminClient(), viewer, assignmentId, new Date().toISOString())
  if (!r.ok) return { ok: false, error: ERRORS[r.reason] ?? copy.errors.saveFailed }
  revalidatePath('/student/inquiry')
  revalidatePath(`/student/inquiry/${assignmentId}`)
  return { ok: true }
}
