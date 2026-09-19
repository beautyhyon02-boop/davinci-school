import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { standardsSchema } from '@/lib/standards/parse'

const dir = join(__dirname, '..', 'data', 'standards')
const files = readdirSync(dir).filter((f) => f.endsWith('.json'))

describe('data/standards/*.json', () => {
  it('finds the expected per-subject files', () => {
    expect(files.sort()).toEqual([
      '과학.json',
      '국어.json',
      '사회.json',
      '수학.json',
      '영어.json',
      '한국사.json',
    ])
  })

  it.each(files)('%s validates against standardsSchema and is non-empty', (file) => {
    const raw = JSON.parse(readFileSync(join(dir, file), 'utf8'))
    const rows = standardsSchema.parse(raw)
    expect(rows.length).toBeGreaterThan(0)
  })

  it('has unique codes across all files', () => {
    const allCodes: string[] = []
    for (const file of files) {
      const raw = JSON.parse(readFileSync(join(dir, file), 'utf8'))
      const rows = standardsSchema.parse(raw)
      for (const r of rows) allCodes.push(r.code)
    }
    const unique = new Set(allCodes)
    expect(unique.size).toBe(allCodes.length)
  })
})
