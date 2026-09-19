import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { ThemeIntroPanel } from './ThemeIntroPanel'
import { SharedMaterialsPanel } from './SharedMaterialsPanel'
import { StandardsPicker, type StandardsBySubject } from './StandardsPicker'
import type { Subject } from '@/lib/studio/schemas'
import { app } from '@/content/site'

const copy = app.studio.sets

type SetStatus = 'draft' | 'review' | 'published'
const STATUS_TONE: Record<SetStatus, 'gray' | 'lemon' | 'mint'> = { draft: 'gray', review: 'lemon', published: 'mint' }

function acceptedStageCount(stageStatus: Record<string, { state?: string }> | null): number {
  if (!stageStatus) return 0
  let n = 0
  for (let s = 2; s <= 6; s++) {
    if (stageStatus[`stage${s}`]?.state === 'accepted') n += 1
  }
  return n
}

export default async function ThemeDetailPage({ params }: { params: Promise<{ themeId: string }> }) {
  const { themeId } = await params
  const supabase = await createClient()

  const { data: theme } = await supabase
    .from('themes')
    .select('id, title, level, grade, subjects, intro_ideas, materials')
    .eq('id', themeId)
    .single()
  if (!theme) notFound()

  const themeSubjects = (theme.subjects ?? []) as Subject[]

  const [{ data: sets }, { data: standardRows }] = await Promise.all([
    supabase.from('item_sets').select('id, subject, status, stage_status').eq('theme_id', themeId).order('subject'),
    themeSubjects.length
      ? supabase
          .from('standards')
          .select('id, code, text, domain, subject, verified_at')
          .eq('level', theme.level)
          .in('subject', themeSubjects)
          .order('domain')
          .order('code')
      : Promise.resolve({ data: [] as { id: string; code: string; text: string; domain: string; subject: string; verified_at: string | null }[] }),
  ])

  const setRows = sets ?? []
  const existingSubjects = setRows.map((s) => s.subject as string)
  const availableSubjects = themeSubjects.filter((s) => !existingSubjects.includes(s))

  const standardsBySubject: StandardsBySubject = {}
  for (const r of standardRows ?? []) {
    const bySubject = (standardsBySubject[r.subject] ??= {})
    const byDomain = (bySubject[r.domain] ??= [])
    byDomain.push({ id: r.id, code: r.code, text: r.text, domain: r.domain, verified: !!r.verified_at })
  }

  const initialMaterialsJson = JSON.stringify(theme.materials ?? { materials: [] }, null, 2)

  return (
    <>
      <Link href="/admin/items" className="text-sm text-mint-700 underline">{app.studio.theme.backToList}</Link>
      <h1 className="mt-2 text-2xl font-bold">{theme.title}</h1>
      <p className="mt-1 text-ink-500">
        {app.studio.theme.meta(theme.level, theme.grade)} · {themeSubjects.join(', ')}
      </p>

      <div className="mt-6 grid gap-6">
        <ThemeIntroPanel themeId={themeId} initialStatus={theme.intro_ideas} />
        <SharedMaterialsPanel themeId={themeId} initialJson={initialMaterialsJson} />

        <Card>
          <h2 className="text-lg font-bold">{copy.heading}</h2>
          {setRows.length === 0 && <p className="mt-2 text-sm text-ink-500">{copy.empty}</p>}
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {setRows.map((s) => {
              const status = s.status as SetStatus
              const n = acceptedStageCount(s.stage_status as Record<string, { state?: string }> | null)
              return (
                <div key={s.id} className="rounded-xl border border-ink-100 p-4">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">{s.subject}</span>
                    <Badge tone={STATUS_TONE[status] ?? 'gray'}>{copy.statusLabel[status] ?? status}</Badge>
                  </div>
                  <p className="mt-2 text-sm text-ink-500">{copy.progress(n)}</p>
                  <div className="mt-3">
                    <Button href={`/admin/items/${themeId}/sets/${s.id}`} variant="ghost">{copy.open}</Button>
                  </div>
                </div>
              )
            })}
          </div>
        </Card>

        <StandardsPicker themeId={themeId} availableSubjects={availableSubjects} standardsBySubject={standardsBySubject} />
      </div>
    </>
  )
}
