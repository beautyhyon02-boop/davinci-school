import type { StageStatus } from './stages'

export type WizardAction = 'generate' | 'accept' | 'done'

/**
 * 세트 마법사(2~7단계)의 "다음 행동"을 순수 함수로 계산한다(대표 결정 2026-09-26: 검토는 참고, [확인]으로 진행).
 * 준비 전·실패·미생성 → generate, 생성됨·검토 의견 받음 → accept(검토 결과와 무관), 확인됨 → done.
 * 시도 횟수 한도로 멈추지 않는다 — [기본값으로 진행]은 생성이 실패할 때만 멈춘다(useStageRunner).
 */
export function nextAction(status: StageStatus | undefined): WizardAction {
  if (!status || status.state === 'idle' || status.state === 'failed') return 'generate'
  if (status.state === 'generated' || status.state === 'reviewed') return 'accept'
  // accepted
  return 'done'
}

/**
 * 사람이 [생성](다시 생성)을 누를 수 있는지. 확인(accepted)하기 전에는 언제든 누를 수 있다 — 생성됨·검토 의견 받음 상태에서도
 * 결과가 마음에 들지 않으면 다시 만든다. 확인한 단계는 [JSON 편집]으로 고친다(하위 단계가 함께 초기화된다).
 */
export function canGenerate(status: StageStatus | undefined): boolean {
  return status?.state !== 'accepted'
}

/** [확인]을 누를 수 있는지 — 확인할 출력이 있고(생성됨·검토 의견 받음) 아직 확인하지 않았으면 언제나. 검토 결과는 보지 않는다. */
export function canAccept(status: StageStatus | undefined): boolean {
  return nextAction(status) === 'accept' && status?.output !== undefined
}

/** [AI 검토 의견 보기]를 누를 수 있는지 — 선택 기능. 출력이 있으면 확인 전후 언제나(결과는 참고일 뿐 아무것도 막지 않는다). */
export function canReview(status: StageStatus | undefined): boolean {
  return status?.output !== undefined && status.state !== 'failed' && status.state !== 'idle'
}

export type AutoRunStop = { kind: 'failed' } | { kind: 'error'; message: string }

/**
 * [기본값으로 진행]의 순수 루프(대표 결정 2026-09-26). `from` 단계부터 끝까지 각 단계를 nextAction 대로 생성하고 곧바로 확인한다 —
 * 검토('review')는 부르지 않는다. 확인된 단계는 건너뛰고, 이미 생성된 단계는 확인만 한다. 생성 결과가 failed 이거나 요청이
 * 거절(throw)되면 그 단계에서 멈춘다. 한 단계는 많아야 두 번(생성·확인) 부른다 — 무한 반복 방지.
 * 돌려주는 stage 는 멈춘(또는 마지막으로 다룬) 단계다.
 */
export async function autoConfirm<S extends number>({ stages, from, get, post, onStatus }: {
  stages: readonly S[]
  from: S
  get: (stage: S) => StageStatus | undefined
  post: (stage: S, action: 'generate' | 'accept') => Promise<StageStatus>
  onStatus: (stage: S, status: StageStatus) => void
}): Promise<{ stage: S | undefined; stop?: AutoRunStop }> {
  let last: S | undefined
  for (const stage of stages) {
    if (stage < from) continue
    last = stage
    for (let step = 0; step < 2; step++) {
      const action = nextAction(get(stage))
      if (action === 'done') break
      let status: StageStatus
      try {
        status = await post(stage, action)
      } catch (e) {
        return { stage, stop: { kind: 'error', message: (e as Error).message } }
      }
      onStatus(stage, status)
      if (status.state === 'failed') return { stage, stop: { kind: 'failed' } }
    }
  }
  return { stage: last }
}
