import type { StageStatus } from './stages'

export type WizardAction = 'generate' | 'review' | 'accept' | 'done' | 'edit'

/**
 * 세트 마법사(2~7단계)의 "다음 행동"을 순수 함수로 계산한다.
 * idle/failed/미생성 → generate, generated → review, reviewed&통과 → accept,
 * reviewed&불통과 → 시도 횟수가 한도(max) 미만이면 generate, 도달했으면 edit(직접 수정 권유), accepted → done.
 * 'edit'은 [기본값으로 진행] 자동 반복을 멈추라는 뜻일 뿐 잠금이 아니다 — 사람이 누르는 [생성]은 canGenerate가 따로 정한다.
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
 * 사람이 [생성](다시 생성)을 누를 수 있는지. 검토 한도(max)에 닿은 뒤에도 누를 수 있다 — 한도 표지(EXHAUSTED_ERROR)는
 * 안내일 뿐 잠금이 아니다(대주제 소개 e65db5e 와 같은 방식, 2026-09-24 오너 사례: 한도 뒤 [확정]도 [생성]도 못 눌러 막혔다).
 * 생성됨(검토 전)·검토 통과(확정 대기)·확정됨 에서는 지금처럼 누를 수 없다. 확정은 여전히 통과한 검토가 있어야 한다.
 */
export function canGenerate(status: StageStatus | undefined, max: number): boolean {
  const action = nextAction(status, max)
  return action === 'generate' || action === 'edit'
}

/**
 * `runDefaults`가 stage state:'failed'를 계속 보게 될 때(예: AI 호출이 매번 실패) generate를 무한 반복하지
 * 않도록 하는 순수 판단. `nextAction`은 failed를 항상 'generate'로 돌려주므로(재시도 자체는 정당), 루프를
 * 도는 쪽에서 실패 횟수를 세어 한도(max)에 도달하면 멈추고 사용자가 직접 편집하도록 유도해야 한다.
 */
export function shouldStopOnFailure(failedCount: number, max: number): boolean {
  return failedCount >= max
}
