import { describe, it, expect } from 'vitest'
import { checkReconstructionFidelity } from '@/lib/studio/fidelity'

const STD = [
  '자료를 줄기와 잎 그림, 도수분포표, 히스토그램, 도수분포다각형으로 나타내고 해석할 수 있다.',
  '상대도수를 구하고, 상대도수의 분포를 표나 그래프로 나타내고 해석할 수 있다.',
  '통계적 탐구 문제를 설정하고, 공학 도구를 이용하여 자료를 수집하여 분석하고, 그 결과를 해석할 수 있다.',
]

describe('checkReconstructionFidelity', () => {
  it('passes a faithful merge (inflection allowed)', () => {
    const r = checkReconstructionFidelity('통계적 탐구 문제를 설정하고, 자료를 도수분포표·히스토그램으로 나타내며, 상대도수의 분포를 표나 그래프로 나타내고, 그 결과를 해석할 수 있다.', STD)
    expect(r.ok).toBe(true)
    expect(r.unknownTokens).toEqual([])
  })
  it('fails when context words are injected', () => {
    const r = checkReconstructionFidelity('학생은 축제 일회용품 자료를 도수분포표로 정리하고 감축 방안을 제안할 수 있다.', STD)
    expect(r.ok).toBe(false)
    expect(r.unknownTokens).toEqual(expect.arrayContaining(['축제', '일회용품', '감축', '제안할']))
  })
  it('ignores connectors and particles', () => {
    expect(checkReconstructionFidelity('자료를 나타내고 그리고 해석할 수 있다.', STD).ok).toBe(true)
  })

  // Extra tests
  it('fails a token that only matches via a too-short prefix', () => {
    // '제안' (len 2) vs source containing only '제' (from '제작' etc. not present) —
    // use a clean case: token '제안' should NOT match because source has no '제안' substring
    // and its prefix requirement (minLen = max(2, 2-2)=2) requires the full 2-char token itself.
    const r = checkReconstructionFidelity('자료를 제안 있다.', STD)
    expect(r.ok).toBe(false)
    expect(r.unknownTokens).toContain('제안')
  })
  it('normalizes middle-dot variants (· and ⋅) in both reconstruction and source', () => {
    const stdWithDot = ['자료를⋅도수분포표로 나타내고 해석할 수 있다.']
    const r = checkReconstructionFidelity('자료를·도수분포표로 나타내고 해석할 수 있다.', stdWithDot)
    expect(r.ok).toBe(true)
    expect(r.unknownTokens).toEqual([])
  })
})
