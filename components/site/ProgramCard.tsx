import Link from 'next/link'
import { Badge } from '@/components/ui/Badge'
import { site } from '@/content/site'

type Program = (typeof site.programs)[number]
const bg = { mint: 'bg-mint-50', lemon: 'bg-lemon-50', lavender: 'bg-lavender-50' } as const

export function ProgramCard({ p }: { p: Program }) {
  const external = 'external' in p ? p.external : undefined
  const cls = `block rounded-2xl p-6 transition hover:-translate-y-0.5 hover:shadow-md ${bg[p.accent]}`
  const body = (
    <>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-xl font-bold">{p.name}</h3>
        {external ? <Badge tone={p.accent}>{site.statusLabel.external}</Badge> : (p.status as string) === 'soon' ? <Badge tone="gray">{site.statusLabel.soon}</Badge> : <Badge tone={p.accent}>{site.statusLabel.open}</Badge>}
      </div>
      <p className="text-ink-700">{p.short}</p>
    </>
  )
  // 따로 배포된 사이트(대입 컨설팅·다빈치랩)는 새 창으로 바로 간다(대표 2026-10-03)
  if (external) return <a href={external} target="_blank" rel="noopener noreferrer" className={cls}>{body}</a>
  return <Link href={`/programs/${p.slug}`} className={cls}>{body}</Link>
}
