import type { SupabaseClient } from '@supabase/supabase-js'
import { callStructured } from '@/lib/ai/claude'
import { GradingDraftSchema } from './grading-schema'
import { buildGradingPrompt } from './grading-prompt'
import { upgradeSnapshot, type Snapshot } from '@/lib/studio/publish'
import type { Criterion, GradingStatus } from './types'

/**
 * 실행 임대 시간. 채점 실행기가 줄을 잡으면(pending + updated_at=지금) 이 시간 동안은 다른 호출이 다시 잡지 못한다.
 * 라우트·서버 액션 maxDuration(300초)과 같게 둔다 — 그보다 오래 pending 이면 실행이 죽은 것으로 보고 다시 잡을 수 있다.
 * (상태 enum 에 'running' 이 없으므로 pending + updated_at 으로 "실행 중"을 표시한다.)
 */
export const RUN_LEASE_MS = 300_000

/**
 * PostgREST or 필터: `statuses` 중 하나이거나, 아직 아무도 잡지 않았거나(updated_at 없음), 임대가 지난 줄.
 * 호출 쪽에서 .in('status', …) 로 전체 상태 범위를 따로 묶는다. 시각 값은 '.'·':' 가 있어 큰따옴표로 감싼다.
 */
export function claimableOr(statuses: GradingStatus[], now = Date.now()): string {
  const cutoff = new Date(now - RUN_LEASE_MS).toISOString()
  return [`status.in.(${statuses.join(',')})`, 'updated_at.is.null', `updated_at.lt."${cutoff}"`].join(',')
}

/** AI 초안의 요소가 문항 채점표와 이름으로 맞지 않을 때. missing = 초안에 없는 채점표 요소, extra = 채점표에 없는(또는 겹친) 초안 요소. */
export class GradingAlignError extends Error {
  constructor(readonly missing: string[], readonly extra: string[]) {
    super(`채점 요소가 채점표와 맞지 않음 — 빠진 요소: ${missing.join(', ') || '없음'} / 채점표에 없는 요소: ${extra.join(', ') || '없음'}`)
    this.name = 'GradingAlignError'
  }
}

const normName = (s: string) => s.trim().replace(/\s+/g, ' ')

/**
 * AI 초안의 요소를 문항 채점표에 이름으로(앞뒤·겹친 공백만 무시) 엄격히 맞춘다(스펙 §2.9: ai_criteria[].max 는 요소 max 를 따른다).
 * 채점표 순서로 다시 늘어놓고 이름·max 는 채점표 것, 점수는 max 로 자르며 score = 요소 점수 합(G-09).
 * 빠진 요소·채점표에 없는 이름·같은 이름 중복이 하나라도 있으면 GradingAlignError — 일부만 채점된 초안은 만들지 않는다.
 */
export function alignCriteria(criteria: Criterion[], rubric: { criteria: { name: string; max: number }[] }): { criteria: Criterion[]; score: number } {
  const byName = new Map<string, Criterion>()
  const extra: string[] = []
  for (const c of criteria) {
    const key = normName(c.name)
    if (byName.has(key) || !rubric.criteria.some((r) => normName(r.name) === key)) extra.push(c.name)
    else byName.set(key, c)
  }
  const missing = rubric.criteria.filter((r) => !byName.has(normName(r.name))).map((r) => r.name)
  if (missing.length || extra.length) throw new GradingAlignError(missing, extra)
  const aligned = rubric.criteria.map((r) => {
    const c = byName.get(normName(r.name))!
    return { ...c, name: r.name, max: r.max, points: Math.min(c.points, r.max) }
  })
  return { criteria: aligned, score: aligned.reduce((sum, c) => sum + c.points, 0) }
}

/**
 * 채점 초안 한 건을 만든다. db 는 service-role 클라이언트(학생·원장 정책과 무관하게 gradings 를 쓴다).
 * 상태: pending → drafted | failed. 이미 drafted/confirmed 면 아무 것도 하지 않고 현재 상태를 돌려준다.
 * 모델을 부르기 전에 줄을 원자적으로 잡는다(조건부 update 한 번) — 두 번 눌러도, 학생이 라우트를 다시 불러도
 * 실행 중인 줄은 다시 잡히지 않으므로 유료 호출이 겹치지 않는다. 모든 쓰기는 updated_at 을 갱신한다(검수 카드 key).
 */
export async function runGrading({ gradingId, db }: { gradingId: string; db: SupabaseClient }): Promise<GradingStatus> {
  const { data: g } = await db.from('gradings').select('id, status, answer_id').eq('id', gradingId).maybeSingle()
  if (!g) throw new Error('grading not found')
  if (g.status !== 'pending' && g.status !== 'failed') return g.status as GradingStatus

  const { data: claimed } = await db.from('gradings').update({ status: 'pending', error: null, updated_at: new Date().toISOString() })
    .eq('id', gradingId).in('status', ['pending', 'failed']).or(claimableOr(['failed'])).select('id')
  if (!claimed || claimed.length === 0) {
    // 다른 호출이 이미 잡았거나 그 사이 상태가 바뀌었다 — 모델을 부르지 않고 지금 상태를 돌려준다
    const { data: cur } = await db.from('gradings').select('status').eq('id', gradingId).maybeSingle()
    return ((cur?.status ?? g.status) as GradingStatus)
  }

  try {
    const { data: ans } = await db.from('answers').select('body, item_no, assignment_id, assignments(item_set_id, item_set_version, student_id)').eq('id', g.answer_id).single()
    const asg = (ans?.assignments as unknown as { item_set_id: string; item_set_version: number; student_id: string } | null)
    if (!ans || !asg) throw new Error('answer not found')
    const [{ data: ver }, { data: st }] = await Promise.all([
      db.from('item_set_versions').select('snapshot').eq('item_set_id', asg.item_set_id).eq('version', asg.item_set_version).single(),
      db.from('students').select('grade').eq('profile_id', asg.student_id).single(),
    ])
    if (!ver) throw new Error('snapshot not found')
    const snapshot: Snapshot = upgradeSnapshot(ver.snapshot)   // v1 판도 v2 모양으로 읽는다(스펙 §4.3)
    const p = buildGradingPrompt({ snapshot, itemNo: ans.item_no, studentGrade: st?.grade ?? snapshot.cover.grade, answer: ans.body })

    const r = await callStructured({ stage: 9, role: 'grade', schema: GradingDraftSchema, system: p.system, user: p.user, effort: 'medium', fixtureKey: p.fixtureKey })
    const item = snapshot.assessment!.items[ans.item_no - 1]
    const aligned = alignCriteria(r.data.criteria, item.rubric)
    const score = Math.min(aligned.score, item.points)
    await db.from('gradings').update({
      status: 'drafted', ai_criteria: aligned.criteria, ai_score: score, ai_strengths: r.data.strengths, ai_improvements: r.data.improvements,
      model: r.model, input_tokens: r.usage.input, output_tokens: r.usage.output, updated_at: new Date().toISOString(),
    }).eq('id', gradingId)
    return 'drafted'
  } catch (e) {
    await db.from('gradings').update({ status: 'failed', error: (e as Error).message, updated_at: new Date().toISOString() }).eq('id', gradingId)
    return 'failed'
  }
}
