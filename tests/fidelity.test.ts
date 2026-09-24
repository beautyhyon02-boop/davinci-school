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
  it('no longer passes 통계청 on the 통계 prefix(2026-09-24 라운드 2에서 닫은 구멍): 같은 길이 낱말이 접두만 겹치면 반려한다', () => {
    // 예전에는 전체 원문 문자열에서 (길이-1)자 접두를 아무 데서나 찾아 통과시켰다 — '통계청'과 '통계적'은
    // 길이가 같고 마지막 글자만 다른데(어미·조사 차이가 아님) 접두 2자가 겹친다는 이유로 통과했다.
    // 이제는 낱말 단위로 대조하고, 접두 관계라도 그 차이가 어미·조사이거나 1음절 이하여야만 통과한다.
    const r = checkReconstructionFidelity('통계청 자료를 도수분포표로 나타내고 해석할 수 있다.', STD)
    expect(r.ok).toBe(false)
    expect(r.unknownTokens).toContain('통계청')
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

// 코드 리뷰 라운드 2(2026-09-24): (1) stem()이 "-하다/-되다" 활용을 어간(하/되) 보존 없이 통째로 지워
// "말하기를"(어간 보존)과 "말한다"(어간까지 삭제)가 서로 다른 값이 돼 반려됐다. (2) stemMatches가 원문을
// 하나로 이어붙인 문자열에서 (길이-1)자 접두를 아무 데서나 찾아 "히스토리"가 "히스토그램"의 앞부분과
// 우연히 겹쳐 통과했다. 두 결함을 normalizeHada(어간 보존)와 낱말 단위 대조(sourceMatches)로 고쳤다.
describe('checkReconstructionFidelity: -하다/되다 어간 보존과 낱말 단위 대조(코드 리뷰 라운드 2, 2026-09-24)', () => {
  it('"말한다"(원문) ↔ "말하기를"(재구조화) — 둘 다 어간 "말하"로 만나야 한다', () => {
    const r = checkReconstructionFidelity('학생은 자료를 가지고 말하기를 해서 발표를 할 수 있다.', ['자료에 대해 말한다.'])
    expect(r.unknownTokens).toEqual([])
    expect(r.ok).toBe(true)
  })

  it('"설명한다"(원문) ↔ "설명하기"(재구조화) — 어간 "설명하"로 만난다', () => {
    const r = checkReconstructionFidelity('학생은 자료를 가지고 설명하기를 해서 답을 할 수 있다.', ['자료를 보고 설명한다.'])
    expect(r.ok).toBe(true)
  })

  it('"준수한다"(원문) ↔ "준수하며"(재구조화) — 어간 "준수하"로 만난다', () => {
    const r = checkReconstructionFidelity('학생은 절차를 가지고 준수하며 결과를 낼 수 있다.', ['절차를 준수한다.'])
    expect(r.ok).toBe(true)
  })

  it('"히스토리"는 더 이상 "히스토그램"의 앞부분과 겹쳐 통과하지 않는다(뒷부분이 완전히 다른 낱말)', () => {
    const r = checkReconstructionFidelity('히스토리 자료를 나타낸다.', ['히스토그램으로 자료를 나타낸다.'])
    expect(r.ok).toBe(false)
    expect(r.unknownTokens).toContain('히스토리')
  })

  it('"도수분포다각형으로"(재구조화) ↔ 원문의 "도수분포다각형"(조사 없이) — 같은 낱말, 조사 차이만', () => {
    const r = checkReconstructionFidelity('자료를 도수분포다각형으로 나타낸다.', ['자료를 도수분포다각형 그래프로 나타낸다.'])
    expect(r.ok).toBe(true)
  })

  it('"나타내서"(재구조화) ↔ 원문의 "나타내고" — 연결어미 차이만', () => {
    const r = checkReconstructionFidelity('자료를 나타내서 해석한다.', ['자료를 나타내고 해석한다.'])
    expect(r.ok).toBe(true)
  })

  it('표준편차는 GENERIC_PRODUCT_WORDS의 "표" 접두와 우연히 겹쳐도 허용되지 않는다(합성어 꼬리표가 아니므로)', () => {
    const r = checkReconstructionFidelity('학생은 자료를 가지고 표준편차를 구해서 답을 할 수 있다.', STD)
    expect(r.ok).toBe(false)
    expect(r.unknownTokens).toContain('표준편차를')
  })

  it('글자는 "글" + 활동 꼬리표(쓰기 등) 합성어가 아니므로 계속 반려된다', () => {
    const r = checkReconstructionFidelity('학생은 자료를 가지고 글자를 세어서 답을 할 수 있다.', STD)
    expect(r.ok).toBe(false)
    expect(r.unknownTokens).toContain('글자를')
  })
})

// owner 사례 2(2026-09-24 두 번째 스크린샷): "~하는 것을 해서", "매체 활용을 해서", "쓰는 것을 할 수 있다"가 반려됐다 —
// 의존 명사 "것"(것을)·"-하여"↔"-을" 명사형("활용하여"↔"활용을")·관형사형 "-는"("쓴다"↔"쓰는")은 새 내용어가 아니다.
describe('checkReconstructionFidelity: 기능어·"-하여"·관형사형 허용(오너 사례 2, 2026-09-24)', () => {
  const S0203 = '친숙한 주제에 관해 사실적 정보를 설명한다.'
  const S0102 = '친숙한 주제에 관한 담화나 글에서 세부 정보를 파악한다.'
  const S0209 = '적절한 매체를 활용하여 정보 윤리를 준수하며 말하거나 쓴다.'
  const R0203 = '학생은 친숙한 주제에 관한 안내문을 가지고 사실적 정보를 파악하는 것을 해서 설명하는 글을 쓸 수 있다.'

  it('[9영02-09] 원문만으로 "활용을"·"쓰는"·"것을"이 통과한다', () => {
    const r = checkReconstructionFidelity('학생은 적절한 매체를 가지고 정보 윤리를 준수하며 매체 활용을 해서 말하거나 쓰는 것을 할 수 있다.', [S0209])
    expect(r.unknownTokens).toEqual([])
    expect(r.ok).toBe(true)
  })
  it('[9영02-03]: "것을"·"안내문을"(일반 자료 명사)은 통과하고, 원문에 없는 수행 "파악하는"만 남는다(L-02: 새 수행 금지)', () => {
    expect(checkReconstructionFidelity(R0203, [S0203]).unknownTokens).toEqual(['파악하는'])
  })
  it('[9영02-03]을 "파악한다"가 있는 [9영01-02]와 통합(merged_with)하면 같은 문장이 통과한다', () => {
    const r = checkReconstructionFidelity(R0203, [S0203, S0102])
    expect(r.unknownTokens).toEqual([])
    expect(r.ok).toBe(true)
  })
  it('기능어 목록(것·때·경우·위해·통해·바탕으로·사용해 등)은 원문에 없어도 허용한다', () => {
    const r = checkReconstructionFidelity('학생은 필요한 경우 적절한 매체를 사용해 정보 윤리를 준수하기 위해 말하는 것과 쓰는 것을 할 수 있다.', [S0209])
    expect(r.unknownTokens).toEqual(['필요한'])
  })
  it('축제·일회용품 같은 대주제 상황 낱말은 여전히 반려된다', () => {
    const r = checkReconstructionFidelity('학생은 학교 축제의 일회용품 줄이기를 다룬 안내문을 가지고 사실적 정보를 설명할 수 있다.', [S0203])
    expect(r.unknownTokens).toEqual(expect.arrayContaining(['학교', '축제의', '일회용품', '줄이기를', '다룬']))
  })
})

describe('stem', () => {
  it('strips the longest matching suffix only', () => {
    expect(stem('설정함으로써')).toBe('설정')
    expect(stem('나타내었으며')).toBe('나타내')
    expect(stem('그래프로')).toBe('그래프')
    expect(stem('자료를')).toBe('자료')
  })
  it('"-하여"는 "하"로, 관형사형 "-는"은 1음절 어간까지 뗀다(활용하여→활용하, 쓰는→쓰)', () => {
    expect(stem('활용하여')).toBe('활용하')
    expect(stem('활용을')).toBe('활용')
    expect(stem('쓰는')).toBe('쓰')
    expect(stem('파악하는')).toBe('파악하')
  })
  it('does not strip when the remaining stem would be shorter than 2', () => {
    expect(stem('표를')).toBe('표를')
    expect(stem('축제')).toBe('축제')
  })
})
