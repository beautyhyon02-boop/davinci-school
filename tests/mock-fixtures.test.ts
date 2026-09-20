import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { loadFixture } from '@/lib/ai/mock'
import { buildPrompt, buildReviewPrompt, type Ctx } from '@/lib/studio/prompts/stages'
import { STAGE_SCHEMAS, Review } from '@/lib/studio/schemas'
import { checkReconstructionFidelity } from '@/lib/studio/fidelity'
import { runStage, type Repo, type StageStatus } from '@/lib/studio/stages'

const SCIENCE_STAGES = [2, 3, 4, 5, 6] as const

function ctxFor(subject: string): Ctx {
  return {
    theme: { title: '학교 축제, 일회용품을 줄이자', level: '중', grade: 1, subjects: ['수학', '과학'] },
    subject,
    standards: [{ code: '[9과01-01]', text: '과학적 탐구 방법을 …' }, { code: '[9과01-03]', text: '인류의 지속가능한 삶을 …' }],
    prior: {},
  }
}

describe('subject-aware fixture keys', () => {
  it('buildPrompt/buildReviewPrompt append the subject when there is one', () => {
    expect(buildPrompt(3, ctxFor('과학')).fixtureKey).toBe('stage3-generate-과학')
    expect(buildReviewPrompt(3, ctxFor('과학'), {}).fixtureKey).toBe('stage3-review-과학')
    expect(buildPrompt(2, ctxFor('수학')).fixtureKey).toBe('stage2-generate-수학')
  })
  it('stage 0 (theme level, no subject) keeps the plain key', () => {
    expect(buildPrompt(0, ctxFor('')).fixtureKey).toBe('stage0-generate')
    expect(buildReviewPrompt(0, ctxFor(''), {}).fixtureKey).toBe('stage0-review')
  })
})

describe('loadFixture subject fallback', () => {
  it('uses the subject file when it exists', () => {
    const science = loadFixture('stage2-generate-과학') as { reconstruction: string }
    expect(science.reconstruction).toContain('과학적 탐구 방법')
  })
  it('falls back to the base file when the subject file is missing', () => {
    const fallback = loadFixture('stage2-generate-국어')
    const base = JSON.parse(readFileSync('data/studio-fixtures/stage2-generate.json', 'utf8'))
    expect(fallback).toEqual(base)
  })
  it('still reports the missing key when neither file exists', () => {
    expect(() => loadFixture('stage9-generate-과학')).toThrow(/fixture not found/)
    expect(() => loadFixture('nope')).toThrow(/fixture not found/)
  })
})

