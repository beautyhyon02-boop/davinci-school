import { describe, it, expect, beforeAll } from 'vitest'
import { runStage, StageError, STAGE_ERRORS, EXHAUSTED_ERROR, MAX_ATTEMPTS, type Repo, type StageStatus, type LogRow } from '@/lib/studio/stages'
import { readFileSync } from 'node:fs'

beforeAll(() => { process.env.AI_MOCK = '1'; delete process.env.ANTHROPIC_API_KEY })

/** promise가 지정한 코드의 StageError로 reject 되는지 확인한다. */
async function expectStageError(promise: Promise<unknown>, code: string, msgPattern?: RegExp) {
  await expect(promise).rejects.toBeInstanceOf(StageError)
  try {
    await promise
    throw new Error('expected rejection, got resolution')
  } catch (e) {
    expect((e as StageError).code).toBe(code)
    if (msgPattern) expect((e as StageError).message).toMatch(msgPattern)
  }
}

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
  // 대표 결정 2026-09-26: 검토는 참고, [확인]으로 진행
  it('generate → accept for stage 2 without any review (static notes stored, no review call)', async () => {
    const repo = fakeRepo({ acceptedUpTo: 2 })
    const g = await runStage({ itemSetId: 'x', stage: 2, action: 'generate', repo })
    expect(g.status.state).toBe('generated')
    expect(g.status.model).toBe('mock')
    expect(g.status.notes).toEqual([])
    const a = await runStage({ itemSetId: 'x', stage: 2, action: 'accept', repo })
    expect(a.status.state).toBe('accepted')
    expect(a.status.model).toBe('mock')
    expect(a.status.review).toBeUndefined()
    expect(repo.logs.filter(l => l.role === 'review')).toEqual([])
  })
  it('optional review still works: generate → review → accept (records model and review result)', async () => {
    const repo = fakeRepo({ acceptedUpTo: 2 })
    await runStage({ itemSetId: 'x', stage: 2, action: 'generate', repo })
    const r = await runStage({ itemSetId: 'x', stage: 2, action: 'review', repo })
    expect(r.status.state).toBe('reviewed'); expect(r.status.review?.pass).toBe(true)
    expect(r.status.model).toBe('mock')
    const reviewLog = repo.logs.find(l => l.role === 'review')
    expect(reviewLog?.issues).toEqual({ pass: true, issues: [] })
    const a = await runStage({ itemSetId: 'x', stage: 2, action: 'accept', repo })
    expect(a.status.state).toBe('accepted')
    expect(a.status.model).toBe('mock')
  })
  it('stage 2 [TS] notes flag an unfaithful reconstruction (logged as model "static") — advisory, accept still works', async () => {
    const repo = fakeRepo({ acceptedUpTo: 2 })
    await runStage({ itemSetId: 'x', stage: 2, action: 'generate', repo })
    ;(repo.outputs[2] as { reconstruction: string }).reconstruction = '학생은 축제 일회용품 감축 방안을 제안할 수 있다.'
    const r = await runStage({ itemSetId: 'x', stage: 2, action: 'review', repo })
    expect(r.status.notes?.[0].kind).toBe('fidelity')
    expect(r.status.error).toBeUndefined()
    const staticLog = repo.logs.find(l => l.role === 'review' && l.model === 'static')
    expect((staticLog?.issues as { pass: boolean }).pass).toBe(false)
    expect((await runStage({ itemSetId: 'x', stage: 2, action: 'accept', repo })).status.state).toBe('accepted')
  })
  it('stage 2 [TS] 메모가 대주제 상황(제목 낱말)을 짚는다 — runStage 가 대주제 제목을 검사에 넘긴다', async () => {
    const repo = fakeRepo({ acceptedUpTo: 2 })
    await runStage({ itemSetId: 'x', stage: 2, action: 'generate', repo })
    ;(repo.outputs[2] as { reconstruction: string }).reconstruction = '학생은 학교 축제의 일회용품 자료를 가지고 상대도수를 구할 수 있다.'
    const r = await runStage({ itemSetId: 'x', stage: 2, action: 'review', repo })
    const detail = r.status.notes?.find((i) => i.detail.includes('통합 문장'))?.detail
    expect(detail).toMatch(/^대주제 상황\(학교, 축제의, 일회용품\)을 재구성 문장에 넣었음 — 학습 목표·차시에만 쓴다: 통합 문장: /)
  })
  it('시도 횟수는 기록일 뿐 — 한도를 넘어도 생성·검토에 한도 표지가 붙지 않고 확인할 수 있다', async () => {
    const repo = fakeRepo({ acceptedUpTo: 2 })
    const max = MAX_ATTEMPTS[2] ?? 1
    await runStage({ itemSetId: 'x', stage: 2, action: 'generate', repo })
    repo.statuses[2] = { state: 'reviewed', attempt: max, output: repo.outputs[2], review: { pass: false, issues: [{ kind: 'fidelity', detail: 'x' }] }, error: EXHAUSTED_ERROR, updated_at: '' }
    const g = await runStage({ itemSetId: 'x', stage: 2, action: 'generate', repo })
    expect(g.status.state).toBe('generated'); expect(g.status.attempt).toBe(max + 1); expect(g.status.error).toBeUndefined()
    const r = await runStage({ itemSetId: 'x', stage: 2, action: 'review', repo })
    expect(r.status.attempt).toBe(max + 1); expect(r.status.error).toBeUndefined()
    expect((await runStage({ itemSetId: 'x', stage: 2, action: 'accept', repo })).status.state).toBe('accepted')
  })
  it('accepts after a failing review (the review never blocks)', async () => {
    const repo = fakeRepo({ acceptedUpTo: 2 })
    await runStage({ itemSetId: 'x', stage: 2, action: 'generate', repo })
    repo.statuses[2] = { state: 'reviewed', attempt: 5, output: repo.outputs[2], review: { pass: false, issues: [{ kind: 'other', detail: 'x' }] }, error: EXHAUSTED_ERROR, updated_at: '' }
    const a = await runStage({ itemSetId: 'x', stage: 2, action: 'accept', repo })
    expect(a.status.state).toBe('accepted'); expect(a.status.error).toBeUndefined()
  })
  it('accept right after generate works for stage 3 as well', async () => {
    const repo = fakeRepo({ acceptedUpTo: 3 })
    await runStage({ itemSetId: 'x', stage: 3, action: 'generate', repo })
    expect((await runStage({ itemSetId: 'x', stage: 3, action: 'accept', repo })).status.state).toBe('accepted')
  })
  it('refuses to accept when there is nothing to confirm (before generate, or after a failed generate)', async () => {
    const repo = fakeRepo({ acceptedUpTo: 3 })
    await expectStageError(runStage({ itemSetId: 'x', stage: 3, action: 'accept', repo }), STAGE_ERRORS.NOTHING_TO_REVIEW)
    repo.outputs[3] = { lessons: [] }
    repo.statuses[3] = { state: 'failed', attempt: 2, error: 'boom', updated_at: '' }
    await expectStageError(runStage({ itemSetId: 'x', stage: 3, action: 'accept', repo }), STAGE_ERRORS.NOTHING_TO_REVIEW, /nothing to confirm/)
  })
  it('refuses to generate stage n unless stage n-1 is accepted (stage 0 exempt)', async () => {
    const repo = fakeRepo()
    await expectStageError(runStage({ itemSetId: 'x', stage: 2, action: 'generate', repo }), STAGE_ERRORS.PREV_NOT_ACCEPTED, /stage 1 must be accepted first/)
    const g0 = await runStage({ itemSetId: 'x', stage: 0, action: 'generate', repo })
    expect(g0.status.state).toBe('generated')
    // stage 0 이 generated 뿐(accepted 아님) → stage 1 거부
    await expectStageError(runStage({ itemSetId: 'x', stage: 1, action: 'generate', repo }), STAGE_ERRORS.PREV_NOT_ACCEPTED, /stage 0 must be accepted first/)
    await runStage({ itemSetId: 'x', stage: 0, action: 'review', repo })
    await runStage({ itemSetId: 'x', stage: 0, action: 'accept', repo })
    const g1 = await runStage({ itemSetId: 'x', stage: 1, action: 'generate', repo })
    expect(g1.status.state).toBe('generated')
  })
  it('feeds only accepted outputs into prior', async () => {
    const repo = fakeRepo({ acceptedUpTo: 3 })
    // stage 2 를 accepted 가 아닌 generated 로 되돌린다 → stage 3 생성은 거부돼야 하고, prior 에서도 빠져야 한다
    repo.statuses[2] = { ...repo.statuses[2], state: 'generated' }
    await expectStageError(runStage({ itemSetId: 'x', stage: 3, action: 'generate', repo }), STAGE_ERRORS.PREV_NOT_ACCEPTED, /stage 2 must be accepted first/)
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
    await expectStageError(runStage({ itemSetId: 'x', stage: 2, action: 'generate', repo }), STAGE_ERRORS.TOO_FEW_STANDARDS, /성취기준이 2개 이상/)
    const repo0 = fakeRepo({ standards: [] })
    const g = await runStage({ itemSetId: 'x', stage: 0, action: 'generate', repo: repo0 })
    expect(g.status.state).toBe('generated')
  })
  it('refuses to review before generate (nothing-to-review)', async () => {
    const repo = fakeRepo({ acceptedUpTo: 3 })
    await expectStageError(runStage({ itemSetId: 'x', stage: 3, action: 'review', repo }), STAGE_ERRORS.NOTHING_TO_REVIEW, /nothing to review/)
  })
})

