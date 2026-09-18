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
  it('exposes UI copy fields used by components so the homepage never hard-codes strings', () => {
    expect(site.header.login).toBeTruthy()
    expect(site.header.franchise).toBeTruthy()
    expect(site.hero.ctaPrimary).toBeTruthy()
    expect(site.hero.ctaFranchise).toBeTruthy()
    expect(site.sections.programs.eyebrow).toBeTruthy()
    expect(site.sections.programs.title).toBeTruthy()
    expect(site.sections.why.eyebrow).toBeTruthy()
    expect(site.sections.why.title).toBeTruthy()
    expect(site.franchiseCta.title).toBeTruthy()
    expect(site.franchiseCta.body).toBeTruthy()
    expect(site.franchiseCta.button).toBeTruthy()
    expect(site.statusLabel.open).toBeTruthy()
    expect(site.statusLabel.soon).toBeTruthy()
    expect(site.footer.contactLabel).toBeTruthy()
  })
})
