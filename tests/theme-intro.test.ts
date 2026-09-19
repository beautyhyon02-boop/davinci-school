import { describe, it, expect, beforeAll } from 'vitest'
import { runThemeIntro, type ThemeRepo, type StageStatus, type ThemeLogRow } from '@/lib/studio/stages'
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
