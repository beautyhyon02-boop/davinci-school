import type { SupabaseClient } from '@supabase/supabase-js'
import type { Snapshot } from '@/lib/studio/publish'
import { SUBJECTS } from '@/lib/studio/schemas'
import { loadAssignmentSnapshot } from './snapshot'
import { loadFinalizations } from './quiz-entry'
import { UnitReportBody } from './report-schema'
import type { UnitReportInput, ReportSubjectInput, ReportGradingInput } from './report'

/**
 * 단원 리포트 자료 모으기(서버 전용 — 페이지·서버 동작이 부른다). 설계 docs/superpowers/specs/2026-09-29-unit-report-design.md §5.1, §6
 * db 는 로그인한 사람의 클라이언트(RLS: 원장은 자기 원만, 본사는 전체)이고, 여기서도 학생의 원을 먼저 확인한다 —
 * 다른 원 학생이면 아무것도 더 읽지 않는다.
 * 표 사이를 잇는 질의(embed)를 쓰지 않고 표마다 따로 읽는다 — 테스트의 가짜 DB 로 그대로 확인할 수 있게.
 *
 * 마이그레이션 0014 전(quiz_finalizations·unit_reports 표 없음): 최종 확인은 "없음"으로, 저장된 리포트는 "없음"으로 읽고
 * finalizeAvailable / reportsAvailable 을 false 로 돌려준다. 예외를 던지지 않는다.
 */

export type ReportViewer = { role: 'teacher' | 'admin'; userId: string; academyId: string | null }
export type ReportStatus = 'none' | 'draft' | 'confirmed'

export type StoredReport = {
  status: 'draft' | 'confirmed'
  /** 저장된 본문(스키마에 맞을 때만). 모양이 맞지 않으면 null — 화면은 새로 만든 본문을 보여 준다. */
  body: UnitReportBody | null
  confirmedAt: string | null
  updatedAt: string | null
}

export type ReportSource = {
  student: { id: string; name: string; seq: number; academyId: string }
  academyName: string
  theme: { id: string; title: string }
  /** buildUnitReport 입력(이 대주제에서 이 학생에게 배정된 과목 모두). */
  input: UnitReportInput
  /** 배정된 과목 이름(교과 순서). */
  subjects: string[]
  finalizeAvailable: boolean
  reportsAvailable: boolean
  stored: StoredReport | null
}

export type ReportSourceResult =
  | { ok: true; source: ReportSource }
  | { ok: false; reason: 'forbidden' | 'not-found' | 'no-assignments' }

type StudentRow = { profile_id: string; academy_id: string; seq: number }
type AssignmentLite = { id: string; item_set_id: string; item_set_version: number; academy_id: string; student_id: string }
type ItemSetLite = { id: string; theme_id: string; subject: string; key_question: string | null }
type AnswerLite = { id: string; assignment_id: string; item_no: number; attempt: number }
type GradingLite = { answer_id: string; status: string; confirmed_at: string | null; final_criteria: { name: string; points: number; max: number }[] | null }
type QuizLite = { assignment_id: string; lesson_no: number; quiz_no: number; correct: boolean }

const subjectOrder = (s: string) => { const i = (SUBJECTS as readonly string[]).indexOf(s); return i < 0 ? SUBJECTS.length : i }
const bySubject = <T extends { subject: string }>(a: T, b: T) => subjectOrder(a.subject) - subjectOrder(b.subject)

/** 원장은 자기 원 학생만, 본사는 전체. */
export function canViewStudent(viewer: ReportViewer, studentAcademyId: string): boolean {
  if (viewer.role === 'admin') return true
  return viewer.role === 'teacher' && !!viewer.academyId && viewer.academyId === studentAcademyId
}

/** 확정된 1회차 채점만(안내장과 같은 규칙 — status 'confirmed' 이면서 confirmed_at 이 있고, 첫 답안의 점수). */
export function confirmedFirstAttempts(answers: AnswerLite[], gradings: GradingLite[]): (ReportGradingInput & { assignment_id: string })[] {
  const out: (ReportGradingInput & { assignment_id: string })[] = []
  for (const g of gradings) {
    if (g.status !== 'confirmed' || !g.confirmed_at || !Array.isArray(g.final_criteria)) continue
    const a = answers.find((x) => x.id === g.answer_id)
    if (!a || a.attempt !== 1) continue
    out.push({
      assignment_id: a.assignment_id, item_no: a.item_no, attempt: a.attempt,
      final_criteria: g.final_criteria.map((c) => ({ name: String(c.name), points: Number(c.points), max: Number(c.max) })),
    })
  }
  return out
}

