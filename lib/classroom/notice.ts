import type { Snapshot } from '@/lib/studio/publish'
import { NOTICE_DISCLAIMER } from '@/lib/studio/schemas'
import { gradeFor } from './scoring'
import type { NoticeT, NoticeDraftOutT } from './notice-schema'

type Band = '상' | '중' | '하'
export type NoticeGradingInput = {
  /** 이 채점이 속한 문항 번호(answers.item_no). 단원 평가 차시는 문항이 둘이라 문항별로 가른다. */
  item_no: number
  attempt: 1 | 2
  final_score: number | null
  final_criteria: { name: string; points: number; max: number; evidence: string }[] | null
  /** gradings.status. 'confirmed' 이면서 confirmed_at 이 있어야만 쓴다(SQL 필터와 이중 검사, N-03). */
  status: 'drafted' | 'confirmed' | (string & {})
  confirmed_at: string | null
}
export type NoticeInput = {
  snapshot: Snapshot; lessonNo: number; studentName: string; date: string
  quiz: { quiz_no: number; response: string; correct: boolean }[]
  gradings: NoticeGradingInput[]
}
/** 확정 채점의 요소별 근거(AI 초안 프롬프트에 넣는다). 미확정 채점의 근거는 절대 들어오지 않는다(N-03). */
export type NoticeEvidence = { kind: '서술형' | '논술형'; attempt: 1 | 2; criterion_name: string; points: number; max: number; evidence: string }

/** 밴드: 문항 점수를 세트 만점 비율로 등급표에 대응(문항 단위 밴드 근사 — 6점 서술형 5점이면 22점 중 18점 → 상). */
function bandForItem(snapshot: Snapshot, score: number, points: number): Band {
  const a = snapshot.assessment!
  const total = a.items.reduce((s, i) => s + i.points, 0)
  const scaled = Math.round((score / points) * total)
  return gradeFor(a.grade_boundaries, Math.min(total, scaled))?.band ?? '하'
}

/** 서울 달력 날짜(YYYY-MM-DD). 한국은 일광 절약 시간이 없어 +9시간 고정. */
export function todayKst(now: Date = new Date()): string {
  return new Date(now.getTime() + 9 * 3600_000).toISOString().slice(0, 10)
}

/**
 * 학생별 안내장 뼈대(순수). data 필드는 스냅샷·퀴즈·확정 채점에서 복사하고, 틀(notice_plan) 문장을 기본값으로 넣는다.
 * 확정되지 않은 채점(status 가 confirmed 가 아니거나 confirmed_at 없음 — 다시 고치기 중 포함)은 무시한다 — 문항마다 1회차 확정 채점이
 * 있어야 그 문항의 결과가 essay_results 에 들어간다(단원 평가 차시는 서술형·논술형 두 문항, 옛 판 차시는 한 문항).
 * needsAi: 요소별 잘한 점·보완할 점을 AI가 채워야 하는가(확정된 서·논술형 결과가 하나라도 있을 때).
 */
export function buildNoticeSkeleton(inp: NoticeInput): { skeleton: NoticeT; needsAi: boolean; evidence: NoticeEvidence[] } {
  const lesson = inp.snapshot.lessons.find((l) => l.no === inp.lessonNo)
  if (!lesson) throw new Error(`lesson ${inp.lessonNo} not found`)
  const plan = inp.snapshot.notice_plan?.per_lesson.find((p) => p.lesson_no === inp.lessonNo) ?? null
  const items = lesson.formative_check.quiz.map((q, i) => {
    const r = inp.quiz.find((x) => x.quiz_no === i + 1)
    const is_correct = r?.correct ?? false
    return { q: q.q, is_correct, note: !is_correct && r ? plan?.quiz_notes.find((n) => n.quiz_no === i + 1)?.wrong_note ?? null : null }
  })
  const assessed = (inp.snapshot.assessment?.items ?? []).map((item, i) => ({ item, itemNo: i + 1 })).filter((x) => x.item.lesson_no === inp.lessonNo)
  const confirmed = inp.gradings.filter((g) => g.status === 'confirmed' && g.confirmed_at && g.final_score !== null).sort((a, b) => a.attempt - b.attempt)
  const essay_results: NoticeT['essay_results'] = []
  const evidence: NoticeEvidence[] = []
  for (const { item, itemNo } of assessed) {
    const mine = confirmed.filter((g) => g.item_no === itemNo)
    const first = mine.find((g) => g.attempt === 1) ?? null
    if (!first) continue
    const second = mine.find((g) => g.attempt === 2) ?? null
    essay_results.push({
      kind: item.kind, confirmed_score: first.final_score!, total_points: item.points, band: bandForItem(inp.snapshot, first.final_score!, item.points),
      criteria_feedback: (first.final_criteria ?? []).map((c) => ({ criterion_name: c.name, band_score: c.points, max: c.max, good_point: '', improve_point: null })),
      retry: second ? { attempted: true, before_score: first.final_score!, after_score: second.final_score!, improvement_comment: null } : null,
    })
    for (const g of [first, second]) if (g) for (const c of g.final_criteria ?? []) evidence.push({ kind: item.kind, attempt: g.attempt, criterion_name: c.name, points: c.points, max: c.max, evidence: c.evidence })
  }
  const skeleton: NoticeT = {
    student_name: inp.studentName, lesson_no: inp.lessonNo, date: inp.date,
    lesson_context: { key_question: lesson.key_question, goal: lesson.goal, topic_summary: plan?.topic_summary ?? lesson.topic.slice(0, 60) },
    participation: { quiz: { correct: items.filter((x) => x.is_correct).length, total: items.length, items }, director_comment: null },
    essay_results,
    next_lesson: { preview: plan?.preview ?? '', home_study_suggestion: plan?.home_study_suggestion ?? '' },
    director_message: null, footer_disclaimer: NOTICE_DISCLAIMER,
  }
  return { skeleton, needsAi: essay_results.length > 0, evidence }
}

