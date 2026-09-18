import { describe, it, expect } from 'vitest'
import { standardsSchema } from '@/lib/standards/parse'

describe('standardsSchema', () => {
  it('accepts valid rows', () => {
    expect(
      standardsSchema.parse([
        { level: '중', subject: '국어', grade_band: '1-3', domain: '', code: '[9국03-01]', text: '샘플 성취기준 문장.' },
      ])
    ).toHaveLength(1)
  })

  it('rejects unknown subject', () => {
    expect(() =>
      standardsSchema.parse([
        { level: '중', subject: '미술', grade_band: '1-3', domain: '', code: '[9미01-01]', text: 'x' },
      ])
    ).toThrow()
  })

  it('accepts 한국사 subject (사회과 별책에서 분리된 역사/한국사 성취기준)', () => {
    expect(
      standardsSchema.parse([
        { level: '중', subject: '한국사', grade_band: '1-3', domain: '', code: '[9역01-01]', text: '고대 국가의 성립과 발전 과정을 파악한다.' },
      ])
    ).toHaveLength(1)
  })
})
