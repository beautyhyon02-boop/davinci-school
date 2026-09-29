import type { SupabaseClient } from '@supabase/supabase-js'
import type { Snapshot } from '@/lib/studio/publish'
import { SUBJECTS } from '@/lib/studio/schemas'
import { fetchAll } from '@/lib/supabase/fetch-all'
import { loadAssignmentSnapshot } from './snapshot'
import { loadFinalizations, isMissingTable } from './quiz-entry'
import type { FinalizationRow } from './quiz-finalize'
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
 *
 * 그 밖의 표를 읽다가 난 오류는 빈 목록으로 바꾸지 않는다 — 0점·0개로 잘못 보이는 대신 'load-failed'(학생별) /
 * loadFailed(목록)로 돌려주고, 화면은 차분한 안내 한 줄을 보인다.
 * 목록은 줄이 많을 수 있다: PostgREST 는 한 번에 1000줄까지만 주고, .in() 목록이 길면 주소가 너무 길어진다 —
 * id 목록은 100개씩 나누고(IN_CHUNK), 묶음마다 정해진 순서(.order)로 끝까지 이어 읽는다(fetchAll).
 */

export type ReportViewer = { role: 'teacher' | 'admin'; userId: string; academyId: string | null }
export type ReportStatus = 'none' | 'draft' | 'confirmed'

export type StoredReport = {
  status: 'draft' | 'confirmed'
  /** 저장된 본문(스키마에 맞을 때만). 모양이 맞지 않으면 null — 화면은 안내 한 줄과 함께 새로 만든 본문을 보여 준다. */
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
  /** 배정은 됐는데 게시 판(스냅숏)을 읽지 못해 리포트에 넣지 못한 과목 — 화면이 안내 줄로 보여 준다. */
  unreadableSubjects: string[]
  finalizeAvailable: boolean
  reportsAvailable: boolean
  stored: StoredReport | null
}

export type ReportSourceResult =
  | { ok: true; source: ReportSource }
  | { ok: false; reason: 'forbidden' | 'not-found' | 'no-assignments' | 'load-failed' }

type StudentRow = { profile_id: string; academy_id: string; seq: number }
type AssignmentLite = { id: string; item_set_id: string; item_set_version: number; academy_id: string; student_id: string; created_at?: string | null }
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
  // 여기서 읽는 줄 수는 학생 한 명·대주제 하나로 묶여 있다(과목 ≤ 몇 개, 배정 ≤ 과목 수, 퀴즈 ≤ 배정 × 차시 × 3) —
  // 1000줄 한도나 긴 .in() 목록에 닿지 않는다. 다만 읽기 오류는 빈 목록으로 바꾸지 않고 'load-failed' 로 돌려준다.
  const failed: ReportSourceResult = { ok: false, reason: 'load-failed' }
  const { data: st, error: stErr } = await db.from('students').select('profile_id, academy_id, seq').eq('profile_id', studentId).maybeSingle()
  if (stErr) return failed
  const student = (st ?? null) as StudentRow | null
  if (!student) return { ok: false, reason: 'not-found' }
  if (!canViewStudent(viewer, student.academy_id)) return { ok: false, reason: 'forbidden' }

  const [pr, th, ac, sets] = await Promise.all([
    db.from('profiles').select('id, name').eq('id', studentId).maybeSingle(),
    db.from('themes').select('id, title').eq('id', themeId).maybeSingle(),
    db.from('academies').select('id, name').eq('id', student.academy_id).maybeSingle(),
    db.from('item_sets').select('id, theme_id, subject, key_question').eq('theme_id', themeId).order('id'),
  ])
  if (pr.error || th.error || ac.error || sets.error) return failed
  const profile = pr.data; const themeRow = th.data; const academy = ac.data
  if (!themeRow) return { ok: false, reason: 'not-found' }
  const itemSets = (sets.data ?? []) as ItemSetLite[]
  if (itemSets.length === 0) return { ok: false, reason: 'no-assignments' }

  const { data: asg, error: asgErr } = await db.from('assignments').select('id, item_set_id, item_set_version, academy_id, student_id')
    .eq('student_id', studentId).in('item_set_id', itemSets.map((s) => s.id)).order('id')
  if (asgErr) return failed
  // 학생의 원과 배정의 원이 다르면(있을 수 없지만) 그 배정은 쓰지 않는다
  const assignments = ((asg ?? []) as AssignmentLite[]).filter((a) => a.academy_id === student.academy_id)
  if (assignments.length === 0) return { ok: false, reason: 'no-assignments' }
  const aids = assignments.map((a) => a.id)

  const [qz, an, finalizations, storedResult, snapshots] = await Promise.all([
    db.from('quiz_responses').select('assignment_id, lesson_no, quiz_no, correct').in('assignment_id', aids).order('id'),
    db.from('answers').select('id, assignment_id, item_no, attempt').in('assignment_id', aids).order('id'),
    loadFinalizations(db, aids),
    loadStoredReport(db, themeId, studentId),
    Promise.all(assignments.map((a) => loadAssignmentSnapshot(db, a.item_set_id, a.item_set_version).catch(() => null))),
  ])
  if (qz.error || an.error) return failed
  const answers = (an.data ?? []) as AnswerLite[]
  const gr = answers.length
    ? await db.from('gradings').select('answer_id, status, confirmed_at, final_criteria').in('answer_id', answers.map((a) => a.id)).eq('status', 'confirmed').not('confirmed_at', 'is', null).order('id')
    : { data: [], error: null }
  if (gr.error) return failed
  const gradings = confirmedFirstAttempts(answers, (gr.data ?? []) as GradingLite[])
  const quizRows = (qz.data ?? []) as QuizLite[]

  const subjects: ReportSubjectInput[] = []
  const unreadable: string[] = []
  for (const [i, a] of assignments.entries()) {
    const snapshot = snapshots[i]
    const set = itemSets.find((s) => s.id === a.item_set_id)
    if (!set) continue
    // 게시 판을 읽지 못한 과목은 사라지지 않고 안내 줄에 이름이 남는다
    if (!snapshot) { if (!unreadable.includes(set.subject)) unreadable.push(set.subject); continue }
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
  if (subjects.length === 0) return unreadable.length ? failed : { ok: false, reason: 'no-assignments' }
  subjects.sort(bySubject)
  const unreadableSubjects = unreadable.filter((u) => !subjects.some((s) => s.subject === u)).sort((a, b) => subjectOrder(a) - subjectOrder(b))

  const name = (profile as { name?: string } | null)?.name ?? ''
  return {
    ok: true,
    source: {
      student: { id: studentId, name, seq: student.seq, academyId: student.academy_id },
      academyName: (academy as { name?: string } | null)?.name ?? '',
      theme: { id: themeId, title: String((themeRow as { title: string }).title) },
      input: { student: { name, seq: student.seq }, theme: { title: String((themeRow as { title: string }).title) }, subjects },
      subjects: subjects.map((s) => s.subject),
      unreadableSubjects,
      finalizeAvailable: finalizations.available,
      reportsAvailable: storedResult.available,
      stored: storedResult.stored,
    },
  }
}

