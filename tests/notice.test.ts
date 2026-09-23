import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { buildNoticeSkeleton, applyDraft, mergeEditable, noticeDataKey, todayKst } from '@/lib/classroom/notice'
import { Notice, NoticeDraftOut, type NoticeT } from '@/lib/classroom/notice-schema'
import { buildNoticePrompt } from '@/lib/classroom/notice-prompt'
import { lintNotice } from '@/lib/classroom/notice-lint'
import { NOTICE_PROMPT_RULES } from '@/lib/studio/prompts/rules/notice'
import { upgradeSnapshot } from '@/lib/studio/publish'

const json = (p: string) => JSON.parse(readFileSync(p, 'utf8'))
const s3 = json('data/studio-fixtures/stage3-generate.json'); const s5 = json('data/studio-fixtures/stage5-generate.json'); const s7 = json('data/studio-fixtures/stage7-generate.json')
const snapshotOf = (a: typeof s3, b: typeof s5, c: typeof s7, subject = '수학') => upgradeSnapshot({ schema_version: 2, cover: { title: 'T', subject, level: '중', grade: 1, version: 1, published_at: '' }, standards: [], intro: '', reconstruction: '', reconstruction_detail: [], learning_goals: [], key_question: 'q', unit_plan: a.unit_plan, lessons: a.lessons, materials: [], assessment: b, teacher_guide: null, notice_plan: c, references: [], generated_with: { models: [] } })
const snapshot = snapshotOf(s3, s5, s7)
const essayLesson = s5.items[0].lesson_no as number
const quiz = [{ quiz_no: 1, response: 'a', correct: true }, { quiz_no: 2, response: 'b', correct: false }, { quiz_no: 3, response: 'c', correct: true }]
type Crit = { name: string; points: number; max: number; evidence: string }
const critOf = (item: { rubric: { criteria: { name: string; max: number }[] } }, drop = 1): Crit[] => item.rubric.criteria.map((c) => ({ name: c.name, points: c.max - drop, max: c.max, evidence: 'e' }))

