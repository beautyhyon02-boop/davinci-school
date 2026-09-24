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
  // 기능어·의존 명사(2026-09-24 오너 사례: "~하는 것을 할 수 있다"의 "것을"이 새 내용어로 걸렸다) — 뜻을 더하지 않는 문법 낱말
  '것', '것을', '것이', '것은', '것과', '때', '경우', '사용해', '사용하여', '사용한',
])

/** 문장 틀의 [자료]·[결과물] 칸이 으레 쓰는 일반 명사. 원문에 없어도 허용한다(원문에 실제로 있으면 더 좋다). */
export const GENERIC_PRODUCT_WORDS = ['글', '표', '그래프', '그림', '문장', '문단', '보고서', '발표', '자료', '도표', '답', '의견', '설명', '편지', '안내문', '포스터', '제안서', '기사', '요약', '목록', '결과', '과정']

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
/**
 * 어미류(동사·형용사 활용): 하다→하, 쓰다→쓰 같은 1음절 어간도 정당하므로 1자까지 허용한다.
 * "-하다/-되다"에 바로 붙는 어미(하며·하고·하는·한다 등)는 여기 두지 않는다 — 그 어미까지 통째로 떼면
 * "하"/"되"가 사라져 "말하기"(어간 보존)와 "말한다"(통째 제거)가 서로 다른 값이 된다. 대신 "다·는·며·고·기"
 * 같은 낱조각만 떼고, 남은 "한/할/해/된/될/돼" 는 stem() 끝에서 normalizeHada가 "하/되"로 되돌린다.
 */
const VERB_ENDINGS = [
  '기를', '기에', '기', '게', '고', '며', '면', '서', '거나', '니다', '습니다', '다',
  // 관형사형 "-는": 조사 '는'(어간 2자 이상)과 같은 글자지만, 여기서는 1음절 동사 어간("쓰는"→"쓰", 원문 "쓴다"→"쓰")을 위해 1자까지 뗀다
  '는',
]

/**
 * "-하여/-되어"는 모음이 바뀌는 활용이라 한 글자만 떼면 "하"가 사라지거나("활용하" 대신 "활용하여" 그대로) 남는다 —
 * 그래서 통째로 "하/되"로 바꾼다(활용하여→활용하, 원문 "활용하여"와 재구조화 "활용을"(→활용)이 "하" 한 음절 차이로 맞는다).
 */
const HADA_CONNECTIVE: [string, string][] = [['하여', '하'], ['되어', '되']]

type SuffixRule = { suf: string; min: number; to?: string }
// 긴 것부터 떼어 내야 '함으로써'가 '로써'나 '써'로 잘못 잘리지 않는다.
const SUFFIX_RULES: SuffixRule[] = [
  ...PARTICLES.map((suf) => ({ suf, min: 2 })),
  ...VERB_ENDINGS.map((suf) => ({ suf, min: 1 })),
  ...HADA_CONNECTIVE.map(([suf, to]) => ({ suf, min: 1, to })),
].sort((a, b) => b.suf.length - a.suf.length)

/** "-하다/-되다" 활용의 받침·축약형을 어간 "하/되"로 되돌린다(말한다→말하, 해석할→해석하, 준수돼→준수되). */
const HADA_NORMALIZE: Record<string, string> = { 한: '하', 할: '하', 함: '하', 해: '하', 된: '되', 될: '되', 됨: '되', 돼: '되' }
function normalizeHada(s: string): string {
  if (s.length === 0) return s
  const last = s[s.length - 1]
  const mapped = HADA_NORMALIZE[last]
  return mapped ? s.slice(0, -1) + mapped : s
}

function tokens(s: string): string[] {
  return s.replace(SPLIT_RE, ' ').split(/\s+/).map(t => t.trim()).filter(t => t.length >= 2 && !STOP.has(t))
}

function rawWords(s: string): string[] {
  return s.replace(SPLIT_RE, ' ').split(/\s+/).map(t => t.trim()).filter(t => t.length > 0)
}

/** 토큰 끝의 어미·조사 하나를 떼어 낸 어간. 조사는 남는 어간이 2자 미만이면 떼지 않지만, 어미(하다·쓰다류)는 1자까지 허용한다. */
export function stem(token: string): string {
  for (const { suf, min, to } of SUFFIX_RULES) {
    if (token.length - suf.length >= min && token.endsWith(suf)) return normalizeHada(token.slice(0, -suf.length) + (to ?? ''))
  }
  return normalizeHada(token)
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

/** 어간 끝 음절의 받침만 지운 "느슨한" 어간(쓴→쓰). 이미 stem()의 -하다 정규화를 거친 값을 한 번 더 다듬는다. */
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

/**
 * 두 어간이 "같은 낱말"인지: 정확히 같거나(받침 변화 포함, looseForms가 이미 처리), 한쪽이 다른 쪽의 접두이고
 * 그 차이가 어미·조사 하나(또는 1음절 이하)뿐일 때만 통과한다. 접두이기만 하면 통과하던 예전 규칙은
 * "히스토리"↔"히스토그램"처럼 뒷부분이 완전히 다른 낱말도 접두 한 조각만 겹치면 통과시켰다(제거 대상).
 */
function formsCompatible(a: string, b: string): boolean {
  if (a === b) return true
  if (a.length < 2 || b.length < 2) return false // 1음절 어간은 정확히 같아야 한다(위에서 걸러졌으면 여기 안 옴)
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a]
  if (!longer.startsWith(shorter)) return false
  const diff = longer.slice(shorter.length)
  return diff.length <= 1 || PARTICLES.includes(diff) || VERB_ENDINGS.includes(diff)
}

/**
 * 재구조화 토큰의 어간을 원문의 "낱말별" 어간과 대조한다(전체 원문 문자열에서 부분 문자열을 찾던 예전 방식은
 * "히스토리"가 "히스토그램"의 앞 3글자와 우연히 겹쳐 통과하는 구멍이 있었다 — 이제 낱말 단위로만 비교한다).
 * '관한'(→관하/관)과 '관해'(→관해)처럼 모음까지 달라지는 짝은 여기서 못 잡고, TEMPLATE_WORDS가 대신 허용한다.
 */
function sourceMatches(token: string, sourceWords: string[]): boolean {
  const tokenForms = looseForms(token)
  for (const raw of sourceWords) {
    const sourceForms = looseForms(raw)
    for (const tf of tokenForms) {
      if (!tf) continue
      for (const sf of sourceForms) {
        if (sf && formsCompatible(tf, sf)) return true
      }
    }
  }
  return false
}

function isKnown(token: string, sourceWords: string[]): boolean {
  return isGenericProduct(token) || sourceMatches(token, sourceWords)
}

export function checkReconstructionFidelity(reconstruction: string, standards: string[]) {
  const source = standards.join(' ').replace(SOURCE_RE, ' ')
  const sourceWords = rawWords(source)
  const unknownTokens = tokens(reconstruction).filter(t => !isKnown(t, sourceWords))
  return { ok: unknownTokens.length === 0, unknownTokens }
}

/**
 * 원문에 없는 토큰(unknownTokens) 가운데 주어진 글(대주제 제목 등)의 낱말과 같은 것만 골라낸다 — 같은 낱말 판정은
 * 원문 대조와 똑같다(어미·조사·받침 변화 허용). 검사 결과를 바꾸지 않고, 반려 사유를 알아보기 쉽게 적을 때만 쓴다.
 */
export function tokensFoundIn(unknownTokens: string[], text: string): string[] {
  const words = rawWords(text.replace(SOURCE_RE, ' '))
  return unknownTokens.filter((t) => sourceMatches(t, words))
}
