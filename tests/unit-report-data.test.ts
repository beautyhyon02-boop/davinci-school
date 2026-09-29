// 단원 리포트 자료 모으기·저장(가짜 DB) — 설계 2026-09-29 §5.1, §5.4, §6. 마이그레이션 0014 전(표 없음)에도 깨지지 않아야 한다.
import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { loadReportSource, loadReportIndex, confirmedFirstAttempts, canViewStudent, IN_CHUNK, type ReportViewer } from '@/lib/classroom/report-data'
import { saveUnitReport, reopenUnitReport } from '@/lib/classroom/report-save'
import { buildUnitReport } from '@/lib/classroom/report'
import { UnitReportBody } from '@/lib/classroom/report-schema'
import { editKey, reportDataKey } from '@/lib/classroom/report-edit'
import { app } from '@/content/site'
import { memoryDb } from './fixtures/fake-db'
import { snapshotFor, quizRows } from './fixtures/unit-report'

const copy = app.classroom.report.build
const NOW = '2026-09-29T05:00:00.000Z'
const teacher: ReportViewer = { role: 'teacher', userId: 'u-teacher', academyId: 'ac1' }
const otherTeacher: ReportViewer = { role: 'teacher', userId: 'u-other', academyId: 'ac2' }
const admin: ReportViewer = { role: 'admin', userId: 'u-admin', academyId: null }

const snapMath = snapshotFor('수학')
const snapEng = snapshotFor('영어')
const criteria = (snapshot: typeof snapMath, itemNo: number, drop = 0) =>
  snapshot.assessment!.items[itemNo - 1].rubric.criteria.map((c) => ({ name: c.name, points: Math.max(0, c.max - drop), max: c.max, evidence: '', note: '' }))