describe('buildNoticeSkeleton', () => {
  it('copies lesson context and quiz results from data, uses plan phrases, and leaves essay null when nothing is confirmed', () => {
    const { skeleton, needsAi } = buildNoticeSkeleton({ snapshot, lessonNo: essayLesson, studentName: '김OO', date: '2026-09-29', quiz, gradings: [{ attempt: 1, final_score: 2, final_criteria: [], status: 'drafted', confirmed_at: null }] })
    expect(skeleton.lesson_context.key_question).toBe(s3.lessons.find((l: { no: number }) => l.no === essayLesson).key_question)
    expect(skeleton.participation.quiz).toMatchObject({ correct: 2, total: 3 })
    expect(skeleton.participation.quiz.items[1].note).toBe(s7.per_lesson.find((p: { lesson_no: number }) => p.lesson_no === essayLesson).quiz_notes[1].wrong_note)
    expect(skeleton.essay_result).toBeNull(); expect(needsAi).toBe(false)
    expect(skeleton.footer_disclaimer).toBe('본 안내장은 학교생활기록부가 아니며, 학원 자체 학습 기록입니다.')
  })
  it('fills essay_result from confirmed gradings only, band from the grade table, retry from attempt 2', () => {
    const crit = critOf(s5.items[0])
    const { skeleton, needsAi } = buildNoticeSkeleton({ snapshot, lessonNo: essayLesson, studentName: '김OO', date: '2026-09-29', quiz,
      gradings: [{ attempt: 1, final_score: 2, final_criteria: crit, status: 'confirmed', confirmed_at: '2026-09-29T00:00:00Z' }, { attempt: 2, final_score: 3, final_criteria: crit, status: 'confirmed', confirmed_at: '2026-09-30T00:00:00Z' }] })
    expect(skeleton.essay_result?.confirmed_score).toBe(2); expect(skeleton.essay_result?.total_points).toBe(3)
    expect(skeleton.essay_result?.retry).toMatchObject({ attempted: true, before_score: 2, after_score: 3 })
    expect(skeleton.essay_result?.criteria_feedback.map((c) => c.criterion_name)).toEqual(crit.map((c: { name: string }) => c.name))
    expect(needsAi).toBe(true)
    const done = applyDraft(skeleton, { quiz_notes: [], criteria_feedback: crit.map((c: { name: string }) => ({ criterion_name: c.name, good_point: '표를 정확하게 완성함', improve_point: null })), improvement_comment: '해석 문장을 스스로 채워 재도전에서 만점' })
    expect(Notice.safeParse(done).error?.issues ?? []).toEqual([])
    expect(done.essay_result?.criteria_feedback[0].good_point).toBe('표를 정확하게 완성함')
  })
  it('a quiz-only lesson has essay_result null and never needs AI', () => {
    const r = buildNoticeSkeleton({ snapshot, lessonNo: 1, studentName: '김OO', date: '2026-09-29', quiz, gradings: [] })
    expect(r.skeleton.essay_result).toBeNull(); expect(r.needsAi).toBe(false)
  })
  it('ignores an unconfirmed retry (attempt 2 without confirmed_at) and passes only confirmed evidence on', () => {
    const crit = critOf(s5.items[0])
    const r = buildNoticeSkeleton({ snapshot, lessonNo: essayLesson, studentName: '김OO', date: '2026-09-29', quiz,
      gradings: [{ attempt: 1, final_score: 2, final_criteria: crit, status: 'confirmed', confirmed_at: '2026-09-29T00:00:00Z' }, { attempt: 2, final_score: 3, final_criteria: [{ ...crit[0], evidence: 'AI 초안 근거' }], status: 'drafted', confirmed_at: null }] })
    expect(r.skeleton.essay_result?.retry).toBeNull()
    expect(r.evidence.map((e) => e.attempt)).toEqual([1])
    expect(JSON.stringify(r)).not.toContain('AI 초안 근거')
  })
  it('a reopened grading (confirmed_at still set but status drafted) is not used — essay_result null (N-03)', () => {
    const crit = critOf(s5.items[0])
    const r = buildNoticeSkeleton({ snapshot, lessonNo: essayLesson, studentName: '김OO', date: '2026-09-29', quiz,
      gradings: [{ attempt: 1, final_score: 2, final_criteria: crit, status: 'drafted', confirmed_at: '2026-09-29T00:00:00Z' }] })
    expect(r.skeleton.essay_result).toBeNull(); expect(r.needsAi).toBe(false); expect(r.evidence).toEqual([])
    const retry = buildNoticeSkeleton({ snapshot, lessonNo: essayLesson, studentName: '김OO', date: '2026-09-29', quiz,
      gradings: [{ attempt: 1, final_score: 2, final_criteria: crit, status: 'confirmed', confirmed_at: '2026-09-29T00:00:00Z' }, { attempt: 2, final_score: 3, final_criteria: crit, status: 'drafted', confirmed_at: '2026-09-30T00:00:00Z' }] })
    expect(retry.skeleton.essay_result?.retry).toBeNull()
  })
  it('the essay lesson without a quiz (논술형) has an empty quiz and a 논술형 result', () => {
    const essay = s5.items[2]
    const r = buildNoticeSkeleton({ snapshot, lessonNo: essay.lesson_no, studentName: '김OO', date: '2026-09-29', quiz: [], gradings: [{ attempt: 1, final_score: 12, final_criteria: critOf(essay), status: 'confirmed', confirmed_at: '2026-09-29T00:00:00Z' }] })
    expect(r.skeleton.participation.quiz).toMatchObject({ correct: 0, total: 0, items: [] })
    expect(r.skeleton.essay_result).toMatchObject({ kind: '논술형', confirmed_score: 12, total_points: 16 })
  })
  it('throws for a lesson that is not in the snapshot', () => {
    expect(() => buildNoticeSkeleton({ snapshot, lessonNo: 9, studentName: '김OO', date: '2026-09-29', quiz, gradings: [] })).toThrow(/lesson 9/)
  })
})