/** 저장된 리포트 한 줄. 표가 없거나 읽지 못하면 available=false. */
export async function loadStoredReport(db: SupabaseClient, themeId: string, studentId: string): Promise<{ available: boolean; stored: StoredReport | null }> {
  try {
    const { data, error } = await db.from('unit_reports').select('body, status, confirmed_at, updated_at').eq('student_id', studentId).eq('theme_id', themeId).maybeSingle()
    if (error) return { available: false, stored: null }
    if (!data) return { available: true, stored: null }
    const parsed = UnitReportBody.safeParse(data.body)
    const confirmed = data.status === 'confirmed' && !!data.confirmed_at
    return {
      available: true,
      stored: {
        status: confirmed ? 'confirmed' : 'draft', body: parsed.success ? parsed.data : null,
        confirmedAt: confirmed ? String(data.confirmed_at) : null, updatedAt: data.updated_at ? String(data.updated_at) : null,
      },
    }
  } catch {
    return { available: false, stored: null }
  }
}

export async function loadReportSource(db: SupabaseClient, viewer: ReportViewer, themeId: string, studentId: string): Promise<ReportSourceResult> {
  // 1) 학생의 원을 먼저 확인한다 — 통과하기 전에는 다른 표를 읽지 않는다
  const { data: st } = await db.from('students').select('profile_id, academy_id, seq').eq('profile_id', studentId).maybeSingle()
  const student = (st ?? null) as StudentRow | null
  if (!student) return { ok: false, reason: 'not-found' }
  if (!canViewStudent(viewer, student.academy_id)) return { ok: false, reason: 'forbidden' }

  const [{ data: profile }, { data: themeRow }, { data: academy }, { data: sets }] = await Promise.all([
    db.from('profiles').select('id, name').eq('id', studentId).maybeSingle(),
    db.from('themes').select('id, title').eq('id', themeId).maybeSingle(),
    db.from('academies').select('id, name').eq('id', student.academy_id).maybeSingle(),
    db.from('item_sets').select('id, theme_id, subject, key_question').eq('theme_id', themeId),
  ])
  if (!themeRow) return { ok: false, reason: 'not-found' }
  const itemSets = (sets ?? []) as ItemSetLite[]
  if (itemSets.length === 0) return { ok: false, reason: 'no-assignments' }

  const { data: asg } = await db.from('assignments').select('id, item_set_id, item_set_version, academy_id, student_id')
    .eq('student_id', studentId).in('item_set_id', itemSets.map((s) => s.id))
  // 학생의 원과 배정의 원이 다르면(있을 수 없지만) 그 배정은 쓰지 않는다
  const assignments = ((asg ?? []) as AssignmentLite[]).filter((a) => a.academy_id === student.academy_id)
  if (assignments.length === 0) return { ok: false, reason: 'no-assignments' }
  const aids = assignments.map((a) => a.id)

  const [{ data: quiz }, { data: ans }, finalizations, storedResult, snapshots] = await Promise.all([
    db.from('quiz_responses').select('assignment_id, lesson_no, quiz_no, correct').in('assignment_id', aids),
    db.from('answers').select('id, assignment_id, item_no, attempt').in('assignment_id', aids),
    loadFinalizations(db, aids),
    loadStoredReport(db, themeId, studentId),
    Promise.all(assignments.map((a) => loadAssignmentSnapshot(db, a.item_set_id, a.item_set_version))),
  ])
  const answers = (ans ?? []) as AnswerLite[]
  const { data: gr } = answers.length
    ? await db.from('gradings').select('answer_id, status, confirmed_at, final_criteria').in('answer_id', answers.map((a) => a.id)).eq('status', 'confirmed').not('confirmed_at', 'is', null)
    : { data: [] }
  const gradings = confirmedFirstAttempts(answers, (gr ?? []) as GradingLite[])
  const quizRows = (quiz ?? []) as QuizLite[]

  const subjects: ReportSubjectInput[] = []
  for (const [i, a] of assignments.entries()) {
    const snapshot = snapshots[i]
    const set = itemSets.find((s) => s.id === a.item_set_id)
    if (!snapshot || !set) continue
    // 같은 과목 세트가 둘 배정돼 있으면(과목당 1세트 제약으로 없어야 한다) 먼저 온 것만
    if (subjects.some((s) => s.subject === set.subject)) continue
    subjects.push({
      subject: set.subject,
      key_question: snapshot.key_question || set.key_question || '',
      snapshot,
      quiz: quizRows.filter((q) => q.assignment_id === a.id).map((q) => ({ lesson_no: q.lesson_no, quiz_no: q.quiz_no, correct: q.correct === true })),
      finalizedLessons: finalizations.rows.filter((f) => f.assignment_id === a.id).map((f) => f.lesson_no),
      gradings: gradings.filter((g) => g.assignment_id === a.id).map((g) => ({ item_no: g.item_no, attempt: g.attempt, final_criteria: g.final_criteria })),
    })
  }
  if (subjects.length === 0) return { ok: false, reason: 'no-assignments' }
  subjects.sort(bySubject)

  const name = (profile as { name?: string } | null)?.name ?? ''
  return {
    ok: true,
    source: {
      student: { id: studentId, name, seq: student.seq, academyId: student.academy_id },
      academyName: (academy as { name?: string } | null)?.name ?? '',
      theme: { id: themeId, title: String((themeRow as { title: string }).title) },
      input: { student: { name, seq: student.seq }, theme: { title: String((themeRow as { title: string }).title) }, subjects },
      subjects: subjects.map((s) => s.subject),
      finalizeAvailable: finalizations.available,
      reportsAvailable: storedResult.available,
      stored: storedResult.stored,
    },
  }
}

