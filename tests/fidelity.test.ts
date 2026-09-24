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

  it('fails a wholly unrelated sentence', () => {
    const r = checkReconstructionFidelity('학생은 축구공을 차서 골대에 넣을 수 있다.', STD)
    expect(r.ok).toBe(false)
    expect(r.unknownTokens.length).toBeGreaterThan(0)
  })
})

// owner 사례(2026-09-24 오너 스크린샷): [9영02-03]·[9영02-09] 재구조화가 "원문에 없는 표현"으로 반려됐다 —
// 실제로는 L-02 문장 틀 낱말(가지고·해서·관한 등)과 일반 결과물 명사(글·발표·답 등), 어미 활용 차이(쓰기↔쓴다)일 뿐이다.
describe('checkReconstructionFidelity: L-02 문장 틀·일반 결과물 명사·어미 변화 허용(2026-09-24)', () => {
  const ENGLISH = {
    '9영02-03': '친숙한 주제에 관해 사실적 정보를 설명한다.',
    '9영02-09': '적절한 매체를 활용하여 정보 윤리를 준수하며 말하거나 쓴다.',
    '9영02-10': '적절한 전략을 활용하여 상황이나 목적에 맞게 말하거나 쓴다.',
  }

  it('[9영02-03]: "관한"(원문 "관해")·"가지고"·"해서"·"글쓰기를"·"글을" 은 원문에 없는 표현이 아니다', () => {
    const r = checkReconstructionFidelity('학생은 친숙한 주제에 관한 자료를 가지고 사실적 정보를 설명하는 글쓰기를 해서 글을 쓸 수 있다.', [ENGLISH['9영02-03']])
    expect(r.unknownTokens).toEqual([])
    expect(r.ok).toBe(true)
  })

  it('[9영02-09]: "가지고"·"쓰기를"(원문 "쓴다")·"발표를" 은 원문에 없는 표현이 아니다', () => {
    const r = checkReconstructionFidelity('학생은 적절한 매체를 가지고 정보 윤리를 준수하며 말하거나 쓰기를 해서 발표를 할 수 있다.', [ENGLISH['9영02-09']])
    expect(r.unknownTokens).toEqual([])
    expect(r.ok).toBe(true)
  })

  it('[9영02-10]: 조사만 다른 변형("전략을"·"상황이나")과 일반 결과물 명사("답을")도 허용한다', () => {
    const r = checkReconstructionFidelity('학생은 적절한 전략을 가지고 상황이나 목적에 맞게 말하거나 쓰기를 해서 답을 할 수 있다.', [ENGLISH['9영02-10']])
    expect(r.unknownTokens).toEqual([])
    expect(r.ok).toBe(true)
  })

  it('a 수학 원문에 "축제 일회용품"을 섞으면 여전히 반려된다(새 내용어는 계속 잡아야 한다)', () => {
    const r = checkReconstructionFidelity('학생은 축제 일회용품 자료를 도수분포표로 정리하고 감축 방안을 제안할 수 있다.', STD)
    expect(r.ok).toBe(false)
    expect(r.unknownTokens).toEqual(expect.arrayContaining(['축제', '일회용품']))
  })

  it('조사만 다른 차이는 계속 통과한다(느슨해진 규칙이 본래 하던 일을 깨지 않는다)', () => {
    expect(checkReconstructionFidelity('자료가 도수분포표로 나타내고 해석할 수 있다.', STD).ok).toBe(true)
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
