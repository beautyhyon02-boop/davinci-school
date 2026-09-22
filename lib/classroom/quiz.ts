/** 단답형 비교용 정규화: 앞뒤 공백·구두점 제거, 안쪽 공백 제거, 소문자. */
export function normalizeShort(s: string): string {
  return s.trim().replace(/[.。,!?]+$/g, '').replace(/\s+/g, '').toLowerCase()
}

export type QuizKey = { type: 'choice' | 'short'; answer: string; choices: string[] | null }

/** 선택형은 표시 기호(①…) 완전 일치, 단답형은 정규화 후 일치. 정답 키가 "A / B"면 둘 중 하나. */
export function judgeQuiz(item: QuizKey, response: string): boolean {
  const r = response.trim()
  if (!r) return false
  if (item.type === 'choice') return r === item.answer.trim()
  const accepted = item.answer.split('/').map(normalizeShort).filter(Boolean)
  return accepted.includes(normalizeShort(r))
}