/** 학생 s1(ac1): 수학·영어 배정. 수학 1~5차시 확인, 영어 1~2차시만 확인. 수학 두 문항 확정, 영어 서술형만 확정(논술형은 검수 대기). s2(ac1): 수학만. s9(ac2): 다른 원. */
function tables() {
  return {
    students: [
      { profile_id: 's1', academy_id: 'ac1', seq: 7 }, { profile_id: 's2', academy_id: 'ac1', seq: 8 }, { profile_id: 's9', academy_id: 'ac2', seq: 1 },
    ],
    profiles: [{ id: 's1', name: '김하늘' }, { id: 's2', name: '이바다' }, { id: 's9', name: '박다른' }],
    academies: [{ id: 'ac1', name: '다빈치 하늘원' }, { id: 'ac2', name: '다빈치 바다원' }],
    themes: [{ id: 't1', title: '학교 축제, 일회용품을 줄이자' }, { id: 't2', title: '배정 없는 대주제' }],
    item_sets: [
      { id: 'set-math', theme_id: 't1', subject: '수학', key_question: '수학 질문' },
      { id: 'set-eng', theme_id: 't1', subject: '영어', key_question: '영어 질문' },
      { id: 'set-sci', theme_id: 't1', subject: '과학', key_question: '과학 질문' },
      { id: 'set-else', theme_id: 't2', subject: '수학', key_question: '' },
    ],
    item_set_versions: [
      { item_set_id: 'set-math', version: 1, snapshot: snapMath },
      { item_set_id: 'set-eng', version: 2, snapshot: snapEng },
    ],
    assignments: [
      { id: 'a-eng', item_set_id: 'set-eng', item_set_version: 2, academy_id: 'ac1', student_id: 's1' },
      { id: 'a-math', item_set_id: 'set-math', item_set_version: 1, academy_id: 'ac1', student_id: 's1' },
      { id: 'a2-math', item_set_id: 'set-math', item_set_version: 1, academy_id: 'ac1', student_id: 's2' },
      { id: 'a9-math', item_set_id: 'set-math', item_set_version: 1, academy_id: 'ac2', student_id: 's9' },
    ],
    quiz_responses: [
      ...quizRows([1, 2, 3, 4, 5], ['1-2']).map((q) => ({ ...q, assignment_id: 'a-math', response: '', source: 'teacher' })),
      ...quizRows([1, 2, 3], ['2-1']).map((q) => ({ ...q, assignment_id: 'a-eng', response: '답', source: 'student' })),
      ...quizRows([1], ['1-1', '1-2', '1-3']).map((q) => ({ ...q, assignment_id: 'a9-math', response: '', source: 'teacher' })),
    ],
    quiz_finalizations: [
      ...[1, 2, 3, 4, 5].map((lesson_no) => ({ assignment_id: 'a-math', lesson_no, finalized_at: NOW })),
      ...[1, 2].map((lesson_no) => ({ assignment_id: 'a-eng', lesson_no, finalized_at: NOW })),
      { assignment_id: 'a9-math', lesson_no: 1, finalized_at: NOW },
    ],
    answers: [
      { id: 'ans-m1', assignment_id: 'a-math', item_no: 1, attempt: 1 },
      { id: 'ans-m2', assignment_id: 'a-math', item_no: 2, attempt: 1 },
      { id: 'ans-m2b', assignment_id: 'a-math', item_no: 2, attempt: 2 },
      { id: 'ans-e1', assignment_id: 'a-eng', item_no: 1, attempt: 1 },
      { id: 'ans-e2', assignment_id: 'a-eng', item_no: 2, attempt: 1 },
      { id: 'ans-9', assignment_id: 'a9-math', item_no: 1, attempt: 1 },
    ],
    gradings: [
      { answer_id: 'ans-m1', status: 'confirmed', confirmed_at: NOW, final_criteria: criteria(snapMath, 1, 1) },
      { answer_id: 'ans-m2', status: 'confirmed', confirmed_at: NOW, final_criteria: criteria(snapMath, 2, 1) },
      { answer_id: 'ans-m2b', status: 'confirmed', confirmed_at: NOW, final_criteria: criteria(snapMath, 2, 0) },   // 재도전 점수는 쓰지 않는다
      { answer_id: 'ans-e1', status: 'confirmed', confirmed_at: NOW, final_criteria: criteria(snapEng, 1, 0) },
      { answer_id: 'ans-e2', status: 'drafted', confirmed_at: null, final_criteria: criteria(snapEng, 2, 0) },        // 검수 대기
      { answer_id: 'ans-9', status: 'confirmed', confirmed_at: NOW, final_criteria: criteria(snapMath, 1, 0) },
    ],
    unit_reports: [] as Record<string, unknown>[],
  }
}
const db = (t = tables(), opts: Parameters<typeof memoryDb>[1] = {}) => { const m = memoryDb(t, opts); return { m, client: m as unknown as SupabaseClient } }

describe('canViewStudent / confirmedFirstAttempts', () => {
  it('teacher: own academy only, admin: any', () => {
    expect(canViewStudent(teacher, 'ac1')).toBe(true)
    expect(canViewStudent(teacher, 'ac2')).toBe(false)
    expect(canViewStudent({ ...teacher, academyId: null }, 'ac1')).toBe(false)
    expect(canViewStudent(admin, 'ac2')).toBe(true)
  })
  it('keeps confirmed first attempts only', () => {
    const t = tables()
    const got = confirmedFirstAttempts(t.answers, t.gradings)
    expect(got.map((g) => `${g.assignment_id}:${g.item_no}:${g.attempt}`)).toEqual(['a-math:1:1', 'a-math:2:1', 'a-eng:1:1', 'a9-math:1:1'])
    expect(confirmedFirstAttempts(t.answers, [{ answer_id: 'ans-m1', status: 'confirmed', confirmed_at: null, final_criteria: [] }])).toEqual([])
  })
})

