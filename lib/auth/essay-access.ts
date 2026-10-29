import { canUseEssay, type Plan } from '@/lib/academies/plan'
import type { SessionProfile } from '@/lib/auth/session'
import { app } from '@/content/site'

/**
 * 서논술 수업 경로 — 다빈치 베이직 원장에게는 닫힌다(대표 2026-10-29). 탐구보고서(/teacher/inquiry)·홈은 두 상품 모두 열려 있다.
 * 순수 함수만 둔다(클라이언트·시험에서도 import 가능). 세션을 읽고 redirect 하는 requireEssayPage 는 essay-access.server.ts.
 */
export const ESSAY_PATHS = ['/teacher/students', '/teacher/items', '/teacher/assignments', '/teacher/reports'] as const

export function isEssayPath(pathname: string): boolean {
  return ESSAY_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'))
}

/** 원장 메뉴: 서논술 쪽 네 항목은 다빈치올(plan='davinci')에게만 보인다. plan 이 없으면(알 수 없음) 닫힌 쪽으로. */
export function teacherNavFor(plan: Plan | null): { href: string; label: string }[] {
  if (plan === 'davinci') return app.nav.teacher
  return app.nav.teacher.filter((n) => !isEssayPath(n.href))
}

/** 서버 동작·API 용 가드. 관리자 또는 다빈치올 원장이 아니면 던진다. */
export function assertEssayAccess(s: Pick<SessionProfile, 'role' | 'plan'>): void {
  if (!canUseEssay(s.role, s.plan)) throw new Error('essay_plan_required')
}
