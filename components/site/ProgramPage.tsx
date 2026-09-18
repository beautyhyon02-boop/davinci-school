import { programDetails, site, pages } from '@/content/site'
import { Section } from '@/components/site/Section'
import { Button } from '@/components/ui/Button'

type OpenProgramSlug = 'inquiry' | 'essay'

const heroBg: Record<OpenProgramSlug, string> = {
  inquiry: 'bg-mint-50',
  essay: 'bg-lemon-50',
}

export function ProgramPage({ slug }: { slug: OpenProgramSlug }) {
  const p = site.programs.find(x => x.slug === slug)!
  const d = programDetails[slug]
  return (
    <>
      <div className={heroBg[slug]}>
        <div className="mx-auto max-w-6xl px-4 py-20">
          <p className="text-sm font-semibold text-lavender-600">{p.name}</p>
          <h1 className="mt-2 text-4xl font-extrabold tracking-tight">{d.headline}</h1>
        </div>
      </div>
      <Section>
        <div className="grid gap-10 md:grid-cols-[2fr_1fr]">
          <div className="space-y-4 text-lg text-ink-700">{d.paragraphs.map(t => <p key={t}>{t}</p>)}</div>
          <ul className="space-y-3 rounded-2xl bg-mint-50 p-6">
            {d.bullets.map(b => <li key={b} className="flex gap-2"><span className="text-mint-600">✓</span>{b}</li>)}
          </ul>
        </div>
        <Button href="/franchise" variant="accent" className="mt-10">{pages.program.cta}</Button>
      </Section>
    </>
  )
}
