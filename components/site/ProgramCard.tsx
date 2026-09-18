import Link from 'next/link'
import { Badge } from '@/components/ui/Badge'
import type { site } from '@/content/site'

type Program = (typeof site.programs)[number]
const bg = { mint: 'bg-mint-50', lemon: 'bg-lemon-50', lavender: 'bg-lavender-50' } as const

export function ProgramCard({ p }: { p: Program }) {
  return (
    <Link href={`/programs/${p.slug}`} className={`block rounded-2xl p-6 transition hover:-translate-y-0.5 hover:shadow-md ${bg[p.accent]}`}>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-xl font-bold">{p.name}</h3>
        {p.status === 'soon' ? <Badge tone="gray">준비 중</Badge> : <Badge tone={p.accent}>운영 중</Badge>}
      </div>
      <p className="text-ink-700">{p.short}</p>
    </Link>
  )
}
