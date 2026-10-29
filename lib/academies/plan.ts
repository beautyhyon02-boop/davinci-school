/**
 * 가맹 상품(plan) — 대표 2026-10-29 「가맹 상품 두 단계」(앞서 본사 PRD 2026-10-20 「RED 이용 권한 분리」).
 * davinci: 다빈치올(RED 자료실 + 서논술 수업) / davinci_basic: 다빈치 베이직(RED 자료실만, 서논술 수업은 닫힘).
 * 불리언이 아니라 문자열인 까닭: 상품이 늘어날 때 값만 더하면 되게.
 */
export const PLANS = ['davinci', 'davinci_basic'] as const
export type Plan = (typeof PLANS)[number]
export const DEFAULT_PLAN: Plan = 'davinci_basic'

export function isPlan(v: unknown): v is Plan {
  return typeof v === 'string' && (PLANS as readonly string[]).includes(v)
}

/** RED 자료(목록·내려받기)를 볼 수 있는가. 관리자, 또는 두 상품 원장 모두. */
export function canUseRed(role: string | null | undefined, plan: Plan | null | undefined): boolean {
  if (role === 'admin') return true
  return role === 'teacher' && isPlan(plan)
}

/** 서논술 수업(원장 화면·서버 동작·API)을 쓸 수 있는가. 관리자, 또는 다빈치올 원장만. */
export function canUseEssay(role: string | null | undefined, plan: Plan | null | undefined): boolean {
  if (role === 'admin') return true
  return role === 'teacher' && plan === 'davinci'
}
