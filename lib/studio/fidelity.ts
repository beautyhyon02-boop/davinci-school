const STOP = new Set(['그리고', '또한', '및', '또는', '이를', '그', '수', '있다', '있다.', '한다', '한다.', '하며', '하고', '학생은', '학생이', '통해', '바탕으로', '따라', '위해', '위한', '대해', '관해', '등', '각', '그리고,'])

// 가운뎃점 변형: · (U+00B7), ⋅ (U+22C5), ㆍ (U+318D), ‧ (U+2027) — 별책 텍스트마다 다르게 쓰인다
const MIDDLE_DOTS = '·⋅ㆍ‧'
const SPLIT_RE = new RegExp(`[.,${MIDDLE_DOTS}、()\\[\\]"'“”‘’]`, 'g')
const SOURCE_RE = new RegExp(`[${MIDDLE_DOTS}、]`, 'g')

// 어미·조사 목록. 긴 것부터 떼어 내야 '함으로써'가 '로써'나 '써'로 잘못 잘리지 않는다.
const SUFFIXES = ['함으로써', '었으며', '았으며', '으로써', '으로서', '하며', '하고', '하여', '해서', '하는', '하기', '하면', '되며', '되고', '되어', '이며', '이고', '에서', '에게', '으로', '로써', '로서', '까지', '부터', '에는', '에도', '만을', '들을', '들이', '들은', '을', '를', '은', '는', '이', '가', '의', '에', '와', '과', '도', '만', '로']
  .sort((a, b) => b.length - a.length)

function tokens(s: string): string[] {
  return s.replace(SPLIT_RE, ' ').split(/\s+/).map(t => t.trim()).filter(t => t.length >= 2 && !STOP.has(t))
}

/** 토큰 끝의 어미·조사 하나를 떼어 낸 어간. 남는 어간이 2자 미만이면 떼지 않는다(한 글자 어간은 아무 데나 붙어 오탐이 된다). */
export function stem(token: string): string {
  for (const suf of SUFFIXES) {
    if (token.length - suf.length >= 2 && token.endsWith(suf)) return token.slice(0, -suf.length)
  }
  return token
}

function stemMatches(token: string, source: string): boolean {
  // 1) 어미·조사를 떼고 2) 남은 어간의 접두(길이-1 이상, 최소 2)가 원문에 있으면 통과
  const st = stem(token)
  const minLen = Math.max(2, st.length - 1)
  for (let len = st.length; len >= minLen; len--) {
    if (source.includes(st.slice(0, len))) return true
  }
  return false
}

export function checkReconstructionFidelity(reconstruction: string, standards: string[]) {
  const source = standards.join(' ').replace(SOURCE_RE, ' ')
  const unknownTokens = tokens(reconstruction).filter(t => !stemMatches(t, source))
  return { ok: unknownTokens.length === 0, unknownTokens }
}