describe('loadReportSource', () => {
  it('collects every assigned subject of the theme in curriculum order and builds a valid report', async () => {
    const r = await loadReportSource(db().client, teacher, 't1', 's1')
    if (!r.ok) throw new Error(r.reason)
    const src = r.source
    expect(src.subjects).toEqual(['영어', '수학'])
    expect(src.student).toEqual({ id: 's1', name: '김하늘', seq: 7, academyId: 'ac1' })
    expect(src.academyName).toBe('다빈치 하늘원')
    expect(src.theme.title).toBe('학교 축제, 일회용품을 줄이자')
    expect([src.finalizeAvailable, src.reportsAvailable, src.stored]).toEqual([true, true, null])
    expect(src.input.student.seq).toBe(7)
    const [eng, math] = src.input.subjects
    expect(eng.finalizedLessons.sort()).toEqual([1, 2])
    expect(math.finalizedLessons.sort()).toEqual([1, 2, 3, 4, 5])
    expect(math.gradings.map((g) => [g.item_no, g.attempt])).toEqual([[1, 1], [2, 1]])
    expect(eng.gradings.map((g) => g.item_no)).toEqual([1])
    expect(eng.key_question).toBe(snapEng.key_question)

    const body = buildUnitReport(src.input, copy)
    expect(UnitReportBody.safeParse(body).error?.issues ?? []).toEqual([])
    const [e, m] = body.subjects
    expect([m.quiz_correct, m.quiz_total]).toEqual([14, 15])
    expect([e.quiz_correct, e.quiz_total]).toEqual([5, 6])          // 3차시 응답은 확인 전이라 들어가지 않는다
    expect(e.missing.lessons).toEqual([3, 4, 5])
    expect(e.missing.items.map((i) => i.kind)).toEqual(['논술형'])
    expect(m.assessment.map((a) => a.points)).toEqual([3, 12])      // 재도전(2회차) 점수가 아니라 1회차
    expect(m.missing).toEqual({ lessons: [], quiz_answers: [], items: [] })
  })

  it('checks the academy before reading anything else', async () => {
    const { m, client } = db()
    const seen: string[] = []
    const from = m.from
    ;(m as { from: typeof from }).from = (table: string) => { seen.push(table); return from(table) }
    expect(await loadReportSource(client, otherTeacher, 't1', 's1')).toEqual({ ok: false, reason: 'forbidden' })
    expect(seen).toEqual(['students'])
    expect(await loadReportSource(client, { ...teacher, academyId: null }, 't1', 's1')).toEqual({ ok: false, reason: 'forbidden' })
  })

  it('admin can read a student of any academy', async () => {
    const r = await loadReportSource(db().client, admin, 't1', 's9')
    if (!r.ok) throw new Error(r.reason)
    expect(r.source.subjects).toEqual(['수학'])
    expect(r.source.academyName).toBe('다빈치 바다원')
  })

  it('unknown student or theme, or a theme without assignments', async () => {
    expect(await loadReportSource(db().client, teacher, 't1', 'nobody')).toEqual({ ok: false, reason: 'not-found' })
    expect(await loadReportSource(db().client, teacher, 'no-theme', 's1')).toEqual({ ok: false, reason: 'not-found' })
    expect(await loadReportSource(db().client, teacher, 't2', 's1')).toEqual({ ok: false, reason: 'no-assignments' })
  })

  it('migration 0014 not applied: no lesson is finalised, nothing is stored, and the flags say so', async () => {
    const r = await loadReportSource(db(tables(), { missing: ['quiz_finalizations', 'unit_reports'] }).client, teacher, 't1', 's1')
    if (!r.ok) throw new Error(r.reason)
    expect([r.source.finalizeAvailable, r.source.reportsAvailable, r.source.stored]).toEqual([false, false, null])
    const body = buildUnitReport(r.source.input, copy)
    expect(UnitReportBody.safeParse(body).success).toBe(true)
    expect(body.subjects.map((s) => s.quiz_total)).toEqual([0, 0])
    expect(body.subjects[1].missing.lessons).toEqual([1, 2, 3, 4, 5])
    expect(body.subjects[1].assessment.map((a) => a.points)).toEqual([3, 12])   // 평가 점수는 그대로
  })

  it('a stored body that no longer fits the schema is read as "no body"', async () => {
    const t = tables()
    t.unit_reports.push({ student_id: 's1', theme_id: 't1', academy_id: 'ac1', body: { broken: true }, status: 'draft', confirmed_at: null, updated_at: NOW })
    const r = await loadReportSource(db(t).client, teacher, 't1', 's1')
    if (!r.ok) throw new Error(r.reason)
    expect(r.source.stored).toEqual({ status: 'draft', body: null, confirmedAt: null, updatedAt: NOW })
  })

  it('a subject whose published version cannot be read is named, not dropped', async () => {
    const t = tables()
    t.item_set_versions = t.item_set_versions.filter((v) => v.item_set_id !== 'set-eng')
    const r = await loadReportSource(db(t).client, teacher, 't1', 's1')
    if (!r.ok) throw new Error(r.reason)
    expect(r.source.subjects).toEqual(['수학'])
    expect(r.source.unreadableSubjects).toEqual(['영어'])
    // 읽을 수 있는 과목이 하나도 없으면 "배정 없음"이 아니라 "읽지 못함"
    t.item_set_versions = []
    expect(await loadReportSource(db(t).client, teacher, 't1', 's1')).toEqual({ ok: false, reason: 'load-failed' })
    const ok = await loadReportSource(db().client, teacher, 't1', 's1')
    expect(ok.ok && ok.source.unreadableSubjects).toEqual([])
  })

  it('a read error is reported, never turned into empty numbers', async () => {
    for (const table of ['quiz_responses', 'answers', 'gradings', 'assignments', 'item_sets', 'themes', 'profiles', 'academies', 'students']) {
      expect(await loadReportSource(db(tables(), { failOn: [`select:${table}`] }).client, teacher, 't1', 's1'), table).toEqual({ ok: false, reason: 'load-failed' })
    }
  })
})

