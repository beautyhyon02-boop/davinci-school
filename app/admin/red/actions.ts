'use server'
import { revalidatePath } from 'next/cache'
import { getSessionProfile } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { app } from '@/content/site'

const copy = app.adminRed

async function assertAdmin() {
  const s = await getSessionProfile()
  if (s.role !== 'admin') throw new Error('forbidden')
  return s
}
const refresh = () => { revalidatePath('/admin/red'); revalidatePath('/programs/inquiry') }

/** 숨기기/보이기 — 원장 목록에서만 빠지고 파일·줄은 남는다. */
export async function setRedHidden(id: string, hidden: boolean): Promise<{ ok: boolean; error?: string }> {
  await assertAdmin()
  const { error } = await createAdminClient().from('resources').update({ hidden }).eq('id', id)
  if (error) return { ok: false, error: copy.errors.db_failed }
  refresh()
  return { ok: true }
}

/** 지우기 — 저장소 파일을 먼저 지우고 줄을 지운다(줄이 남으면 다시 지울 수 있고, 파일만 남는 반쪽은 없게). */
export async function deleteRedReport(id: string): Promise<{ ok: boolean; error?: string }> {
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
