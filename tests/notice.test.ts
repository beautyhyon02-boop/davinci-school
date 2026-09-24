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
// 대표 2026-09-26: 서술형(문항 1)·논술형(문항 2)은 마지막 교수 차시 뒤 단원 평가 차시(6)에 함께 있다
const session = s5.items[0].lesson_no as number
const quiz = [{ quiz_no: 1, response: 'a', correct: true }, { quiz_no: 2, response: 'b', correct: false }, { quiz_no: 3, response: 'c', correct: true }]
type Crit = { name: string; points: number; max: number; evidence: string }
const critOf = (item: { rubric: { criteria: { name: string; max: number }[] } }, drop = 1): Crit[] => item.rubric.criteria.map((c) => ({ name: c.name, points: c.max - drop, max: c.max, evidence: 'e' }))
const sum = (c: Crit[]) => c.reduce((t, x) => t + x.points, 0)
const at = '2026-09-29T00:00:00Z'
const confirmed = (item_no: number, attempt: 1 | 2, crit: Crit[]) => ({ item_no, attempt, final_score: sum(crit), final_criteria: crit, status: 'confirmed' as const, confirmed_at: at })

describe('buildNoticeSkeleton', () => {
  it('a teaching lesson copies context and quiz results from data, uses plan phrases, and has no essay results', () => {
    const { skeleton, needsAi } = buildNoticeSkeleton({ snapshot, lessonNo: 4, studentName: '김OO', date: '2026-09-29', quiz, gradings: [] })
    expect(skeleton.lesson_context.key_question).toBe(s3.lessons.find((l: { no: number }) => l.no === 4).key_question)
    expect(skeleton.participation.quiz).toMatchObject({ correct: 2, total: 3 })
    expect(skeleton.participation.quiz.items[1].note).toBe(s7.per_lesson.find((p: { lesson_no: number }) => p.lesson_no === 4).quiz_notes[1].wrong_note)
    expect(skeleton.essay_results).toEqual([]); expect(needsAi).toBe(false)
    expect(skeleton.footer_disclaimer).toBe('본 안내장은 학교생활기록부가 아니며, 학원 자체 학습 기록입니다.')
  })
  it('the 단원 평가 차시 carries one result per confirmed item (서술형 6점 · 논술형 16점), no quiz, and nothing while unconfirmed', () => {
    const none = buildNoticeSkeleton({ snapshot, lessonNo: session, studentName: '김OO', date: '2026-09-29', quiz: [], gradings: [{ item_no: 1, attempt: 1, final_score: 2, final_criteria: [], status: 'drafted', confirmed_at: null }] })
    expect(none.skeleton.essay_results).toEqual([]); expect(none.needsAi).toBe(false)
    expect(none.skeleton.participation.quiz).toMatchObject({ correct: 0, total: 0, items: [] })
    const short = critOf(s5.items[0]); const essay = critOf(s5.items[1])
    const both = buildNoticeSkeleton({ snapshot, lessonNo: session, studentName: '김OO', date: '2026-09-29', quiz: [], gradings: [confirmed(2, 1, essay), confirmed(1, 1, short)] })
    expect(both.skeleton.essay_results.map((r) => [r.kind, r.confirmed_score, r.total_points])).toEqual([['서술형', sum(short), 6], ['논술형', sum(essay), 16]])
    expect(both.skeleton.essay_results[1].criteria_feedback.map((c) => c.criterion_name)).toEqual(essay.map((c) => c.name))
    expect(both.needsAi).toBe(true)
    expect(both.evidence.map((e) => e.kind)).toEqual([...short.map(() => '서술형'), ...essay.map(() => '논술형')])
    // 한 문항만 확정되면 그 문항만
    const one = buildNoticeSkeleton({ snapshot, lessonNo: session, studentName: '김OO', date: '2026-09-29', quiz: [], gradings: [confirmed(2, 1, essay)] })
    expect(one.skeleton.essay_results.map((r) => r.kind)).toEqual(['논술형'])
  })
  it('band from the grade table (item score scaled to 22), retry from a confirmed attempt 2 of the same item', () => {
    const crit = critOf(s5.items[0])
    const { skeleton } = buildNoticeSkeleton({ snapshot, lessonNo: session, studentName: '김OO', date: '2026-09-29', quiz: [],
      gradings: [confirmed(1, 1, crit), confirmed(1, 2, critOf(s5.items[0], 0))] })
    const r = skeleton.essay_results[0]
    expect(r.confirmed_score).toBe(3); expect(r.total_points).toBe(6); expect(r.band).toBe('중')   // 3/6 → 11/22 → 4등급 중
    expect(r.retry).toMatchObject({ attempted: true, before_score: 3, after_score: 6 })
    const done = applyDraft(skeleton, { quiz_notes: [], criteria_feedback: crit.map((c) => ({ criterion_name: c.name, good_point: '상대도수를 정확하게 구함', improve_point: null })), improvement_comments: [{ kind: '서술형', comment: '첫 답안을 출발점으로 이유를 더해 만점' }, { kind: '논술형', comment: '이 문항은 재도전이 없어 쓰이지 않음' }] })
    expect(Notice.safeParse(done).error?.issues ?? []).toEqual([])
    expect(done.essay_results[0].criteria_feedback[0].good_point).toBe('상대도수를 정확하게 구함')
    expect(done.essay_results[0].retry?.improvement_comment).toBe('첫 답안을 출발점으로 이유를 더해 만점')
  })
  it('ignores an unconfirmed retry (attempt 2 without confirmed_at) and passes only confirmed evidence on', () => {
    const crit = critOf(s5.items[0])
    const r = buildNoticeSkeleton({ snapshot, lessonNo: session, studentName: '김OO', date: '2026-09-29', quiz: [],
      gradings: [confirmed(1, 1, crit), { item_no: 1, attempt: 2, final_score: 6, final_criteria: [{ ...crit[0], evidence: 'AI 초안 근거' }], status: 'drafted', confirmed_at: null }] })
    expect(r.skeleton.essay_results[0].retry).toBeNull()
    expect(r.evidence.map((e) => e.attempt)).toEqual(crit.map(() => 1))
    expect(JSON.stringify(r)).not.toContain('AI 초안 근거')
  })
  it('a reopened grading (confirmed_at still set but status drafted) is not used (N-03)', () => {
    const crit = critOf(s5.items[0])
    const r = buildNoticeSkeleton({ snapshot, lessonNo: session, studentName: '김OO', date: '2026-09-29', quiz: [],
      gradings: [{ item_no: 1, attempt: 1, final_score: 2, final_criteria: crit, status: 'drafted', confirmed_at: at }] })
    expect(r.skeleton.essay_results).toEqual([]); expect(r.needsAi).toBe(false); expect(r.evidence).toEqual([])
  })
  it('an old 판 lesson (one item per lesson) still gets exactly that item', () => {
    const legacySnap = { ...snapshot, lessons: snapshot.lessons.map((l) => ({ ...l })), assessment: { ...snapshot.assessment!, items: [{ ...snapshot.assessment!.items[0], lesson_no: 4, points: 3 }, { ...snapshot.assessment!.items[0], lesson_no: 5, points: 3 }, { ...snapshot.assessment!.items[1], lesson_no: 6 }] } }
    const crit = critOf(s5.items[0])
    const r = buildNoticeSkeleton({ snapshot: legacySnap, lessonNo: 5, studentName: '김OO', date: '2026-09-29', quiz, gradings: [confirmed(1, 1, crit), confirmed(2, 1, crit)] })
    expect(r.skeleton.essay_results.map((x) => [x.kind, x.total_points])).toEqual([['서술형', 3]])
  })
  it('reads a notice stored before 2026-09-26 (one essay_result) as essay_results', () => {
    const stored = { ...buildNoticeSkeleton({ snapshot, lessonNo: 4, studentName: '김OO', date: '2026-09-29', quiz, gradings: [] }).skeleton } as Record<string, unknown>
    delete stored.essay_results
    const old = { ...stored, essay_result: { kind: '서술형', confirmed_score: 2, total_points: 3, band: '중', criteria_feedback: [], retry: null } }
    expect(Notice.parse(old).essay_results.map((r) => r.total_points)).toEqual([3])
    expect(Notice.parse({ ...stored, essay_result: null }).essay_results).toEqual([])
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
    for (const item of a5.items) for (const c of item.rubric.criteria) expect(fixture.criteria_feedback.map((x) => x.criterion_name)).toContain(c.name)
    // 단원 평가 차시: 두 문항 모두 확정 + 재도전 확정
    const lessonNo = a5.items[0].lesson_no
    const gradings = a5.items.flatMap((item: { rubric: { criteria: { name: string; max: number }[] } }, i: number) => [confirmed(i + 1, 1, critOf(item)), confirmed(i + 1, 2, critOf(item, 0))])
    const { skeleton } = buildNoticeSkeleton({ snapshot: snap, lessonNo, studentName: '김OO', date: '2026-09-29', quiz: [], gradings })
    const done = applyDraft(skeleton, fixture)
    expect(Notice.safeParse(done).error?.issues ?? []).toEqual([])
    expect(done.essay_results.map((r) => r.kind)).toEqual(['서술형', '논술형'])
    expect(done.essay_results.every((r) => r.criteria_feedback.every((c) => c.good_point.length > 0) && !!r.retry?.improvement_comment)).toBe(true)
    expect(lintNotice(done, ['박OO'])).toEqual([])
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
  it('puts the N- rules first, uses the notice-draft fixture and sends only confirmed data — both rubrics on the 단원 평가 차시', () => {
    const crit = critOf(s5.items[0])
    const { skeleton, evidence } = buildNoticeSkeleton({ snapshot, lessonNo: session, studentName: '김OO', date: '2026-09-29', quiz: [],
      gradings: [confirmed(1, 1, [{ ...crit[0], evidence: '확정 근거 문장' }])] })
    const p = buildNoticePrompt({ snapshot, lessonNo: session, skeleton, evidence })
    expect(p.system[0]).toBe(NOTICE_PROMPT_RULES); expect(p.fixtureKey).toBe('notice-draft')
    expect(p.user).toContain('확정 근거 문장'); expect(p.user).toContain(crit[0].name)
    expect(p.user).toContain(s7.per_lesson.find((x: { lesson_no: number }) => x.lesson_no === session).criteria_phrases[0].improve[0])
    expect(p.user).toContain('채점표 요소와 척도(서술형, 6점)'); expect(p.user).toContain('채점표 요소와 척도(논술형, 16점)')
    expect(p.user).toContain('improvement_comments')
  })
})

describe('mergeEditable / noticeDataKey', () => {
  // 퀴즈가 있는 옛 판 모양 차시 대신: 단원 평가 차시에 퀴즈 응답을 붙여 편집 가능한 칸을 모두 만든다
  const crit = critOf(s5.items[0])
  const skeleton = buildNoticeSkeleton({ snapshot, lessonNo: session, studentName: '김OO', date: '2026-09-29', quiz: [], gradings: [confirmed(1, 1, crit), confirmed(2, 1, critOf(s5.items[1]))] }).skeleton
  const withQuiz = { ...skeleton, participation: { ...skeleton.participation, quiz: { correct: 2, total: 3, items: [{ q: 'a', is_correct: true, note: null }, { q: 'b', is_correct: false, note: '다시 보면 됩니다' }, { q: 'c', is_correct: true, note: null }] } } }
  const base = applyDraft(withQuiz, { quiz_notes: [], criteria_feedback: [{ criterion_name: crit[0].name, good_point: '상대도수 활동에서 두 값을 정확하게 구함', improve_point: null }], improvement_comments: [] })
  it('takes only the editable text fields from the submitted body', () => {
    const sent: NoticeT = structuredClone(base)
    sent.director_message = '차근차근 따라오는 모습이 좋았습니다.'; sent.participation.director_comment = '짝 활동에서 먼저 발표함'
    sent.essay_results[0].criteria_feedback[0].good_point = '고친 잘한 점 문장입니다'; sent.essay_results[1].criteria_feedback[0].good_point = '논술형 잘한 점 문장입니다'
    sent.essay_results[0].confirmed_score = 6; sent.essay_results[0].band = '상'; sent.participation.quiz.correct = 3; sent.participation.quiz.items[1].is_correct = true; sent.student_name = '박OO'
    const m = mergeEditable(base, sent)!
    expect(m.director_message).toBe('차근차근 따라오는 모습이 좋았습니다.'); expect(m.participation.director_comment).toBe('짝 활동에서 먼저 발표함')
    expect(m.essay_results[0].criteria_feedback[0].good_point).toBe('고친 잘한 점 문장입니다'); expect(m.essay_results[1].criteria_feedback[0].good_point).toBe('논술형 잘한 점 문장입니다')
    expect(m.essay_results[0].confirmed_score).toBe(sum(crit)); expect(m.essay_results[0].band).toBe(base.essay_results[0].band)
    expect(m.participation.quiz.correct).toBe(2); expect(m.participation.quiz.items[1].is_correct).toBe(false); expect(m.student_name).toBe('김OO')
    expect(noticeDataKey(m)).toBe(noticeDataKey(base))
  })
  it('blank director fields become null and a shape mismatch is rejected', () => {
    const sent: NoticeT = structuredClone(base); sent.director_message = '  '
    expect(mergeEditable(base, sent)?.director_message).toBeNull()
    const short: NoticeT = structuredClone(base); short.participation.quiz.items.pop()
    expect(mergeEditable(base, short)).toBeNull()
    const oneResult: NoticeT = structuredClone(base); oneResult.essay_results.pop()
    expect(mergeEditable(base, oneResult)).toBeNull()
    const swapped: NoticeT = structuredClone(base); swapped.essay_results.reverse()
    expect(mergeEditable(base, swapped)).toBeNull()
  })
  it('the data key changes when a confirmed score or a quiz result changes, not when text or date changes', () => {
    const t: NoticeT = structuredClone(base); t.director_message = 'x'; t.date = '2026-10-01'; t.essay_results[0].criteria_feedback[0].good_point = 'y'
    expect(noticeDataKey(t)).toBe(noticeDataKey(base))
    const s: NoticeT = structuredClone(base); s.essay_results[1].confirmed_score = 3
    expect(noticeDataKey(s)).not.toBe(noticeDataKey(base))
    const q: NoticeT = structuredClone(base); q.participation.quiz.items[0].is_correct = false
    expect(noticeDataKey(q)).not.toBe(noticeDataKey(base))
  })
  it('todayKst formats the Seoul calendar date', () => {
    expect(todayKst(new Date('2026-09-28T16:30:00Z'))).toBe('2026-09-29')
    expect(todayKst(new Date('2026-09-29T02:00:00Z'))).toBe('2026-09-29')
  })
})

describe('학년 선택(대표 2026-09-26): 안내장 프롬프트의 학년 줄', () => {
  it('says "중 1학년" for an old snapshot and "중학교(1~3학년군)" when the set has no grade', () => {
    const { skeleton } = buildNoticeSkeleton({ snapshot, lessonNo: 4, studentName: '김OO', date: '2026-09-29', quiz: [], gradings: [] })
    expect(buildNoticePrompt({ snapshot, lessonNo: 4, skeleton }).user).toContain('학생: 김OO · 중 1학년 · 수학 4차시')
    const noGrade = { ...snapshot, cover: { ...snapshot.cover, grade: null } }
    const u = buildNoticePrompt({ snapshot: noGrade, lessonNo: 4, skeleton }).user
    expect(u).toContain('학생: 김OO · 중학교(1~3학년군) · 수학 4차시'); expect(u).not.toMatch(/null학년/)
  })
})
