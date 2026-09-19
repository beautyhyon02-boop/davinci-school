import { describe, it, expect } from 'vitest'
import { fetchAll } from '@/lib/supabase/fetch-all'

describe('fetchAll', () => {
  it('pages through .range() calls until a page shorter than pageSize is returned', async () => {
    const pageSizes = [1000, 1000, 37]
    let calls = 0
    const seen: { from: number; to: number }[] = []
    const build = async (from: number, to: number) => {
      seen.push({ from, to })
      const size = pageSizes[calls] ?? 0
      calls += 1
      return { data: Array.from({ length: size }, (_, i) => from + i), error: null }
    }
    const rows = await fetchAll<number>(build)
    expect(rows.length).toBe(2037)
    expect(calls).toBe(3)
    expect(seen).toEqual([{ from: 0, to: 999 }, { from: 1000, to: 1999 }, { from: 2000, to: 2999 }])
  })

  it('throws when a page returns an error, without swallowing it', async () => {
    const build = async () => ({ data: null, error: new Error('boom') })
    await expect(fetchAll(build)).rejects.toThrow('boom')
  })
})
