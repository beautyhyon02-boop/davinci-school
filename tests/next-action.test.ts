import { describe, it, expect } from 'vitest'
import { nextAction, canGenerate, canAccept, canReview, autoConfirm } from '@/lib/studio/next-action'
import type { StageStatus } from '@/lib/studio/stages'

const base = { attempt: 0, updated_at: '' }
const st = (s: Partial<StageStatus> & { state: StageStatus['state'] }) => ({ ...base, ...s }) as StageStatus
const failingReview = (attempt: number) => st({ state: 'reviewed', attempt, output: {}, review: { pass: false, issues: [{ kind: 'fidelity', detail: 'x' }] } })

// 대표 결정 2026-09-26: 세트 마법사는 검토로 막지 않는다 — [생성] → 읽기 → [확인]
describe('nextAction (생성 → 확인)', () => {
  it('undefined / idle / failed -> generate', () => {
    expect(nextAction(undefined)).toBe('generate')
    expect(nextAction(st({ state: 'idle' }))).toBe('generate')
    expect(nextAction(st({ state: 'failed', attempt: 1, error: 'x' }))).toBe('generate')
  })
  it('generated -> accept (no review step in between)', () => {
    expect(nextAction(st({ state: 'generated', attempt: 1, output: {} }))).toBe('accept')
  })
  it('generated with static notes -> still accept (notes are advisory)', () => {
    expect(nextAction(st({ state: 'generated', attempt: 1, output: {}, notes: [{ kind: 'fidelity', detail: 'x' }] }))).toBe('accept')
  })
  it('reviewed -> accept whether the AI review passed or not, at any attempt count', () => {
    expect(nextAction(st({ state: 'reviewed', attempt: 1, output: {}, review: { pass: true, issues: [] } }))).toBe('accept')
    expect(nextAction(failingReview(1))).toBe('accept')
    expect(nextAction(failingReview(3))).toBe('accept')
    expect(nextAction(failingReview(9))).toBe('accept')
  })
  it('accepted -> done', () => {
    expect(nextAction(st({ state: 'accepted', attempt: 1, output: {} }))).toBe('done')
  })
})

describe('canGenerate (확인 전에는 언제나 다시 생성)', () => {
  it('allows generate from undefined/idle/failed/generated/reviewed, at any attempt count', () => {
    expect(canGenerate(undefined)).toBe(true)
    expect(canGenerate(st({ state: 'idle' }))).toBe(true)
    expect(canGenerate(st({ state: 'failed', attempt: 4, error: 'x' }))).toBe(true)
    expect(canGenerate(st({ state: 'generated', attempt: 1, output: {} }))).toBe(true)
    expect(canGenerate(failingReview(5))).toBe(true)
  })
  it('does not allow generate once accepted (고치려면 JSON 편집)', () => {
    expect(canGenerate(st({ state: 'accepted', attempt: 3, output: {} }))).toBe(false)
  })
})

describe('canAccept (출력만 있으면 [확인])', () => {
  it('true for generated and reviewed (pass or not) with an output', () => {
    expect(canAccept(st({ state: 'generated', attempt: 1, output: {} }))).toBe(true)
    expect(canAccept(failingReview(3))).toBe(true)
  })
  it('false without an output or when already accepted', () => {
    expect(canAccept(undefined)).toBe(false)
    expect(canAccept(st({ state: 'idle' }))).toBe(false)
    expect(canAccept(st({ state: 'failed', attempt: 1, error: 'x' }))).toBe(false)
    expect(canAccept(st({ state: 'accepted', attempt: 1, output: {} }))).toBe(false)
  })
})

describe('canReview (AI 검토 의견은 선택)', () => {
  it('available whenever an output is shown, including after 확인', () => {
    expect(canReview(st({ state: 'generated', attempt: 1, output: {} }))).toBe(true)
    expect(canReview(failingReview(2))).toBe(true)
    expect(canReview(st({ state: 'accepted', attempt: 1, output: {} }))).toBe(true)
  })
  it('not available without an output', () => {
    expect(canReview(undefined)).toBe(false)
    expect(canReview(st({ state: 'failed', attempt: 1, error: 'x' }))).toBe(false)
  })
})

describe('autoConfirm ([기본값으로 진행] 루프)', () => {
  const STAGES = [2, 3, 4, 5, 6, 7] as const
  type S = (typeof STAGES)[number]
  function harness(initial: Partial<Record<S, StageStatus>> = {}, fail?: { stage: S; how: 'failed' | 'throw' }) {
    const statuses: Partial<Record<S, StageStatus>> = { ...initial }
    const calls: [S, string][] = []
    const post = async (stage: S, action: 'generate' | 'accept'): Promise<StageStatus> => {
      calls.push([stage, action])
      if (fail?.stage === stage && action === 'generate') {
        if (fail.how === 'throw') throw new Error('rejected')
        return st({ state: 'failed', attempt: 1, error: 'boom' })
      }
      const prev = statuses[stage]
      return action === 'generate'
        ? st({ state: 'generated', attempt: (prev?.attempt ?? 0) + 1, output: { stage }, notes: [{ kind: 'fidelity', detail: '메모' }] })
        : st({ ...prev!, state: 'accepted' })
    }
    const run = (from: S = 2) => autoConfirm({ stages: STAGES, from, get: (s) => statuses[s], post, onStatus: (s, v) => { statuses[s] = v } })
    return { statuses, calls, run }
  }
  it('generates and confirms every stage 2..7 with no review calls, even when static notes exist', async () => {
    const h = harness()
    const r = await h.run()
    expect(r).toEqual({ stage: 7 })
    expect(h.calls).toEqual(STAGES.flatMap((s) => [[s, 'generate'], [s, 'accept']]))
    expect(h.calls.some(([, a]) => a === 'review')).toBe(false)
    for (const s of STAGES) expect(h.statuses[s]?.state).toBe('accepted')
  })
  it('skips confirmed stages and only confirms an already generated (or reviewed) one', async () => {
    const h = harness({ 2: st({ state: 'accepted', attempt: 1, output: {} }), 3: failingReview(4) })
    await h.run(3)
    expect(h.calls.slice(0, 3)).toEqual([[3, 'accept'], [4, 'generate'], [4, 'accept']])
  })
  it('stops at a failed generate and reports the stage', async () => {
    const h = harness({}, { stage: 4, how: 'failed' })
    const r = await h.run()
    expect(r).toEqual({ stage: 4, stop: { kind: 'failed' } })
    expect(h.statuses[3]?.state).toBe('accepted'); expect(h.statuses[4]?.state).toBe('failed'); expect(h.statuses[5]).toBeUndefined()
  })
  it('stops when a request is rejected, carrying the message', async () => {
    const h = harness({}, { stage: 2, how: 'throw' })
    expect(await h.run()).toEqual({ stage: 2, stop: { kind: 'error', message: 'rejected' } })
    expect(h.calls).toEqual([[2, 'generate']])
  })
})
