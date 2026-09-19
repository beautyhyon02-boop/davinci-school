import { z } from 'zod'

export const standardSchema = z.object({
  level: z.enum(['초', '중', '고']),
  subject: z.enum(['국어', '영어', '수학', '과학', '사회', '한국사', '세계사']),
  grade_band: z.string(),
  domain: z.string(),
  code: z.string().regex(/^\[.+\]$/),
  text: z.string().min(5),
})

export const standardsSchema = z.array(standardSchema)

export type Standard = z.infer<typeof standardSchema>
