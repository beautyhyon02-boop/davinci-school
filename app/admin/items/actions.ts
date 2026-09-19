'use server'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getSessionProfile } from '@/lib/auth/session'
import { parseTheme } from '@/lib/studio/themes'
import { app } from '@/content/site'

const errors = app.studio.errors

async function assertAdmin() {
  const s = await getSessionProfile()
  if (s.role !== 'admin') throw new Error('forbidden')
  return s
}

export async function createTheme(_prev: { error?: string } | undefined, formData: FormData) {
  await assertAdmin()
  const r = parseTheme(formData)
  if (!r.ok) return { error: r.error }
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('themes')
    .insert({ title: r.data.title, level: r.data.level, grade: r.data.grade, subjects: r.data.subjects })
    .select('id')
    .single()
  if (error || !data) return { error: errors.saveFailed }
  redirect(`/admin/items/${data.id}`)
}
