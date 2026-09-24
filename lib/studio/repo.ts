import type { createClient } from '@/lib/supabase/server'
import type { Ctx } from './prompts/stages'
import type { Repo, StageStatus, ThemeRepo } from './stages'
import { keyQuestionAfterStage2 } from './edit-rules'
import { withMaterialDefaults } from './draft-defaults'

type Supabase = Awaited<ReturnType<typeof createClient>>

// stage별 item_sets 컬럼 매핑: 0/1은 stage_status에만 저장, 2~7은 전용 컬럼을 둔다(마이그레이션 0011).
// 2단계: reconstruction_detail(재구조화 표 = 출력 standards) + reconstruction + learning_goals 컬럼,
//        level_anchor·key_question_candidates 는 stage_status.stage2.output 에서 읽는다.
// 3단계: unit_plan + lessons. 7단계: notice_plan.
// app/admin/items/[themeId]/sets/[setId]/actions.ts 의 stageColumns 와 같아야 한다.

/**
 * 단계별 상태 맵(0~7)을 만든다. 1~7단계는 item_sets.stage_status 에 있지만 0단계(대주제 소개)는
 * 대주제(themes.intro_ideas)에 저장되므로 여기서 합류시킨다 — 빠뜨리면 runStage 의 prior 루프가
 * stage0 을 영영 accepted 로 보지 못해 확정된 대주제 소개가 2~7단계 프롬프트에 들어가지 않는다.
 */
export function buildStatuses(
  stageStatus: Record<string, StageStatus | undefined>,
  introIdeas: StageStatus | null | undefined,
): Record<number, StageStatus> {
  const statuses: Record<number, StageStatus> = {}
  for (let s = 0; s <= 7; s++) {
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
        .select('theme_id, subject, level, grade, reconstruction, reconstruction_detail, learning_goals, unit_plan, lessons, materials, assessment, teacher_guide, notice_plan, stage_status')
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
      // 2·3단계는 v2 출력 전체(재구조화 표·level_anchor, unit_plan)를 되살린다 — 빠지면 다음 단계 프롬프트와 검토가
      // 그 근거를 못 보고, placementIssues(5단계 lesson_no ↔ 평가 계획)처럼 unit_plan 이 있어야 도는 [TS] 검사가 조용히 건너뛰어진다.
      if (itemSet.reconstruction != null) {
        const st2 = stageStatus.stage2?.output as { key_question_candidates?: string[]; level_anchor?: unknown[] } | undefined
        outputs[2] = {
          standards: itemSet.reconstruction_detail ?? [], reconstruction: itemSet.reconstruction, learning_goals: itemSet.learning_goals ?? [],
          level_anchor: st2?.level_anchor ?? [], key_question_candidates: st2?.key_question_candidates ?? [],
        }
      }
      if (itemSet.lessons != null) outputs[3] = { unit_plan: itemSet.unit_plan ?? null, lessons: itemSet.lessons }
      if (itemSet.materials != null) outputs[4] = { materials: itemSet.materials }
      if (itemSet.assessment != null) outputs[5] = itemSet.assessment
      if (itemSet.teacher_guide != null) outputs[6] = itemSet.teacher_guide
      if (itemSet.notice_plan != null) outputs[7] = itemSet.notice_plan

      const prior: Record<string, unknown> = {}
      // 공유 자료는 v1 모양(source 문자열, role 없음)으로 저장돼 있을 수 있다 — v2 기본값(role raw, context 는 유지)을 입혀 넘긴다.
      // 빠지면 5단계 [TS] '원자료 1개 이상' 검사가 공유 자료만 인용한 문항을 잘못 반려한다(T6 관찰).
      if (Array.isArray(theme.materials)) prior.shared_materials = (theme.materials as unknown[]).map(withMaterialDefaults)

      return {
        // 세트 학년은 대주제 학년의 복사본(updateThemeGrade 가 함께 바꾼다) — null 이면 학교급 학년군 전체(대표 2026-09-26)
        theme: { title: theme.title, level: itemSet.level, grade: (itemSet.grade as number | null) ?? null, subjects },
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
          const o = output as { standards: unknown; reconstruction: string; learning_goals: unknown; key_question_candidates?: string[] }
          // 2단계를 다시 만들면 핵심질문 후보가 바뀐다 — 이미 고른 핵심질문이 새 후보에 없으면 함께 비운다.
          const { data: current } = await supabase.from('item_sets').select('key_question').eq('id', itemSetId).single()
          const keyQuestion = keyQuestionAfterStage2(current?.key_question as string | null | undefined, o.key_question_candidates ?? [])
          const { error } = await supabase
            .from('item_sets')
            .update({ reconstruction: o.reconstruction, reconstruction_detail: o.standards, learning_goals: o.learning_goals, key_question: keyQuestion })
            .eq('id', itemSetId)
          if (error) throw new Error(error.message)
          return
        }
        case 3: {
          const o = output as { unit_plan: unknown; lessons: unknown }
          const { error } = await supabase.from('item_sets').update({ unit_plan: o.unit_plan, lessons: o.lessons }).eq('id', itemSetId)
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
        case 7: {
          const { error } = await supabase.from('item_sets').update({ notice_plan: output }).eq('id', itemSetId)
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
        grade: (data.grade as number | null) ?? null,
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
