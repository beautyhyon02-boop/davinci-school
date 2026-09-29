/** 단답형 비교용 정규화: 앞뒤 공백·구두점 제거, 안쪽 공백 제거, 소문자. */
export function normalizeShort(s: string): string {
  return s.trim().replace(/[.。,!?]+$/g, '').replace(/\s+/g, '').toLowerCase()
}

export type QuizKey = { type: 'choice' | 'short'; answer: string; choices: string[] | null }

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
export function judgeQuiz(item: QuizKey, response: string): boolean {
  const r = response.trim()
  if (!r) return false
  if (item.type === 'choice') return r === item.answer.trim()
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
