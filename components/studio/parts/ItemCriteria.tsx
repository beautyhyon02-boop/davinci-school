import { app } from '@/content/site'
import { SubLabel } from './common'

// 평가 요소(대표 2026-09-29: "평가 요소에 나와 있는 것들이 조건이라고 보면 된다" — 채점되는 것은 학생에게 보여야 한다).
// 문항마다 채점 요소 이름과 만점을 한 줄에 하나씩 보인다: 학생 답안 칸, 문제지 인쇄, 원장 문항 카드(PackageView), 제작소 5단계 카드.
// 넘기는 것은 이름·만점뿐이다 — 척도 서술(descriptor)·예시·예시답안·A~E(level_map)는 이 조각에 들어오지 않는다(studentCriteria).
// 서술형은 조건이 없으므로(C-32) 이 목록이 채점 기준을 알리는 유일한 줄이고, 논술형은 번호 붙은 조건 다음에 온다.
// parts/ 규칙: 서버·클라이언트 어디서나 렌더된다(평범한 데이터만 받는다).

const copy = app.packageView.items

export type VisibleCriterion = { name: string; max: number }

/**
 * variant 'card' = 원장·제작소 문항 카드와 문제지(작은 회색 소제목), 'student' = 학생 답안 칸(조건 머리글과 같은 굵은 글자).
 * 요소가 없으면(옛 판·손으로 고친 판) 그리지 않는다.
 */
export function ItemCriteria({ criteria, variant = 'card', className = '' }: { criteria: VisibleCriterion[]; variant?: 'card' | 'student'; className?: string }) {
  if (criteria.length === 0) return null
  return (
    <div data-item-criteria className={className || undefined}>
      {variant === 'student' ? <p className="font-semibold">{copy.criteriaHeading}</p> : <SubLabel>{copy.criteriaHeading}</SubLabel>}
      <ul className={`${variant === 'student' ? '' : 'mt-1 '}list-disc space-y-0.5 pl-5`}>
        {criteria.map((c, i) => <li key={i}>{copy.criterionLine(c.name, c.max)}</li>)}
      </ul>
    </div>
  )
}

/** 채점표에서 학생에게 보일 부분만(이름·만점). 척도·축·조건 번호·배운 차시는 뺀다. 저장된 옛 판은 필드가 빠질 수 있어 선택적으로 읽는다. */
export function visibleCriteria(rubric: { criteria?: { name?: string; max?: number }[] | null } | null | undefined): VisibleCriterion[] {
  return (rubric?.criteria ?? [])
    .filter((c): c is { name: string; max: number } => typeof c?.name === 'string' && typeof c?.max === 'number')
    .map(({ name, max }) => ({ name, max }))
}
