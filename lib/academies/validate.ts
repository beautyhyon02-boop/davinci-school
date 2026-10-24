import { z } from 'zod'
import { app } from '@/content/site'
import { PLANS, DEFAULT_PLAN } from '@/lib/academies/plan'

const errors = app.adminAcademies.errors

const schema = z.object({
  code: z.string().trim().toLowerCase().regex(/^[a-z0-9]{3,12}$/, errors.codeInvalid),
  name: z.string().trim().min(1, errors.nameRequired),
  region: z.string().trim().optional().default(''),
  director_phone: z.string().trim().optional().default(''),
  // 가맹 상품(PRD 2026-10-20): 본사가 계정을 만들 때 고른다. 비어 있으면 서논술 전용.
  plan: z.enum(PLANS).default(DEFAULT_PLAN),
})
export type AcademyInput = z.infer<typeof schema>

export function parseAcademy(formData: FormData): { ok: true; data: AcademyInput } | { ok: false; error: string } {
  const raw = Object.fromEntries(['code', 'name', 'region', 'director_phone', 'plan'].map(k => [k, formData.get(k) ?? '']))
  if (raw.plan === '') delete (raw as Record<string, unknown>).plan
  const r = schema.safeParse(raw)
  return r.success ? { ok: true, data: r.data } : { ok: false, error: r.error.issues[0]?.message ?? errors.invalidInput }
}
