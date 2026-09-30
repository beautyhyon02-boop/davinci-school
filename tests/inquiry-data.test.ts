// 교과융합 탐구보고서 — 읽기(lib/inquiry/data.ts)·쓰기(lib/inquiry/save.ts)를 가짜 DB 로 확인한다. 원·본인 확인이 읽기보다 먼저인지, 0016 전(표 없음)에 조용한지.
import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { memoryDb } from './fixtures/fake-db'
import { loadTasks, loadTask, loadTaskAssignments, loadAssignmentView, loadStudentAssignments, countAssignmentsByTask, type InquiryViewer } from '@/lib/inquiry/data'
import { createTask, saveTask, setTaskStatus, assignStudents, applyOutline, reopenAssignment, saveReportPatch, submitReport, normalizePatch } from '@/lib/inquiry/save'
import { emptyReport } from '@/lib/inquiry/schema'
import seed from '@/data/inquiry/2026-09-30-cup-regulation.json'

const A1 = '11111111-1111-4111-8111-111111111111'
const A2 = '22222222-2222-4222-8222-222222222222'
const T1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const S1 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const S2 = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const S3 = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const NOW = '2026-10-01T03:00:00.000Z'

const teacher1: InquiryViewer = { role: 'teacher', userId: 'tch1', academyId: A1 }
const teacher2: InquiryViewer = { role: 'teacher', userId: 'tch2', academyId: A2 }
const admin: InquiryViewer = { role: 'admin', userId: 'adm', academyId: null }
const student1: InquiryViewer = { role: 'student', userId: S1, academyId: A1 }
const student3: InquiryViewer = { role: 'student', userId: S3, academyId: A2 }

const verifiedSeed = () => ({ ...seed, sources: seed.sources.map((s) => ({ ...s, verified: { by: '관리자', at: NOW } })) })

function world(opts: { missing?: string[]; failOn?: string[] } = {}) {
  const tables = {
    inquiry_tasks: [{ id: T1, ...verifiedSeed(), status: 'published', created_at: NOW, updated_at: NOW, published_at: NOW }],
    inquiry_assignments: [
      { id: 'as1', task_id: T1, academy_id: A1, student_id: S1, outline: { method: 'none', career: true }, status: 'assigned', created_at: NOW, updated_at: NOW },
      { id: 'as3', task_id: T1, academy_id: A2, student_id: S3, outline: { method: 'survey', career: false }, status: 'assigned', created_at: NOW, updated_at: NOW },
    ],
    inquiry_reports: [
      { assignment_id: 'as1', academy_id: A1, sections: { motive: '궁금했다', method: '숨은 글' }, questions: [], used_source_ids: ['p1'], career_field: '', updated_at: NOW, submitted_at: null },
    ],
    students: [
      { profile_id: S1, academy_id: A1, enrolled: true, seq: 1 }, { profile_id: S2, academy_id: A1, enrolled: true, seq: 2 }, { profile_id: S3, academy_id: A2, enrolled: true, seq: 1 },
    ],
    profiles: [{ id: S1, name: '김하늘' }, { id: S2, name: '이바다' }, { id: S3, name: '박구름' }],
    academies: [{ id: A1, name: '다빈치 하늘원' }, { id: A2, name: '다빈치 바다원' }],
  }
  const db = memoryDb(tables, opts)
  return { db: db as unknown as SupabaseClient, raw: db }
}

