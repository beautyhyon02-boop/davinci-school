'use server'
import { createClient } from '@/lib/supabase/server'
import { parseInquiry } from '@/lib/inquiries/validate'
import { notifyInquiry } from '@/lib/email/notify'
import { pages } from '@/content/site'

export async function submitInquiry(_prev: { ok?: boolean; error?: string } | undefined, formData: FormData) {
  const r = parseInquiry(formData)
  if (!r.ok) return { error: r.error }
  const supabase = await createClient()
  const { error } = await supabase.from('franchise_inquiries').insert(r.data)
  if (error) return { error: pages.franchise.errors.submitFailed }
  await notifyInquiry(r.data)
  return { ok: true }
}
