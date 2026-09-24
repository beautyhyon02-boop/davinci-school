import { describe, it, expect } from 'vitest'
import { canEditStage, downstreamResets, keyQuestionAfterStage2, normalizeKeyQuestion, KEY_QUESTION_LIMITS, EDITABLE_STAGES } from '@/lib/studio/edit-rules'
import { WIZARD_STAGES } from '@/lib/studio/wizard-stages'
import { STAGE_ERRORS, type StageStatus } from '@/lib/studio/stages'

const NOW = '2026-09-20T00:00:00.000Z'

function accepted(): StageStatus {
  return { state: 'accepted', attempt: 1, output: {}, review: { pass: true, issues: [] }, updated_at: NOW }
}
function status(state: StageStatus['state']): StageStatus {
  return { state, attempt: 1, output: {}, updated_at: NOW }
}

describe('canEditStage', () => {
  it('allows editing stage 2 when the set has 2+ standards (stage 2의 전 단계 = 성취기준 선택)', () => {
    expect(canEditStage({ stage: 2, statuses: {}, standardCount: 2 })).toEqual({ ok: true })
  })

  it('refuses stage 2 with fewer than 2 standards, mirroring runStage', () => {
    const r = canEditStage({ stage: 2, statuses: {}, standardCount: 1 })
    expect(r).toEqual({ ok: false, code: STAGE_ERRORS.TOO_FEW_STANDARDS })
  })

  it('allows editing stage n when stage n-1 is accepted', () => {
    const statuses = { stage2: accepted(), stage3: accepted(), stage4: accepted(), stage5: accepted(), stage6: accepted() }
    for (const stage of [3, 4, 5, 6, 7]) {
      expect(canEditStage({ stage, statuses, standardCount: 3 })).toEqual({ ok: true })
    }
  })

  it('refuses editing stage n when stage n-1 is missing or not accepted', () => {
    expect(canEditStage({ stage: 3, statuses: {}, standardCount: 3 })).toEqual({ ok: false, code: STAGE_ERRORS.PREV_NOT_ACCEPTED })
    for (const state of ['idle', 'generated', 'reviewed', 'failed'] as const) {
      const r = canEditStage({ stage: 4, statuses: { stage3: status(state) }, standardCount: 3 })
      expect(r).toEqual({ ok: false, code: STAGE_ERRORS.PREV_NOT_ACCEPTED })
    }
  })

  it('does not require the edited stage to already have output — 반복 실패 후 직접 입력하는 경로가 막히면 안 된다', () => {
    const statuses = { stage2: accepted(), stage3: status('failed') }
    expect(canEditStage({ stage: 3, statuses, standardCount: 3 })).toEqual({ ok: true })
  })
})

describe('downstreamResets', () => {
  const all = {
    stage2: accepted(),
    stage3: accepted(),
    stage4: accepted(),
    stage5: accepted(),
    stage6: accepted(),
    stage7: accepted(),
  }

  it('resets every later stage to idle with output and review dropped', () => {
    const resets = downstreamResets(3, all, NOW)
    expect(resets.map((r) => r.stage)).toEqual([4, 5, 6, 7])
    for (const r of resets) {
      expect(r.status).toEqual({ state: 'idle', attempt: 0, updated_at: NOW })
      expect(r.status.output).toBeUndefined()
      expect(r.status.review).toBeUndefined()
    }
  })

  it('never touches the edited stage or earlier ones', () => {
    expect(downstreamResets(2, all, NOW).map((r) => r.stage)).toEqual([3, 4, 5, 6, 7])
    expect(downstreamResets(6, all, NOW).map((r) => r.stage)).toEqual([7])
    expect(downstreamResets(7, all, NOW)).toEqual([])
  })

  it('skips stages that are already absent or idle (불필요한 set_stage_status 호출을 내지 않는다)', () => {
    const partial = { stage2: accepted(), stage3: accepted(), stage5: status('idle') }
    expect(downstreamResets(2, partial, NOW).map((r) => r.stage)).toEqual([3])
  })
})

describe('wizard stage list', () => {
  it('covers stages 2..7 (7 = 안내장 틀) and editing follows the same list', () => {
    expect([...WIZARD_STAGES]).toEqual([2, 3, 4, 5, 6, 7])
    expect([...EDITABLE_STAGES]).toEqual([...WIZARD_STAGES])
  })
})

describe('keyQuestionAfterStage2', () => {
  const candidates = ['왜 일회용품은 줄이기 어려울까?', '축제 쓰레기는 어디로 갈까?']

  it('keeps the chosen key question when it is still a candidate', () => {
    expect(keyQuestionAfterStage2(candidates[1], candidates)).toBe(candidates[1])
  })

  it('clears it when the new stage 2 candidates no longer contain it', () => {
    expect(keyQuestionAfterStage2('예전 핵심질문', candidates)).toBeNull()
    expect(keyQuestionAfterStage2(candidates[0], [])).toBeNull()
  })

  it('stays null when nothing was chosen yet', () => {
    expect(keyQuestionAfterStage2(null, candidates)).toBeNull()
    expect(keyQuestionAfterStage2(undefined, candidates)).toBeNull()
    expect(keyQuestionAfterStage2('', candidates)).toBeNull()
  })
})

// 대표 2026-09-26: 핵심질문 수정 칸 — 후보를 고른 뒤 고쳐 쓴 문장을 그대로 저장한다.
describe('핵심질문 수정 칸', () => {
  const candidates = ['왜 일회용품은 줄이기 어려울까?', '축제 쓰레기는 어디로 갈까?']

  it('normalizeKeyQuestion trims and collapses whitespace; an edited sentence need not be a candidate', () => {
    expect(normalizeKeyQuestion('  우리 축제의 일회용품은\n 왜 줄지 않을까?  ')).toEqual({ ok: true, value: '우리 축제의 일회용품은 왜 줄지 않을까?' })
    expect(normalizeKeyQuestion(candidates[0])).toEqual({ ok: true, value: candidates[0] })
  })

  it('normalizeKeyQuestion refuses too short or too long text', () => {
    expect(normalizeKeyQuestion('   왜?  ')).toEqual({ ok: false, code: 'tooShort' })
    expect(normalizeKeyQuestion('가'.repeat(KEY_QUESTION_LIMITS.max + 1))).toEqual({ ok: false, code: 'tooLong' })
    expect(normalizeKeyQuestion('가'.repeat(KEY_QUESTION_LIMITS.max)).ok).toBe(true)
  })

  it('a stage 2 hand edit keeps an admin-edited key question (it was not a candidate before either)', () => {
    const edited = '우리 축제의 일회용품은 왜 줄지 않을까?'
    expect(keyQuestionAfterStage2(edited, ['새 후보 하나입니다', '새 후보 둘입니다'], candidates)).toBe(edited)
  })

  it('a stage 2 hand edit still clears a chosen candidate that the edit changed; regeneration (no previous list) clears edits', () => {
    expect(keyQuestionAfterStage2(candidates[0], ['바뀐 후보 문장입니다', candidates[1]], candidates)).toBeNull()
    expect(keyQuestionAfterStage2('우리 축제의 일회용품은 왜 줄지 않을까?', candidates)).toBeNull()
  })
})