describe('loadReportIndex', () => {
  it('lists themes with assignments → students → readiness per subject', async () => {
    const idx = await loadReportIndex(db().client, teacher)
    expect(idx.themes.map((t) => t.title)).toEqual(['학교 축제, 일회용품을 줄이자'])
    const st = idx.themes[0].students
    expect(st.map((s) => s.name)).toEqual(['김하늘', '이바다'])
    expect(st[0].subjects).toEqual([
      { subject: '영어', finalizedLessons: 2, teachingLessons: 5, confirmedItems: 1, items: 2 },
      { subject: '수학', finalizedLessons: 5, teachingLessons: 5, confirmedItems: 2, items: 2 },
    ])
    expect(st[1].subjects).toEqual([{ subject: '수학', finalizedLessons: 0, teachingLessons: 5, confirmedItems: 0, items: 2 }])
    expect(st.map((s) => s.status)).toEqual(['none', 'none'])
    expect(JSON.stringify(idx)).not.toContain('박다른')            // 다른 원 학생
  })
  it('admin sees every academy; a teacher without an academy sees nothing', async () => {
    const idx = await loadReportIndex(db().client, admin)
    expect(idx.themes[0].students.map((s) => s.name)).toEqual(['김하늘', '박다른', '이바다'])
    expect((await loadReportIndex(db().client, { ...teacher, academyId: null })).themes).toEqual([])
  })
  it('shows the report status, and tolerates the missing tables', async () => {
    const t = tables()
    const body = async (sid: string) => {
      const r = await loadReportSource(db().client, admin, 't1', sid)
      if (!r.ok) throw new Error(r.reason)
      return buildUnitReport(r.source.input, copy)
    }
    t.unit_reports.push({ id: 'r1', student_id: 's1', theme_id: 't1', status: 'confirmed', confirmed_at: NOW, body: await body('s1') }, { id: 'r2', student_id: 's2', theme_id: 't1', status: 'draft', confirmed_at: null, body: await body('s2') })
    expect((await loadReportIndex(db(t).client, teacher)).themes[0].students.map((s) => s.status)).toEqual(['confirmed', 'draft'])
    // 본문을 읽을 수 없는 줄은 「확정」으로 보이지 않는다 — 학생별 화면이 새로 만들기 때문
    t.unit_reports[0].body = { broken: true }
    expect((await loadReportIndex(db(t).client, teacher)).themes[0].students.map((s) => s.status)).toEqual(['none', 'draft'])
    const idx = await loadReportIndex(db(tables(), { missing: ['quiz_finalizations', 'unit_reports'] }).client, teacher)
    expect([idx.finalizeAvailable, idx.reportsAvailable]).toEqual([false, false])
    expect(idx.themes[0].students[0].subjects[1]).toEqual({ subject: '수학', finalizedLessons: 0, teachingLessons: 5, confirmedItems: 2, items: 2 })
    expect(idx.themes[0].students.map((s) => s.status)).toEqual(['none', 'none'])
    expect(idx.loadFailed).toBe(false)
  })

  it('themes come newest first, by the latest assignment of each theme', async () => {
    const t = tables()
    t.themes.push({ id: 't0', title: '가장 먼저 오는 제목' }, { id: 't3', title: '하천과 우리 마을' })
    t.item_sets.push({ id: 'set-old', theme_id: 't0', subject: '수학', key_question: '' }, { id: 'set-new', theme_id: 't3', subject: '수학', key_question: '' })
    t.item_set_versions.push({ item_set_id: 'set-old', version: 1, snapshot: snapMath }, { item_set_id: 'set-new', version: 1, snapshot: snapMath })
    const stamped = t.assignments.map((a, i) => ({ ...a, created_at: `2026-09-1${i}T00:00:00.000Z` }))
    t.assignments = [
      ...stamped,
      { id: 'a-old', item_set_id: 'set-old', item_set_version: 1, academy_id: 'ac1', student_id: 's1', created_at: '2026-08-01T00:00:00.000Z' },
      { id: 'a-new', item_set_id: 'set-new', item_set_version: 1, academy_id: 'ac1', student_id: 's2', created_at: '2026-09-28T00:00:00.000Z' },
    ] as typeof t.assignments
    const idx = await loadReportIndex(db(t).client, teacher)
    expect(idx.themes.map((x) => x.title)).toEqual(['하천과 우리 마을', '학교 축제, 일회용품을 줄이자', '가장 먼저 오는 제목'])
  })

  it('a subject whose published version cannot be read stays in the list with a flag', async () => {
    const t = tables()
    t.item_set_versions = t.item_set_versions.filter((v) => v.item_set_id !== 'set-eng')
    const st = (await loadReportIndex(db(t).client, teacher)).themes[0].students[0]
    expect(st.subjects.map((s) => [s.subject, s.unreadable ?? false])).toEqual([['영어', true], ['수학', false]])
  })

  it('a read error shows as loadFailed, not as zero counts', async () => {
    for (const table of ['assignments', 'item_sets', 'profiles', 'answers', 'gradings', 'themes']) {
      const idx = await loadReportIndex(db(tables(), { failOn: [`select:${table}`] }).client, teacher)
      expect([table, idx.loadFailed, idx.themes]).toEqual([table, true, []])
    }
  })
})