// ── 목록(/teacher/reports) ─────────────────────────────────────────────

export type SubjectReadiness = { subject: string; finalizedLessons: number; teachingLessons: number; confirmedItems: number; items: number }
export type ReportIndexStudent = { studentId: string; name: string; subjects: SubjectReadiness[]; status: ReportStatus }
export type ReportIndexTheme = { themeId: string; title: string; students: ReportIndexStudent[] }
export type ReportIndex = { themes: ReportIndexTheme[]; finalizeAvailable: boolean; reportsAvailable: boolean }

/** 게시 판에서 세는 분모: 퀴즈가 있는 차시(교수 차시) 수와 평가 문항 수. */
export function snapshotCounts(snapshot: Snapshot | null): { lessonNos: number[]; items: number } {
  if (!snapshot) return { lessonNos: [], items: 0 }
  return {
    lessonNos: (snapshot.lessons ?? []).filter((l) => (l.formative_check?.quiz ?? []).length > 0).map((l) => l.no),
    items: (snapshot.assessment?.items ?? []).length,
  }
}

/**
 * 대주제 → 학생 → 과목별 준비 상태. 원장은 자기 원의 배정만(질의에도 academy_id 를 건다), 본사는 전체.
 * 배정이 하나도 없는 대주제는 나오지 않는다.
 */
