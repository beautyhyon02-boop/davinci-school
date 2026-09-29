import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { ThemeIntroPanel } from './ThemeIntroPanel'
import { SharedMaterialsPanel } from './SharedMaterialsPanel'
import { AddSubjectsPanel } from './AddSubjectsPanel'
import { GradeEditor } from './GradeEditor'
import { StandardsPicker, type StandardsBySubject } from './StandardsPicker'
import type { Subject, Level } from '@/lib/studio/schemas'
import { isStudioSubject, standardSubjectsFor, groupStandardFamilies } from '@/lib/studio/subjects'
import { sharedMaterialsJson, type SharedMaterial } from '@/lib/studio/themes'
import { fetchAll } from '@/lib/supabase/fetch-all'
import { cleanMaterialTitle } from '@/lib/studio/materials'
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
    .select('id, title, level, grade, subjects, intro, intro_ideas, materials')
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
  // 새 세트는 제작소 과목 다섯만(대표 결정 2026-09-30) — 옛 대주제에 남은 한국사·세계사는 배지로만 보이고 세트는 사회로 만든다
  const availableSubjects = themeSubjects.filter((s) => isStudioSubject(s) && !existingSubjects.includes(s))
  // 사회 세트는 사회·한국사·세계사 성취기준을 모두 고를 수 있다(과목 묶음)
  const standardSubjects = Array.from(new Set(availableSubjects.flatMap((s) => standardSubjectsFor(s))))

  // 이미 세트가 만들어진 과목은 picker에 필요 없으니 조회 대상에서 뺀다. level당 과목이 여러 개면
  // 성취기준이 PostgREST 기본 페이지 한도(1000행)를 넘을 수 있어 fetchAll로 끝까지 이어 받는다.
  type StandardRow = { id: string; code: string; text: string; domain: string; subject: string; verified_at: string | null }
  const standardRows = availableSubjects.length
    ? await fetchAll<StandardRow>((from, to) =>
        supabase
          .from('standards')
          .select('id, code, text, domain, subject, verified_at')
          .eq('level', theme.level)
          .in('subject', standardSubjects)
          .order('subject')
          .order('domain')
          .order('code')
          .range(from, to),
      )
    : []

  // 과목 → 묶음(사회만: 지리·일반사회·역사… 코드 머리로 나눔) → 영역 → 성취기준. 묶음 제목은 content/site.ts 에서 온다.
  const standardsBySubject: StandardsBySubject = {}
  for (const subject of availableSubjects) {
    const allowed = standardSubjectsFor(subject)
    const rows = standardRows
      .filter((r) => allowed.includes(r.subject))
      .map((r) => ({ id: r.id, code: r.code, text: r.text, subject: r.subject, domain: r.domain.trim() ? r.domain : app.studio.picker.uncategorized, verified: !!r.verified_at }))
    standardsBySubject[subject] = groupStandardFamilies(rows, subject).map((f) => ({
      key: f.key,
      label: f.key ? app.studio.picker.familyLabel(f.key) : '',
      domains: f.domains.map((d) => ({ domain: d.domain, rows: d.rows.map((r) => ({ id: r.id, code: r.code, text: r.text, domain: r.domain, verified: r.verified })) })),
    }))
  }

  // themes.materials 는 래퍼 없는 배열로 저장된다 — textarea 에는 스키마 모양({materials:[...]})으로 씌워 보여 준다.
  const initialMaterialsJson = sharedMaterialsJson(theme.materials as SharedMaterial[] | null)
  // 세트 만들기 폼의 「이 세트에서 쓸 공동 자료」 체크 목록(대표 결정 2026-09-28, 기본 = 아무것도 안 씀)
  const sharedOptions = ((Array.isArray(theme.materials) ? theme.materials : []) as { id: string; title?: string; kind?: string }[])
    .map((m) => ({ id: m.id, title: cleanMaterialTitle(m.title ?? ''), kind: m.kind ?? '' }))

  return (
    <>
      <Link href="/admin/items" className="text-sm text-mint-700 underline">{app.studio.theme.backToList}</Link>
      <h1 className="mt-2 text-2xl font-bold">{theme.title}</h1>
      <p className="mt-1 text-ink-500">{app.studio.theme.meta(theme.level, (theme.grade as number | null) ?? null)}</p>
      <GradeEditor themeId={themeId} level={theme.level as Level} grade={(theme.grade as number | null) ?? null} />
      <div className="mt-2 flex flex-wrap gap-2">
        {themeSubjects.map((s) => (
          <Badge key={s} tone="lavender">{s}</Badge>
        ))}
      </div>

      <div className="mt-6 grid gap-6">
        <ThemeIntroPanel themeId={themeId} initialStatus={theme.intro_ideas} themeSubjects={themeSubjects} acceptedIntro={(theme.intro as string | null) ?? null} />
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

        <AddSubjectsPanel themeId={themeId} themeSubjects={themeSubjects} subjectsWithSets={existingSubjects} />

        <StandardsPicker themeId={themeId} availableSubjects={availableSubjects} standardsBySubject={standardsBySubject} sharedOptions={sharedOptions} />
      </div>
    </>
  )
}