describe('loaders', () => {
  it('lists tasks (published only for teachers) and parses the seed row', async () => {
    const { db } = world()
    const all = await loadTasks(db, { publishedOnly: true })
    expect(all.available).toBe(true); expect(all.rows).toHaveLength(1)
    expect(all.rows[0].task?.title).toBe(seed.title)
    const one = await loadTask(db, T1)
    expect(one.row?.task?.sources).toHaveLength(8)
  })
  it('is calm before migration 0016 (table missing) and marks other read errors as loadFailed', async () => {
    const { db } = world({ missing: ['inquiry_tasks', 'inquiry_assignments', 'inquiry_reports'] })
    expect(await loadTasks(db, { publishedOnly: false })).toEqual({ available: false, loadFailed: false, rows: [] })
    expect(await loadTaskAssignments(db, teacher1, T1)).toEqual({ available: false, loadFailed: false, rows: [] })
    expect(await loadStudentAssignments(db, S1)).toEqual({ available: false, loadFailed: false, rows: [] })
    expect((await loadAssignmentView(db, teacher1, 'as1'))).toEqual({ ok: false, reason: 'unavailable' })
    const { db: failing } = world({ failOn: ['select:inquiry_tasks'] })
    expect((await loadTasks(failing, { publishedOnly: false })).loadFailed).toBe(true)
  })
  it('teacher progress list is scoped to the academy and computes progress from the outline', async () => {
    const { db, raw } = world()
    const list = await loadTaskAssignments(db, teacher1, T1)
    expect(list.rows.map((r) => r.studentName)).toEqual(['김하늘'])
    // 목차에 탐구 방법이 없으므로 숨은 글(method)은 세지 않는다: 8칸 중 1칸
    expect(list.rows[0].progress).toEqual({ filled: 1, total: 8 })
    expect(list.rows[0].status).toBe('assigned')
    expect(raw.reads.find((r) => r.table === 'inquiry_assignments')).toBeTruthy()
    const other = await loadTaskAssignments(db, teacher2, T1)
    expect(other.rows.map((r) => r.studentName)).toEqual(['박구름'])
    expect((await loadTaskAssignments(db, admin, T1)).rows).toHaveLength(2)
    expect([...(await countAssignmentsByTask(db, teacher1)).entries()]).toEqual([[T1, 1]])
  })
  it('loadAssignmentView checks the academy / owner before reading anything else', async () => {
    const { db, raw } = world()
    raw.reads.length = 0
    expect(await loadAssignmentView(db, teacher2, 'as1')).toEqual({ ok: false, reason: 'forbidden' })
    expect(raw.reads.map((r) => r.table)).toEqual(['inquiry_assignments'])
    expect(await loadAssignmentView(db, student3, 'as1')).toEqual({ ok: false, reason: 'forbidden' })
    const ok = await loadAssignmentView(db, student1, 'as1')
    expect(ok.ok).toBe(true)
    if (ok.ok) {
      expect(ok.view.studentName).toBe('김하늘'); expect(ok.view.academyName).toBe('다빈치 하늘원')
      expect(ok.view.report.sections.motive).toBe('궁금했다'); expect(ok.view.hasReport).toBe(true)
      expect(ok.view.task.task?.title).toBe(seed.title)
    }
    expect(await loadAssignmentView(db, teacher1, 'nope')).toEqual({ ok: false, reason: 'not-found' })
  })
  it('student card list carries title, subjects and progress', async () => {
    const { db } = world()
    const cards = await loadStudentAssignments(db, S1)
    expect(cards.rows).toHaveLength(1)
    expect(cards.rows[0]).toMatchObject({ assignmentId: 'as1', title: seed.title, subjects: ['사회', '국어'], status: 'assigned', progress: { filled: 1, total: 8 } })
  })
})

