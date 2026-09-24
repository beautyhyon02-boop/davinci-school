/**
 * L-02 재구조화 문장("학생은 [자료]를 가지고 [수행]을 해서 [결과물]을 할 수 있다")은 늘 같은 틀 낱말과
 * 몇 가지 일반 결과물 명사를 쓴다 — 이 낱말들은 원문에 없어도 새 내용어가 아니므로 항상 허용한다.
 * "관한/관해" 같은 관형사형↔연결형 짝은 어미 활용으로 풀기보다(모음이 달라 받침만 지워서는 안 맞는다),
 * 이 닫힌 집합(관하다·대하다·위하다·통하다·의하다·따르다·인하다 계열)으로 바로 허용한다.
 */
export const TEMPLATE_WORDS = new Set([
  '학생은', '학생이', '가지고', '해서', '하여', '할', '수', '있다', '있게', '된다',
  '통해', '통하여', '통한', '바탕으로', '대해', '대하여', '대한', '관해', '관하여', '관한',
  '이용해', '이용하여', '이용한', '활용해', '활용하여', '활용한', '위해', '위하여', '위한',
  '의해', '의하여', '의한', '따라', '따른', '인해', '인한',
  '그리고', '또는', '또한', '및', '등', '각', '한', '두', '세', '이를', '그',
])

/** 문장 틀의 [자료]·[결과물] 칸이 으레 쓰는 일반 명사. 원문에 없어도 허용한다(원문에 실제로 있으면 더 좋다). */
export const GENERIC_PRODUCT_WORDS = ['글', '표', '그래프', '그림', '문장', '문단', '보고서', '발표', '자료', '도표', '답', '의견', '설명', '편지', '포스터', '제안서', '기사', '요약', '목록', '결과', '과정']

/** GENERIC_PRODUCT_WORDS + 이 활동성 꼬리표(쓰기·말하기 등)의 합성어도 허용한다("글쓰기" = 글 + 쓰기). */
const GENERIC_TAILS = ['쓰기', '쓰', '말하기', '만들기', '그리기', '짓기', '풀기', '세우기']

// 가운뎃점 변형: · (U+00B7), ⋅ (U+22C5), ㆍ (U+318D), ‧ (U+2027) — 별책 텍스트마다 다르게 쓰인다
const MIDDLE_DOTS = '·⋅ㆍ‧'
const SPLIT_RE = new RegExp(`[.,${MIDDLE_DOTS}、()\\[\\]"'“”‘’]`, 'g')
const SOURCE_RE = new RegExp(`[${MIDDLE_DOTS}、]`, 'g')

const STOP = new Set([...TEMPLATE_WORDS, '있다.', '한다', '한다.', '하며', '하고', '그리고,'])

// 조사류: 어간이 2자 미만이면 떼지 않는다(1음절 어간은 아무 데나 붙어 오탐이 된다) — GENERIC_PRODUCT_WORDS
// 판정에서만 예외로 1자까지 떼는 별도 함수(stripParticleLoose)를 쓴다.
const PARTICLES = [
  '함으로써', '었으며', '았으며', '으로써', '으로서', '에서', '에게', '으로', '로써', '로서',
  '까지', '부터', '에는', '에도', '만을', '들을', '들이', '들은', '처럼', '이나',
  '을', '를', '은', '는', '이', '가', '의', '에', '와', '과', '도', '만', '로', '나',
]
// 어미류(동사·형용사 활용): 하다→하, 쓰다→쓰 같은 1음절 어간도 정당하므로 1자까지 허용한다.
// stemMatches/looseMatches 쪽에서 1음절 어간은 정확히 같아야 통과하게 해 과다 매칭을 막는다.
const VERB_ENDINGS = [
  '하며', '하고', '하여', '해서', '하는', '하기', '하면', '되며', '되고', '되어', '이며', '이고',
  '한다', '된다', '되는', '한', '된', '기를', '기에', '기', '게', '고', '며', '면', '거나', '니다', '습니다', '다',
]

type SuffixRule = { suf: string; min: number }
// 긴 것부터 떼어 내야 '함으로써'가 '로써'나 '써'로 잘못 잘리지 않는다.
const SUFFIX_RULES: SuffixRule[] = [
  ...PARTICLES.map((suf) => ({ suf, min: 2 })),
  ...VERB_ENDINGS.map((suf) => ({ suf, min: 1 })),
].sort((a, b) => b.suf.length - a.suf.length)

function tokens(s: string): string[] {
  return s.replace(SPLIT_RE, ' ').split(/\s+/).map(t => t.trim()).filter(t => t.length >= 2 && !STOP.has(t))
}

