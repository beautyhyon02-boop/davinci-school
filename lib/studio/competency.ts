// 단원 리포트의 육각형 축(대표 결정 2026-09-29, R-1) — 과목과 무관한 공통 역량 6개. 순서가 곧 육각형의 꼭짓점 순서다.
// 설계: docs/superpowers/specs/2026-09-29-unit-report-design.md §3
export const COMPETENCIES = ['지식·이해', '자료 읽기', '근거 들어 설명하기', '글로 표현하기', '과정·기능', '가치·태도'] as const
export type Competency = (typeof COMPETENCIES)[number]

/** 역량마다 쉬운 말 한 줄(생성 프롬프트·규칙 C-40 이 같은 문장을 쓴다). */
export const COMPETENCY_MEANING: Record<Competency, string> = {
  '지식·이해': '개념·용어를 안다',
  '자료 읽기': '표·글·그림에서 정보를 찾는다',
  '근거 들어 설명하기': '이유·근거를 들어 설명·주장한다',
  '글로 표현하기': '읽는 사람에게 맞게 문장·글로 쓴다',
  '과정·기능': '계산·절차·탐구 방법을 수행한다',
  '가치·태도': '가치를 판단하고 실천 의지를 보인다',
}
/** "지식·이해(개념·용어를 안다), 자료 읽기(…), …" — 여섯 역량과 뜻을 한 줄로. */
export const COMPETENCY_GLOSS = COMPETENCIES.map((c) => `${c}(${COMPETENCY_MEANING[c]})`).join(', ')

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
