/**
 * 조건 문장 끝의 부분배점 표기를 화면에서 한 번만 보이게 한다.
 * 규칙 C-11은 "필요한 조건 끝에 부분배점을 소괄호로 병기"하라고 하므로 모델이 text 에 "(4점)"을 붙이고 points 에도 4를 넣는다.
 * 화면은 points 배지를 따로 보여 주므로, points 가 있으면 text 꼬리의 "(N점)"을 떼어 "(4점) 4점" 중복을 없앤다(2026-09-26 대표님 지적).
 */
const TRAILING_POINTS = /\s*[（(]\s*\d+\s*점\s*[)）]\s*$/u

export function conditionDisplayText(text: string, points: number | null | undefined): string {
  if (points === null || points === undefined) return text
  return text.replace(TRAILING_POINTS, '')
}