// ── 목록(/teacher/reports) ─────────────────────────────────────────────

export type SubjectReadiness = {
  subject: string; finalizedLessons: number; teachingLessons: number; confirmedItems: number; items: number
  /** 게시 판(스냅숏)을 읽지 못한 과목 — 개수 대신 안내 문구를 보인다. */
  unreadable?: true
}
export type ReportIndexStudent = { studentId: string; name: string; subjects: SubjectReadiness[]; status: ReportStatus }
export type ReportIndexTheme = { themeId: string; title: string; students: ReportIndexStudent[] }
export type ReportIndex = {
  themes: ReportIndexTheme[]; finalizeAvailable: boolean; reportsAvailable: boolean
  /** 읽다가 오류가 났다 — 화면은 목록 대신 안내 한 줄을 보인다(0개로 잘못 보이지 않게). */
  loadFailed: boolean
}

/** .in() 목록 한 번에 넣는 id 수(uuid 100개 ≈ 3.7KB — 주소 길이 한도 안). */
export const IN_CHUNK = 100
/** 저장된 리포트는 본문(jsonb)까지 읽어 모양을 확인하므로 한 번에 적게 읽는다. */
const REPORT_PAGE = 200

type Page<T> = PromiseLike<{ data: T[] | null; error: unknown }>

/** id 목록을 IN_CHUNK 개씩 나눠, 묶음마다 1000줄 한도를 넘겨 끝까지 읽는다. 오류는 던진다(fetchAll). */
export async function fetchByIds<T>(ids: string[], build: (chunk: string[], from: number, to: number) => Page<T>, pageSize = 1000): Promise<T[]> {
  const parts: string[][] = []
  for (let i = 0; i < ids.length; i += IN_CHUNK) parts.push(ids.slice(i, i + IN_CHUNK))
  const out: T[] = []
  // 묶음은 차례로 읽는다 — 한꺼번에 수십 요청을 보내지 않는다
  for (const chunk of parts) out.push(...await fetchAll<T>((from, to) => orThrow(build(chunk, from, to)), pageSize))
  return out
}

/** 게시 판에서 세는 분모: 퀴즈가 있는 차시(교수 차시) 수와 평가 문항 수. */
export function snapshotCounts(snapshot: Snapshot | null): { lessonNos: number[]; items: number } {
  if (!snapshot) return { lessonNos: [], items: 0 }
  return {
    lessonNos: (snapshot.lessons ?? []).filter((l) => (l.formative_check?.quiz ?? []).length > 0).map((l) => l.no),
    items: (snapshot.assessment?.items ?? []).length,
  }
}

