'use server'
import { createClient } from '@/lib/supabase/server'
import { isHoneypotTripped, parseInquiry } from '@/lib/inquiries/validate'
import { notifyInquiry } from '@/lib/email/notify'
import { pages } from '@/content/site'

export async function submitInquiry(_prev: { ok?: boolean; error?: string } | undefined, formData: FormData) {
  // 봇이 허니팟을 채웠으면 저장·알림 없이 성공한 것처럼 응답한다.
  if (isHoneypotTripped(formData)) return { ok: true }
  const r = parseInquiry(formData)
  if (!r.ok) return { error: r.error }
  const supabase = await createClient()
  const { error } = await supabase.from('franchise_inquiries').insert(r.data)
  if (error) return { error: pages.franchise.errors.submitFailed }
  await notifyInquiry(r.data)
  return { ok: true }
}
