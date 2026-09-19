import { describe, it, expect, beforeAll } from 'vitest'
import { runStage, type Repo, type StageStatus, type LogRow } from '@/lib/studio/stages'
import { readFileSync } from 'node:fs'

beforeAll(() => { process.env.AI_MOCK = '1'; delete process.env.ANTHROPIC_API_KEY })

type FakeRepo = Repo & { outputs: Record<number, unknown>; statuses: Record<number, StageStatus>; logs: LogRow[] }

/** 이전 단계들을 accepted 로 미리 채운 가짜 저장소. `upTo` 미만의 단계가 확정된 상태로 시작한다. */
function fakeRepo(opts: { acceptedUpTo?: number; standards?: { code: string; text: string }[] } = {}): FakeRepo {
  const std = opts.standards ?? JSON.parse(readFileSync('data/studio-fixtures/standards-math.json', 'utf8'))
  const outputs: Record<number, unknown> = {}, statuses: Record<number, StageStatus> = {}, logs: LogRow[] = []
  for (let s = 0; s < (opts.acceptedUpTo ?? 0); s++) {
    outputs[s] = { placeholder: `stage${s}` }
    statuses[s] = { state: 'accepted', attempt: 1, output: outputs[s], review: { pass: true, issues: [] }, updated_at: '' }
  }
  return {
    outputs, statuses, logs,
    async loadContext() { return { theme: { title: '학교 축제 일회용품 줄이기', level: '중', grade: 1, subjects: ['수학'] }, subject: '수학', standards: std, prior: {}, outputs, statuses } },
    async saveOutput(_id, stage, out) { outputs[stage] = out },
    async saveStatus(_id, stage, st) { statuses[stage] = st },
    async log(e) { logs.push(e) },
  }
}

describe('runStage', () => {
  it('generate → review → accept for stage 2 (records model and review result)', async () => {
    const repo = fakeRepo({ acceptedUpTo: 2 })
    const g = await runStage({ itemSetId: 'x', stage: 2, action: 'generate', repo })
    expect(g.status.state).toBe('generated')
    expect(g.status.model).toBe('mock')
    const r = await runStage({ itemSetId: 'x', stage: 2, action: 'review', repo })
    expect(r.status.state).toBe('reviewed'); expect(r.status.review?.pass).toBe(true)
    expect(r.status.model).toBe('mock')
    const reviewLog = repo.logs.find(l => l.role === 'review')
    expect(reviewLog?.issues).toEqual({ pass: true, issues: [] })
    const a = await runStage({ itemSetId: 'x', stage: 2, action: 'accept', repo })
    expect(a.status.state).toBe('accepted')
    expect(a.status.model).toBe('mock')
  })
  it('stage 2 review fails locally on unfaithful reconstruction without calling AI', async () => {
    const repo = fakeRepo({ acceptedUpTo: 2 })
    await runStage({ itemSetId: 'x', stage: 2, action: 'generate', repo })
    ;(repo.outputs[2] as { reconstruction: string }).reconstruction = '학생은 축제 일회용품 감축 방안을 제안할 수 있다.'
    const r = await runStage({ itemSetId: 'x', stage: 2, action: 'review', repo })
    expect(r.status.review?.pass).toBe(false)
    expect(r.status.review?.issues[0].kind).toBe('fidelity')
    const reviewLog = repo.logs.find(l => l.role === 'review')
    expect(reviewLog?.model).toBe('local-fidelity')
    expect((reviewLog?.issues as { pass: boolean }).pass).toBe(false)
  })
  it('refuses to accept before review passes', async () => {
    const repo = fakeRepo({ acceptedUpTo: 3 })
    await runStage({ itemSetId: 'x', stage: 3, action: 'generate', repo })
    await expect(runStage({ itemSetId: 'x', stage: 3, action: 'accept', repo })).rejects.toThrow(/review/)
  })
  it('refuses to generate stage n unless stage n-1 is accepted (stage 0 exempt)', async () => {
    const repo = fakeRepo()
    await expect(runStage({ itemSetId: 'x', stage: 2, action: 'generate', repo })).rejects.toThrow('stage 1 must be accepted first')
    const g0 = await runStage({ itemSetId: 'x', stage: 0, action: 'generate', repo })
    expect(g0.status.state).toBe('generated')
    // stage 0 이 generated 뿐(accepted 아님) → stage 1 거부
    await expect(runStage({ itemSetId: 'x', stage: 1, action: 'generate', repo })).rejects.toThrow('stage 0 must be accepted first')
    await runStage({ itemSetId: 'x', stage: 0, action: 'review', repo })
    await runStage({ itemSetId: 'x', stage: 0, action: 'accept', repo })
    const g1 = await runStage({ itemSetId: 'x', stage: 1, action: 'generate', repo })
    expect(g1.status.state).toBe('generated')
  })
  it('feeds only accepted outputs into prior', async () => {
    const repo = fakeRepo({ acceptedUpTo: 3 })
    // stage 2 를 accepted 가 아닌 generated 로 되돌린다 → stage 3 생성은 거부돼야 하고, prior 에서도 빠져야 한다
    repo.statuses[2] = { ...repo.statuses[2], state: 'generated' }
    await expect(runStage({ itemSetId: 'x', stage: 3, action: 'generate', repo })).rejects.toThrow('stage 2 must be accepted first')
    // stage 3 이미 생성돼 있다고 치고 review 경로로 prior 를 관찰: buildPrompt 는 mock 이라 호출되지 않으므로 loadContext 의 prior 로 확인
    repo.statuses[2] = { ...repo.statuses[2], state: 'accepted' }
    const seen: Record<string, unknown>[] = []
    const orig = repo.loadContext.bind(repo)
    repo.loadContext = async (id) => { const c = await orig(id); seen.push(c.prior); return c }
    repo.statuses[1] = { ...repo.statuses[1], state: 'reviewed' }
    await runStage({ itemSetId: 'x', stage: 3, action: 'generate', repo })
    expect(Object.keys(seen[0])).toEqual(['stage0', 'stage2'])
  })
  it('refuses stage ≥ 2 when fewer than 2 standards are linked', async () => {
    const repo = fakeRepo({ acceptedUpTo: 2, standards: [{ code: '[9수04-02]', text: '자료를 도수분포표로 나타내고 해석할 수 있다.' }] })
    await expect(runStage({ itemSetId: 'x', stage: 2, action: 'generate', repo })).rejects.toThrow('성취기준이 2개 이상')
    const repo0 = fakeRepo({ standards: [] })
    const g = await runStage({ itemSetId: 'x', stage: 0, action: 'generate', repo: repo0 })
    expect(g.status.state).toBe('generated')
  })
})
