import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { STAGE_SCHEMAS, Review, Assessment } from '@/lib/studio/schemas'
import { checkReconstructionFidelity } from '@/lib/studio/fidelity'

describe('studio fixtures', () => {
  // 2~7단계는 v2 fixture(scripts/upgrade-fixtures-v2.ts 가 만듦) — [TS] 검사까지는 tests/mock-fixtures.test.ts 가 본다
  for (const n of [0, 1, 2, 3, 4, 5, 6, 7] as const) {
    it(`stage${n} generate fixture validates`, () => {
      const gen = JSON.parse(readFileSync(`data/studio-fixtures/stage${n}-generate.json`, 'utf8'))
      expect(STAGE_SCHEMAS[n].safeParse(gen).success).toBe(true)
    })
    it(`stage${n} review fixture validates`, () => {
      const rev = JSON.parse(readFileSync(`data/studio-fixtures/stage${n}-review.json`, 'utf8'))
      expect(Review.safeParse(rev).success).toBe(true)
    })
  }
  it('stage2 fixture is faithful to the math standards', () => {
    const gen = JSON.parse(readFileSync('data/studio-fixtures/stage2-generate.json', 'utf8'))
    const std = JSON.parse(readFileSync('data/studio-fixtures/standards-math.json', 'utf8')).map((s: { text: string }) => s.text)
    expect(checkReconstructionFidelity(gen.reconstruction, std).ok).toBe(true)
  })
  it('assessment rejects zero 논술형 items (superRefine)', () => {
    const gen = JSON.parse(readFileSync('data/studio-fixtures/stage5-generate.json', 'utf8'))
    const broken = {
      ...gen,
      items: gen.items.map((item: { kind: string }) =>
        item.kind === '논술형' ? { ...item, kind: '서술형' } : item
      ),
    }
    expect(broken.items.some((i: { kind: string }) => i.kind === '논술형')).toBe(false)
    expect(Assessment.safeParse(broken).success).toBe(false)
  })
})
