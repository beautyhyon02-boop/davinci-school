'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getSessionProfile } from '@/lib/auth/session'

export async function setInquiryStatus(id: string, status: 'new' | 'contacted' | 'done') {
  const s = await getSessionProfile()
  if (s.role !== 'admin') throw new Error('forbidden')
  const supabase = await createClient()
  await supabase.from('franchise_inquiries').update({ status }).eq('id', id)
  revalidatePath('/admin/inquiries')
}
