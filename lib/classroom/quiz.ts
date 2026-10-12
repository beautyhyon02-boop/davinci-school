/** 단답형 비교용 정규화: 앞뒤 공백·구두점 제거, 안쪽 공백 제거, 소문자. */
export function normalizeShort(s: string): string {
  return s.trim().replace(/[.。,!?]+$/g, '').replace(/\s+/g, '').toLowerCase()
}

/** keywords(L-22, 대표 2026-10-12): 정답에 꼭 들어가야 할 핵심어 1~3개 — 모두 들어 있으면 글자가 달라도 정답. 옛 판에는 없다. */
export type QuizKey = { type: 'choice' | 'short'; answer: string; choices: string[] | null; keywords?: string[] | null }

/** 선택형은 표시 기호(①…) 완전 일치, 단답형은 정규화 후 일치. 정답 키가 "A / B"면 둘 중 하나. */
/** 단답 끝에 붙는 단위·조사("6개", "6 개", "6개이다", "6개요")를 떼어 비교용 핵심만 남긴다. */
const TRAILING_UNITS = /(개|명|곳|번|회|점|원|장|마리|권|대|살|년|월|일|시간|분|초|퍼센트|%|cm|mm|km|kg|g|m|l|ℓ)+$/
const TRAILING_ENDINGS = /(입니다|이다|이에요|예요|이요|요|임|다)$/

const UNIT_AFTER_DIGIT = /(\d)(개|명|곳|번|회|점|원|장|마리|권|대|살|년|월|일|시간|분|초|퍼센트|%|cm|mm|km|kg|g|m|l|ℓ)/g
// "30 이상 40 미만" / "30이상40미만" / "30~40" / "30-40" / "30부터40까지" → "30~40"
const RANGE = /(\d+(?:\.\d+)?)(?:이상|부터|~|-|–|—|에서)(\d+(?:\.\d+)?)(?:미만|까지|이하)?/g

export function coreOfShort(s: string): string {
  let x = normalizeShort(s)
  x = x.replace(TRAILING_ENDINGS, '')
  x = x.replace(UNIT_AFTER_DIGIT, '$1')   // 숫자 뒤 단위는 위치에 상관없이 제거("30개 이상 40개 미만" → "30이상40미만")
  x = x.replace(TRAILING_UNITS, '')
  x = x.replace(RANGE, '$1~$2')          // 범위 표기 통일
  return x
}

function asNumber(s: string): number | null {
  const m = s.match(/^[-+]?\d+(?:\.\d+)?$/)
  return m ? Number(s) : null
}

/**
 * 선택형은 표시 기호(①…) 완전 일치, 단답형은 정규화 후 일치. 정답 키가 "A / B"면 둘 중 하나.
 * 단답형은 유연하게 본다: 단위·종결어미를 뗀 핵심이 같거나(6개 = 6), 숫자면 값이 같으면(6.0 = 6) 정답.
 */
/** 정답 표기가 모두 숫자·범위("4", "0.36", "5회 이상 10회 미만" → 5~10, "약 19개")인가 — 핵심어가 뜻이 없는 정답. */
export function isNumericAnswer(answer: string): boolean {
  const cores = answer.split('/').map((k) => coreOfShort(k)).filter(Boolean)
  return cores.length > 0 && cores.every((c) => /^약?[-+]?[\d.]+(~[\d.]+)?$/.test(c))
}

/** 글자 비교(지금까지의 규칙): 정규화 일치, 단위·종결어미를 뗀 핵심 일치, 숫자 값 일치. 정답 키가 "A / B"면 둘 중 하나. */
function literalMatch(item: QuizKey, r: string): boolean {
  const keys = item.answer.split('/').map((k) => k.trim()).filter(Boolean)
  const rNorm = normalizeShort(r)
  const rCore = coreOfShort(r)
  const rNum = asNumber(rCore)
  return keys.some((k) => {
    if (normalizeShort(k) === rNorm) return true
    const kCore = coreOfShort(k)
    if (kCore && kCore === rCore) return true
    const kNum = asNumber(kCore)
    return kNum !== null && rNum !== null && kNum === rNum
  })
}

const NEGATION = /않|아니|아님|없|못\s|\bnot\b|n't\b|\bno\b|\bnever\b/i
/** 낱말 첫머리인가 — 바로 앞 글자가 한글·영문·숫자가 아니면(문장 처음·공백·구두점 뒤) 첫머리로 본다. */
const WORD_CHAR = /[0-9A-Za-z\u3131-\u318E\uAC00-\uD7A3]/