describe('admin writes', () => {
  it('createTask → saveTask keeps an existing verified mark and stamps only newly ticked sources', async () => {
    const { db, raw } = world()
    const created = await createTask(db, 'adm')
    expect(created.ok).toBe(true)
    const id = created.ok ? created.id : ''
    const first = await saveTask(db, id, { ...seed, sources: seed.sources.map((s, i) => ({ ...s, verified: i === 0 ? { by: '', at: '' } : null })) }, { name: '관리자', now: NOW })
    expect(first.ok).toBe(true)
    if (first.ok) { expect(first.task.sources[0].verified).toEqual({ by: '관리자', at: NOW }); expect(first.task.sources[1].verified).toBeNull() }
    // 두 번째 저장: 첫 자료는 화면이 보낸 엉뚱한 값 대신 기존 기록을 지키고, 둘째 자료는 새로 찍힌다
    const second = await saveTask(db, id, { ...seed, sources: seed.sources.map((s, i) => ({ ...s, verified: i <= 1 ? { by: '해커', at: '1999' } : null })) }, { name: '관리자', now: '2026-10-02T00:00:00.000Z' })
    expect(second.ok).toBe(true)
    if (second.ok) { expect(second.task.sources[0].verified).toEqual({ by: '관리자', at: NOW }); expect(second.task.sources[1].verified).toEqual({ by: '관리자', at: '2026-10-02T00:00:00.000Z' }) }
    expect(raw.writes.filter((w) => w.table === 'inquiry_tasks' && w.op === 'update')).toHaveLength(2)
    expect(await saveTask(db, id, { title: '' }, { name: 'x', now: NOW })).toEqual({ ok: false, reason: 'invalid' })
    expect(await saveTask(db, 'missing-id', seed, { name: 'x', now: NOW })).toEqual({ ok: false, reason: 'not-found' })
  })
  it('publish is refused with the gate list until sources are verified; unpublish never checks', async () => {
    const { db, raw } = world()
    raw.tables.inquiry_tasks[0] = { ...raw.tables.inquiry_tasks[0], ...seed, status: 'draft' }   // verified null 인 원본 seed
    const r = await setTaskStatus(db, T1, 'published', NOW)
    expect(r.ok).toBe(false)
    if (!r.ok) { expect(r.reason).toBe('gate'); expect(r.missing?.map((m) => m.kind)).toEqual(['papers', 'news', 'book', 'question', 'question', 'question']) }
    raw.tables.inquiry_tasks[0] = { ...raw.tables.inquiry_tasks[0], ...verifiedSeed() }
    expect(await setTaskStatus(db, T1, 'published', NOW)).toEqual({ ok: true })
    expect(raw.tables.inquiry_tasks[0].status).toBe('published'); expect(raw.tables.inquiry_tasks[0].published_at).toBe(NOW)
    expect(await setTaskStatus(db, T1, 'draft', NOW)).toEqual({ ok: true })
    expect(raw.tables.inquiry_tasks[0].status).toBe('draft')
    const { db: gone } = world({ missing: ['inquiry_tasks'] })
    expect(await setTaskStatus(gone, T1, 'published', NOW)).toEqual({ ok: false, reason: 'unavailable' })
  })
})

describe('teacher writes', () => {
  it('assignStudents inserts only own-academy, not-yet-assigned students with the given outline', async () => {
    const { db, raw } = world()
    const r = await assignStudents(db, { taskId: T1, academyId: A1, studentIds: [S1, S2, S3, S2], outline: { method: 'data', career: false }, assignedBy: 'tch1', now: NOW })
    expect(r).toEqual({ ok: true, assigned: 1 })
    const ins = raw.writes.find((w) => w.table === 'inquiry_assignments' && w.op === 'insert')
    expect(ins?.rows).toHaveLength(1)
    expect(ins?.rows?.[0]).toMatchObject({ student_id: S2, academy_id: A1, task_id: T1, outline: { method: 'data', career: false }, status: 'assigned' })
    expect(await assignStudents(db, { taskId: T1, academyId: A1, studentIds: [], outline: {}, assignedBy: 'tch1', now: NOW })).toEqual({ ok: false, reason: 'no-students' })
    raw.tables.inquiry_tasks[0].status = 'draft'
    expect(await assignStudents(db, { taskId: T1, academyId: A1, studentIds: [S1], outline: {}, assignedBy: 'tch1', now: NOW })).toEqual({ ok: false, reason: 'not-published' })
  })
  it('applyOutline touches only own-academy assignments of the task', async () => {
    const { db, raw } = world()
    const r = await applyOutline(db, { taskId: T1, academyId: A1, assignmentIds: ['as1', 'as3'], outline: { method: 'experiment', career: true }, now: NOW })
    expect(r).toEqual({ ok: true, applied: 1 })
    expect(raw.tables.inquiry_assignments.find((a) => a.id === 'as1')?.outline).toEqual({ method: 'experiment', career: true })
    expect(raw.tables.inquiry_assignments.find((a) => a.id === 'as3')?.outline).toEqual({ method: 'survey', career: false })
    expect(await applyOutline(db, { taskId: T1, academyId: A1, assignmentIds: ['as1'], outline: { method: 'bogus' }, now: NOW })).toEqual({ ok: false, reason: 'invalid' })
  })
  it('reopenAssignment clears submitted_at and sets reopened; other academy is forbidden', async () => {
    const { db, raw } = world()
    raw.tables.inquiry_reports[0].submitted_at = NOW
    expect(await reopenAssignment(db, teacher2, 'as1', NOW)).toEqual({ ok: false, reason: 'forbidden' })
    expect(await reopenAssignment(db, teacher1, 'as1', NOW)).toEqual({ ok: true })
    expect(raw.tables.inquiry_reports[0].submitted_at).toBeNull()
    expect(raw.tables.inquiry_assignments[0].status).toBe('reopened')
  })
})

