import { z } from 'zod'

export const CriterionSchema = z.object({
  name: z.string().min(1),
  points: z.number().int().min(0),
  max: z.number().int().min(1),
  evidence: z.string().min(1),   // 답안에서 인용한 근거 문장
  note: z.string(),
}).refine((c) => c.points <= c.max, { message: 'points > max' })

export const GradingDraftSchema = z.object({
  criteria: z.array(CriterionSchema).min(1).max(4),
  score: z.number().int().min(0),
  strengths: z.array(z.string().min(5)).min(1).max(3),
  improvements: z.array(z.string().min(5)).min(1).max(3),
}).refine((d) => d.score === d.criteria.reduce((s, c) => s + c.points, 0), { message: 'score must equal the sum of criteria points' })

export type GradingDraftOut = z.infer<typeof GradingDraftSchema>
