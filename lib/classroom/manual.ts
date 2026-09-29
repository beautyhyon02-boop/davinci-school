import type { Criterion } from './types'

/**
 * 종이 답안 점수 입력(설계 2026-09-29 §4.2, R-5)의 순수 계산. 원장이 루브릭을 보며 요소별 점수를 직접 고른다 — AI 호출 없음.
 * DB·화면 문구를 쓰지 않는다(브라우저에서도 부른다). 저장은 paper-score.ts.
 */

/** gradings.model 값: 원장이 직접 입력한 채점(AI 초안 없음 — ai_* 열은 비어 있다). */
export const MANUAL_MODEL = 'manual'

export function isManualGrading(g: { model?: string | null } | null | undefined): boolean {
  return g?.model === MANUAL_MODEL
}

export type RubricLike = { criteria: { name: string; max: number }[] }

/**
 * 요소별 점수(채점표 순서)를 확정본 모양으로. 이름·만점은 채점표 것(alignCriteria 와 같은 뜻 — 채점표 순서, 요소 수 일치),
 * 근거·메모는 비운다(답안 글이 없다). 점수가 정수가 아니거나 0..max 를 벗어나거나 요소 수가 다르면 null.
 */
export function buildManualCriteria(rubric: RubricLike, points: unknown): { criteria: Criterion[]; score: number } | null {
  if (!Array.isArray(points) || points.length !== rubric.criteria.length || rubric.criteria.length === 0) return null
  const criteria: Criterion[] = []
  for (const [i, r] of rubric.criteria.entries()) {
    const p = points[i]
    if (typeof p !== 'number' || !Number.isInteger(p) || p < 0 || p > r.max) return null
    criteria.push({ name: r.name, points: p, max: r.max, evidence: '', note: '' })
  }
  return { criteria, score: criteria.reduce((s, c) => s + c.points, 0) }
}

/** 고른 점수의 합과, 모든 요소를 골랐는지(고르지 않은 요소는 null). */
export function manualTotal(points: (number | null)[]): { total: number; complete: boolean } {
  return { total: points.reduce<number>((s, p) => s + (p ?? 0), 0), complete: points.length > 0 && points.every((p) => p !== null) }
}

/**
 * 이 문항에 [종이 답안 점수 입력]을 보일 것인가: 1회차 답안이 제출되지 않았을 때(줄이 없거나 임시저장만).
 * 원장이 넣은 답안 줄은 있는데 채점 줄이 없으면(지난 저장이 중간에 실패) 다시 저장할 수 있게 연다.
 */
export function canEnterPaperScore(first: { submitted_at: string | null; source: string } | null | undefined, hasGrading: boolean): boolean {
  if (!first || !first.submitted_at) return true
  return first.source === 'teacher' && !hasGrading
}