function rawWords(s: string): string[] {
  return s.replace(SPLIT_RE, ' ').split(/\s+/).map(t => t.trim()).filter(t => t.length > 0)
}

/** 토큰 끝의 어미·조사 하나를 떼어 낸 어간. 조사는 남는 어간이 2자 미만이면 떼지 않지만, 어미(하다·쓰다류)는 1자까지 허용한다. */
export function stem(token: string): string {
  for (const { suf, min } of SUFFIX_RULES) {
    if (token.length - suf.length >= min && token.endsWith(suf)) return token.slice(0, -suf.length)
  }
  return token
}

/** GENERIC_PRODUCT_WORDS 판정 전용: 조사를 1자 남을 때까지도 떼어 낸다("글을"→"글"). 새 내용어 판정(stem)에는 쓰지 않는다. */
function stripParticleLoose(token: string): string {
  for (const p of PARTICLES) {
    if (token.length - p.length >= 1 && token.endsWith(p)) return token.slice(0, -p.length)
  }
  return token
}

/** 한글 음절의 받침(종성)만 지운다. 받침이 없으면(또는 한글 음절이 아니면) 그대로 돌려준다. */
function stripBatchim(syllable: string): string {
  const code = syllable.charCodeAt(0)
  if (code < 0xAC00 || code > 0xD7A3) return syllable
  const jong = (code - 0xAC00) % 28
  return jong === 0 ? syllable : String.fromCharCode(code - jong)
}

/** 어간 끝 음절의 받침만 지운 "느슨한" 어간. '쓴'→'쓰', '관한'→'관하'(둘 다 들어 있으면 뒤엣것도 후보로 쓴다). */
function looseForms(word: string): string[] {
  const st = stem(word)
  if (st.length === 0) return [st]
  const loose = st.slice(0, -1) + stripBatchim(st[st.length - 1])
  return loose === st ? [st] : [st, loose]
}

/** 문장 틀·일반 결과물 명사 허용(§4): "글쓰기를"처럼 일반 명사 + 활동 꼬리표 합성어도 허용한다. */
function isGenericProduct(token: string): boolean {
  const candidates = new Set([stem(token), stripParticleLoose(token)])
  for (const c of candidates) {
    if (GENERIC_PRODUCT_WORDS.includes(c)) return true
    for (const w of GENERIC_PRODUCT_WORDS) {
      if (c.length > w.length && c.startsWith(w) && GENERIC_TAILS.includes(c.slice(w.length))) return true
    }
  }
  return false
}

/** 1) 어미·조사를 떼고 2) 남은 어간의 접두(길이-1 이상, 최소 2)가 원문 전체 문자열에 있으면 통과. */
function stemMatches(token: string, source: string): boolean {
  const st = stem(token)
  const minLen = Math.max(2, st.length - 1)
  for (let len = st.length; len >= minLen; len--) {
    if (source.includes(st.slice(0, len))) return true
  }
  return false
}

/**
 * 받침만 다른 어미 변화(쓰기↔쓴다 등)를 원문의 단어별 어간과 대조해 허용하는 2차 검사.
 * 1음절 어간은 정확히 같아야 통과한다(과다 매칭 방지) — 그래서 '관한'(→관하/관)과 '관해'(→관해)처럼
 * 모음까지 달라지는 짝은 여기서 못 잡고, TEMPLATE_WORDS가 대신 허용한다.
 */
function looseMatches(token: string, sourceWords: string[]): boolean {
  const tokenForms = looseForms(token)
  for (const raw of sourceWords) {
    const sourceForms = looseForms(raw)
    for (const tf of tokenForms) {
      if (!tf) continue
      for (const sf of sourceForms) {
        if (!sf) continue
        if (tf.length === 1 || sf.length === 1) { if (tf === sf) return true; continue }
        const [shortF, longF] = tf.length <= sf.length ? [tf, sf] : [sf, tf]
        if (longF.includes(shortF)) return true
      }
    }
  }
  return false
}

function isKnown(token: string, source: string, sourceWords: string[]): boolean {
  if (isGenericProduct(token)) return true
  if (stemMatches(token, source)) return true
  return looseMatches(token, sourceWords)
}

export function checkReconstructionFidelity(reconstruction: string, standards: string[]) {
  const source = standards.join(' ').replace(SOURCE_RE, ' ')
  const sourceWords = rawWords(source)
  const unknownTokens = tokens(reconstruction).filter(t => !isKnown(t, source, sourceWords))
  return { ok: unknownTokens.length === 0, unknownTokens }
}