describe('loadReportIndex — 줄이 많을 때(1000줄 한도·긴 .in() 목록)', () => {
  /** 학생 1300명 × 수학 1세트. 학생마다 1~2차시 확인, 서술형 1문항 확정. 저장된 리포트는 앞의 250명만(초안). */
  const N = 1300
  const id = (p: string, i: number) => `${p}${String(i).padStart(5, '0')}`
  function big() {
    const t = tables()
    const body = buildUnitReport({ student: { name: '학생', seq: 1 }, theme: { title: 't' }, subjects: [] }, copy)
    const many = Array.from({ length: N }, (_, i) => i)
    return {
      ...t,
      students: many.map((i) => ({ profile_id: id('s', i), academy_id: 'ac1', seq: i })),
      profiles: many.map((i) => ({ id: id('s', i), name: id('학생', i) })),
      assignments: many.map((i) => ({ id: id('a', i), item_set_id: 'set-math', item_set_version: 1, academy_id: 'ac1', student_id: id('s', i), created_at: NOW })),
      quiz_responses: [],
      quiz_finalizations: many.flatMap((i) => [1, 2].map((lesson_no) => ({ id: id('f', i * 2 + lesson_no), assignment_id: id('a', i), lesson_no, finalized_at: NOW }))),
      answers: many.map((i) => ({ id: id('ans', i), assignment_id: id('a', i), item_no: 1, attempt: 1 })),
      gradings: many.map((i) => ({ id: id('g', i), answer_id: id('ans', i), status: 'confirmed', confirmed_at: NOW, final_criteria: criteria(snapMath, 1, 0) })),
      unit_reports: many.slice(0, 250).map((i) => ({ id: id('r', i), student_id: id('s', i), theme_id: 't1', status: 'draft', confirmed_at: null, body })),
    }
  }

  it('the fake DB really cuts a plain select at 1000 rows', async () => {
    const { m } = db(big())
    const { data } = await (m.from('assignments').select() as unknown as Promise<{ data: unknown[] }>)
    expect(data).toHaveLength(1000)
  })

  it('reads every row: all 1300 students, each with the right counts and status', async () => {
    const { m, client } = db(big(), { maxIn: IN_CHUNK })
    const idx = await loadReportIndex(client, teacher)
    expect(idx.loadFailed).toBe(false)
    expect(idx.themes).toHaveLength(1)
    const st = idx.themes[0].students
    expect(st).toHaveLength(N)
    expect(new Set(st.map((s) => s.studentId)).size).toBe(N)
    for (const s of st) expect(s.subjects, s.studentId).toEqual([{ subject: '수학', finalizedLessons: 2, teachingLessons: 5, confirmedItems: 1, items: 2 }])
    expect(st.filter((s) => s.status === 'draft')).toHaveLength(250)
    expect(st.filter((s) => s.name === '')).toHaveLength(0)
    // 긴 id 목록은 100개씩 나눠 보냈고, 모든 읽기에 범위가 걸려 있다
    const listReads = m.reads.filter((r) => r.table !== 'item_set_versions')
    expect(Math.max(...listReads.flatMap((r) => r.inCounts))).toBeLessThanOrEqual(IN_CHUNK)
    expect(listReads.every((r) => r.range !== null)).toBe(true)
    expect(m.reads.filter((r) => r.table === 'assignments').map((r) => r.range)).toEqual([[0, 999], [1000, 1999]])
    expect(m.reads.filter((r) => r.table === 'answers')).toHaveLength(N / IN_CHUNK)
  })

  it('more than 1000 rows inside one chunk of ids are paged too', async () => {
    const t = big()
    // 배정 100개에 답안을 12개씩(문항 번호는 1만 확정) — 한 묶음(100개)에 1200줄
    t.answers = t.assignments.slice(0, 100).flatMap((a, i) => Array.from({ length: 12 }, (_, k) => ({ id: id('ans', i * 12 + k), assignment_id: a.id, item_no: k === 11 ? 1 : 3, attempt: 1 })))
    t.gradings = t.answers.map((a, i) => ({ id: id('g', i), answer_id: a.id, status: 'confirmed', confirmed_at: NOW, final_criteria: criteria(snapMath, 1, 0) }))
    const idx = await loadReportIndex(db(t, { maxIn: IN_CHUNK }).client, teacher)
    const st = idx.themes[0].students
    // 1000줄에서 잘렸다면 뒤쪽 배정의 확정 문항(묶음의 마지막 줄들)이 0 으로 보인다
    expect(st.slice(0, 100).map((s) => s.subjects[0].confirmedItems)).toEqual(Array(100).fill(1))
    expect(st.slice(100).every((s) => s.subjects[0].confirmedItems === 0)).toBe(true)
  })
})

