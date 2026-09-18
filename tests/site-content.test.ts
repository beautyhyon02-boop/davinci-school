import { describe, it, expect } from 'vitest'
import { site } from '@/content/site'

describe('site content', () => {
  it('has exactly four programs with unique slugs', () => {
    const slugs = site.programs.map(p => p.slug)
    expect(slugs).toEqual(['inquiry', 'essay', 'consulting', 'lab'])
  })
  it('marks inquiry and essay as open', () => {
    expect(site.programs.filter(p => p.status === 'open').map(p => p.slug)).toEqual(['inquiry', 'essay'])
  })
})
