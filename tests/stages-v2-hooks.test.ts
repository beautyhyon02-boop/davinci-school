// runStage v2 연결부(enrich 후 저장, [TS] 검사 선행)를 가짜 callStructured 로 검사한다.
// mock fixture 가 v1 인 동안(T6 전)에도 generate 경로를 돌려 보기 위해 tests/stages.test.ts 와 따로 둔다.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { callStructured } from '@/lib/ai/claude'
import { runStage, type Repo, type StageStatus, type LogRow } from '@/lib/studio/stages'
import { MAX_ATTEMPTS } from '@/lib/studio/max-attempts'
import { nextAction } from '@/lib/studio/next-action'

vi.mock('@/lib/ai/claude', () => ({ callStructured: vi.fn() }))
const call = vi.mocked(callStructured)

const standards = [{ code: '[9수04-02]', text: '자료를 줄기와 잎 그림, 도수분포표, 히스토그램, 도수분포다각형으로 나타내고 해석할 수 있다.' }, { code: '[9수04-03]', text: '상대도수를 구하고, 상대도수의 분포를 표나 그래프로 나타내고 해석할 수 있다.' }]
const faithful = {
  standards: standards.map((s) => ({ code: s.code, original_text: s.text, reconstruction_type: '유지', merged_with: [], reconstructed_text: s.text, reason: ['4~6차시 압축'], learning_elements: ['도수분포표'] })),
  reconstruction: standards[1].text,
  learning_goals: [{ text: '도수분포표의 뜻을 설명할 수 있다.', axis: '지식·이해' }, { text: '상대도수를 구할 수 있다.', axis: '과정·기능' }, { text: '통계의 유용성을 인식한다.', axis: '가치·태도' }],
  level_anchor: [], key_question_candidates: ['자료는 무엇을 말하는가?', '왜 비율로 비교하는가?'],
}
const unfaithful = () => ({ ...structuredClone(faithful), reconstruction: '학생은 축제 일회용품 감축 방안을 제안할 수 있다.' })

function repo(outputs: Record<number, unknown>, statuses: Record<number, StageStatus>, logs: LogRow[]): Repo {
  return {
    async loadContext() { return { theme: { title: 't', level: '중', grade: 1, subjects: ['수학'] }, subject: '수학', standards, prior: {}, outputs, statuses } },
    async saveOutput(_id, stage, out) { outputs[stage] = out },
    async saveStatus(_id, stage, st) { statuses[stage] = st },
    async log(e) { logs.push(e) },
  }
}
const accepted = (): StageStatus => ({ state: 'accepted', attempt: 1, output: {}, updated_at: '' })

beforeEach(() => { call.mockReset() })

