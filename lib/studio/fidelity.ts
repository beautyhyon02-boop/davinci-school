const STOP = new Set(['그리고', '또한', '및', '또는', '이를', '그', '수', '있다', '있다.', '한다', '한다.', '하며', '하고', '학생은', '학생이', '통해', '바탕으로', '따라', '위해', '위한', '대해', '관해', '등', '각', '그리고,'])

function tokens(s: string): string[] {
  return s.replace(/[.,·⋅、()\[\]"'“”‘’]/g, ' ').split(/\s+/).map(t => t.trim()).filter(t => t.length >= 2 && !STOP.has(t))
}

function stemMatches(token: string, source: string): boolean {
  // 어미·조사 변화를 허용: 토큰의 접두(길이-2 이상, 최소 2)가 원문에 있으면 통과
  const minLen = Math.max(2, token.length - 2)
  for (let len = token.length; len >= minLen; len--) {
    if (source.includes(token.slice(0, len))) return true
  }
  return false
}

export function checkReconstructionFidelity(reconstruction: string, standards: string[]) {
  const source = standards.join(' ').replace(/[·⋅、]/g, ' ')
  const unknownTokens = tokens(reconstruction).filter(t => !stemMatches(t, source))
  return { ok: unknownTokens.length === 0, unknownTokens }
}
