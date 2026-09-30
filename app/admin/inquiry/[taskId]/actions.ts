'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getSessionProfile } from '@/lib/auth/session'
import { saveTask, setTaskStatus, type SaveReason } from '@/lib/inquiry/save'
import { parseTaskJson, type InquiryTask } from '@/lib/inquiry/schema'
import { gateMessages } from '@/lib/inquiry/publish-gate'
import { app } from '@/content/site'

const copy = app.inquiry.admin
export type TaskActionResult = { ok: true; task?: InquiryTask } | { ok: false; error: string; missing?: string[] }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ERRORS: Partial<Record<SaveReason, string>> = {
  forbidden: copy.errors.forbidden, 'not-found': copy.errors.notFound, invalid: copy.errors.invalid,
  'save-failed': copy.errors.saveFailed, unavailable: app.inquiry.unavailable, gate: copy.errors.gate,
}

async function adminOrNull() {
  const s = await getSessionProfile()
  return s.role === 'admin' ? s : null
}

function revalidate(taskId: string) {
  revalidatePath('/admin/inquiry')
  revalidatePath(`/admin/inquiry/${taskId}`)
  revalidatePath('/teacher/inquiry')
}

/** [저장]: 화면의 과제 전체를 받는다. 확인함 기록(누가·언제)은 서버가 찍는다(lib/inquiry/save.ts saveTask). */
export async function saveInquiryTask(taskId: string, input: unknown): Promise<TaskActionResult> {
  const s = await adminOrNull()
  if (!s) return { ok: false, error: copy.errors.forbidden }
  if (!UUID.test(String(taskId))) return { ok: false, error: copy.errors.notFound }
  const db = await createClient()
  const r = await saveTask(db, taskId, input, { name: s.name, now: new Date().toISOString() })
  if (!r.ok) return { ok: false, error: ERRORS[r.reason] ?? copy.errors.saveFailed }
  revalidate(taskId)
  return { ok: true, task: r.task }
}

/** [JSON 불러오기]: 붙여넣은 글을 과제 스키마로 읽어 저장한다(확인함은 비운다 — 본사가 링크를 열어 보고 체크한다). */
export async function importInquiryTask(taskId: string, json: string): Promise<TaskActionResult> {
  const s = await adminOrNull()
  if (!s) return { ok: false, error: copy.errors.forbidden }
  if (!UUID.test(String(taskId))) return { ok: false, error: copy.errors.notFound }
  const parsed = parseTaskJson(String(json ?? ''))
  if (!parsed.ok) return { ok: false, error: parsed.error === 'json' ? copy.errors.invalidJson : copy.errors.invalid }
  const db = await createClient()
  const r = await saveTask(db, taskId, parsed.task, { name: s.name, now: new Date().toISOString() })
  if (!r.ok) return { ok: false, error: ERRORS[r.reason] ?? copy.errors.saveFailed }
  revalidate(taskId)
  return { ok: true, task: r.task }
}

/** [게시]·[게시 취소]: 관문은 저장된 줄로 본다 — 먼저 [저장]을 눌러야 한다(화면이 안내). */
export async function setInquiryTaskStatus(taskId: string, status: 'published' | 'draft'): Promise<TaskActionResult> {
  const s = await adminOrNull()
  if (!s) return { ok: false, error: copy.errors.forbidden }
  if (!UUID.test(String(taskId))) return { ok: false, error: copy.errors.notFound }
  const db = await createClient()
  const r = await setTaskStatus(db, taskId, status, new Date().toISOString())
  if (!r.ok) return { ok: false, error: ERRORS[r.reason] ?? copy.errors.saveFailed, missing: r.missing ? gateMessages(r.missing, app.inquiry.gate) : undefined }
  revalidate(taskId)
  return { ok: true }
}
