import type { StageStatus } from './stages'

export type WizardAction = 'generate' | 'review' | 'accept' | 'done' | 'edit'

/**
 * 세트 마법사(2~6단계)의 "다음 행동"을 순수 함수로 계산한다.
 * idle/failed/미생성 → generate, generated → review, reviewed&통과 → accept,
 * reviewed&불통과 → 시도 횟수가 한도(max) 미만이면 generate, 도달했으면 edit(직접 수정), accepted → done.
 */
export function nextAction(status: StageStatus | undefined, max: number): WizardAction {
  if (!status || status.state === 'idle' || status.state === 'failed') return 'generate'
  if (status.state === 'generated') return 'review'
  if (status.state === 'reviewed') {
    if (status.review?.pass) return 'accept'
    return status.attempt < max ? 'generate' : 'edit'
  }
  // accepted
  return 'done'
}