/**
 * 핵심어 일치(L-22) — 오탐을 막는 조건(독립 검토 2026-10-12): 핵심어가 모두 들어 있어야 하고,
 * ① 숫자뿐인 핵심어는 무시(14 가 4 를 품는 문제), ② 정답 키에 없는 부정 표현("않·아니·없·not")이 답에 있으면 안 됨,
 * ③ 답이 가장 긴 정답 키의 2배를 넘고 15자도 넘으면 안 됨(긴 답은 AI 가 본다), ④ 핵심어는 낱말 첫머리에서만 센다("상대도수"는 "도수"가 아님).
 * 못 맞히면 false 로 떨어져 AI 뜻 판정으로 간다 — 핵심어 오탐은 원장 눈에 안 띄고, 놓침은 0.1원이면 되기 때문.
 */
function keywordMatch(item: QuizKey, r: string): boolean {
  const kws = (item.keywords ?? []).map((k) => normalizeShort(k)).filter((k) => k && !/^[-+]?[\d.]+$/.test(k))
  if (kws.length === 0) return false
  const keys = item.answer.split('/').map((k) => k.trim()).filter(Boolean)
  const longest = Math.max(0, ...keys.map((k) => k.length))
  if (r.length > Math.max(longest * 2, 15)) return false
  if (NEGATION.test(r) && !keys.some((k) => NEGATION.test(k))) return false
  const lower = r.toLowerCase()
  // 공백을 뗀 글에서 자리를 찾고, 원문에서 그 자리 바로 앞 글자를 본다(공백·문장 처음이면 낱말 첫머리)
  const map: number[] = []
  let stripped = ''
  for (let i = 0; i < lower.length; i++) { if (!/\s/.test(lower[i])) { map.push(i); stripped += lower[i] } }
  return kws.every((k) => {
    let from = 0
    while (from <= stripped.length - k.length) {
      const at = stripped.indexOf(k, from)
      if (at < 0) return false
      const orig = map[at]
      if (orig === 0 || !WORD_CHAR.test(lower[orig - 1])) return true
      from = at + 1
    }
    return false
  })
}

/** 무엇으로 맞았는지 — 글자 비교(literal) → 핵심어(keyword) → 못 맞힘(null). 원장 표가 핵심어 일치를 따로 표시한다. */
export function matchKind(item: QuizKey, response: string): 'literal' | 'keyword' | null {
  const r = response.trim()
  if (!r) return null
  if (item.type === 'choice') return r === item.answer.trim() ? 'literal' : null
  if (literalMatch(item, r)) return 'literal'
  return keywordMatch(item, r) ? 'keyword' : null
}

/** 선택형은 표시 기호(①…) 완전 일치, 단답형은 글자 비교 → 핵심어(L-22). */
export function judgeQuiz(item: QuizKey, response: string): boolean {
  return matchKind(item, response) !== null
}

/**
 * AI 뜻 판정(lib/classroom/quiz-judge.ts)을 부를 문항인가 — 단답형이고, 답이 비어 있지 않고, 글자 비교·핵심어로 틀렸을 때만.
 * 정답 표기가 모두 숫자이고 학생 답도 숫자면 값이 다른 것이라 부르지 않는다(비용 0).
 */
export function needsAiJudge(item: QuizKey, response: string): boolean {
  const r = response.trim()
  if (item.type !== 'short' || !r) return false
  if (judgeQuiz(item, r)) return false
  return !(isNumericAnswer(item.answer) && asNumber(coreOfShort(r)) !== null)
}

/**
 * 학생 화면의 퀴즈 결과를 문항 번호 자리에 맞춘다(1번 = 0번 자리). 응답 줄이 없는 자리는 null.
 * 원장이 종이 O/X 를 일부 문항에만 넣은 차시도 자리가 밀리지 않는다. paper = 원장이 넣은 줄(source 'teacher').
 */
export function alignQuizDone(quizCount: number, rows: { quiz_no: number; response: string; correct: boolean; source?: string }[]): ({ response: string; correct: boolean; paper: boolean } | null)[] {
  return Array.from({ length: quizCount }, (_, i) => {
    const r = rows.find((x) => x.quiz_no === i + 1)
    return r ? { response: r.response, correct: r.correct, paper: r.source === 'teacher' } : null
  })
}
