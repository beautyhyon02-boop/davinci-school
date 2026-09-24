/**
 * 채점표 척도(rubric.criteria[].scale)는 늘 점수(points)로 읽는다 — 배열 순서로 읽지 않는다.
 * 생성 AI가 척도를 만점부터 내림차순으로 적는 일이 있다(2026-09-25 영어 세트: scale[0] = 만점 서술, 마지막 = 0점 서술).
 * 화면·검사·채점 프롬프트·안내장 초안은 모두 이 파일의 함수로 0점부터 오름차순으로 맞춰 읽는다.
 */
export type ScaleStepLike = { points: number }

/** 0점부터 오름차순으로 정렬한 사본(원본은 건드리지 않는다). */
export function sortScale<T extends ScaleStepLike>(scale: readonly T[]): T[] {
  return [...scale].sort((a, b) => a.points - b.points)
}

/** 이미 0점부터 오름차순인지. */
export function isAscendingScale(scale: readonly ScaleStepLike[]): boolean {
  return scale.every((s, i) => i === 0 || scale[i - 1].points <= s.points)
}

/** 주어진 점수의 단계(없으면 undefined). */
export function stepAt<T extends ScaleStepLike>(scale: readonly T[], points: number): T | undefined {
  return scale.find((s) => s.points === points)
}

/** 0점 단계. */
export function zeroStep<T extends ScaleStepLike>(scale: readonly T[]): T | undefined {
  return stepAt(scale, 0)
}

/** 만점 단계 — max 를 주면 그 점수, 없으면 척도에서 가장 큰 점수. */
export function maxStep<T extends ScaleStepLike>(scale: readonly T[], max?: number): T | undefined {
  if (scale.length === 0) return undefined
  return stepAt(scale, max ?? Math.max(...scale.map((s) => s.points)))
}

type WithScales = { items: { rubric: { criteria: { scale: ScaleStepLike[] }[] } }[] }

/**
 * 문항들의 척도를 모두 0점부터 오름차순으로 맞춘다. 이미 오름차순이면 같은 객체를 돌려준다(읽을 때마다 부르는 정규화라 멱등).
 * 문항 조각이 채점표를 갖추지 않았으면(부분 fixture·옛 모양) 그 문항은 건너뛴다.
 */
export function sortAssessmentScales<A extends WithScales>(a: A | null): A | null {
  if (!a || !Array.isArray(a.items)) return a
  const criteriaOf = (it: WithScales['items'][number]) => (Array.isArray(it?.rubric?.criteria) ? it.rubric.criteria : [])
  const needs = a.items.some((it) => criteriaOf(it).some((c) => Array.isArray(c.scale) && !isAscendingScale(c.scale)))
  if (!needs) return a
  return {
    ...a,
    items: a.items.map((it) => {
      const criteria = criteriaOf(it)
      if (!criteria.some((c) => Array.isArray(c.scale) && !isAscendingScale(c.scale))) return it
      return { ...it, rubric: { ...it.rubric, criteria: criteria.map((c) => (Array.isArray(c.scale) && !isAscendingScale(c.scale) ? { ...c, scale: sortScale(c.scale) } : c)) } }
    }),
  }
}
