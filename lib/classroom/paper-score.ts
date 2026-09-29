import type { SupabaseClient } from '@supabase/supabase-js'
import { loadAssignmentSnapshot } from './snapshot'
import { alignCriteria } from './grade'
import { buildManualCriteria, canEnterPaperScore, MANUAL_MODEL } from './manual'

/**
 * 종이 답안 점수 저장(설계 2026-09-29 §4.2): answers(source 'teacher', 본문 = 종이 답안 표지, 1회차, 제출됨) +
 * gradings(status 'confirmed', model 'manual', final_*). AI 를 부르지 않는다.
 *
 * db = 원장 클라이언트(RLS: 자기 원의 배정·답안만). admin = service role — gradings 에는 원장 insert 정책이 없어서
 * (0009: select·update 만) 채점 줄은 admin 으로 넣는다. 그 전에 이 함수가 배정을 원장 클라이언트 + academy_id 로 읽어
 * "이 원장 원의 배정"임을 확인한다(학생 제출 submitAnswer 가 본인 확인 뒤 admin 으로 gradings 를 넣는 것과 같은 방식).
 * 트리거는 건드리지 않는다: answers_guard·gradings_guard 는 update 트리거이고, 임시저장 줄(submitted_at 없음)을 제출된
 * 종이 답안으로 바꾸는 것은 answers_guard 가 허용한다(제출 전 줄).
 */
export type PaperScoreReason = 'forbidden' | 'bad-item' | 'bad-score' | 'already-submitted' | 'save-failed'
export type PaperScoreResult = { ok: true; gradingId: string; score: number } | { ok: false; reason: PaperScoreReason }

export type PaperScoreArgs = {
  db: SupabaseClient
  admin: SupabaseClient
  teacher: { userId: string; academyId: string }
  assignmentId: string
  itemNo: number
  /** 채점표 순서의 요소별 점수. */
  points: unknown
  comment?: string | null
  /** answers.body 에 넣는 표지 문장(content/site.ts). */
  marker: string
  now: string
}

const COMMENT_MAX = 1000

export async function savePaperScore(a: PaperScoreArgs): Promise<PaperScoreResult> {
  if (!Number.isInteger(a.itemNo) || a.itemNo < 1) return { ok: false, reason: 'bad-item' }
  const { data: asg } = await a.db.from('assignments').select('id, item_set_id, item_set_version, academy_id')
    .eq('id', a.assignmentId).eq('academy_id', a.teacher.academyId).maybeSingle()
  if (!asg || asg.academy_id !== a.teacher.academyId) return { ok: false, reason: 'forbidden' }
  const snapshot = await loadAssignmentSnapshot(a.db, asg.item_set_id, asg.item_set_version)
  const item = snapshot?.assessment?.items[a.itemNo - 1]
  if (!item) return { ok: false, reason: 'bad-item' }

  const built = buildManualCriteria(item.rubric, a.points)
  if (!built) return { ok: false, reason: 'bad-score' }
  // AI 초안과 같은 자로 맞춘다(채점표 순서·이름·만점). 직접 만든 요소라 늘 맞지만, 확정본의 모양을 한 곳(alignCriteria)이 정하게 둔다.
  const aligned = alignCriteria(built.criteria, item.rubric)
  const score = Math.min(aligned.score, item.points)

  const { data: first, error: readErr } = await a.db.from('answers').select('id, submitted_at, source')
    .eq('assignment_id', a.assignmentId).eq('item_no', a.itemNo).eq('attempt', 1).maybeSingle()
  if (readErr) return { ok: false, reason: 'save-failed' }
  const existing = (first ?? null) as { id: string; submitted_at: string | null; source: string } | null
  let existingGrading: { id: string } | null = null
  if (existing) {
    const { data: g } = await a.admin.from('gradings').select('id').eq('answer_id', existing.id).maybeSingle()
    existingGrading = (g ?? null) as { id: string } | null
  }
  // 학생이 화면으로 제출한 답안(또는 이미 채점 줄이 있는 종이 답안)은 덮어쓰지 않는다 — 그쪽은 검수 카드에서 고친다
  if (!canEnterPaperScore(existing, !!existingGrading)) return { ok: false, reason: 'already-submitted' }

  const answerRow = { body: a.marker, source: 'teacher' as const, entered_by: a.teacher.userId, saved_at: a.now, submitted_at: a.now }
  let answerId: string
  if (!existing) {
    const { data, error } = await a.db.from('answers').insert({ assignment_id: a.assignmentId, item_no: a.itemNo, attempt: 1, ...answerRow }).select('id').single()
    if (error || !data) return { ok: false, reason: 'save-failed' }
    answerId = (data as { id: string }).id
  } else if (!existing.submitted_at) {
    // 학생의 임시저장 줄(제출 전)을 종이 답안 줄로 바꾼다 — (배정, 문항, 회차)가 유일 키라 줄을 하나 더 만들 수 없다
    const { data, error } = await a.db.from('answers').update(answerRow).eq('id', existing.id).is('submitted_at', null).select('id').maybeSingle()
    if (error || !data) return { ok: false, reason: 'save-failed' }
    answerId = existing.id
  } else {
    answerId = existing.id   // 지난 저장이 채점 줄 직전에 실패한 종이 답안 — 채점 줄만 이어서 만든다
  }

  const comment = typeof a.comment === 'string' && a.comment.trim() ? a.comment.trim().slice(0, COMMENT_MAX) : null
  const grading = {
    status: 'confirmed' as const, model: MANUAL_MODEL,
    final_criteria: aligned.criteria, final_score: score, final_strengths: [], final_improvements: [],
    teacher_comment: comment, confirmed_by: a.teacher.userId, confirmed_at: a.now, updated_at: a.now,
  }
  if (existingGrading) {
    const { error } = await a.admin.from('gradings').update(grading).eq('id', existingGrading.id)
    if (error) return { ok: false, reason: 'save-failed' }
    return { ok: true, gradingId: existingGrading.id, score }
  }
  const { data: g, error: gErr } = await a.admin.from('gradings').insert({ answer_id: answerId, academy_id: asg.academy_id, ...grading }).select('id').single()
  if (gErr || !g) return { ok: false, reason: 'save-failed' }
  return { ok: true, gradingId: (g as { id: string }).id, score }
}
