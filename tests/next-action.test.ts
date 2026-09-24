import { describe, it, expect } from 'vitest'
import { nextAction, canGenerate, shouldStopOnFailure } from '@/lib/studio/next-action'
import type { StageStatus } from '@/lib/studio/stages'

const base = { attempt: 0, updated_at: '' }

describe('nextAction', () => {
  it('undefined status -> generate', () => {
    expect(nextAction(undefined, 1)).toBe('generate')
  })
  it('idle -> generate', () => {
    expect(nextAction({ ...base, state: 'idle' } as StageStatus, 1)).toBe('generate')
  })
  it('failed -> generate', () => {
    expect(nextAction({ ...base, state: 'failed', attempt: 1, error: 'x' } as StageStatus, 1)).toBe('generate')
  })
  it('generated -> review', () => {
    expect(nextAction({ ...base, state: 'generated', attempt: 1, output: {} } as StageStatus, 1)).toBe('review')
  })
  it('reviewed & pass -> accept', () => {
    const s = { ...base, state: 'reviewed', attempt: 1, output: {}, review: { pass: true, issues: [] } } as StageStatus
    expect(nextAction(s, 1)).toBe('accept')
  })
  it('reviewed & !pass & attempt < max -> generate', () => {
    const s = { ...base, state: 'reviewed', attempt: 1, output: {}, review: { pass: false, issues: [] } } as StageStatus
    expect(nextAction(s, 3)).toBe('generate')
  })
  it('reviewed & !pass & attempt == max (boundary) -> edit', () => {
    const s = { ...base, state: 'reviewed', attempt: 3, output: {}, review: { pass: false, issues: [] } } as StageStatus
    expect(nextAction(s, 3)).toBe('edit')
  })
  it('reviewed & !pass & attempt > max -> edit', () => {
    const s = { ...base, state: 'reviewed', attempt: 4, output: {}, review: { pass: false, issues: [] } } as StageStatus
    expect(nextAction(s, 3)).toBe('edit')
  })
  it('accepted -> done', () => {
    const s = { ...base, state: 'accepted', attempt: 1, output: {}, review: { pass: true, issues: [] } } as StageStatus
    expect(nextAction(s, 1)).toBe('done')
  })
})

describe('canGenerate (검토 한도는 안내, 잠금 아님)', () => {
  const failed = (attempt: number) => ({ ...base, state: 'reviewed', attempt, output: {}, review: { pass: false, issues: [] } } as StageStatus)
  it('allows 다시 생성 below, at and above the attempt limit', () => {
    expect(canGenerate(failed(1), 3)).toBe(true)
    expect(canGenerate(failed(3), 3)).toBe(true)
    expect(canGenerate(failed(5), 3)).toBe(true)
  })
  it('allows generate from idle/failed/undefined', () => {
    expect(canGenerate(undefined, 3)).toBe(true)
    expect(canGenerate({ ...base, state: 'idle' } as StageStatus, 3)).toBe(true)
    expect(canGenerate({ ...base, state: 'failed', attempt: 4, error: 'x' } as StageStatus, 3)).toBe(true)
  })
  it('does not allow generate while a review is pending, after a passing review, or once accepted', () => {
    expect(canGenerate({ ...base, state: 'generated', attempt: 1, output: {} } as StageStatus, 3)).toBe(false)
    expect(canGenerate({ ...base, state: 'reviewed', attempt: 3, output: {}, review: { pass: true, issues: [] } } as StageStatus, 3)).toBe(false)
    expect(canGenerate({ ...base, state: 'accepted', attempt: 3, output: {}, review: { pass: true, issues: [] } } as StageStatus, 3)).toBe(false)
  })
  it('the 자동 진행 still stops at the limit (nextAction → edit) so it never loops forever', () => {
    expect(nextAction(failed(3), 3)).toBe('edit')
  })
})

describe('shouldStopOnFailure', () => {
  it('does not stop while failedCount is below max', () => {
    expect(shouldStopOnFailure(0, 1)).toBe(false)
    expect(shouldStopOnFailure(1, 3)).toBe(false)
    expect(shouldStopOnFailure(2, 3)).toBe(false)
  })
  it('stops at the boundary (failedCount == max)', () => {
    expect(shouldStopOnFailure(1, 1)).toBe(true)
    expect(shouldStopOnFailure(3, 3)).toBe(true)
  })
  it('stops when failedCount exceeds max', () => {
    expect(shouldStopOnFailure(4, 3)).toBe(true)
  })
})
