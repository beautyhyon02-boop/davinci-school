/**
 * 세트 구조의 숫자를 문장 조각으로(규칙·프롬프트·검토 초점이 같이 쓴다). 숫자는 assessment-structure.ts·level-map.ts 에서만 온다 —
 * 배점·시간을 바꾸면 이 조각이 따라 바뀐다. 규칙 문장(부록 A)은 스펙 행과 글자까지 같아야 하므로(tests/rules.test.ts),
 * 숫자를 바꾼 뒤에는 그 테스트가 알려 주는 새 문장으로 스펙 부록 A 행을 고친다.
 */
import { SET_ITEMS, SET_TOTAL, SHORT_POINTS, ESSAY_POINTS, SHORT_TOTAL, SHORT_CRITERIA, ESSAY_CRITERIA, SET_ITEM_COUNT, ASSESSMENT_SESSION } from './assessment-structure'
import { GRADE_TABLE_22 } from './level-map'

const [SHORT_STEP, ESSAY_STEP] = ASSESSMENT_SESSION.steps
const range = (a: number, b: number) => (a === b ? `${a}` : `${a}~${b}`)

/** "서술형 6점" 예시 단계 "6·5·4·3·2·1". */
export const SHORT_EXEMPLAR_STEPS = Array.from({ length: SHORT_POINTS }, (_, i) => SHORT_POINTS - i).join('·')
/** "2~3" — 서술형 채점 요소 수. */
export const SHORT_CRITERIA_RANGE = range(SHORT_CRITERIA.min, SHORT_CRITERIA.max)
/** "서술형 6 + 논술형 16 = 22". */
export const POINTS_SUM = `서술형 ${SHORT_POINTS} + 논술형 ${ESSAY_POINTS} = ${SET_TOTAL}`
/** "0~6" — 논술형 예시가 전제하는 서술형 점수 범위(assumed_short_points). */
export const ASSUMED_SHORT_RANGE = `0~${SHORT_TOTAL}`
/** "1~2" — 5단계 문항 번호 범위. */
export const ITEM_NO_RANGE = range(1, SET_ITEM_COUNT)
/** 평가 차시 시간 "평가 안내 5 · 서술형 작성 15 · 논술형 작성 35 · 정리 5". */
export const SESSION_MINUTES = `평가 안내 ${ASSESSMENT_SESSION.time_budget.intro_min} · ${SHORT_STEP.step_label} ${SHORT_STEP.minutes} · ${ESSAY_STEP.step_label} ${ESSAY_STEP.minutes} · 정리 ${ASSESSMENT_SESSION.time_budget.wrapup_min}`
/** 두 작성 소단계의 분. */
export const SHORT_MINUTES = SHORT_STEP.minutes
export const ESSAY_MINUTES = ESSAY_STEP.minutes
/** "서술형 작성 15분 + 논술형 작성 35분". */
export const SESSION_STEPS = `${SHORT_STEP.step_label} ${SHORT_STEP.minutes}분 + ${ESSAY_STEP.step_label} ${ESSAY_STEP.minutes}분`

/** "서술형 1 + 논술형 1" — 문항 구성(개수). */
export const SET_KINDS = `서술형 ${SET_ITEMS.서술형.count} + 논술형 ${SET_ITEMS.논술형.count}`

/** 등급표 "21~22, 18~20, … 0~4" (7등급부터). */
export const GRADE_RANGES = [...GRADE_TABLE_22].sort((a, b) => b.grade - a.grade).map((b) => range(b.min, b.max)).join(', ')
/** "상=6~7, 중=3~5, 하=1~2". */
export const GRADE_BANDS = (['상', '중', '하'] as const).map((band) => {
  const gs = GRADE_TABLE_22.filter((b) => b.band === band).map((b) => b.grade)
  return `${band}=${range(Math.min(...gs), Math.max(...gs))}`
}).join(', ')
/** "7=A, 6=B, 5=C, 4=D, 3=E, 2·1=E 미만". */
export const LEVEL_REFS = (() => {
  const rows = [...GRADE_TABLE_22].sort((a, b) => b.grade - a.grade)
  const out: string[] = []
  for (const r of rows) {
    const prev = out.length ? rows[rows.indexOf(r) - 1] : null
    if (prev && prev.level_ref === r.level_ref) out[out.length - 1] = out[out.length - 1].replace(`=${r.level_ref}`, `·${r.grade}=${r.level_ref}`)
    else out.push(`${r.grade}=${r.level_ref}`)
  }
  return out.join(', ')
})()

/** 논술형 채점표 "4요소 × 0~4점". */
export const ESSAY_RUBRIC = `${ESSAY_CRITERIA.count}요소 × 0~${ESSAY_CRITERIA.max}점`
/** 세트 구성 문장 조각 "서술형 1문항(6점, 채점 요소 2~3개) + 논술형 1문항(16점, 4요소 × 0~4점) = 22점". */
export const SET_COMPOSITION = `서술형 ${SET_ITEMS.서술형.count}문항(${SHORT_POINTS}점, 채점 요소 ${SHORT_CRITERIA_RANGE}개) + 논술형 ${SET_ITEMS.논술형.count}문항(${ESSAY_POINTS}점, ${ESSAY_RUBRIC}) = ${SET_TOTAL}점`
