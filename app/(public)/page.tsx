import { site } from '@/content/site'
import { Button } from '@/components/ui/Button'
import { Section } from '@/components/site/Section'
import { ProgramCard } from '@/components/site/ProgramCard'

export default function HomePage() {
  return (
    <>
      <section className="bg-gradient-to-b from-mint-50 to-white">
        <div className="mx-auto max-w-6xl px-4 py-24 text-center">
          <h1 className="text-4xl font-extrabold tracking-tight md:text-5xl">{site.tagline}</h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-ink-700">{site.intro}</p>
          <div className="mt-8 flex justify-center gap-3">
            <Button href="/programs/essay">{site.hero.ctaPrimary}</Button>
            <Button href="/franchise" variant="accent">{site.hero.ctaFranchise}</Button>
          </div>
          <dl className="mx-auto mt-14 grid max-w-3xl grid-cols-3 gap-4">
            {site.stats.map(s => (
              <div key={s.label} className="rounded-2xl bg-white/70 p-4">
                <dt className="text-sm text-ink-500">{s.label}</dt>
                <dd className="text-2xl font-extrabold text-mint-700">{s.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <Section eyebrow={site.sections.programs.eyebrow} title={site.sections.programs.title}>
        <div className="grid gap-5 md:grid-cols-2">
          {site.programs.map(p => <ProgramCard key={p.slug} p={p} />)}
        </div>
      </Section>

      <Section eyebrow={site.sections.why.eyebrow} title={site.sections.why.title}>
        <div className="grid gap-5 md:grid-cols-3">
          {site.why.map(w => (
            <div key={w.title} className="rounded-2xl border border-ink-100 p-6">
              <h3 className="mb-2 text-lg font-bold">{w.title}</h3>
              <p className="text-ink-700">{w.body}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section>
        <div className="rounded-3xl bg-lavender-50 p-10 text-center">
          <h2 className="text-2xl font-extrabold">{site.franchiseCta.title}</h2>
          <p className="mt-2 text-ink-700">{site.franchiseCta.body}</p>
          <Button href="/franchise" variant="accent" className="mt-6">{site.franchiseCta.button}</Button>
        </div>
      </Section>
    </>
  )
}
