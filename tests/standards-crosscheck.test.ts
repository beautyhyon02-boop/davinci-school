import { describe, it, expect } from 'vitest'
import { normalizeStandardText, crosscheckStandards } from '@/lib/standards/crosscheck'

describe('normalizeStandardText', () => {
  it('collapses whitespace differences', () => {
    expect(normalizeStandardText('소인수분해의  뜻을\n알고, 자연수를 소인수분해 할 수 있다.'))
      .toBe(normalizeStandardText('소인수분해의 뜻을 알고, 자연수를 소인수분해 할 수 있다.'))
  })
  it('unifies middle-dot punctuation variants (·/ㆍ/⋅)', () => {
    expect(normalizeStandardText('근·현대 사회로의 전환')).toBe(normalizeStandardText('근ㆍ현대 사회로의 전환'))
    expect(normalizeStandardText('근·현대 사회로의 전환')).toBe(normalizeStandardText('근⋅현대 사회로의 전환'))
  })
  it('removes a trailing period, including the ideographic full stop', () => {
    expect(normalizeStandardText('자연수를 소인수분해 할 수 있다.')).toBe(normalizeStandardText('자연수를 소인수분해 할 수 있다'))
    expect(normalizeStandardText('자연수를 소인수분해 할 수 있다。')).toBe(normalizeStandardText('자연수를 소인수분해 할 수 있다'))
  })
  it('treats a PDF line-wrap space as equivalent to no space at all (2026-09-26 재검토: 실측 불일치 82건 중 76건이 이 유형)', () => {
    expect(normalizeStandardText('비교 할 수 있다.')).toBe(normalizeStandardText('비교할 수 있다.'))
  })
  it('does NOT equate a real wording difference just because it also differs in spacing (조사 유무)', () => {
    expect(normalizeStandardText('세계의 여러 지역')).not.toBe(normalizeStandardText('세계 여러 지역'))
  })
  it('does NOT equate a genuine middle-dot-vs-space difference', () => {
    expect(normalizeStandardText('사회⋅문화적')).not.toBe(normalizeStandardText('사회 문화적'))
  })
})

describe('crosscheckStandards', () => {
  it('verifies a row whose text is byte-identical to the level record', () => {
    const result = crosscheckStandards(
      [{ id: '1', code: '[9수01-01]', subject: '수학', text: '소인수분해의 뜻을 알고, 자연수를 소인수분해 할 수 있다.' }],
      [{ code: '[9수01-01]', text: '소인수분해의 뜻을 알고, 자연수를 소인수분해 할 수 있다.', source: '수학-중.json' }],
    )
    expect(result.verified).toEqual([{ id: '1', code: '[9수01-01]' }])
    expect(result.mismatched).toEqual([])
    expect(result.unmatched).toEqual([])
  })

  it('verifies a row that differs only in whitespace/punctuation', () => {
    const result = crosscheckStandards(
      [{ id: '1', code: '[9역08-01]', subject: '한국사', text: '고조선과 여러 나라의  형성 과정 및 사회 모습을 탐구한다' }],
      [{ code: '[9역08-01]', text: '고조선과 여러 나라의 형성 과정 및 사회 모습을 탐구한다.', source: '역사-중.json' }],
    )
    expect(result.verified).toEqual([{ id: '1', code: '[9역08-01]' }])
    expect(result.mismatched).toEqual([])
  })

  it('flags a real wording difference as mismatched, keeping both texts and the source file', () => {
    const result = crosscheckStandards(
      [{ id: '1', code: '[9수01-02]', subject: '수학', text: '소인수분해를 이용하여 최대공약수를 구할 수 있다.' }],
      [{ code: '[9수01-02]', text: '소인수분해를 이용하여 최대공약수와 최소공배수를 구할 수 있다.', source: '수학-중.json' }],
    )
    expect(result.verified).toEqual([])
    expect(result.mismatched).toEqual([
      {
        id: '1',
        code: '[9수01-02]',
        dbText: '소인수분해를 이용하여 최대공약수를 구할 수 있다.',
        levelText: '소인수분해를 이용하여 최대공약수와 최소공배수를 구할 수 있다.',
        source: '수학-중.json',
      },
    ])
  })

  it('marks a code absent from every level file as unmatched (e.g. 고등학교, 세계사)', () => {
    const result = crosscheckStandards(
      [{ id: '1', code: '[12세사01-01]', subject: '세계사', text: '역사의 의미를 이해한다.' }],
      [{ code: '[9수01-01]', text: '다른 코드', source: '수학-중.json' }],
    )
    expect(result.unmatched).toEqual([{ id: '1', code: '[12세사01-01]' }])
    expect(result.verified).toEqual([])
    expect(result.mismatched).toEqual([])
  })

  it('sorts multiple rows into the correct bucket independently', () => {
    const result = crosscheckStandards(
      [
        { id: 'a', code: '[9수01-01]', subject: '수학', text: '같다.' },
        { id: 'b', code: '[9수01-02]', subject: '수학', text: '다르다.' },
        { id: 'c', code: '[9고유없음01-01]', subject: '수학', text: '없다.' },
      ],
      [
        { code: '[9수01-01]', text: '같다.', source: 'f.json' },
        { code: '[9수01-02]', text: '진짜다르다.', source: 'f.json' },
      ],
    )
    expect(result.verified.map((r) => r.id)).toEqual(['a'])
    expect(result.mismatched.map((r) => r.id)).toEqual(['b'])
    expect(result.unmatched.map((r) => r.id)).toEqual(['c'])
  })
})
