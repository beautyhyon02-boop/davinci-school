import { describe, it, expect } from 'vitest'
import { GradingDraftSchema } from '@/lib/classroom/grading-schema'

const good = {
  criteria: [{ name: '수치 인용의 정확성', points: 2, max: 3, evidence: '올해 플라스틱컵이 405개로', note: '작년 비교 없음' }],
  score: 2,
  strengths: ['자료 B에서 올해 수치를 정확히 골라 썼습니다.'],
  improvements: ['작년 290개에서 올해 405개로 115개 늘었다처럼 두 해를 함께 쓰면 3점 기준을 채웁니다.'],
}

describe('GradingDraftSchema', () => {
  it('accepts a well-formed draft', () => { expect(GradingDraftSchema.safeParse(good).success).toBe(true) })
  it('rejects score that is not the sum of criteria points', () => {
    expect(GradingDraftSchema.safeParse({ ...good, score: 3 }).success).toBe(false)
  })
  it('rejects points over max and empty evidence', () => {
    expect(GradingDraftSchema.safeParse({ ...good, criteria: [{ ...good.criteria[0], points: 4 }], score: 4 }).success).toBe(false)
    expect(GradingDraftSchema.safeParse({ ...good, criteria: [{ ...good.criteria[0], evidence: '' }] }).success).toBe(false)
  })
  it('requires 1~3 strengths and improvements', () => {
    expect(GradingDraftSchema.safeParse({ ...good, strengths: [] }).success).toBe(false)
  })
})