/** 읽기 오류를 그대로 들고 던진다(fetchAll 은 Error 가 아닌 오류를 문자열로 바꾸므로, 표 없음 판정에 쓸 코드를 남긴다). */
class ReadError extends Error {
  constructor(readonly cause: unknown) { super('read failed') }
}
const orThrow = <T>(q: Page<T>): Page<T> => q.then((r) => { if (r.error) throw new ReadError(r.error); return r })
const causeOf = (e: unknown) => (e instanceof ReadError ? e.cause : e)

/** 최종 확인(목록용): 묶어서 끝까지 읽는다. 표가 없거나 읽지 못하면 available=false(화면에 안내 줄). */
async function loadFinalizationsAll(db: SupabaseClient, assignmentIds: string[]): Promise<{ available: boolean; rows: FinalizationRow[] }> {
  try {
    const rows = await fetchByIds<FinalizationRow>(assignmentIds, (chunk, from, to) =>
      db.from('quiz_finalizations').select('assignment_id, lesson_no, finalized_at').in('assignment_id', chunk).order('id').range(from, to))
    return { available: true, rows }
  } catch (e) {
    if (!isMissingTable(causeOf(e))) console.error('[quiz_finalizations] read failed', causeOf(e))
    return { available: false, rows: [] }
  }
}

/**
 * 대주제 → 학생 → 과목별 준비 상태. 원장은 자기 원의 배정만(질의에도 academy_id 를 건다), 본사는 전체.
 * 배정이 하나도 없는 대주제는 나오지 않는다. 대주제는 최근에 배정한 것이 위로 온다(그 대주제의 가장 늦은 배정 시각).
 */
export async function loadReportIndex(db: SupabaseClient, viewer: ReportViewer): Promise<ReportIndex> {
  const empty: ReportIndex = { themes: [], finalizeAvailable: true, reportsAvailable: true, loadFailed: false }
  if (viewer.role === 'teacher' && !viewer.academyId) return empty
  try {
    return await readIndex(db, viewer, empty)
  } catch (e) {
    console.error('[unit report index] read failed', causeOf(e))
    return { ...empty, loadFailed: true }
  }
}

