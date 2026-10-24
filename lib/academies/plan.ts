/**
 * 가맹 상품(plan) — 본사 PRD 2026-10-20 「RED 이용 권한 분리」.
 * davinci: 다빈치스쿨 가맹(RED 자료실 열림) / essay_only: 서논술 전용(RED 는 소개까지만).
 * 불리언이 아니라 문자열인 까닭: 상품이 늘어날 때 값만 더하면 되게.
 */
export const PLANS = ['davinci', 'essay_only'] as const
export type Plan = (typeof PLANS)[number]
export const DEFAULT_PLAN: Plan = 'essay_only'

export function isPlan(v: unknown): v is Plan {
  return typeof v === 'string' && (PLANS as readonly string[]).includes(v)
}

/** RED 자료(목록·내려받기)를 볼 수 있는가. 관리자는 plan 과 무관하게 본다. */
export function canUseRed(role: string | null | undefined, plan: Plan | null | undefined): boolean {
  if (role === 'admin') return true
  return role === 'teacher' && plan === 'davinci'
}
