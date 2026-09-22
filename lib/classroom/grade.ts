import type { SupabaseClient } from '@supabase/supabase-js'
import { callStructured } from '@/lib/ai/claude'
import { GradingDraftSchema } from './grading-schema'
import { buildGradingPrompt } from './grading-prompt'
import type { Snapshot } from '@/lib/studio/publish'
import type { GradingStatus } from './types'

/**
 * 채점 초안 한 건을 만든다. db 는 service-role 클라이언트(학생·원장 정책과 무관하게 gradings 를 쓴다).
 * 상태: pending → drafted | failed. 이미 drafted/confirmed 면 아무 것도 하지 않고 현재 상태를 돌려준다.
 */
export async function runGrading({ gradingId, db }: { gradingId: string; db: SupabaseClient }): Promise<GradingStatus> {
  const { data: g } = await db.from('gradings').select('id, status, answer_id').eq('id', gradingId).maybeSingle()
  if (!g) throw new Error('grading not found')
  if (g.status !== 'pending' && g.status !== 'failed') return g.status as GradingStatus

  const { data: ans } = await db.from('answers').select('body, item_no, assignment_id, assignments(item_set_id, item_set_version, student_id)').eq('id', g.answer_id).single()
  const asg = (ans?.assignments as unknown as { item_set_id: string; item_set_version: number; student_id: string } | null)
  if (!ans || !asg) throw new Error('answer not found')
  const [{ data: ver }, { data: st }] = await Promise.all([
    db.from('item_set_versions').select('snapshot').eq('item_set_id', asg.item_set_id).eq('version', asg.item_set_version).single(),
    db.from('students').select('grade').eq('profile_id', asg.student_id).single(),
  ])
  if (!ver) throw new Error('snapshot not found')
  const snapshot = ver.snapshot as Snapshot
  const p = buildGradingPrompt({ snapshot, itemNo: ans.item_no, studentGrade: st?.grade ?? snapshot.cover.grade, answer: ans.body })

  await db.from('gradings').update({ status: 'pending', error: null }).eq('id', gradingId)
  try {
    const r = await callStructured({ stage: 9, role: 'grade', schema: GradingDraftSchema, system: p.system, user: p.user, effort: 'medium', fixtureKey: p.fixtureKey })
    const item = snapshot.assessment!.items[ans.item_no - 1]
    const score = Math.min(r.data.score, item.points)
    await db.from('gradings').update({
      status: 'drafted', ai_criteria: r.data.criteria, ai_score: score, ai_strengths: r.data.strengths, ai_improvements: r.data.improvements,
      model: r.model, input_tokens: r.usage.input, output_tokens: r.usage.output,
    }).eq('id', gradingId)
    return 'drafted'
  } catch (e) {
    await db.from('gradings').update({ status: 'failed', error: (e as Error).message }).eq('id', gradingId)
    return 'failed'
  }
}