async function readIndex(db: SupabaseClient, viewer: ReportViewer, empty: ReportIndex): Promise<ReportIndex> {
  const assignments = await fetchAll<AssignmentLite>((from, to) => {
    let q = db.from('assignments').select('id, item_set_id, item_set_version, academy_id, student_id, created_at')
    if (viewer.role === 'teacher') q = q.eq('academy_id', viewer.academyId as string)
    return orThrow<AssignmentLite>(q.order('id').range(from, to))
  })
  if (assignments.length === 0) return empty

  const aids = assignments.map((a) => a.id)
  const setIds = [...new Set(assignments.map((a) => a.item_set_id))]
  const studentIds = [...new Set(assignments.map((a) => a.student_id))]
  const versions = [...new Map(assignments.map((a) => [`${a.item_set_id}@${a.item_set_version}`, a])).values()]

  const [itemSets, profiles, answers, finalizations, snaps, reports] = await Promise.all([
    fetchByIds<ItemSetLite>(setIds, (chunk, from, to) => db.from('item_sets').select('id, theme_id, subject, key_question').in('id', chunk).order('id').range(from, to)),
    fetchByIds<{ id: string; name: string }>(studentIds, (chunk, from, to) => db.from('profiles').select('id, name').in('id', chunk).order('id').range(from, to)),
    fetchByIds<AnswerLite>(aids, (chunk, from, to) => db.from('answers').select('id, assignment_id, item_no, attempt').in('assignment_id', chunk).order('id').range(from, to)),
    loadFinalizationsAll(db, aids),
    Promise.all(versions.map(async (a) => [`${a.item_set_id}@${a.item_set_version}`, await loadAssignmentSnapshot(db, a.item_set_id, a.item_set_version).catch(() => null)] as const)),
    loadReportStatuses(db, studentIds),
  ])
  const themeIds = [...new Set(itemSets.map((s) => s.theme_id))]
  const themeRows = await fetchByIds<{ id: string; title: string }>(themeIds, (chunk, from, to) => db.from('themes').select('id, title').in('id', chunk).order('id').range(from, to))
  const gradingRows = await fetchByIds<GradingLite>(answers.map((a) => a.id), (chunk, from, to) =>
    db.from('gradings').select('answer_id, status, confirmed_at, final_criteria').in('answer_id', chunk).eq('status', 'confirmed').not('confirmed_at', 'is', null).order('id').range(from, to))

  // 줄이 많아도 느려지지 않게 미리 묶어 둔다
  const doneItems = new Map<string, Set<number>>()           // 배정 → 확정된(1회차) 문항 번호
  for (const g of confirmedFirstAttempts(answers, gradingRows)) {
    if (!doneItems.has(g.assignment_id)) doneItems.set(g.assignment_id, new Set())
    doneItems.get(g.assignment_id)!.add(g.item_no)
  }
  const finalized = new Map<string, Set<number>>()           // 배정 → 최종 확인된 차시
  for (const f of finalizations.rows) {
    if (!finalized.has(f.assignment_id)) finalized.set(f.assignment_id, new Set())
    finalized.get(f.assignment_id)!.add(f.lesson_no)
  }
  const snapshots = new Map(snaps)
  const names = new Map(profiles.map((p) => [p.id, p.name]))
  const setById = new Map(itemSets.map((s) => [s.id, s]))
  const byTheme = new Map<string, AssignmentLite[]>()
  for (const a of assignments) {
    const set = setById.get(a.item_set_id)
    if (!set) continue
    if (!byTheme.has(set.theme_id)) byTheme.set(set.theme_id, [])
    byTheme.get(set.theme_id)!.push(a)
  }

  const themes: (ReportIndexTheme & { latest: string })[] = []
  for (const t of themeRows) {
    const mine = byTheme.get(t.id) ?? []
    const perStudent = new Map<string, AssignmentLite[]>()
    for (const a of mine) {
      if (!perStudent.has(a.student_id)) perStudent.set(a.student_id, [])
      perStudent.get(a.student_id)!.push(a)
    }
    const students: ReportIndexStudent[] = []
    for (const [sid, list] of perStudent) {
      const subjects: SubjectReadiness[] = []
      for (const a of list) {
        const set = setById.get(a.item_set_id)!
        if (subjects.some((s) => s.subject === set.subject)) continue
        const snapshot = snapshots.get(`${a.item_set_id}@${a.item_set_version}`) ?? null
        const c = snapshotCounts(snapshot)
        const fin = [...(finalized.get(a.id) ?? [])].filter((n) => c.lessonNos.includes(n))
        const done = [...(doneItems.get(a.id) ?? [])].filter((n) => n >= 1 && n <= c.items)
        subjects.push({
          subject: set.subject, finalizedLessons: fin.length, teachingLessons: c.lessonNos.length, confirmedItems: done.length, items: c.items,
          ...(snapshot ? {} : { unreadable: true as const }),
        })
      }
      subjects.sort(bySubject)
      students.push({ studentId: sid, name: names.get(sid) ?? '', subjects, status: reports.statuses.get(`${sid}@${t.id}`) ?? 'none' })
    }
    students.sort((a, b) => a.name.localeCompare(b.name, 'ko'))
    const latest = mine.reduce((m, a) => (a.created_at && a.created_at > m ? a.created_at : m), '')
    if (students.length) themes.push({ themeId: t.id, title: t.title, students, latest })
  }
  // 최근에 배정한 대주제가 위로. 시각이 같으면 제목 순서
  themes.sort((a, b) => (a.latest === b.latest ? a.title.localeCompare(b.title, 'ko') : a.latest < b.latest ? 1 : -1))
  return {
    themes: themes.map((t) => ({ themeId: t.themeId, title: t.title, students: t.students })),
    finalizeAvailable: finalizations.available, reportsAvailable: reports.available, loadFailed: false,
  }
}

/**
 * 저장된 리포트의 상태. 본문이 스키마에 맞지 않는 줄은 "없음"으로 친다 — 학생별 화면이 그 본문을 버리고 새로 만들기 때문에
 * 목록에 「확정」으로 보이면 안 된다.
 */
async function loadReportStatuses(db: SupabaseClient, studentIds: string[]): Promise<{ available: boolean; statuses: Map<string, ReportStatus> }> {
  const statuses = new Map<string, ReportStatus>()
  if (studentIds.length === 0) return { available: true, statuses }
  type Row = { student_id: string; theme_id: string; status: string; confirmed_at: string | null; body: unknown }
  try {
    const rows = await fetchByIds<Row>(studentIds, (chunk, from, to) =>
      db.from('unit_reports').select('student_id, theme_id, status, confirmed_at, body').in('student_id', chunk).order('id').range(from, to), REPORT_PAGE)
    for (const r of rows) {
      if (!UnitReportBody.safeParse(r.body).success) continue
      statuses.set(`${r.student_id}@${r.theme_id}`, r.status === 'confirmed' && r.confirmed_at ? 'confirmed' : 'draft')
    }
    return { available: true, statuses }
  } catch (e) {
    if (!isMissingTable(causeOf(e))) console.error('[unit_reports] read failed', causeOf(e))
    return { available: false, statuses }
  }
}
