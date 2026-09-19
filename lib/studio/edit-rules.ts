import { STAGE_ERRORS, type StageErrorCode, type StageStatus } from './stages'

/** 마법사가 다루는(= 관리자가 JSON 으로 직접 고칠 수 있는) 단계. */
export const EDITABLE_STAGES = [2, 3, 4, 5, 6] as const
export type EditableStage = (typeof EDITABLE_STAGES)[number]

const LAST_STAGE = 6

/**
 * n단계를 직접 수정(JSON 편집)해도 되는지 순수하게 판정한다. 생성과 같은 확정 게이트를 적용한다 —
 * runStage 는 n-1단계가 accepted 여야 n단계를 생성하는데(stages.ts), 편집 경로에는 그 검사가 없어
 * 아직 근거가 없는 단계에 출력을 밀어 넣을 수 있었다.
 * 2단계의 전 단계는 1단계(성취기준 선택)이고 runStage 는 2단계 이상에서 성취기준 2개 이상을 요구하므로,
 * 2단계는 "성취기준 2개 이상"을 같은 조건으로 본다.
 */
export function canEditStage({
  stage,
  statuses,
  standardCount,
}: {
  stage: number
  statuses: Record<string, StageStatus | undefined>
  standardCount: number
}): { ok: true } | { ok: false; code: StageErrorCode } {
  if (stage === 2) {
    if (standardCount < 2) return { ok: false, code: STAGE_ERRORS.TOO_FEW_STANDARDS }
    return { ok: true }
  }
  if (statuses[`stage${stage - 1}`]?.state !== 'accepted') {
    return { ok: false, code: STAGE_ERRORS.PREV_NOT_ACCEPTED }
  }
  return { ok: true }
}

/**
 * n단계를 고치면 n+1..6단계는 바뀐 근거 위에 만들어진 낡은 출력이므로 idle 로 되돌린다(출력·검토 폐기).
 * 이미 idle 인 단계는 되돌릴 게 없으므로 건너뛴다 — set_stage_status 호출 수를 필요한 만큼만 낸다.
 */
export function downstreamResets(
  stage: number,
  statuses: Record<string, StageStatus | undefined>,
  now: string,
): { stage: number; status: StageStatus }[] {
  const resets: { stage: number; status: StageStatus }[] = []
  for (let s = stage + 1; s <= LAST_STAGE; s++) {
    const current = statuses[`stage${s}`]
    if (!current || current.state === 'idle') continue
    resets.push({ stage: s, status: { state: 'idle', attempt: 0, updated_at: now } })
  }
  return resets
}

/**
 * 2단계가 다시 만들어지거나 수정되면 핵심질문 후보가 달라진다 — 이미 고른 핵심질문이 새 후보에 없으면 비운다.
 * 비교 키는 선택 UI(chooseKeyQuestion)와 같은 후보 문자열 그 자체다.
 */
export function keyQuestionAfterStage2(current: string | null | undefined, candidates: string[]): string | null {
  if (!current) return null
  return candidates.includes(current) ? current : null
}