describe('과학 fixtures', () => {
  for (const n of SCIENCE_STAGES) {
    it(`stage${n} 과학 fixtures validate`, () => {
      const gen = loadFixture(`stage${n}-generate-과학`)
      const parsed = STAGE_SCHEMAS[n].safeParse(gen)
      expect(parsed.error?.issues ?? []).toEqual([])
      expect(parsed.success).toBe(true)
      expect(Review.safeParse(loadFixture(`stage${n}-review-과학`)).success).toBe(true)
    })
  }

  it('stage2 reconstruction is faithful to the 과학 standards', () => {
    const gen = loadFixture('stage2-generate-과학') as { reconstruction: string; key_question_candidates: string[] }
    const std = JSON.parse(readFileSync('data/studio-fixtures/standards-science.json', 'utf8')) as { code: string; text: string }[]
    expect(std.map(s => s.code)).toEqual(['[9과01-01]', '[9과01-03]'])
    const f = checkReconstructionFidelity(gen.reconstruction, std.map(s => s.text))
    expect(f.unknownTokens).toEqual([])
    expect(f.ok).toBe(true)
    expect(gen.key_question_candidates).toHaveLength(3)
    expect(gen.key_question_candidates[0]).toBe('축제의 일회용컵 문제를 줄이기 위해 우리 학교가 무엇을 바꾸는 것이 과학적으로 가장 타당한가?')
  })

  it('standards-science.json is copied verbatim from data/standards/과학.json', () => {
    const fixture = JSON.parse(readFileSync('data/studio-fixtures/standards-science.json', 'utf8')) as { code: string; text: string }[]
    const all = JSON.parse(readFileSync('data/standards/과학.json', 'utf8')) as { code: string; text: string }[]
    for (const s of fixture) expect(all.find(x => x.code === s.code)?.text).toBe(s.text)
  })

  it('stage3 lessons cover both 과학 standards and place each assessment once', () => {
    const { lessons } = loadFixture('stage3-generate-과학') as { lessons: { standards: string[]; assessment: string | null }[] }
    const codes = new Set(lessons.flatMap(l => l.standards))
    expect([...codes].sort()).toEqual(['[9과01-01]', '[9과01-03]'])
    expect(lessons.map(l => l.assessment)).toEqual([null, null, '서술형1', '서술형2', '논술형'])
  })

  it('stage4 emits only the set-specific material 자료 E', () => {
    const { materials } = loadFixture('stage4-generate-과학') as { materials: { id: string; source: string }[] }
    expect(materials.map(m => m.id)).toEqual(['E'])
    expect(materials[0].source).toBe('자작')
  })

  it('stage5 totals 22 points and its exemplar scores match the grade table', () => {
    const a = loadFixture('stage5-generate-과학') as {
      items: { kind: string; points: number; lesson_no: number }[]
      grade_boundaries: { grade: number; min: number; max: number }[]
      exemplars: { scores: number[]; total: number; grade: number }[]
    }
    expect(a.items.reduce((s, i) => s + i.points, 0)).toBe(22)
    expect(a.items.map(i => i.lesson_no)).toEqual([3, 4, 5])
    for (const ex of a.exemplars) {
      const extended = ex.scores.reduce((s, v) => s + v, 0)
      expect(extended).toBeLessThanOrEqual(16)
      expect(ex.total).toBeGreaterThanOrEqual(extended)
      const band = a.grade_boundaries.find(b => ex.total >= b.min && ex.total <= b.max)
      expect(band?.grade).toBe(ex.grade)
    }
  })

  it('stage6 has one per_lesson note block per 3단계 차시', () => {
    const { lessons } = loadFixture('stage3-generate-과학') as { lessons: { no: number }[] }
    const { per_lesson } = loadFixture('stage6-generate-과학') as { per_lesson: { no: number }[] }
    expect(per_lesson.map(p => p.no)).toEqual(lessons.map(l => l.no))
  })
})

describe('runStage end-to-end in mock mode (과학)', () => {
  beforeAll(() => { process.env.AI_MOCK = '1'; delete process.env.ANTHROPIC_API_KEY })

  it('runs 2~6단계 generate → review → accept with the 과학 fixtures', async () => {
    const standards = JSON.parse(readFileSync('data/studio-fixtures/standards-science.json', 'utf8')) as { code: string; text: string }[]
    const outputs: Record<number, unknown> = {}
    const statuses: Record<number, StageStatus> = {}
    for (let s = 0; s < 2; s++) {
      outputs[s] = { placeholder: `stage${s}` }
      statuses[s] = { state: 'accepted', attempt: 1, output: outputs[s], review: { pass: true, issues: [] }, updated_at: '' }
    }
    const repo: Repo = {
      async loadContext() {
        return { theme: { title: '학교 축제, 일회용품을 줄이자', level: '중', grade: 1, subjects: ['수학', '과학'] }, subject: '과학', standards, prior: {}, outputs, statuses }
      },
      async saveOutput(_id, stage, out) { outputs[stage] = out },
      async saveStatus(_id, stage, st) { statuses[stage] = st },
      async log() {},
    }
    for (const stage of SCIENCE_STAGES) {
      const g = await runStage({ itemSetId: 'x', stage, action: 'generate', repo })
      expect(g.status.error).toBeUndefined()
      expect(g.status.state).toBe('generated')
      expect(g.status.model).toBe('mock')
      const r = await runStage({ itemSetId: 'x', stage, action: 'review', repo })
      expect(r.status.review?.pass).toBe(true)
      expect(await runStage({ itemSetId: 'x', stage, action: 'accept', repo }).then(a => a.status.state)).toBe('accepted')
    }
    expect((outputs[4] as { materials: { id: string }[] }).materials[0].id).toBe('E')
  })
})
