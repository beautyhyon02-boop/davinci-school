// 단원 리포트의 문장 고치기·과목 고르기·점수 다시 불러오기(순수 함수) — 설계 2026-09-29 §5.4, R-4·R-8
import { describe, it, expect } from 'vitest'
import { buildUnitReport } from '@/lib/classroom/report'
import { UnitReportBody } from '@/lib/classroom/report-schema'
import { applyEdits, restrictReport, reportDataKey, editsFromStored, sanitizeEdits, defaultSummary, defaultOverall, editKey, MAX_SENTENCE } from '@/lib/classroom/report-edit'
import { app } from '@/content/site'
import { fullSubject, student, theme, SIX_AXIS_TAGS } from './fixtures/unit-report'

const copy = app.classroom.report.build
const subjects = () => [
  fullSubject('영어', { wrong: ['2-1', '4-3'], drop: 1, tags: SIX_AXIS_TAGS }),
  fullSubject('수학', { wrong: ['1-2'], tags: SIX_AXIS_TAGS }),
  fullSubject('과학', { variant: '과학', wrong: ['3-3'], drop: 2 }),
]
const input = () => ({ student, theme, subjects: subjects() })
const full = buildUnitReport(input(), copy)
const firstCriterion = full.subjects[0].assessment[0].criteria[0]
const K = {
  overall: editKey.overall(),
  summary: editKey.summary('영어'),
  quiz: editKey.quiz('영어', 2, 1),
  phrase: editKey.phrase('영어', 1, firstCriterion.name),
}

describe('restrictReport — 넣을 과목(R-4)', () => {
  it('gives the same body as buildUnitReport with includeSubjects', () => {
    for (const pick of [['영어'], ['영어', '수학'], ['수학', '과학'], ['영어', '수학', '과학']]) {
      expect(restrictReport(full, pick, copy)).toEqual(buildUnitReport({ ...input(), includeSubjects: pick }, copy))
    }
  })
  it('ignores subjects that are not in the body and keeps the body order', () => {
    const r = restrictReport(full, ['과학', '사회', '영어'], copy)
    expect(r.included_subjects).toEqual(['영어', '과학'])
    expect(UnitReportBody.safeParse(r).success).toBe(true)
  })
  it('default sentences match the ones buildUnitReport wrote', () => {
    for (const s of full.subjects) expect(defaultSummary(s, copy)).toBe(s.summary)
    expect(defaultOverall(full, copy)).toBe(full.overall_comment)
  })
})

describe('applyEdits — 문장만 덮는다', () => {
  const edited = applyEdits(full, { [K.overall]: '  종합을 고쳤습니다.  ', [K.summary]: '영어 요약을 고쳤습니다.', [K.quiz]: '다시 풀어 봅시다.', [K.phrase]: '문구를 고쳤습니다.' })
  it('changes the four kinds of sentences, trimmed', () => {
    expect(edited.overall_comment).toBe('종합을 고쳤습니다.')
    expect(edited.subjects[0].summary).toBe('영어 요약을 고쳤습니다.')
    expect(edited.subjects[0].quizzes.find((q) => q.lesson_no === 2 && q.quiz_no === 1)!.wrong_note).toBe('다시 풀어 봅시다.')
    expect(edited.subjects[0].assessment[0].criteria[0].phrase).toBe('문구를 고쳤습니다.')
    expect(UnitReportBody.safeParse(edited).success).toBe(true)
  })
  it('never changes a number: the data key is the same', () => {
    expect(reportDataKey(edited)).toBe(reportDataKey(full))
    expect(edited.radar).toEqual(full.radar)
    expect(edited.subjects.map((s) => [s.quiz_correct, s.quiz_total, s.assessment_points, s.assessment_max])).toEqual(full.subjects.map((s) => [s.quiz_correct, s.quiz_total, s.assessment_points, s.assessment_max]))
  })
  it('drops keys that have no place in the body, and never notes a correct quiz', () => {
    const r = applyEdits(full, { [editKey.quiz('영어', 1, 1)]: '맞은 문항', [editKey.summary('사회')]: '없는 과목', [editKey.phrase('영어', 9, '없는 요소')]: 'x', 'points|영어|1': '99' })
    expect(r).toEqual(full)
  })
  it('an empty sentence removes the line (null for notes and phrases)', () => {
    const r = applyEdits(full, { [K.quiz]: '   ', [K.phrase]: '', [K.summary]: '' })
    expect(r.subjects[0].quizzes.find((q) => q.lesson_no === 2 && q.quiz_no === 1)!.wrong_note).toBeNull()
    expect(r.subjects[0].assessment[0].criteria[0].phrase).toBeNull()
    expect(r.subjects[0].summary).toBe('')
    expect(UnitReportBody.safeParse(r).success).toBe(true)
  })
  it('cuts a sentence at the limit', () => {
    expect(applyEdits(full, { [K.overall]: '가'.repeat(MAX_SENTENCE + 50) }).overall_comment).toHaveLength(MAX_SENTENCE)
  })
})

describe('sanitizeEdits', () => {
  it('keeps strings only and tolerates anything else', () => {
    expect(sanitizeEdits({ a: ' x ', b: 3, c: null, d: { e: 1 } })).toEqual({ a: 'x' })
    for (const bad of [null, undefined, 'x', 3, ['a']]) expect(sanitizeEdits(bad)).toEqual({})
  })
})