describe('notice-draft fixture (mock AI)', () => {
  const fixture = NoticeDraftOut.parse(json('data/studio-fixtures/notice-draft.json'))
  for (const [subject, sfx] of [['수학', ''], ['과학', '-과학']] as const) it(`${subject}: covers every rubric criterion and every applied essay notice passes the lint`, () => {
    const a3 = json(`data/studio-fixtures/stage3-generate${sfx}.json`); const a5 = json(`data/studio-fixtures/stage5-generate${sfx}.json`); const a7 = json(`data/studio-fixtures/stage7-generate${sfx}.json`)
    const snap = snapshotOf(a3, a5, a7, subject)
    for (const item of a5.items) {
      for (const c of item.rubric.criteria) expect(fixture.criteria_feedback.map((x) => x.criterion_name)).toContain(c.name)
      const lessonQuiz = a3.lessons.find((l: { no: number }) => l.no === item.lesson_no).formative_check.quiz.map((_: unknown, i: number) => ({ quiz_no: i + 1, response: 'x', correct: i !== 1 }))
      const crit = critOf(item)
      const { skeleton } = buildNoticeSkeleton({ snapshot: snap, lessonNo: item.lesson_no, studentName: '김OO', date: '2026-09-29', quiz: lessonQuiz,
        gradings: [{ attempt: 1, final_score: crit.reduce((s, c) => s + c.points, 0), final_criteria: crit, status: 'confirmed', confirmed_at: '2026-09-29T00:00:00Z' }, { attempt: 2, final_score: item.points, final_criteria: critOf(item, 0), status: 'confirmed', confirmed_at: '2026-09-30T00:00:00Z' }] })
      const done = applyDraft(skeleton, fixture)
      expect(Notice.safeParse(done).error?.issues ?? []).toEqual([])
      expect(done.essay_result?.criteria_feedback.every((c) => c.good_point.length > 0)).toBe(true)
      expect(lintNotice(done, ['박OO'])).toEqual([])
    }
  })
  it('every quiz-only lesson notice built from the plan passes the lint (math and science)', () => {
    for (const sfx of ['', '-과학']) {
      const a3 = json(`data/studio-fixtures/stage3-generate${sfx}.json`); const a5 = json(`data/studio-fixtures/stage5-generate${sfx}.json`); const a7 = json(`data/studio-fixtures/stage7-generate${sfx}.json`)
      const snap = snapshotOf(a3, a5, a7)
      for (const l of a3.lessons) {
        const allWrong = l.formative_check.quiz.map((_: unknown, i: number) => ({ quiz_no: i + 1, response: 'x', correct: false }))
        const { skeleton } = buildNoticeSkeleton({ snapshot: snap, lessonNo: l.no, studentName: '김OO', date: '2026-09-29', quiz: allWrong, gradings: [] })
        expect(Notice.safeParse(skeleton).error?.issues ?? [], `${sfx} ${l.no}`).toEqual([])
        expect(lintNotice(skeleton, []), `${sfx} ${l.no}`).toEqual([])
      }
    }
  })
})

