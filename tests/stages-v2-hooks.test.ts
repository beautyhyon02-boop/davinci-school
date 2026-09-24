// runStage v2 연결부(enrich 후 저장, 생성 직후 [TS] 자동 검사 메모, 선택 검토)를 가짜 callStructured 로 검사한다.
// mock fixture 가 v1 인 동안(T6 전)에도 generate 경로를 돌려 보기 위해 tests/stages.test.ts 와 따로 둔다.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { callStructured } from '@/lib/ai/claude'
import { runStage, type Repo, type StageStatus, type LogRow } from '@/lib/studio/stages'
import { MAX_ATTEMPTS, EXHAUSTED_ERROR } from '@/lib/studio/max-attempts'
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
    expect(g.status.notes).toEqual([])
    expect(call).toHaveBeenCalledTimes(1)
  })
  // 대표 결정 2026-09-26: 검토는 참고, [확인]으로 진행 — [TS] 는 생성 직후 메모로만 남고 아무것도 막지 않는다
  it('generate runs the [TS] check right away and stores its issues as advisory notes (no extra model call, no error)', async () => {
    call.mockResolvedValueOnce({ data: unfaithful(), usage: { input: 0, output: 0, cacheRead: 0 }, model: 'fake' })
    const logs: LogRow[] = []
    const statuses: Record<number, StageStatus> = { 0: accepted(), 1: accepted() }
    const g = await runStage({ itemSetId: 'x', stage: 2, action: 'generate', repo: repo({}, statuses, logs) })
    expect(call).toHaveBeenCalledTimes(1)
    expect(g.status).toMatchObject({ state: 'generated', attempt: 1, model: 'fake' })
    expect(g.status.error).toBeUndefined()
    expect(g.status.review).toBeUndefined()
    expect(g.status.notes?.some((n) => n.kind === 'fidelity')).toBe(true)
    expect(statuses[2].notes).toEqual(g.status.notes)
    // generation_log 는 그대로 남는다: 모델 생성 행(가짜라 log 콜백 없음) + [TS] 메모 행
    expect(logs).toEqual([expect.objectContaining({ role: 'review', model: 'static', ok: false, input: 0, output: 0, cacheRead: 0, issues: { pass: false, issues: g.status.notes } })])
    expect(nextAction(g.status)).toBe('accept')
  })
  it('accept right after generate succeeds even with static notes (no review needed)', async () => {
    call.mockResolvedValueOnce({ data: unfaithful(), usage: { input: 0, output: 0, cacheRead: 0 }, model: 'fake' })
    const outputs: Record<number, unknown> = {}
    const statuses: Record<number, StageStatus> = { 0: accepted(), 1: accepted() }
    await runStage({ itemSetId: 'x', stage: 2, action: 'generate', repo: repo(outputs, statuses, []) })
    const a = await runStage({ itemSetId: 'x', stage: 2, action: 'accept', repo: repo(outputs, statuses, []) })
    expect(call).toHaveBeenCalledTimes(1)
    expect(a.status).toMatchObject({ state: 'accepted', model: 'fake' })
    expect(a.status.notes?.length).toBeGreaterThan(0)
    expect(a.status.output).toBe(outputs[2])
  })
  it('MAX_ATTEMPTS stays 3 for every stage 0..7 (record only — it never gates the set wizard)', () => {
    for (const s of [0, 1, 2, 3, 4, 5, 6, 7] as const) expect(MAX_ATTEMPTS[s]).toBe(3)
  })
  it('optional review with static issues still asks the model once, keeps [TS] notes separate, and never sets an error (even past MAX_ATTEMPTS)', async () => {
    call.mockImplementationOnce(async (inp) => {
      await inp.log?.({ model: 'fake-review', input: 1, output: 1, cacheRead: 0, ok: true })
      return { data: { pass: false, issues: [{ kind: 'other', detail: 'AI 의견' }] }, usage: { input: 1, output: 1, cacheRead: 0 }, model: 'fake-review' } as never
    })
    const bad = unfaithful()
    const logs: LogRow[] = []
    const statuses: Record<number, StageStatus> = { 1: accepted(), 2: { state: 'generated', attempt: 7, output: bad, model: 'fake', updated_at: '' } }
    const r = await runStage({ itemSetId: 'x', stage: 2, action: 'review', repo: repo({ 2: bad }, statuses, logs) })
    expect(call).toHaveBeenCalledTimes(1)
    expect(r.status).toMatchObject({ state: 'reviewed', attempt: 7, model: 'fake', review: { pass: false, issues: [{ kind: 'other', detail: 'AI 의견' }] } })
    expect(r.status.notes?.some((n) => n.kind === 'fidelity')).toBe(true)
    expect(r.status.error).toBeUndefined()
    expect(logs.map((l) => l.model)).toEqual(['static', 'fake-review'])
    // 검토 의견이 무엇이든 다음 행동은 [확인]이고, 확인도 된다
    expect(nextAction(r.status)).toBe('accept')
    const a = await runStage({ itemSetId: 'x', stage: 2, action: 'accept', repo: repo({ 2: bad }, statuses, logs) })
    expect(a.status.state).toBe('accepted')
  })
  it('an output the static checks cannot read (old v1 shape) becomes a note instead of a crash', async () => {
    call.mockResolvedValueOnce({ data: { pass: true, issues: [] }, usage: { input: 0, output: 0, cacheRead: 0 }, model: 'fake-review' } as never)
    const v1 = { reconstruction: '자료를 나타내고 해석할 수 있다.', key_questions: ['q?'] }
    const logs: LogRow[] = []
    const statuses: Record<number, StageStatus> = { 1: accepted(), 2: { state: 'generated', attempt: 1, output: v1, updated_at: '' } }
    const r = await runStage({ itemSetId: 'x', stage: 2, action: 'review', repo: repo({ 2: v1 }, statuses, logs) })
    expect(r.status.notes).toMatchObject([{ kind: 'other' }])
    expect(logs[0]).toMatchObject({ model: 'static', ok: false })
  })
  it('accept clears a stale exhausted marker left on an old row', async () => {
    const out = structuredClone(faithful)
    const statuses: Record<number, StageStatus> = { 1: accepted(), 2: { state: 'reviewed', attempt: 3, output: out, review: { pass: false, issues: [] }, error: EXHAUSTED_ERROR, updated_at: '' } }
    const a = await runStage({ itemSetId: 'x', stage: 2, action: 'accept', repo: repo({ 2: out }, statuses, []) })
    expect(a.status.state).toBe('accepted')
    expect(a.status.error).toBeUndefined()
    expect(call).not.toHaveBeenCalled()
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
