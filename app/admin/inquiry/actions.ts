'use server'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getSessionProfile } from '@/lib/auth/session'
import { createTask } from '@/lib/inquiry/save'
import { app } from '@/content/site'

const errors = app.inquiry.admin.errors
export type NewTaskState = { error?: string } | undefined

/** [새 과제]: 빈 초안을 만들고 그 화면으로 간다. */
export async function newInquiryTask(_prev: NewTaskState): Promise<NewTaskState> {
  const s = await getSessionProfile()
  if (s.role !== 'admin') return { error: errors.forbidden }
  const db = await createClient()
  const r = await createTask(db, s.userId)
  if (!r.ok) return { error: r.reason === 'unavailable' ? app.inquiry.unavailable : errors.saveFailed }
  redirect(`/admin/inquiry/${r.id}`)
}