describe('buildNoticePrompt', () => {
  it('puts the N- rules first, uses the notice-draft fixture and sends only confirmed data', () => {
    const crit = critOf(s5.items[0])
    const { skeleton, evidence } = buildNoticeSkeleton({ snapshot, lessonNo: essayLesson, studentName: '김OO', date: '2026-09-29', quiz,
      gradings: [{ attempt: 1, final_score: 2, final_criteria: [{ ...crit[0], evidence: '확정 근거 문장' }], status: 'confirmed', confirmed_at: '2026-09-29T00:00:00Z' }] })
    const p = buildNoticePrompt({ snapshot, lessonNo: essayLesson, skeleton, evidence })
    expect(p.system[0]).toBe(NOTICE_PROMPT_RULES); expect(p.fixtureKey).toBe('notice-draft')
    expect(p.user).toContain('확정 근거 문장'); expect(p.user).toContain(crit[0].name)
    expect(p.user).toContain(s7.per_lesson.find((x: { lesson_no: number }) => x.lesson_no === essayLesson).criteria_phrases[0].improve[0])
  })
})

describe('mergeEditable / noticeDataKey', () => {
  const crit = critOf(s5.items[0])
  const base = applyDraft(buildNoticeSkeleton({ snapshot, lessonNo: essayLesson, studentName: '김OO', date: '2026-09-29', quiz,
    gradings: [{ attempt: 1, final_score: 2, final_criteria: crit, status: 'confirmed', confirmed_at: '2026-09-29T00:00:00Z' }] }).skeleton,
    { quiz_notes: [], criteria_feedback: [{ criterion_name: crit[0].name, good_point: '표 완성 활동에서 계급을 정확하게 나눔', improve_point: null }], improvement_comment: null })
  it('takes only the editable text fields from the submitted body', () => {
    const sent: NoticeT = structuredClone(base)
    sent.director_message = '차근차근 따라오는 모습이 좋았습니다.'; sent.participation.director_comment = '짝 활동에서 먼저 발표함'
    sent.essay_result!.criteria_feedback[0].good_point = '고친 잘한 점 문장입니다'
    sent.essay_result!.confirmed_score = 3; sent.essay_result!.band = '상'; sent.participation.quiz.correct = 3; sent.participation.quiz.items[1].is_correct = true; sent.student_name = '박OO'
    const m = mergeEditable(base, sent)!
    expect(m.director_message).toBe('차근차근 따라오는 모습이 좋았습니다.'); expect(m.participation.director_comment).toBe('짝 활동에서 먼저 발표함')
    expect(m.essay_result?.criteria_feedback[0].good_point).toBe('고친 잘한 점 문장입니다')
    expect(m.essay_result?.confirmed_score).toBe(2); expect(m.essay_result?.band).toBe(base.essay_result?.band)
    expect(m.participation.quiz.correct).toBe(2); expect(m.participation.quiz.items[1].is_correct).toBe(false); expect(m.student_name).toBe('김OO')
    expect(noticeDataKey(m)).toBe(noticeDataKey(base))
  })
  it('blank director fields become null and a shape mismatch is rejected', () => {
    const sent: NoticeT = structuredClone(base); sent.director_message = '  '
    expect(mergeEditable(base, sent)?.director_message).toBeNull()
    const short: NoticeT = structuredClone(base); short.participation.quiz.items.pop()
    expect(mergeEditable(base, short)).toBeNull()
  })
  it('the data key changes when a confirmed score or a quiz result changes, not when text or date changes', () => {
    const t: NoticeT = structuredClone(base); t.director_message = 'x'; t.date = '2026-10-01'; t.essay_result!.criteria_feedback[0].good_point = 'y'
    expect(noticeDataKey(t)).toBe(noticeDataKey(base))
    const s: NoticeT = structuredClone(base); s.essay_result!.confirmed_score = 3
    expect(noticeDataKey(s)).not.toBe(noticeDataKey(base))
    const q: NoticeT = structuredClone(base); q.participation.quiz.items[0].is_correct = false
    expect(noticeDataKey(q)).not.toBe(noticeDataKey(base))
  })
  it('todayKst formats the Seoul calendar date', () => {
    expect(todayKst(new Date('2026-09-28T16:30:00Z'))).toBe('2026-09-29')
    expect(todayKst(new Date('2026-09-29T02:00:00Z'))).toBe('2026-09-29')
  })
})
