// tests/levels.test.ts
import { describe, it, expect } from 'vitest'
import { getLevels, getDomainLevels, levelFileFor, anchorLevel, minimumLevel } from '@/lib/reference/levels'

describe('levels loader', () => {
  it('maps codes to files by subject letter and school digit', () => {
    expect(levelFileFor('[9수04-02]')).toMatch(/수학-중\.json$/)
    expect(levelFileFor('[6국02-01]')).toMatch(/국어-초\.json$/)
    expect(levelFileFor('[9역01-01]')).toMatch(/역사-중\.json$/)
    expect(levelFileFor('[9사(일사)01-03]')).toMatch(/사회-중\.json$/)
    expect(levelFileFor('[12화학Ⅰ01-02]')).toBeNull()
  })
  it('returns A~E statements for a middle-school code and the anchor/minimum levels', () => {
    const r = getLevels('[9수04-02]')!
    expect(r.scheme).toBe('A-E'); expect(Object.keys(r.levels).sort()).toEqual(['A', 'B', 'C', 'D', 'E'])
    expect(r.levels.C).toContain('주어진 자료')
    expect(anchorLevel(r.scheme)).toBe('C'); expect(minimumLevel(r.scheme)).toBe('E')
    expect(getLevels('[9수99-99]')).toBeNull()
  })
  it('returns domain-level three-axis statements', () => {
    const d = getDomainLevels('[9수04-03]')!
    expect(d.domain).toBe('자료와 가능성')
    const c = d.levels.C as Record<string, string>
    expect(c['가치·태도']).toBeTruthy()
  })
})
