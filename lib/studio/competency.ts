// 단원 리포트의 육각형 축(대표 결정 2026-09-29, R-1) — 과목과 무관한 공통 역량 6개. 순서가 곧 육각형의 꼭짓점 순서다.
// 설계: docs/superpowers/specs/2026-09-29-unit-report-design.md §3
export const COMPETENCIES = ['지식·이해', '자료 읽기', '근거 들어 설명하기', '글로 표현하기', '과정·기능', '가치·태도'] as const
export type Competency = (typeof COMPETENCIES)[number]

const isCompetency = (v: unknown): v is Competency => typeof v === 'string' && (COMPETENCIES as readonly string[]).includes(v)

/**
 * 문항·채점 요소의 역량. 꼬리표(competency)가 있으면 그것, 없으면(옛 판·기존 세트) 보정한다 —
 * 채점 요소는 3차원 axis(지식·이해/과정·기능/가치·태도)와 같은 이름의 역량, 그 밖(퀴즈)은 지식·이해.
 */
export function competencyOf(tagged: { competency?: unknown; axis?: unknown }): Competency {
  if (isCompetency(tagged.competency)) return tagged.competency
  if (isCompetency(tagged.axis)) return tagged.axis
  return '지식·이해'
}