describe('student writes', () => {
  it('normalizePatch validates each kind and merges sections into the stored map', () => {
    const cur = { ...emptyReport(), sections: { motive: 'a' } }
    expect(normalizePatch({ kind: 'section', key: 'background', text: 'b' }, cur)).toEqual({ sections: { motive: 'a', background: 'b' } })
    expect(normalizePatch({ kind: 'section', key: 'bogus', text: 'b' }, cur)).toBeNull()
    expect(normalizePatch({ kind: 'questions', questions: [{ key: '나', text: '고침' }] }, cur)).toEqual({ questions: [{ key: '가', text: '' }, { key: '나', text: '고침' }, { key: '다', text: '' }] })
    expect(normalizePatch({ kind: 'sources', ids: ['p1', 'p1', 'n1'] }, cur)).toEqual({ used_source_ids: ['p1', 'n1'] })
    expect(normalizePatch({ kind: 'sources', ids: [1] }, cur)).toBeNull()
    expect(normalizePatch({ kind: 'career', text: '교사' }, cur)).toEqual({ career_field: '교사' })
  })
  it('saveReportPatch: own assignment only, refused after submit, upserts the merged row', async () => {
    const { db, raw } = world()
    expect(await saveReportPatch(db, student3, 'as1', { kind: 'section', key: 'motive', text: 'x' }, NOW)).toEqual({ ok: false, reason: 'forbidden' })
    expect(await saveReportPatch(db, teacher1, 'as1', { kind: 'section', key: 'motive', text: 'x' }, NOW)).toEqual({ ok: false, reason: 'forbidden' })
    const r = await saveReportPatch(db, student1, 'as1', { kind: 'section', key: 'background', text: '배경' }, NOW)
    expect(r).toEqual({ ok: true, updatedAt: NOW })
    expect(raw.tables.inquiry_reports[0].sections).toEqual({ motive: '궁금했다', method: '숨은 글', background: '배경' })
    // 첫 저장(줄 없음)도 upsert 로 만들어진다
    raw.tables.inquiry_assignments.push({ id: 'as2', task_id: T1, academy_id: A1, student_id: S2, outline: {}, status: 'assigned', created_at: NOW, updated_at: NOW })
    const s2: InquiryViewer = { role: 'student', userId: S2, academyId: A1 }
    expect((await saveReportPatch(db, s2, 'as2', { kind: 'career', text: '기자' }, NOW)).ok).toBe(true)
    expect(raw.tables.inquiry_reports.find((r) => r.assignment_id === 'as2')).toMatchObject({ academy_id: A1, career_field: '기자' })
    raw.tables.inquiry_reports[0].submitted_at = NOW
    expect(await saveReportPatch(db, student1, 'as1', { kind: 'section', key: 'motive', text: 'y' }, NOW)).toEqual({ ok: false, reason: 'submitted' })
  })
  it('submitReport stamps submitted_at, creates the row first when none exists, and updates the assignment status via admin', async () => {
    const { db, raw } = world()
    const adminDb = db
    expect(await submitReport(db, adminDb, student1, 'as1', NOW)).toEqual({ ok: true })
    expect(raw.tables.inquiry_reports[0].submitted_at).toBe(NOW)
    expect(raw.tables.inquiry_assignments[0].status).toBe('submitted')
    expect(await submitReport(db, adminDb, student1, 'as1', NOW)).toEqual({ ok: false, reason: 'submitted' })
    // 아직 한 글자도 쓰지 않은 학생(보고서 줄 없음)
    expect(await submitReport(db, null, student3, 'as3', NOW)).toEqual({ ok: true })
    const row = raw.tables.inquiry_reports.find((r) => r.assignment_id === 'as3')
    expect(row).toMatchObject({ academy_id: A2, submitted_at: NOW })
    expect(raw.tables.inquiry_assignments[1].status).toBe('assigned')   // admin 없이 — 화면은 보고서 제출 시각으로 판단한다
    const view = await loadAssignmentView(db, teacher2, 'as3')
    expect(view.ok && view.view.assignment.status).toBe('submitted')
  })
})
