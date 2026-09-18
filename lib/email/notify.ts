import 'server-only'
import { Resend } from 'resend'
import type { Inquiry } from '@/lib/inquiries/validate'
import { INQUIRY_EMAIL_FROM } from '@/lib/email/config'
import { email } from '@/content/site'

export async function notifyInquiry(i: Inquiry) {
  const key = process.env.RESEND_API_KEY
  const to = process.env.INQUIRY_NOTIFY_EMAIL
  if (!key || !to) return
  const resend = new Resend(key)
  const c = email.inquiry
  await resend.emails.send({
    from: INQUIRY_EMAIL_FROM,
    to, subject: c.subject(i.region, i.name),
    text: `${c.labels.name}: ${i.name}\n${c.labels.phone}: ${i.phone}\n${c.labels.region}: ${i.region}\n\n${i.message}`,
  }).catch((e: unknown) => console.error('[inquiry email] send failed:', e instanceof Error ? e.message : e))
}
