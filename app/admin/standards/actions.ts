'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getSessionProfile } from '@/lib/auth/session'

export async function verifyStandard(id: string, verified: boolean, _formData?: FormData) {
  const s = await getSessionProfile()
  if (s.role !== 'admin') throw new Error('forbidden')
  const supabase = await createClient()
  await supabase.from('standards').update({
    verified_at: verified ? new Date().toISOString() : null,
    verified_by: verified ? s.userId : null,
  }).eq('id', id)
  revalidatePath('/admin/standards')
}

export async function setSourcePage(id: string, page: number | null, _formData?: FormData) {
  const s = await getSessionProfile()
  if (s.role !== 'admin') throw new Error('forbidden')
  const supabase = await createClient()
  await supabase.from('standards').update({ source_page: page }).eq('id', id)
  revalidatePath('/admin/standards')
}
