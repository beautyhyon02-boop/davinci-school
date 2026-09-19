import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Badge } from '@/components/ui/Badge'
import { StageWizard } from './StageWizard'
import type { StageStatus } from '@/lib/studio/stages'
import { app } from '@/content/site'
import { WIZARD_STAGES, type WizardStage } from './useStageRunner'

const copy = app.studio.wizard

const STATUS_TONE: Record<string, 'gray' | 'lemon' | 'mint'> = { draft: 'gray', review: 'lemon', published: 'mint', retired: 'gray' }

export default async function SetWizardPage({ params }: { params: Promise<{ themeId: string; setId: string }> }) {
  const { themeId, setId } = await params
  const supabase = await createClient()

  const { data: itemSet } = await supabase
    .from('item_sets')
    .select('id, theme_id, subject, level, grade, status, version, key_question, stage_status')
    .eq('id', setId)
    .single()
  if (!itemSet || itemSet.theme_id !== themeId) notFound()

  const { data: theme } = await supabase.from('themes').select('title').eq('id', themeId).single()
  if (!theme) notFound()

  const stageStatus = (itemSet.stage_status ?? {}) as Record<string, StageStatus>
  const initialStatuses: Partial<Record<WizardStage, StageStatus>> = {}
  for (const s of WIZARD_STAGES) {
    const st = stageStatus[`stage${s}`]
    if (st) initialStatuses[s] = st
  }
  const stage2 = stageStatus.stage2
  const candidates = (stage2?.output as { key_question_candidates?: string[] } | undefined)?.key_question_candidates ?? []

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
        <StageWizard
          setId={setId}
          initialStatuses={initialStatuses}
          keyQuestion={itemSet.key_question}
          candidates={candidates}
        />
      </div>
    </>
  )
}
