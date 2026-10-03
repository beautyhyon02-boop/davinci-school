import { programDetails, site, pages } from '@/content/site'
import { Button } from '@/components/ui/Button'

/** 따로 배포된 사이트로 보내는 프로그램 쪽(대입 컨설팅·다빈치랩 — 대표 2026-10-03). 새 창으로 연다. */
export function ExternalProgram({ slug }: { slug: 'consulting' | 'lab' }) {
  const p = site.programs.find(x => x.slug === slug)!
  const d = programDetails[slug]
  const t = pages.program.external
  const href = 'external' in p ? p.external : '/'
  return (
    <div className="mx-auto max-w-2xl px-4 py-32 text-center">
      <p className="text-sm font-semibold text-lavender-600">{t.eyebrow}</p>
      <h1 className="mt-2 text-3xl font-extrabold">{d.headline}</h1>
      {d.paragraphs.map(x => <p key={x} className="mt-4 text-ink-700">{x}</p>)}
      <div className="mt-8 flex flex-col items-center gap-2">
        <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center rounded-full bg-mint-500 px-6 py-3 font-semibold text-white hover:bg-mint-600">{t.button(p.name)}</a>
        <span className="text-xs text-ink-500">{t.note}</span>
        <Button href="/" variant="ghost" className="mt-4">{t.back}</Button>
      </div>
    </div>
  )
}
