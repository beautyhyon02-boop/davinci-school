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

/**
 * `runDefaults`가 stage state:'failed'를 계속 보게 될 때(예: AI 호출이 매번 실패) generate를 무한 반복하지
 * 않도록 하는 순수 판단. `nextAction`은 failed를 항상 'generate'로 돌려주므로(재시도 자체는 정당), 루프를
 * 도는 쪽에서 실패 횟수를 세어 한도(max)에 도달하면 멈추고 사용자가 직접 편집하도록 유도해야 한다.
 */
export function shouldStopOnFailure(failedCount: number, max: number): boolean {
  return failedCount >= max
}
