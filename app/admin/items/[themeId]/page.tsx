import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { ThemeIntroPanel } from './ThemeIntroPanel'
import { SharedMaterialsPanel } from './SharedMaterialsPanel'
import { AddSubjectsPanel } from './AddSubjectsPanel'
import { StandardsPicker, type StandardsBySubject } from './StandardsPicker'
import type { Subject } from '@/lib/studio/schemas'
import { sharedMaterialsJson, type SharedMaterial } from '@/lib/studio/themes'
import { fetchAll } from '@/lib/supabase/fetch-all'
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

  const { data: sets } = await supabase
    .from('item_sets')
    .select('id, subject, status, stage_status')
    .eq('theme_id', themeId)
    .order('subject')

  const setRows = sets ?? []
  const existingSubjects = setRows.map((s) => s.subject as string)
  const availableSubjects = themeSubjects.filter((s) => !existingSubjects.includes(s))

  // 이미 세트가 만들어진 과목은 picker에 필요 없으니 조회 대상에서 뺀다. level당 과목이 여러 개면
  // 성취기준이 PostgREST 기본 페이지 한도(1000행)를 넘을 수 있어 fetchAll로 끝까지 이어 받는다.
  type StandardRow = { id: string; code: string; text: string; domain: string; subject: string; verified_at: string | null }
  const standardRows = availableSubjects.length
    ? await fetchAll<StandardRow>((from, to) =>
        supabase
          .from('standards')
          .select('id, code, text, domain, subject, verified_at')
          .eq('level', theme.level)
          .in('subject', availableSubjects)
          .order('subject')
          .order('domain')
          .order('code')
          .range(from, to),
      )
    : []

  const standardsBySubject: StandardsBySubject = {}
  for (const r of standardRows) {
    const domain = r.domain.trim() ? r.domain : app.studio.picker.uncategorized
    const bySubject = (standardsBySubject[r.subject] ??= {})
    const byDomain = (bySubject[domain] ??= [])
    byDomain.push({ id: r.id, code: r.code, text: r.text, domain, verified: !!r.verified_at })
  }

  // themes.materials 는 래퍼 없는 배열로 저장된다 — textarea 에는 스키마 모양({materials:[...]})으로 씌워 보여 준다.
  const initialMaterialsJson = sharedMaterialsJson(theme.materials as SharedMaterial[] | null)

  return (
    <>
      <Link href="/admin/items" className="text-sm text-mint-700 underline">{app.studio.theme.backToList}</Link>
      <h1 className="mt-2 text-2xl font-bold">{theme.title}</h1>
      <p className="mt-1 text-ink-500">{app.studio.theme.meta(theme.level, theme.grade)}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {themeSubjects.map((s) => (
          <Badge key={s} tone="lavender">{s}</Badge>
        ))}
      </div>

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

        <AddSubjectsPanel themeId={themeId} themeSubjects={themeSubjects} />

        <StandardsPicker themeId={themeId} availableSubjects={availableSubjects} standardsBySubject={standardsBySubject} />
      </div>
    </>
  )
}
