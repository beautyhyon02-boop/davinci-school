import { describe, it, expect } from 'vitest'
import { site, programDetails, pages, auth } from '@/content/site'

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
  it('has programDetails for all four program slugs with non-empty headlines', () => {
    const slugs = site.programs.map(p => p.slug)
    for (const slug of slugs) {
      expect(programDetails[slug]).toBeTruthy()
      expect(programDetails[slug].headline).toBeTruthy()
      expect(Array.isArray(programDetails[slug].paragraphs)).toBe(true)
      expect(Array.isArray(programDetails[slug].bullets)).toBe(true)
    }
  })
  it('exposes page copy (ComingSoon, program CTA, franchise form) so pages never hard-code Korean strings', () => {
    expect(pages.comingSoon.eyebrow).toBeTruthy()
    expect(pages.comingSoon.title('테스트')).toContain('테스트')
    expect(pages.comingSoon.body).toBeTruthy()
    expect(pages.comingSoon.back).toBeTruthy()
    expect(pages.program.cta).toBeTruthy()
    expect(pages.franchise.title).toBeTruthy()
    expect(pages.franchise.intro).toBeTruthy()
    expect(pages.franchise.formTitle).toBeTruthy()
    expect(pages.franchise.fields.name.label).toBeTruthy()
    expect(pages.franchise.fields.phone.label).toBeTruthy()
    expect(pages.franchise.fields.phone.placeholder).toBeTruthy()
    expect(pages.franchise.fields.region.label).toBeTruthy()
    expect(pages.franchise.fields.region.placeholder).toBeTruthy()
    expect(pages.franchise.fields.message.label).toBeTruthy()
    expect(pages.franchise.submit).toBeTruthy()
  })
  it('exposes login page copy so the login form never hard-codes Korean strings', () => {
    expect(auth.login.title).toBeTruthy()
    expect(auth.login.subtitle).toBeTruthy()
    expect(auth.login.idLabel).toBeTruthy()
    expect(auth.login.passwordLabel).toBeTruthy()
    expect(auth.login.submit).toBeTruthy()
    expect(auth.login.submitting).toBeTruthy()
    expect(auth.login.errors.missing).toBeTruthy()
    expect(auth.login.errors.invalid).toBeTruthy()
  })
})
