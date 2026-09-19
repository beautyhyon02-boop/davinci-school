import { describe, it, expect } from 'vitest'
import { buildSearchFilter } from '@/lib/standards/search'

describe('buildSearchFilter', () => {
  it('quotes the value so PostgREST-structural characters like parentheses survive', () => {
    expect(buildSearchFilter('9사(지리)')).toBe('code.ilike."%9사(지리)%",text.ilike."%9사(지리)%"')
  })

  it('sanitizes quotes and backslashes that would break out of the quoted value', () => {
    expect(buildSearchFilter('a"b\\c')).toBe('code.ilike."%abc%",text.ilike."%abc%"')
  })
})
