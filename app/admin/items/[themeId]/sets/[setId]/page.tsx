import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Badge } from '@/components/ui/Badge'
import { StageWizard } from './StageWizard'
import { SetPageTabs } from './SetPageTabs'
import { PublishPanel } from './PublishPanel'
import { PackageView } from '@/components/studio/PackageView'
import { canPublish, buildSnapshot } from '@/lib/studio/publish'
import type { StageStatus } from '@/lib/studio/stages'
import { app } from '@/content/site'
import { WIZARD_STAGES, type WizardStage } from '@/lib/studio/wizard-stages'

const copy = app.studio.wizard

const STATUS_TONE: Record<string, 'gray' | 'lemon' | 'mint'> = { draft: 'gray', review: 'lemon', published: 'mint', retired: 'gray' }

export default async function SetWizardPage({ params }: { params: Promise<{ themeId: string; setId: string }> }) {
  const { themeId, setId } = await params
  const supabase = await createClient()

  const { data: itemSet } = await supabase
    .from('item_sets')
    .select('id, theme_id, subject, level, grade, status, version, key_question, stage_status, materials, lessons, reconstruction, learning_goals, assessment, teacher_guide')
    .eq('id', setId)
    .single()
  if (!itemSet || itemSet.theme_id !== themeId) notFound()

  const { data: theme } = await supabase.from('themes').select('title, level, grade, intro, materials').eq('id', themeId).single()
  if (!theme) notFound()

  const { data: standardRows } = await supabase
    .from('item_set_standards')
    .select('standards(code, text, verified_at)')
    .eq('item_set_id', setId)
  const standardsFull = (standardRows ?? [])
    .map((r) => r.standards as unknown as { code: string; text: string; verified_at: string | null } | null)
    .filter((s): s is { code: string; text: string; verified_at: string | null } => !!s)
    .sort((a, b) => a.code.localeCompare(b.code))

  const stageStatus = (itemSet.stage_status ?? {}) as Record<string, StageStatus>
  const initialStatuses: Partial<Record<WizardStage, StageStatus>> = {}
  for (const s of WIZARD_STAGES) {
    const st = stageStatus[`stage${s}`]
    if (st) initialStatuses[s] = st
  }
  const stage2 = stageStatus.stage2
  const candidates = (stage2?.output as { key_question_candidates?: string[] } | undefined)?.key_question_candidates ?? []

  // publishItemSet과 같은 규칙: 다음 버전은 item_sets.version이 아니라 item_set_versions 최댓값+1로 미리보기에서도 미리 계산한다.
  const { data: lastVersion } = await supabase
    .from('item_set_versions')
    .select('version')
    .eq('item_set_id', setId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle()
  const nextVersion = (lastVersion?.version ?? 0) + 1

  const draftSnapshot = buildSnapshot({
    theme: { title: theme.title, level: theme.level, grade: theme.grade, intro: theme.intro, materials: theme.materials },
    itemSet: { ...itemSet, stage_status: stageStatus },
    standards: standardsFull.map((s) => ({ code: s.code, text: s.text })),
    version: nextVersion,
  })
  const { blockers } = canPublish({
    statuses: stageStatus,
    standards: standardsFull.map((s) => ({ code: s.code, verified: !!s.verified_at })),
    keyQuestion: itemSet.key_question,
  })

  return (
    <>
      <Link href={`/admin/items/${themeId}`} className="text-sm text-mint-700 underline">{copy.backToTheme}</Link>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-bold">{theme.title}</h1>
        <Badge tone="gray">{itemSet.subject}</Badge>
        <Badge tone={STATUS_TONE[itemSet.status] ?? 'gray'}>{app.studio.sets.statusLabel[itemSet.status as keyof typeof app.studio.sets.statusLabel] ?? itemSet.status}</Badge>
        <Badge tone="gray">{copy.versionLabel(itemSet.version ?? 1)}</Badge>
      </div>
      <p className="mt-1 text-sm text-ink-500">{app.studio.theme.meta(itemSet.level, itemSet.grade)}</p>

      <div className="mt-6">
        <SetPageTabs
          wizard={
            <>
              <StageWizard
                setId={setId}
                initialStatuses={initialStatuses}
                keyQuestion={itemSet.key_question}
                candidates={candidates}
                materials={(itemSet.materials ?? []) as { id: string; images?: string[] }[]}
                lessons={(itemSet.lessons ?? []) as { no: number; images?: string[] }[]}
              />
            </>
          }
          preview={
            <div className="space-y-4">
              <PublishPanel
                setId={setId}
                currentVersion={itemSet.version ?? 1}
                nextVersion={nextVersion}
                initialBlockers={blockers}
              />
              <PackageView snapshot={draftSnapshot} mode="admin" showAnswers />
            </div>
          }
        />
      </div>
    </>
  )
}