describe('runStage v2 hooks', () => {
  const standards = [{ code: '[9수04-02]', text: '자료를 줄기와 잎 그림, 도수분포표, 히스토그램, 도수분포다각형으로 나타내고 해석할 수 있다.' }, { code: '[9수04-03]', text: '상대도수를 구하고, 상대도수의 분포를 표나 그래프로 나타내고 해석할 수 있다.' }]
  function repoWith(outputs: Record<number, unknown>, statuses: Record<number, StageStatus>, logs: unknown[]): Repo {
    return {
      async loadContext() { return { theme: { title: 't', level: '중', grade: 1, subjects: ['수학'] }, subject: '수학', standards, prior: {}, outputs, statuses } },
      async saveOutput(_id, stage, out) { outputs[stage] = out },
      async saveStatus(_id, stage, st) { statuses[stage] = st },
      async log(e) { logs.push(e) },
    }
  }
  it('review runs static checks first (notes, logged as model:"static") and then the model, without blocking', async () => {
    process.env.AI_MOCK = '1'
    const bad = { standards: [{ code: '[9수04-02]', original_text: '틀린 원문', reconstruction_type: '유지', merged_with: [], reconstructed_text: '틀린 원문', reason: ['4~6차시 압축'], learning_elements: ['x'] }], reconstruction: '통계청 자료를 해석할 수 있다.', learning_goals: [], level_anchor: [], key_question_candidates: [] }
    const statuses: Record<number, StageStatus> = { 1: { state: 'accepted', attempt: 1, output: {}, updated_at: '' }, 2: { state: 'generated', attempt: 1, output: bad, updated_at: '' } }
    const logs: { model: string; ok: boolean }[] = []
    const r = await runStage({ itemSetId: 'x', stage: 2, action: 'review', repo: repoWith({ 2: bad }, statuses, logs) })
    expect(r.status.notes?.some((i) => i.kind === 'fidelity')).toBe(true)
    expect(r.status.review).toBeDefined()
    expect(r.status.error).toBeUndefined()
    expect(logs[0]).toMatchObject({ model: 'static', ok: false })
  })
  // (같은 동작을 tests/stages-v2-hooks.test.ts 는 가짜 callStructured 로, 여기서는 v2 mock fixture 로 검사한다)
  it('generate stores the enriched output (level_anchor filled) in mock mode', async () => {
    process.env.AI_MOCK = '1'
    const outputs: Record<number, unknown> = {}
    const statuses: Record<number, StageStatus> = { 0: { state: 'accepted', attempt: 1, output: {}, updated_at: '' }, 1: { state: 'accepted', attempt: 1, output: {}, updated_at: '' } }
    await runStage({ itemSetId: 'x', stage: 2, action: 'generate', repo: repoWith(outputs, statuses, []) })
    expect((outputs[2] as { level_anchor: unknown[] }).level_anchor.length).toBe(2)
  })
})
