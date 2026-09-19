import { describe, it, expect } from 'vitest'
import { checkReconstructionFidelity, stem } from '@/lib/studio/fidelity'

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

  it('fails a token whose stem is absent from the source', () => {
    // '제안'은 뗄 어미·조사가 없어 어간이 '제안' 그대로이고, 최소 접두 길이 = max(2, 2-1) = 2 이므로
    // '제안' 두 글자 전체가 원문에 있어야 한다. 원문에는 '제안'이 없으므로 걸려야 한다.
    const r = checkReconstructionFidelity('자료를 제안 있다.', STD)
    expect(r.ok).toBe(false)
    expect(r.unknownTokens).toContain('제안')
  })
  it('normalizes middle-dot variants (· ⋅ ㆍ ‧) in both reconstruction and source', () => {
    const stdWithDot = ['자료를⋅도수분포표로 나타내고 해석할 수 있다.']
    expect(checkReconstructionFidelity('자료를·도수분포표로 나타내고 해석할 수 있다.', stdWithDot).ok).toBe(true)
    expect(checkReconstructionFidelity('자료를ㆍ도수분포표로 나타내고 해석할 수 있다.', ['자료를‧도수분포표로 나타내고 해석할 수 있다.']).ok).toBe(true)
    expect(checkReconstructionFidelity('자료를‧도수분포표로 나타내고 해석할 수 있다.', ['자료를ㆍ도수분포표로 나타내고 해석할 수 있다.']).unknownTokens).toEqual([])
  })

  // I5: 긴 어미가 붙은 원문 동사의 활용형은 통과해야 한다(이전 규칙 len-2 로는 2음절 어간에 4음절 어미가 붙으면 걸렸다)
  it('passes long verb endings on source verbs: 설정함으로써, 나타내었으며', () => {
    const r = checkReconstructionFidelity('통계적 탐구 문제를 설정함으로써 자료를 도수분포표로 나타내었으며 그 결과를 해석할 수 있다.', STD)
    expect(r.unknownTokens).toEqual([])
    expect(r.ok).toBe(true)
  })
  it('still fails on context words like 축제 after suffix stripping', () => {
    const r = checkReconstructionFidelity('축제 자료를 도수분포표로 나타내고 해석할 수 있다.', STD)
    expect(r.unknownTokens).toEqual(['축제'])
  })
  it('documents a known false negative: 통계청 passes on the 통계 prefix (AI reviewer is the second gate)', () => {
    // '통계청'은 뗄 어미가 없고 접두 '통계'(len-1)가 원문 '통계적'에 있어 통과한다. 이런 새 개념 삽입은
    // 순수 검사가 못 잡으므로 stage 2 의 검토 AI(fidelity 초점)가 두 번째 관문이다.
    const r = checkReconstructionFidelity('통계청 자료를 도수분포표로 나타내고 해석할 수 있다.', STD)
    expect(r.ok).toBe(true)
  })
})

describe('stem', () => {
  it('strips the longest matching suffix only', () => {
    expect(stem('설정함으로써')).toBe('설정')
    expect(stem('나타내었으며')).toBe('나타내')
    expect(stem('그래프로')).toBe('그래프')
    expect(stem('자료를')).toBe('자료')
  })
  it('does not strip when the remaining stem would be shorter than 2', () => {
    expect(stem('표를')).toBe('표를')
    expect(stem('축제')).toBe('축제')
  })
})