/** AI 초안을 뼈대의 빈 칸에만 끼운다. 요소명이 채점표와 다른 AI 항목은 버린다(N-11). */
export function applyDraft(skeleton: NoticeT, out: NoticeDraftOutT): NoticeT {
  const items = skeleton.participation.quiz.items.map((it, i) => ({ ...it, note: it.is_correct ? null : out.quiz_notes.find((n) => n.quiz_no === i + 1)?.note ?? it.note }))
  const essay_results = skeleton.essay_results.map((r) => ({
    ...r,
    criteria_feedback: r.criteria_feedback.map((c) => {
      const d = out.criteria_feedback.find((x) => x.criterion_name === c.criterion_name)
      return d ? { ...c, good_point: d.good_point, improve_point: d.improve_point } : c
    }),
    retry: r.retry ? { ...r.retry, improvement_comment: out.improvement_comments.find((x) => x.kind === r.kind)?.comment ?? null } : null,
  }))
  return { ...skeleton, participation: { ...skeleton.participation, quiz: { ...skeleton.participation.quiz, items } }, essay_results }
}

const text = (s: string) => s.trim()
const textOrNull = (s: string | null) => (s && s.trim() ? s.trim() : null)

/**
 * 원장이 화면에서 고친 본문(sent)에서 문장 칸만 가져와 저장된 초안(stored)에 덮는다.
 * 점수·정오·이름·요소명 같은 data 필드는 언제나 stored 값을 쓴다(원장 화면이 점수를 바꿀 수 없다 — N-03).
 * 모양(퀴즈 수·요소 수·요소명·재도전 유무)이 다르면 null.
 */
export function mergeEditable(stored: NoticeT, sent: NoticeT): NoticeT | null {
  const sq = stored.participation.quiz.items; const nq = sent.participation.quiz.items
  if (sq.length !== nq.length) return null
  const se = stored.essay_results; const ne = sent.essay_results
  if (se.length !== ne.length) return null
  for (const [k, s] of se.entries()) {
    const n = ne[k]
    if (s.kind !== n.kind || s.criteria_feedback.length !== n.criteria_feedback.length) return null
    if (s.criteria_feedback.some((c, i) => c.criterion_name !== n.criteria_feedback[i].criterion_name)) return null
    if (!s.retry !== !n.retry) return null
  }
  return {
    ...stored,
    lesson_context: { ...stored.lesson_context, topic_summary: text(sent.lesson_context.topic_summary) },
    participation: {
      quiz: { ...stored.participation.quiz, items: sq.map((it, i) => ({ ...it, note: it.is_correct ? null : textOrNull(nq[i].note) })) },
      director_comment: textOrNull(sent.participation.director_comment),
    },
    essay_results: se.map((s, k) => ({
      ...s,
      criteria_feedback: s.criteria_feedback.map((c, i) => ({ ...c, good_point: text(ne[k].criteria_feedback[i].good_point), improve_point: textOrNull(ne[k].criteria_feedback[i].improve_point) })),
      retry: s.retry && ne[k].retry ? { ...s.retry, improvement_comment: textOrNull(ne[k].retry!.improvement_comment) } : null,
    })),
    next_lesson: { preview: text(sent.next_lesson.preview), home_study_suggestion: text(sent.next_lesson.home_study_suggestion) },
    director_message: textOrNull(sent.director_message),
  }
}

/** 안내장의 data 필드만 모은 비교 키. 초안 뒤 채점이 다시 열리거나 퀴즈 정오가 바뀌었는지 확정 때 대조한다. 날짜·문장은 뺀다. */
export function noticeDataKey(n: NoticeT): string {
  return JSON.stringify([
    n.student_name, n.lesson_no, n.lesson_context.key_question, n.lesson_context.goal,
    n.participation.quiz.correct, n.participation.quiz.total, n.participation.quiz.items.map((it) => [it.q, it.is_correct]),
    n.essay_results.map((e) => [e.kind, e.confirmed_score, e.total_points, e.band, e.criteria_feedback.map((c) => [c.criterion_name, c.band_score, c.max]), e.retry && [e.retry.attempted, e.retry.before_score, e.retry.after_score]]),
  ])
}