describe('reportDataKey — 숫자만', () => {
  it('changes when a quiz mark, a score or a missing list changes', () => {
    const flip = subjects(); flip[0] = fullSubject('영어', { wrong: ['2-1'], drop: 1, tags: SIX_AXIS_TAGS })
    const score = subjects(); score[0] = fullSubject('영어', { wrong: ['2-1', '4-3'], drop: 0, tags: SIX_AXIS_TAGS })
    const unfinal = subjects(); unfinal[0] = { ...unfinal[0], finalizedLessons: [1, 2, 3, 4] }
    const key = reportDataKey(full)
    for (const s of [flip, score, unfinal]) expect(reportDataKey(buildUnitReport({ student, theme, subjects: s }, copy))).not.toBe(key)
    expect(reportDataKey(buildUnitReport(input(), copy))).toBe(key)
  })
  it('does not contain a sentence', () => {
    const key = reportDataKey(full)
    expect(key).not.toContain(full.overall_comment)
    expect(key).not.toContain(full.subjects[0].quizzes[0].question)
  })
})

describe('editsFromStored — 점수 다시 불러오기', () => {
  const stored = applyEdits(restrictReport(full, ['영어', '수학'], copy), { [K.overall]: '원장이 쓴 종합', [K.quiz]: '원장이 쓴 퀴즈 코멘트', [K.phrase]: '원장이 쓴 문구' })

  it('finds nothing in an untouched body', () => {
    expect(editsFromStored(full, full, copy)).toEqual({})
    expect(editsFromStored(restrictReport(full, ['수학'], copy), full, copy)).toEqual({})
  })
  it('finds exactly the edited sentences, and applying them to the fresh body gives the stored body back', () => {
    const edits = editsFromStored(stored, full, copy)
    expect(Object.keys(edits).sort()).toEqual([K.overall, K.phrase, K.quiz].sort())
    expect(applyEdits(restrictReport(full, ['영어', '수학'], copy), edits)).toEqual(stored)
  })
  it('numbers changed: default sentences follow the new numbers, edited sentences stay where the item still exists', () => {
    // 영어 4차시 3번이 O 로 바뀌고(요약 숫자가 바뀐다), 2차시 1번은 여전히 X
    const changed = subjects(); changed[0] = fullSubject('영어', { wrong: ['2-1'], drop: 1, tags: SIX_AXIS_TAGS })
    const fresh = buildUnitReport({ student, theme, subjects: changed }, copy)
    const edits = editsFromStored(stored, fresh, copy)
    expect(edits[K.summary]).toBeUndefined()                       // 요약은 고치지 않았다 → 새 숫자의 기본 문장
    const next = applyEdits(restrictReport(fresh, stored.included_subjects, copy), edits)
    expect(next.subjects[0].summary).toBe(fresh.subjects[0].summary)
    expect(next.subjects[0].summary).not.toBe(stored.subjects[0].summary)
    expect(next.subjects[0].quiz_correct).toBe(14)
    expect(next.overall_comment).toBe('원장이 쓴 종합')
    expect(next.subjects[0].quizzes.find((q) => q.lesson_no === 2 && q.quiz_no === 1)!.wrong_note).toBe('원장이 쓴 퀴즈 코멘트')
    expect(next.subjects[0].assessment[0].criteria[0].phrase).toBe('원장이 쓴 문구')
    expect(reportDataKey(next)).not.toBe(reportDataKey(stored))
  })
  it('an edited summary stays even when its numbers change', () => {
    const s2 = applyEdits(stored, { [K.summary]: '원장이 쓴 요약' })
    const changed = subjects(); changed[0] = fullSubject('영어', { wrong: [], drop: 1, tags: SIX_AXIS_TAGS })
    const fresh = buildUnitReport({ student, theme, subjects: changed }, copy)
    expect(editsFromStored(s2, fresh, copy)[K.summary]).toBe('원장이 쓴 요약')
  })
  it('drops a quiz note when the item became correct, and a phrase when the score moved it to the other side', () => {
    const changed = subjects(); changed[0] = fullSubject('영어', { wrong: ['4-3'], drop: 0, tags: SIX_AXIS_TAGS })
    const fresh = buildUnitReport({ student, theme, subjects: changed }, copy)
    const now = fresh.subjects[0].assessment[0].criteria[0]
    expect(now.phrase_kind).not.toBe(firstCriterion.phrase_kind)     // drop 1 → 0 이면 보완할 점 → 잘한 점
    const edits = editsFromStored(stored, fresh, copy)
    expect(edits[K.quiz]).toBeUndefined()
    expect(edits[K.phrase]).toBeUndefined()
    const next = applyEdits(restrictReport(fresh, stored.included_subjects, copy), edits)
    expect(next.subjects[0].assessment[0].criteria[0].phrase).toBe(now.phrase)
  })
  it('skips a subject that is no longer assigned', () => {
    const fresh = buildUnitReport({ student, theme, subjects: subjects().slice(1) }, copy)
    const edits = editsFromStored(stored, fresh, copy)
    expect(Object.keys(edits)).toEqual([K.overall])
  })
})
