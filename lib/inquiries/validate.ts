import { z } from 'zod'
import { pages } from '@/content/site'

const errors = pages.franchise.errors

const schema = z.object({
  name: z.string().trim().min(1, errors.name).max(50),
  phone: z.string().trim().transform(s => s.replace(/\D/g, '')).refine(d => d.length >= 10 && d.length <= 11, errors.phone)
    .transform(d => d.length === 11 ? `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}` : `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`),
  region: z.string().trim().min(1, errors.region).max(50),
  message: z.string().trim().max(2000).optional().default(''),
})
export type Inquiry = z.infer<typeof schema>

export function parseInquiry(formData: FormData): { ok: true; data: Inquiry } | { ok: false; error: string } {
  const r = schema.safeParse({
    name: formData.get('name') ?? '', phone: formData.get('phone') ?? '',
    region: formData.get('region') ?? '', message: formData.get('message') ?? '',
  })
  if (!r.success) return { ok: false, error: r.error.issues[0]?.message ?? errors.generic }
  return { ok: true, data: r.data }
}
