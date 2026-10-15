'use server'
import { revalidatePath } from 'next/cache'
import { getSessionProfile } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { parseRedMeta } from '@/lib/red/meta'
import { app } from '@/content/site'

const copy = app.adminRed
type Result = { ok: boolean; error?: string }

async function assertAdmin() {
  const s = await getSessionProfile()
  if (s.role !== 'admin') throw new Error('forbidden')
  return s
}
const refresh = () => { revalidatePath('/admin/red'); revalidatePath('/programs/inquiry') }

async function patchRow(id: string, patch: Record<string, unknown>): Promise<Result> {
  const { error } = await createAdminClient().from('resources').update(patch).eq('id', id)
  if (error) return { ok: false, error: copy.errors.db_failed }
  refresh()
  return { ok: true }
}

/** 게시(PRD): 원장에게 보인다. 보류 사유는 지운다. */
export async function publishRed(id: string): Promise<Result> {
  await assertAdmin()
  return patchRow(id, { status: 'published', published_at: new Date().toISOString(), hold_note: '' })
}

/** 보류(PRD): 사유와 함께. 원장에게 안 보인다. */
export async function holdRed(id: string, note: string): Promise<Result> {
  await assertAdmin()
  const trimmedNote = String(note ?? '').trim()
  if (trimmedNote.length > 200) return { ok: false, error: copy.errors.invalid }
  return patchRow(id, { status: 'hold', hold_note: trimmedNote })
}

/** 게시 취소(PRD): 검수대기로 돌아간다. */
export async function unpublishRed(id: string): Promise<Result> {
  await assertAdmin()
  return patchRow(id, { status: 'pending', published_at: null })
}

/**
 * 메타 수정(PRD US-006): 구분·종류·시리즈·과목·제목·요약·날짜·참고 링크.
 * 세트(교사용+학생용)는 구분·종류·시리즈·과목·제목이 같아야 한 줄로 묶이므로, 짝 줄(옛 열쇠 + 다른 kind)도 같은 값으로 함께 고친다(검토 2026-10-16 — 세트가 둘로 갈라지지 않게).
 */
export async function updateRedMeta(id: string, formData: FormData): Promise<Result> {
  await assertAdmin()
  const meta = parseRedMeta(formData)
  if (!meta) return { ok: false, error: copy.errors.invalid }
  const admin = createAdminClient()
  const { data: row } = await admin.from('resources').select('id, category, red_type, series, subject, title, kind').match({ id }).maybeSingle()
  if (!row) return { ok: false, error: copy.errors.db_failed }
  const { data: sibling } = await admin.from('resources').select('id')
    .match({ category: row.category, red_type: row.red_type, series: row.series, subject: row.subject, title: row.title, kind: row.kind === 'teacher' ? 'student' : 'teacher' }).maybeSingle()
  const first = await patchRow(id, meta)
  if (!first.ok) return first
  if (sibling && sibling.id !== id) return patchRow(sibling.id, meta)
  return first
}

/** 지우기 — 저장소 파일을 먼저 지우고 줄을 지운다(줄이 남으면 다시 지울 수 있고, 파일만 남는 반쪽은 없게). */
export async function deleteRedReport(id: string): Promise<Result> {
  await assertAdmin()
  const admin = createAdminClient()
  const { data: row } = await admin.from('resources').select('storage_path').eq('id', id).maybeSingle()
  if (!row) return { ok: false, error: copy.errors.db_failed }
  const { error: rmErr } = await admin.storage.from('resources').remove([row.storage_path])
  if (rmErr) return { ok: false, error: copy.errors.upload_failed }
  const { error } = await admin.from('resources').delete().eq('id', id)
  if (error) return { ok: false, error: copy.errors.db_failed }
  refresh()
  return { ok: true }
}
