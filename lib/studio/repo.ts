import type { createClient } from '@/lib/supabase/server'
import type { Ctx } from './prompts/stages'
import type { Repo, StageStatus, ThemeRepo } from './stages'
import { keyQuestionAfterStage2 } from './edit-rules'

type Supabase = Awaited<ReturnType<typeof createClient>>

// stage별 item_sets 컬럼 매핑: 0/1은 stage_status에만 저장, 2~6은 전용 컬럼을 둔다.
// (2단계는 reconstruction/learning_goals 컬럼 + stage_status.stage2.output.key_question_candidates)

/**
 * 단계별 상태 맵(0~6)을 만든다. 1~6단계는 item_sets.stage_status 에 있지만 0단계(대주제 소개)는
 * 대주제(themes.intro_ideas)에 저장되므로 여기서 합류시킨다 — 빠뜨리면 runStage 의 prior 루프가
 * stage0 을 영영 accepted 로 보지 못해 확정된 대주제 소개가 2~6단계 프롬프트에 들어가지 않는다.
 */
export function buildStatuses(
  stageStatus: Record<string, StageStatus | undefined>,
  introIdeas: StageStatus | null | undefined,
): Record<number, StageStatus> {
  const statuses: Record<number, StageStatus> = {}
  for (let s = 0; s <= 6; s++) {
    const st = stageStatus[`stage${s}`]
    if (st) statuses[s] = st
  }
  if (introIdeas) statuses[0] = introIdeas
  return statuses
}

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
        .select('title, subjects, materials, intro_ideas')
        .eq('id', itemSet.theme_id)
        .single()
      if (themeErr || !theme) throw new Error(`theme not found: ${itemSet.theme_id}`)
      const subjects = ((theme.subjects as string[] | null) ?? []).length ? (theme.subjects as string[]) : [itemSet.subject as string]

      const { data: standardRows } = await supabase
        .from('item_set_standards')
        .select('standards(code, text)')
        .eq('item_set_id', itemSetId)
      // code 순으로 정렬: 프롬프트(사용자 턴)가 결정적이 되도록
      const standards = (standardRows ?? [])
        .map(r => r.standards as unknown as { code: string; text: string } | null)
        .filter((s): s is { code: string; text: string } => !!s)
        .sort((a, b) => a.code.localeCompare(b.code))

      const stageStatus = (itemSet.stage_status ?? {}) as Record<string, StageStatus>
      const introIdeas = theme.intro_ideas as StageStatus | null
      const statuses = buildStatuses(stageStatus, introIdeas)

      const outputs: Record<number, unknown> = {}
      if (introIdeas?.output !== undefined) outputs[0] = introIdeas.output
      if (stageStatus.stage1?.output !== undefined) outputs[1] = stageStatus.stage1.output
      if (itemSet.reconstruction != null) {
        const candidates = (stageStatus.stage2?.output as { key_question_candidates?: string[] } | undefined)?.key_question_candidates ?? []
        outputs[2] = { reconstruction: itemSet.reconstruction, learning_goals: itemSet.learning_goals ?? [], key_question_candidates: candidates }
      }
      if (itemSet.lessons != null) outputs[3] = { lessons: itemSet.lessons }
      if (itemSet.materials != null) outputs[4] = { materials: itemSet.materials }
      if (itemSet.assessment != null) outputs[5] = itemSet.assessment
      if (itemSet.teacher_guide != null) outputs[6] = itemSet.teacher_guide

      const prior: Record<string, unknown> = {}
      if (theme.materials != null) prior.shared_materials = theme.materials

      return {
        theme: { title: theme.title, level: itemSet.level, grade: itemSet.grade, subjects },
        subject: itemSet.subject,
        standards,
        prior,
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
          const o = output as { reconstruction: string; learning_goals: string[]; key_question_candidates?: string[] }
          // 2단계를 다시 만들면 핵심질문 후보가 바뀐다 — 이미 고른 핵심질문이 새 후보에 없으면 함께 비운다.
          const { data: current } = await supabase.from('item_sets').select('key_question').eq('id', itemSetId).single()
          const keyQuestion = keyQuestionAfterStage2(current?.key_question as string | null | undefined, o.key_question_candidates ?? [])
          const { error } = await supabase
            .from('item_sets')
            .update({ reconstruction: o.reconstruction, learning_goals: o.learning_goals, key_question: keyQuestion })
            .eq('id', itemSetId)
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
      // read-modify-write 대신 DB 함수(set_stage_status)로 stage_status를 원자적으로 병합
      const { error } = await supabase.rpc('set_stage_status', {
        p_item_set_id: itemSetId,
        p_key: `stage${stage}`,
        p_value: status,
      })
      if (error) throw new Error(error.message)
    },

    async log(entry) {
      let tId = themeId
      if (!tId) {
        const { data } = await supabase.from('item_sets').select('theme_id').eq('id', entry.itemSetId).single()
        tId = data?.theme_id ?? null
      }
      const { error } = await supabase.from('generation_log').insert({
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
      if (error) console.warn('[generation_log] insert failed:', error.message)
    },
  }
}

// 대주제 소개(0단계): themes.intro_ideas(생성/검토 상태)와 확정 시 themes.intro 에 저장한다.
export function createSupabaseThemeRepo(supabase: Supabase): ThemeRepo {
  return {
    async loadTheme(themeId) {
      const { data, error } = await supabase
        .from('themes')
        .select('title, level, grade, subjects, intro_ideas')
        .eq('id', themeId)
        .single()
      if (error || !data) throw new Error(`theme not found: ${themeId}`)
      return {
        title: data.title,
        level: data.level,
        grade: data.grade,
        subjects: ((data.subjects as string[] | null) ?? []),
        intro_ideas: (data.intro_ideas as StageStatus | null) ?? null,
      }
    },

    async saveThemeIntro(themeId, status, accepted) {
      const update: Record<string, unknown> = { intro_ideas: status }
      if (accepted) update.intro = accepted.intro
      const { error } = await supabase.from('themes').update(update).eq('id', themeId)
      if (error) throw new Error(error.message)
    },

    async log(entry) {
      const { error } = await supabase.from('generation_log').insert({
        item_set_id: null,
        theme_id: entry.themeId,
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
      if (error) console.warn('[generation_log] insert failed:', error.message)
    },
  }
}
