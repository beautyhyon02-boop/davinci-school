import { z } from 'zod'
import { app } from '@/content/site'

const errors = app.adminAcademies.errors

const schema = z.object({
  code: z.string().trim().toLowerCase().regex(/^[a-z0-9]{3,12}$/, errors.codeInvalid),
  name: z.string().trim().min(1, errors.nameRequired),
  region: z.string().trim().optional().default(''),
  director_phone: z.string().trim().optional().default(''),
})
export type AcademyInput = z.infer<typeof schema>

export function parseAcademy(formData: FormData): { ok: true; data: AcademyInput } | { ok: false; error: string } {
  const r = schema.safeParse(Object.fromEntries(['code', 'name', 'region', 'director_phone'].map(k => [k, formData.get(k) ?? ''])))
  return r.success ? { ok: true, data: r.data } : { ok: false, error: r.error.issues[0]?.message ?? '입력을 확인하세요.' }
}