describe('runStage v2 hooks (fake callStructured)', () => {
  it('generate saves the enriched output (level_anchor filled by the server) as both output and status.output', async () => {
    call.mockResolvedValueOnce({ data: structuredClone(faithful), usage: { input: 0, output: 0, cacheRead: 0 }, model: 'fake' })
    const outputs: Record<number, unknown> = {}
    const statuses: Record<number, StageStatus> = { 0: accepted(), 1: accepted() }
    const g = await runStage({ itemSetId: 'x', stage: 2, action: 'generate', repo: repo(outputs, statuses, []) })
    const saved = outputs[2] as { level_anchor: { code: string; level: string }[] }
    expect(saved.level_anchor.map((a) => [a.code, a.level])).toEqual([['[9수04-02]', 'C'], ['[9수04-03]', 'C']])
    expect(g.status.output).toBe(saved)
    expect(call).toHaveBeenCalledTimes(1)
  })
  it('review with static issues does not call the model at all', async () => {
    const bad = unfaithful()
    const logs: LogRow[] = []
    const statuses: Record<number, StageStatus> = { 1: accepted(), 2: { state: 'generated', attempt: 1, output: bad, model: 'fake', updated_at: '' } }
    const r = await runStage({ itemSetId: 'x', stage: 2, action: 'review', repo: repo({ 2: bad }, statuses, logs) })
    expect(call).not.toHaveBeenCalled()
    expect(r.status).toMatchObject({ state: 'reviewed', attempt: 1, model: 'fake', review: { pass: false } })
    expect(logs).toHaveLength(1)
    expect(logs[0]).toMatchObject({ role: 'review', model: 'static', ok: false, input: 0, output: 0, cacheRead: 0, issues: { pass: false } })
  })
  it('MAX_ATTEMPTS is 3 for every stage 0..7 (ruling: a non-developer admin must be able to regenerate after a miss)', () => {
    for (const s of [0, 1, 2, 3, 4, 5, 6, 7] as const) expect(MAX_ATTEMPTS[s]).toBe(3)
  })
  it('a static failure on attempt 1 leaves room to regenerate (no limit error, next action is generate)', async () => {
    const bad = unfaithful()
    const statuses: Record<number, StageStatus> = { 1: accepted(), 2: { state: 'generated', attempt: 1, output: bad, updated_at: '' } }
    const r = await runStage({ itemSetId: 'x', stage: 2, action: 'review', repo: repo({ 2: bad }, statuses, []) })
    expect(r.status.error).toBeUndefined()
    expect(nextAction(r.status, MAX_ATTEMPTS[2] ?? 1)).toBe('generate')
  })
  it('static failure follows MAX_ATTEMPTS (stage 2 limit 3 → exhausted at attempt 3)', async () => {
    const bad = unfaithful()
    const statuses: Record<number, StageStatus> = { 1: accepted(), 2: { state: 'generated', attempt: 3, output: bad, updated_at: '' } }
    const r = await runStage({ itemSetId: 'x', stage: 2, action: 'review', repo: repo({ 2: bad }, statuses, []) })
    expect(r.status.error).toMatch(/한도/)
    expect(nextAction(r.status, MAX_ATTEMPTS[2] ?? 1)).toBe('edit')
  })
  it('an output the static checks cannot read (old v1 shape) becomes an issue instead of a crash, without a model call', async () => {
    const v1 = { reconstruction: '자료를 나타내고 해석할 수 있다.', key_questions: ['q?'] }
    const logs: LogRow[] = []
    const statuses: Record<number, StageStatus> = { 1: accepted(), 2: { state: 'generated', attempt: 1, output: v1, updated_at: '' } }
    const r = await runStage({ itemSetId: 'x', stage: 2, action: 'review', repo: repo({ 2: v1 }, statuses, logs) })
    expect(call).not.toHaveBeenCalled()
    expect(r.status.review).toMatchObject({ pass: false, issues: [{ kind: 'other' }] })
    expect(logs[0]).toMatchObject({ model: 'static', ok: false })
  })
  it('review with no static issues calls the model exactly once and logs its result', async () => {
    call.mockImplementationOnce(async (inp) => {
      await inp.log?.({ model: 'fake-review', input: 1, output: 1, cacheRead: 0, ok: true })
      return { data: { pass: true, issues: [] }, usage: { input: 1, output: 1, cacheRead: 0 }, model: 'fake-review' } as never
    })
    const logs: LogRow[] = []
    const out = structuredClone(faithful)
    const statuses: Record<number, StageStatus> = { 1: accepted(), 2: { state: 'generated', attempt: 1, output: out, updated_at: '' } }
    const r = await runStage({ itemSetId: 'x', stage: 2, action: 'review', repo: repo({ 2: out }, statuses, logs) })
    expect(call).toHaveBeenCalledTimes(1)
    expect(call.mock.calls[0][0]).toMatchObject({ role: 'review', fixtureKey: 'stage2-review-수학' })
    expect(r.status.review).toEqual({ pass: true, issues: [] })
    expect(logs).toEqual([expect.objectContaining({ model: 'fake-review', ok: true, issues: { pass: true, issues: [] } })])
  })
})
