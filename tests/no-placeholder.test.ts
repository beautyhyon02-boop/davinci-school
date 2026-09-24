import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'

describe('no placeholder text in fixtures', () => {
  it('stage fixtures contain no filler phrases', () => {
    const files = readdirSync('data/studio-fixtures').filter((f) => /^stage\d-generate/.test(f))
    for (const f of files) expect(readFileSync(`data/studio-fixtures/${f}`, 'utf8'), f).not.toMatch(/추후 작성|TBD|lorem ipsum|예시 문장을 넣/)
  })
})