export async function loadReportIndex(db: SupabaseClient, viewer: ReportViewer): Promise<ReportIndex> {
  const empty: ReportIndex = { themes: [], finalizeAvailable: true, reportsAvailable: true }
  if (viewer.role === 'teacher' && !viewer.academyId) return empty
  let q = db.from('assignments').select('id, item_set_id, item_set_version, academy_id, student_id')
  if (viewer.role === 'teacher') q = q.eq('academy_id', viewer.academyId as string)
  const { data: asg } = await q
  const assignments = (asg ?? []) as AssignmentLite[]
  if (assignments.length === 0) return empty

  const aids = assignments.map((a) => a.id)
  const setIds = [...new Set(assignments.map((a) => a.item_set_id))]
  const studentIds = [...new Set(assignments.map((a) => a.student_id))]
  const versions = [...new Map(assignments.map((a) => [`${a.item_set_id}@${a.item_set_version}`, a])).values()]

  const [{ data: sets }, { data: profiles }, { data: ans }, finalizations, snaps, reports] = await Promise.all([
    db.from('item_sets').select('id, theme_id, subject, key_question').in('id', setIds),
    db.from('profiles').select('id, name').in('id', studentIds),
    db.from('answers').select('id, assignment_id, item_no, attempt').in('assignment_id', aids),
    loadFinalizations(db, aids),
    Promise.all(versions.map(async (a) => [`${a.item_set_id}@${a.item_set_version}`, snapshotCounts(await loadAssignmentSnapshot(db, a.item_set_id, a.item_set_version))] as const)),
    loadReportStatuses(db, studentIds),
  ])
  const itemSets = (sets ?? []) as ItemSetLite[]
  const themeIds = [...new Set(itemSets.map((s) => s.theme_id))]
  const { data: themeRows } = themeIds.length ? await db.from('themes').select('id, title').in('id', themeIds) : { data: [] }
  const answers = (ans ?? []) as AnswerLite[]
  const { data: gr } = answers.length
    ? await db.from('gradings').select('answer_id, status, confirmed_at, final_criteria').in('answer_id', answers.map((a) => a.id)).eq('status', 'confirmed').not('confirmed_at', 'is', null)
    : { data: [] }
  const gradings = confirmedFirstAttempts(answers, (gr ?? []) as GradingLite[])
  const counts = new Map(snaps)
  const names = new Map(((profiles ?? []) as { id: string; name: string }[]).map((p) => [p.id, p.name]))

  const themes: ReportIndexTheme[] = []
  for (const t of (themeRows ?? []) as { id: string; title: string }[]) {
    const mySets = itemSets.filter((s) => s.theme_id === t.id)
    const mine = assignments.filter((a) => mySets.some((s) => s.id === a.item_set_id))
    const students: ReportIndexStudent[] = []
    for (const sid of [...new Set(mine.map((a) => a.student_id))]) {
      const subjects: SubjectReadiness[] = []
      for (const a of mine.filter((x) => x.student_id === sid)) {
        const set = mySets.find((s) => s.id === a.item_set_id)!
        if (subjects.some((s) => s.subject === set.subject)) continue
        const c = counts.get(`${a.item_set_id}@${a.item_set_version}`) ?? { lessonNos: [], items: 0 }
        const fin = new Set(finalizations.rows.filter((f) => f.assignment_id === a.id && c.lessonNos.includes(f.lesson_no)).map((f) => f.lesson_no))
        const done = new Set(gradings.filter((g) => g.assignment_id === a.id && g.item_no >= 1 && g.item_no <= c.items).map((g) => g.item_no))
        subjects.push({ subject: set.subject, finalizedLessons: fin.size, teachingLessons: c.lessonNos.length, confirmedItems: done.size, items: c.items })
      }
      subjects.sort(bySubject)
      students.push({ studentId: sid, name: names.get(sid) ?? '', subjects, status: reports.statuses.get(`${sid}@${t.id}`) ?? 'none' })
    }
    students.sort((a, b) => a.name.localeCompare(b.name, 'ko'))
    if (students.length) themes.push({ themeId: t.id, title: t.title, students })
  }
  themes.sort((a, b) => a.title.localeCompare(b.title, 'ko'))
  return { themes, finalizeAvailable: finalizations.available, reportsAvailable: reports.available }
}

async function loadReportStatuses(db: SupabaseClient, studentIds: string[]): Promise<{ available: boolean; statuses: Map<string, ReportStatus> }> {
  const statuses = new Map<string, ReportStatus>()
  if (studentIds.length === 0) return { available: true, statuses }
  try {
    const { data, error } = await db.from('unit_reports').select('student_id, theme_id, status, confirmed_at').in('student_id', studentIds)
    if (error || !data) return { available: false, statuses }
    for (const r of data as { student_id: string; theme_id: string; status: string; confirmed_at: string | null }[]) {
      statuses.set(`${r.student_id}@${r.theme_id}`, r.status === 'confirmed' && r.confirmed_at ? 'confirmed' : 'draft')
    }
    return { available: true, statuses }
  } catch {
    return { available: false, statuses }
  }
}
