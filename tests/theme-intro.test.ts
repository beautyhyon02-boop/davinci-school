import { describe, it, expect, beforeAll } from 'vitest'
import { runStage, runThemeIntro, type Repo, type ThemeRepo, type StageStatus, type ThemeLogRow } from '@/lib/studio/stages'
import { buildStatuses } from '@/lib/studio/repo'
import { buildPrompt } from '@/lib/studio/prompts/stages'

beforeAll(() => { process.env.AI_MOCK = '1'; delete process.env.ANTHROPIC_API_KEY })

type FakeThemeRepo = ThemeRepo & { intro: string | null; logs: ThemeLogRow[] }

function fakeThemeRepo(): FakeThemeRepo {
  let introIdeas: StageStatus | null = null
  let intro: string | null = null
  const logs: ThemeLogRow[] = []
  return {
    get intro() { return intro },
    logs,
    async loadTheme() {
      return { title: '학교 축제 일회용품 줄이기', level: '중', grade: 1, subjects: ['수학', '과학'], intro_ideas: introIdeas }
    },
    async saveThemeIntro(_themeId, status, accepted) {
      introIdeas = status
      if (accepted) intro = accepted.intro
    },
    async log(e) { logs.push(e) },
  } as FakeThemeRepo
}

describe('runThemeIntro', () => {
  it('generate → review → accept persists theme.intro', async () => {
    const repo = fakeThemeRepo()
    const g = await runThemeIntro({ themeId: 't1', action: 'generate', repo })
    expect(g.status.state).toBe('generated')
    expect(g.status.model).toBe('mock')
    expect(repo.intro).toBeNull()

    const r = await runThemeIntro({ themeId: 't1', action: 'review', repo })
    expect(r.status.state).toBe('reviewed')
    expect(r.status.review?.pass).toBe(true)

    const a = await runThemeIntro({ themeId: 't1', action: 'accept', repo })
    expect(a.status.state).toBe('accepted')
    expect(repo.intro).not.toBeNull()
    expect(typeof repo.intro).toBe('string')
  })

  it('refuses to accept before review passes', async () => {
    const repo = fakeThemeRepo()
    await runThemeIntro({ themeId: 't1', action: 'generate', repo })
    await expect(runThemeIntro({ themeId: 't1', action: 'accept', repo })).rejects.toThrow(/review/)
  })

  it('refuses to review before generate', async () => {
    const repo = fakeThemeRepo()
    await expect(runThemeIntro({ themeId: 't1', action: 'review', repo })).rejects.toThrow(/generate first/)
  })
})

// 0단계(대주제 소개)는 themes.intro_ideas 에 저장되므로 loadContext 가 statuses[0] 으로 합류시켜야
// runStage 의 prior 루프가 stage0 을 accepted 로 보고 2~6단계 프롬프트에 확정된 소개를 넣는다.
describe('accepted theme intro reaches stage 2~6 prompts', () => {
  const INTRO_TEXT = '학교 축제에서 나오는 일회용품을 줄이는 방법을 함께 찾아본다.'
  const INTRO_OUTPUT = { intro: INTRO_TEXT, subject_ideas: [{ subject: '수학', idea: '설문 자료를 도수분포표로 정리한다.' }] }

  function introStatus(state: StageStatus['state']): StageStatus {
    return { state, attempt: 1, output: INTRO_OUTPUT, review: { pass: true, issues: [] }, updated_at: '' }
  }

  /** loadContext 와 같은 방식으로 ctx 를 꾸미고 2단계를 생성시킨 뒤, 그때의 ctx(= prior 가 채워진)를 돌려준다. */
  async function ctxAfterStage2Generate(introIdeas: StageStatus | null) {
    const stageStatus: Record<string, StageStatus> = {
      stage1: { state: 'accepted', attempt: 1, output: { selected: [] }, updated_at: '' },
    }
    const statuses = buildStatuses(stageStatus, introIdeas)
    const outputs: Record<number, unknown> = {}
    if (introIdeas?.output !== undefined) outputs[0] = introIdeas.output
    const ctx = {
      theme: { title: '학교 축제 일회용품 줄이기', level: '중', grade: 1, subjects: ['수학'] },
      subject: '수학',
      standards: [
        { code: '[9수04-02]', text: '자료를 도수분포표로 나타내고 해석할 수 있다.' },
        { code: '[9수04-03]', text: '자료를 히스토그램으로 나타내고 해석할 수 있다.' },
      ],
      prior: {} as Record<string, unknown>,
      outputs,
      statuses,
    }
    const repo: Repo = {
      async loadContext() { return ctx },
      async saveOutput() {},
      async saveStatus() {},
      async log() {},
    }
    await runStage({ itemSetId: 'x', stage: 2, action: 'generate', repo })
    return ctx
  }

  it('buildStatuses puts themes.intro_ideas at stage 0', () => {
    expect(buildStatuses({}, introStatus('accepted'))[0]?.state).toBe('accepted')
    expect(buildStatuses({}, null)[0]).toBeUndefined()
  })

  it('stage 2 prompt carries the accepted intro text', async () => {
    const ctx = await ctxAfterStage2Generate(introStatus('accepted'))
    expect(ctx.prior.stage0).toEqual(INTRO_OUTPUT)
    expect(buildPrompt(2, ctx).user).toContain(INTRO_TEXT)
  })

  it('stage 2 prompt omits an intro that is only reviewed (not accepted), and one that does not exist', async () => {
    const reviewed = await ctxAfterStage2Generate(introStatus('reviewed'))
    expect(reviewed.prior.stage0).toBeUndefined()
    expect(buildPrompt(2, reviewed).user).not.toContain(INTRO_TEXT)

    const none = await ctxAfterStage2Generate(null)
    expect(buildPrompt(2, none).user).not.toContain(INTRO_TEXT)
  })
})

describe('shared_materials in stage 4 prior', () => {
  it('buildPrompt(4, ctx) includes shared_materials when present in prior', () => {
    const ctx = {
      theme: { title: '학교 축제 일회용품 줄이기', level: '중', grade: 1, subjects: ['수학'] },
      subject: '수학',
      standards: [{ code: '[9수04-02]', text: '자료를 … 해석할 수 있다.' }],
      prior: { shared_materials: [{ id: 'A', title: '설문 결과', kind: 'table', body: null, table: { columns: ['항목', '값'], rows: [['a', 1]] }, source: '자작' }] },
    }
    const p = buildPrompt(4, ctx)
    expect(p.user).toContain('shared_materials')
    expect(p.user).toContain('설문 결과')
  })
})
