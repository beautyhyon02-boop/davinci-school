import { STAGE_ERRORS, type StageErrorCode, type StageStatus } from './stages'
import { WIZARD_STAGES } from './wizard-stages'

/** 마법사가 다루는(= 관리자가 JSON 으로 직접 고칠 수 있는) 단계 — 마법사 단계 목록과 같다(2~7). */
export const EDITABLE_STAGES = WIZARD_STAGES
export type EditableStage = (typeof EDITABLE_STAGES)[number]

const LAST_STAGE = 7

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
 * n단계를 고치면 n+1..7단계는 바뀐 근거 위에 만들어진 낡은 출력이므로 idle 로 되돌린다(출력·검토 폐기).
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
 * previousCandidates(수정 전 후보)를 주면(관리자 직접 수정 경로), 핵심질문이 옛 후보에도 없던 문장 — 관리자가 고쳐 쓴 핵심질문 —
 * 은 후보가 바뀌어도 그대로 둔다(대표 2026-09-26: 핵심질문 수정 칸). 다시 생성(repo.saveOutput)은 넘기지 않으므로 늘 비운다.
 */
export function keyQuestionAfterStage2(current: string | null | undefined, candidates: string[], previousCandidates?: string[]): string | null {
  if (!current) return null
  if (candidates.includes(current)) return current
  if (previousCandidates && !previousCandidates.includes(current)) return current
  return null
}

/** 핵심질문 문장 길이(글자, 앞뒤 공백 제외). 최소는 2단계 후보(key_question_candidates min 5)와 같다. */
export const KEY_QUESTION_LIMITS = { min: 5, max: 200 } as const

/**
 * 관리자가 고쳐 쓴 핵심질문(후보를 고른 뒤 수정 칸에서 고친 문장)을 저장 전에 다듬는다 — 앞뒤 공백을 지우고 줄바꿈·연속 공백을
 * 한 칸으로 모은 뒤 길이를 본다. 후보 문장과 같을 필요는 없다(대표 2026-09-26).
 */
export function normalizeKeyQuestion(text: string): { ok: true; value: string } | { ok: false; code: 'tooShort' | 'tooLong' } {
  const value = text.replace(/\s+/g, ' ').trim()
  if (value.length < KEY_QUESTION_LIMITS.min) return { ok: false, code: 'tooShort' }
  if (value.length > KEY_QUESTION_LIMITS.max) return { ok: false, code: 'tooLong' }
  return { ok: true, value }
}
