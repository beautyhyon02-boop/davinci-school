import { describe, it, expect, beforeAll } from 'vitest'
import { runStage, type Repo } from '@/lib/studio/stages'
import { readFileSync } from 'node:fs'

beforeAll(() => { process.env.AI_MOCK = '1'; delete process.env.ANTHROPIC_API_KEY })

function fakeRepo(): Repo & { outputs: Record<number, unknown>; statuses: Record<number, unknown> } {
  const std = JSON.parse(readFileSync('data/studio-fixtures/standards-math.json', 'utf8'))
  const outputs: Record<number, unknown> = {}, statuses: Record<number, unknown> = {}
  return {
    outputs, statuses,
    async loadContext() { return { theme: { title: '학교 축제 일회용품 줄이기', level: '중', grade: 1, subjects: ['수학'] }, subject: '수학', standards: std, prior: {}, outputs, statuses: statuses as Record<number, import('@/lib/studio/stages').StageStatus> } },
    async saveOutput(_id, stage, out) { outputs[stage] = out },
    async saveStatus(_id, stage, st) { statuses[stage] = st },
    async log() {},
  }
}

describe('runStage', () => {
  it('generate → review → accept for stage 2', async () => {
    const repo = fakeRepo()
    const g = await runStage({ itemSetId: 'x', stage: 2, action: 'generate', repo })
    expect(g.status.state).toBe('generated')
    const r = await runStage({ itemSetId: 'x', stage: 2, action: 'review', repo })
    expect(r.status.state).toBe('reviewed'); expect(r.status.review?.pass).toBe(true)
    const a = await runStage({ itemSetId: 'x', stage: 2, action: 'accept', repo })
    expect(a.status.state).toBe('accepted')
  })
  it('stage 2 review fails locally on unfaithful reconstruction without calling AI', async () => {
    const repo = fakeRepo()
    await runStage({ itemSetId: 'x', stage: 2, action: 'generate', repo })
    ;(repo.outputs[2] as { reconstruction: string }).reconstruction = '학생은 축제 일회용품 감축 방안을 제안할 수 있다.'
    const r = await runStage({ itemSetId: 'x', stage: 2, action: 'review', repo })
    expect(r.status.review?.pass).toBe(false)
    expect(r.status.review?.issues[0].kind).toBe('fidelity')
  })
  it('refuses to accept before review passes', async () => {
    const repo = fakeRepo()
    await runStage({ itemSetId: 'x', stage: 3, action: 'generate', repo })
    await expect(runStage({ itemSetId: 'x', stage: 3, action: 'accept', repo })).rejects.toThrow(/review/)
  })
})
