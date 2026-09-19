'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getSessionProfile } from '@/lib/auth/session'
import { STAGE_SCHEMAS, type Stage } from '@/lib/studio/schemas'
import type { StageStatus } from '@/lib/studio/stages'
import { app } from '@/content/site'

const errors = app.studio.wizard.errors

async function assertAdmin() {
  const s = await getSessionProfile()
  if (s.role !== 'admin') throw new Error('forbidden')
  return s
}

type ActionResult = { ok: true } | { ok: false; error: string }

// stage별 item_sets 컬럼 매핑 — lib/studio/repo.ts saveOutput과 동일해야 한다(2단계는 reconstruction+learning_goals, 나머지는 단일 컬럼).
function stageColumns(stage: Stage, output: unknown): Record<string, unknown> {
  switch (stage) {
    case 2: {
      const o = output as { reconstruction: string; learning_goals: string[] }
      return { reconstruction: o.reconstruction, learning_goals: o.learning_goals }
    }
    case 3:
      return { lessons: (output as { lessons: unknown }).lessons }
    case 4:
      return { materials: (output as { materials: unknown }).materials }
    case 5:
      return { assessment: output }
    case 6:
      return { teacher_guide: output }
    default:
      return {}
  }
}

/** 2~6단계 출력을 관리자가 JSON으로 직접 수정해 저장한다. zod로 검증 후 저장하고 상태를 generated(model:'edited')로 되돌린다. */
export async function saveStageEdit(setId: string, stage: Stage, json: string): Promise<ActionResult> {
  await assertAdmin()

  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    return { ok: false, error: errors.invalidJson }
  }

  const schema = STAGE_SCHEMAS[stage]
  const r = schema.safeParse(parsed)
  if (!r.success) return { ok: false, error: errors.invalidShape(r.error.issues[0]?.message ?? r.error.message) }

  const supabase = await createClient()
  const { data: itemSet, error: fetchErr } = await supabase
    .from('item_sets')
    .select('theme_id, stage_status')
    .eq('id', setId)
    .single()
  if (fetchErr || !itemSet) return { ok: false, error: errors.saveFailed }

  const stageStatus = (itemSet.stage_status ?? {}) as Record<string, StageStatus>
  const prev = stageStatus[`stage${stage}`] ?? { state: 'idle', attempt: 0, updated_at: '' }

  const columns = stageColumns(stage, r.data)
  const { error: updateErr } = await supabase.from('item_sets').update(columns).eq('id', setId)
  if (updateErr) return { ok: false, error: errors.saveFailed }

  const status: StageStatus = {
    state: 'generated',
    attempt: prev.attempt,
    output: r.data,
    updated_at: new Date().toISOString(),
    model: 'edited',
  }
  const { error: rpcErr } = await supabase.rpc('set_stage_status', {
    p_item_set_id: setId,
    p_key: `stage${stage}`,
    p_value: status,
  })
  if (rpcErr) return { ok: false, error: errors.saveFailed }

  revalidatePath(`/admin/items/${itemSet.theme_id}/sets/${setId}`)
  return { ok: true }
}

/** 2단계가 확정된 뒤, 그 단계의 핵심질문 후보 중 하나를 세트의 key_question으로 확정한다. */
export async function chooseKeyQuestion(setId: string, q: string): Promise<ActionResult> {
  await assertAdmin()

  const supabase = await createClient()
  const { data: itemSet, error: fetchErr } = await supabase
    .from('item_sets')
    .select('theme_id, stage_status')
    .eq('id', setId)
    .single()
  if (fetchErr || !itemSet) return { ok: false, error: errors.saveFailed }

  const stageStatus = (itemSet.stage_status ?? {}) as Record<string, StageStatus>
  const stage2 = stageStatus.stage2
  const candidates = (stage2?.output as { key_question_candidates?: string[] } | undefined)?.key_question_candidates ?? []
  if (stage2?.state !== 'accepted' || !candidates.includes(q)) {
    return { ok: false, error: errors.keyQuestionInvalid }
  }

  const { error: updateErr } = await supabase.from('item_sets').update({ key_question: q }).eq('id', setId)
  if (updateErr) return { ok: false, error: errors.saveFailed }

  revalidatePath(`/admin/items/${itemSet.theme_id}/sets/${setId}`)
  return { ok: true }
}