describe('saveUnitReport — 숫자는 서버가 만든다', () => {
  const base = { viewer: teacher, themeId: 't1', studentId: 's1', copy, now: NOW }

  it('stores a draft built from the DB, with the chosen subjects and the edited sentences only', async () => {
    const { m, client } = db()
    const edits = { [editKey.overall()]: '원장이 쓴 종합', [editKey.summary('수학')]: '원장이 쓴 수학 요약', 'points|수학|1': '99', [editKey.summary('영어')]: '넣지 않은 과목' }
    const r = await saveUnitReport({ ...base, db: client, subjects: ['수학', '사회'], edits, status: 'draft' })
    if (!r.ok) throw new Error(r.reason)
    expect(m.tables.unit_reports).toHaveLength(1)
    const row = m.tables.unit_reports[0]
    expect([row.status, row.academy_id, row.student_id, row.theme_id, row.subjects, row.drafted_by, row.confirmed_at, row.confirmed_by]).toEqual(['draft', 'ac1', 's1', 't1', ['수학'], 'u-teacher', null, null])
    const body = UnitReportBody.parse(row.body)
    expect(body.included_subjects).toEqual(['수학'])
    expect(body.overall_comment).toBe('원장이 쓴 종합')
    expect(body.subjects[0].summary).toBe('원장이 쓴 수학 요약')
    const src = await loadReportSource(client, teacher, 't1', 's1')
    if (!src.ok) throw new Error(src.reason)
    expect(reportDataKey(body)).toBe(reportDataKey(buildUnitReport({ ...src.source.input, includeSubjects: ['수학'] }, copy)))
    expect(src.source.stored?.status).toBe('draft')
  })

  it('a payload that carries numbers cannot change them', async () => {
    const { m, client } = db()
    const forged = { overall_comment: 'x', subjects: [{ subject: '수학', quiz_correct: 15, assessment_points: 22 }], radar: [], [editKey.overall()]: '문장' }
    const r = await saveUnitReport({ ...base, db: client, subjects: ['수학'], edits: forged, status: 'draft' })
    if (!r.ok) throw new Error(r.reason)
    const body = UnitReportBody.parse(m.tables.unit_reports[0].body)
    expect([body.subjects[0].quiz_correct, body.subjects[0].assessment_points]).toEqual([14, 15])
    expect(body.overall_comment).toBe('문장')
  })

  it('no subject chosen → every assigned subject; confirm sets the time, saving again returns to draft in the same row', async () => {
    const { m, client } = db()
    const c = await saveUnitReport({ ...base, db: client, subjects: [], edits: {}, status: 'confirmed' })
    expect(c.ok).toBe(true)
    expect(m.tables.unit_reports[0]).toMatchObject({ status: 'confirmed', confirmed_at: NOW, confirmed_by: 'u-teacher', subjects: ['영어', '수학'] })
    expect(await reopenUnitReport({ db: client, viewer: teacher, themeId: 't1', studentId: 's1', now: NOW })).toEqual({ ok: true })
    await saveUnitReport({ ...base, db: client, subjects: ['영어'], edits: {}, status: 'draft' })
    expect(m.tables.unit_reports).toHaveLength(1)
    expect(m.tables.unit_reports[0]).toMatchObject({ status: 'draft', confirmed_at: null, subjects: ['영어'] })
  })

  it('a confirmed report is never overwritten by a save — the teacher is asked to press [다시 고치기]', async () => {
    const { m, client } = db()
    await saveUnitReport({ ...base, db: client, subjects: [], edits: { [editKey.overall()]: '확정한 문장' }, status: 'confirmed' })
    const before = JSON.stringify(m.tables.unit_reports[0])
    expect(await saveUnitReport({ ...base, db: client, subjects: ['영어'], edits: { [editKey.overall()]: '다른 창에서 쓴 문장' }, status: 'draft' })).toEqual({ ok: false, reason: 'already-confirmed' })
    expect(await saveUnitReport({ ...base, db: client, subjects: ['영어'], edits: {}, status: 'confirmed' })).toEqual({ ok: false, reason: 'already-confirmed' })
    expect(JSON.stringify(m.tables.unit_reports[0])).toBe(before)
    expect(app.classroom.report.errors.alreadyConfirmed).toContain('[다시 고치기]')
  })

  it('confirmed in another window between reading and saving: the guarded update touches nothing', async () => {
    const { m, client } = db()
    await saveUnitReport({ ...base, db: client, subjects: [], edits: {}, status: 'draft' })
    // 읽기(unit_reports select)가 끝난 바로 뒤에 다른 창이 확정한다
    const from = m.from
    ;(m as { from: typeof from }).from = (table: string) => {
      const q = from(table)
      if (table !== 'unit_reports') return q
      return { ...q, update: (patch: Record<string, unknown>) => { Object.assign(m.tables.unit_reports[0], { status: 'confirmed', confirmed_at: NOW }); return q.update(patch) } }
    }
    const before = JSON.stringify(m.tables.unit_reports[0].body)
    expect(await saveUnitReport({ ...base, db: client, subjects: ['영어'], edits: {}, status: 'draft' })).toEqual({ ok: false, reason: 'already-confirmed' })
    expect(m.tables.unit_reports[0]).toMatchObject({ status: 'confirmed', confirmed_at: NOW })
    expect(JSON.stringify(m.tables.unit_reports[0].body)).toBe(before)
  })

  it('a stored row whose body cannot be read is replaced by the new one, even if it says confirmed', async () => {
    const t = tables()
    t.unit_reports.push({ id: 'r1', student_id: 's1', theme_id: 't1', academy_id: 'ac1', body: { broken: true }, status: 'confirmed', confirmed_at: NOW, updated_at: NOW })
    const { m, client } = db(t)
    const r = await saveUnitReport({ ...base, db: client, subjects: [], edits: {}, status: 'draft' })
    expect(r.ok).toBe(true)
    expect(m.tables.unit_reports).toHaveLength(1)
    expect(m.tables.unit_reports[0]).toMatchObject({ id: 'r1', status: 'draft', confirmed_at: null })
    expect(UnitReportBody.safeParse(m.tables.unit_reports[0].body).success).toBe(true)
  })

  it('a read error stops the save', async () => {
    const { m, client } = db(tables(), { failOn: ['select:quiz_responses'] })
    expect(await saveUnitReport({ ...base, db: client, subjects: [], edits: {}, status: 'draft' })).toEqual({ ok: false, reason: 'load-failed' })
    expect(m.writes).toEqual([])
  })

  it('another academy: nothing is read beyond the student row and nothing is written', async () => {
    const { m, client } = db()
    expect(await saveUnitReport({ ...base, viewer: otherTeacher, db: client, subjects: [], edits: {}, status: 'confirmed' })).toEqual({ ok: false, reason: 'forbidden' })
    expect(await reopenUnitReport({ db: client, viewer: otherTeacher, themeId: 't1', studentId: 's1', now: NOW })).toEqual({ ok: false, reason: 'forbidden' })
    expect(m.writes).toEqual([])
  })

  it('migration 0014 not applied: saving answers calmly instead of throwing', async () => {
    const { m, client } = db(tables(), { missing: ['quiz_finalizations', 'unit_reports'] })
    expect(await saveUnitReport({ ...base, db: client, subjects: [], edits: {}, status: 'draft' })).toEqual({ ok: false, reason: 'save-failed' })
    expect(await reopenUnitReport({ db: client, viewer: teacher, themeId: 't1', studentId: 's1', now: NOW })).toEqual({ ok: false, reason: 'save-failed' })
    expect(m.writes).toEqual([])
  })

  it('reopen: confirmed → draft, body untouched; nothing stored → no-report', async () => {
    const { m, client } = db()
    expect(await reopenUnitReport({ db: client, viewer: teacher, themeId: 't1', studentId: 's1', now: NOW })).toEqual({ ok: false, reason: 'no-report' })
    await saveUnitReport({ ...base, db: client, subjects: [], edits: { [editKey.overall()]: '확정한 문장' }, status: 'confirmed' })
    const before = JSON.stringify(m.tables.unit_reports[0].body)
    expect(await reopenUnitReport({ db: client, viewer: teacher, themeId: 't1', studentId: 's1', now: NOW })).toEqual({ ok: true })
    expect(m.tables.unit_reports[0]).toMatchObject({ status: 'draft', confirmed_at: null, confirmed_by: null })
    expect(JSON.stringify(m.tables.unit_reports[0].body)).toBe(before)
  })
})
