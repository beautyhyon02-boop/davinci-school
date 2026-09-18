import 'server-only'
import { Resend } from 'resend'
import type { Inquiry } from '@/lib/inquiries/validate'
import { INQUIRY_EMAIL_FROM } from '@/lib/email/config'

export async function notifyInquiry(i: Inquiry) {
  const key = process.env.RESEND_API_KEY
  const to = process.env.INQUIRY_NOTIFY_EMAIL
  if (!key || !to) return
  const resend = new Resend(key)
  await resend.emails.send({
    from: INQUIRY_EMAIL_FROM,
    to, subject: `[가맹문의] ${i.region} ${i.name}`,
    text: `이름: ${i.name}\n연락처: ${i.phone}\n지역: ${i.region}\n\n${i.message}`,
  }).catch(() => {})
}
