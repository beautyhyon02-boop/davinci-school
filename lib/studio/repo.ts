import type { createClient } from '@/lib/supabase/server'
import type { Ctx } from './prompts/stages'
import type { Repo, StageStatus } from './stages'

type Supabase = Awaited<ReturnType<typeof createClient>>

// stage별 item_sets 컬럼 매핑: 0/1은 stage_status에만 저장, 2~6은 전용 컬럼을 둔다.
// (2단계는 reconstruction/learning_goals 컬럼 + stage_status.stage2.output.key_question_candidates)

export function createSupabaseRepo(supabase: Supabase): Repo {
  let themeId: string | null = null

  return {
    async loadContext(itemSetId): Promise<Ctx & { outputs: Record<number, unknown>; statuses?: Record<number, StageStatus> }> {
      const { data: itemSet, error: itemSetErr } = await supabase
        .from('item_sets')
        .select('theme_id, subject, level, grade, reconstruction, learning_goals, lessons, materials, assessment, teacher_guide, stage_status')
        .eq('id', itemSetId)
        .single()
      if (itemSetErr || !itemSet) throw new Error(`item_set not found: ${itemSetId}`)
      themeId = itemSet.theme_id

      const { data: theme, error: themeErr } = await supabase
        .from('themes')
        .select('title')
        .eq('id', itemSet.theme_id)
        .single()
      if (themeErr || !theme) throw new Error(`theme not found: ${itemSet.theme_id}`)

      const { data: standardRows } = await supabase
        .from('item_set_standards')
        .select('standards(code, text)')
        .eq('item_set_id', itemSetId)
      const standards = (standardRows ?? [])
        .map(r => r.standards as unknown as { code: string; text: string } | null)
        .filter((s): s is { code: string; text: string } => !!s)

      const stageStatus = (itemSet.stage_status ?? {}) as Record<string, StageStatus>
      const statuses: Record<number, StageStatus> = {}
      for (let s = 0; s <= 6; s++) {
        const st = stageStatus[`stage${s}`]
        if (st) statuses[s] = st
      }

      const outputs: Record<number, unknown> = {}
      if (stageStatus.stage0?.output !== undefined) outputs[0] = stageStatus.stage0.output
      if (stageStatus.stage1?.output !== undefined) outputs[1] = stageStatus.stage1.output
      if (itemSet.reconstruction != null) {
        const candidates = (stageStatus.stage2?.output as { key_question_candidates?: string[] } | undefined)?.key_question_candidates ?? []
        outputs[2] = { reconstruction: itemSet.reconstruction, learning_goals: itemSet.learning_goals ?? [], key_question_candidates: candidates }
      }
      if (itemSet.lessons != null) outputs[3] = { lessons: itemSet.lessons }
      if (itemSet.materials != null) outputs[4] = { materials: itemSet.materials }
      if (itemSet.assessment != null) outputs[5] = itemSet.assessment
      if (itemSet.teacher_guide != null) outputs[6] = itemSet.teacher_guide

      return {
        theme: { title: theme.title, level: itemSet.level, grade: itemSet.grade, subjects: [itemSet.subject] },
        subject: itemSet.subject,
        standards,
        prior: {},
        outputs,
        statuses,
      }
    },

    async saveOutput(itemSetId, stage, output) {
      switch (stage) {
        case 0:
        case 1:
          return // 전용 컬럼 없음 — stage_status에만 저장 (saveStatus에서 처리)
        case 2: {
          const o = output as { reconstruction: string; learning_goals: string[] }
          const { error } = await supabase.from('item_sets').update({ reconstruction: o.reconstruction, learning_goals: o.learning_goals }).eq('id', itemSetId)
          if (error) throw new Error(error.message)
          return
        }
        case 3: {
          const o = output as { lessons: unknown }
          const { error } = await supabase.from('item_sets').update({ lessons: o.lessons }).eq('id', itemSetId)
          if (error) throw new Error(error.message)
          return
        }
        case 4: {
          const o = output as { materials: unknown }
          const { error } = await supabase.from('item_sets').update({ materials: o.materials }).eq('id', itemSetId)
          if (error) throw new Error(error.message)
          return
        }
        case 5: {
          const { error } = await supabase.from('item_sets').update({ assessment: output }).eq('id', itemSetId)
          if (error) throw new Error(error.message)
          return
        }
        case 6: {
          const { error } = await supabase.from('item_sets').update({ teacher_guide: output }).eq('id', itemSetId)
          if (error) throw new Error(error.message)
          return
        }
      }
    },

    async saveStatus(itemSetId, stage, status) {
      const { data, error: readErr } = await supabase.from('item_sets').select('stage_status').eq('id', itemSetId).single()
      if (readErr || !data) throw new Error(`item_set not found: ${itemSetId}`)
      const stageStatus = { ...(data.stage_status ?? {}), [`stage${stage}`]: status }
      const { error } = await supabase.from('item_sets').update({ stage_status: stageStatus }).eq('id', itemSetId)
      if (error) throw new Error(error.message)
    },

    async log(entry) {
      let tId = themeId
      if (!tId) {
        const { data } = await supabase.from('item_sets').select('theme_id').eq('id', entry.itemSetId).single()
        tId = data?.theme_id ?? null
      }
      await supabase.from('generation_log').insert({
        item_set_id: entry.itemSetId,
        theme_id: tId,
        stage: entry.stage,
        role: entry.role,
        attempt: entry.attempt,
        model: entry.model,
        input_tokens: entry.input,
        output_tokens: entry.output,
        cache_read_tokens: entry.cacheRead,
        ok: entry.ok,
        issues: entry.issues ?? null,
        error: entry.error ?? null,
      })
    },
  }
}
