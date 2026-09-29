// 단원 리포트 계산(순수 함수) — 설계 docs/superpowers/specs/2026-09-29-unit-report-design.md §5.1~5.3
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { buildUnitReport, buildRadar, choosePhrase, stableHash, overallComment, type RadarAxis } from '@/lib/classroom/report'
import { UnitReportBody } from '@/lib/classroom/report-schema'
import { COMPETENCIES } from '@/lib/studio/competency'
import { NOTICE_DISCLAIMER } from '@/lib/studio/schemas'
import { reportCopy, snapshotFor, fullSubject, quizRows, gradingFor, student, theme, SIX_AXIS_TAGS, TEACHING_LESSONS } from './fixtures/unit-report'

const s7 = JSON.parse(readFileSync('data/studio-fixtures/stage7-generate.json', 'utf8'))
const axis = (radar: RadarAxis[], name: string) => radar.find((a) => a.competency === name)!

describe('buildUnitReport — 두 과목(영어·수학)', () => {
  const input = { student, theme, subjects: [fullSubject('영어', { wrong: ['2-1', '4-3'], drop: 1 }), fullSubject('수학', { wrong: ['1-2'] })] }
  const body = buildUnitReport(input, reportCopy)

  it('passes the stored-body schema and carries the fixed disclaimer', () => {
    expect(UnitReportBody.safeParse(body).error?.issues ?? []).toEqual([])
    expect(body.footer_disclaimer).toBe(NOTICE_DISCLAIMER)
    expect(body.student_name).toBe('김OO'); expect(body.theme_title).toBe(theme.title)
    expect(body.included_subjects).toEqual(['영어', '수학'])
    expect(JSON.parse(JSON.stringify(body))).toEqual(body)   // jsonb 로 저장해도 같은 값
  })

  it('lists quizzes by lesson and number, with a wrong note only on wrong items', () => {
    const en = body.subjects[0]
    expect(en.quizzes).toHaveLength(15)
    expect(en.quizzes.map((q) => [q.lesson_no, q.quiz_no]).slice(0, 4)).toEqual([[1, 1], [1, 2], [1, 3], [2, 1]])
    expect([en.quiz_correct, en.quiz_total]).toEqual([13, 15])
    const wrong = en.quizzes.filter((q) => !q.correct)
    expect(wrong.map((q) => `${q.lesson_no}-${q.quiz_no}`)).toEqual(['2-1', '4-3'])
    expect(wrong[0].wrong_note).toBe(s7.per_lesson.find((p: { lesson_no: number }) => p.lesson_no === 2).quiz_notes.find((n: { quiz_no: number }) => n.quiz_no === 1).wrong_note)
    expect(en.quizzes.filter((q) => q.correct).every((q) => q.wrong_note === null)).toBe(true)
    expect(en.quizzes[0].question).toBe(input.subjects[0].snapshot.lessons[0].formative_check.quiz[0].q)
  })

  it('lists assessment items with criteria points, competency and a phrase from the matching bank', () => {
    const [short, essay] = body.subjects[0].assessment
    expect([short.kind, short.item_no, short.points, short.max]).toEqual(['서술형', 1, 3, 6])
    expect([essay.kind, essay.item_no, essay.points, essay.max]).toEqual(['논술형', 2, 12, 16])
    expect(body.subjects[0].assessment_points).toBe(15); expect(body.subjects[0].assessment_max).toBe(22)
    const bank = (name: string) => s7.per_lesson.flatMap((p: { criteria_phrases: { criterion_name: string }[] | null }) => p.criteria_phrases ?? []).find((c: { criterion_name: string }) => c.criterion_name === name)
    for (const c of short.criteria) {   // 1/2 = 0.5 → 보완할 점
      expect(c.phrase_kind).toBe('improve'); expect(bank(c.name).improve).toContain(c.phrase)
    }
    for (const c of essay.criteria) {   // 3/4 = 0.75 → 잘한 점
      expect(c.phrase_kind).toBe('good'); expect(bank(c.name).good).toContain(c.phrase)
    }
    // 꼬리표가 없는 세트: 요소는 axis 와 같은 이름의 역량
    expect(essay.criteria.map((c) => c.competency)).toEqual(['지식·이해', '과정·기능', '가치·태도', '과정·기능'])
  })

  it('writes the one-line summary from the copy templates', () => {
    expect(body.subjects[0].summary).toBe('영어: 퀴즈 15문항 중 13문항 정답, 평가 22점 중 15점')
    expect(body.subjects[1].summary).toBe('수학: 퀴즈 15문항 중 14문항 정답, 평가 22점 중 22점')
    expect(body.subjects.every((s) => s.missing.lessons.length + s.missing.items.length + s.missing.quiz_answers.length === 0)).toBe(true)
  })

  it('radar: six axes in COMPETENCIES order, quiz = 1 point, criterion = its max; untagged sets fill three axes only', () => {
    expect(body.radar.map((a) => a.competency)).toEqual([...COMPETENCIES])
    // 지식·이해: 퀴즈 30문항(27 정답) + 요소 (2·4)×2 과목 — 영어 1+3, 수학 2+4
    expect(axis(body.radar, '지식·이해')).toMatchObject({ earned: 27 + 4 + 6, possible: 30 + 12, count: 30 + 4, sparse: false })
    // 과정·기능: 과목마다 요소 2·2·4·4 — 영어 1+1+3+3, 수학 만점
    expect(axis(body.radar, '과정·기능')).toMatchObject({ earned: 8 + 12, possible: 24, count: 8, ratio: 20 / 24 })
    expect(axis(body.radar, '가치·태도')).toMatchObject({ earned: 3 + 4, possible: 8, count: 2, sparse: false })
    for (const name of ['자료 읽기', '근거 들어 설명하기', '글로 표현하기']) expect(axis(body.radar, name)).toEqual({ competency: name, earned: 0, possible: 0, count: 0, ratio: null, sparse: true })
  })

  it('overall comment names the strongest and the weakest axis with data', () => {
    // 지식·이해 37/42 ≈ 0.881, 과정·기능 0.833, 가치·태도 0.875
    expect(body.overall_comment).toBe(reportCopy.overall.strongAndWeak({ studentName: '김OO', themeTitle: theme.title, strong: '지식·이해', weak: '과정·기능' }))
  })

  it('never mentions other students (no rank, average or comparison field)', () => {
    expect(JSON.stringify(body)).not.toMatch(/rank|average|percentile|등수|평균|석차/)
  })
})

describe('buildUnitReport — 다섯 과목', () => {
  const subjects = [
    fullSubject('국어', { tags: SIX_AXIS_TAGS, wrong: ['1-1'] }),
    fullSubject('영어', { tags: SIX_AXIS_TAGS, drop: 1 }),
    fullSubject('수학', { wrong: ['3-2', '3-3'] }),
    fullSubject('과학', { variant: '과학', drop: { '서술': 2 } }),
    fullSubject('사회', { variant: '과학', wrong: ['5-1'] }),
  ]
  const body = buildUnitReport({ student, theme, subjects }, reportCopy)

  it('keeps the subject order and each subject\'s own key question', () => {
    expect(body.subjects.map((s) => s.subject)).toEqual(['국어', '영어', '수학', '과학', '사회'])
    expect(body.subjects.map((s) => s.key_question)).toEqual(['국어 q', '영어 q', '수학 q', '과학 q', '사회 q'])
    expect(UnitReportBody.safeParse(body).success).toBe(true)
  })

  it('reads competency tags where present and sums every subject into the radar', () => {
    expect(body.subjects[0].quizzes.slice(0, 3).map((q) => q.competency)).toEqual(['지식·이해', '자료 읽기', '자료 읽기'])
    expect(body.subjects[0].assessment[1].criteria.map((c) => c.competency)).toEqual(['과정·기능', '근거 들어 설명하기', '가치·태도', '글로 표현하기'])
    expect(body.radar.every((a) => a.ratio !== null && a.count >= 2 && !a.sparse)).toBe(true)
    // 글로 표현하기: 국어·영어의 「수학적 표현과 서술」(4점) — 국어 4, 영어 3
    expect(axis(body.radar, '글로 표현하기')).toMatchObject({ earned: 7, possible: 8, count: 2 })
    const total = body.radar.reduce((s, a) => s + a.possible, 0)
    expect(total).toBe(5 * (15 + 22))
    expect(body.radar.reduce((s, a) => s + a.count, 0)).toBe(5 * (15 + 7))
  })
})

describe('buildUnitReport — 옛 세트·빠진 자료', () => {
  it('a set without notice_plan shows scores only (no wrong note, no phrase)', () => {
    const legacy = fullSubject('수학', { noticePlan: false, wrong: ['1-1'], drop: 1 })
    expect(legacy.snapshot.notice_plan).toBeNull()
    const body = buildUnitReport({ student, theme, subjects: [legacy] }, reportCopy)
    expect(body.subjects[0].quizzes.every((q) => q.wrong_note === null)).toBe(true)
    const criteria = body.subjects[0].assessment.flatMap((a) => a.criteria)
    expect(criteria).toHaveLength(7)
    expect(criteria.every((c) => c.phrase === null)).toBe(true)
    expect(criteria.map((c) => c.phrase_kind)).toEqual(['improve', 'improve', 'improve', 'good', 'good', 'good', 'good'])
    expect(body.subjects[0].assessment_points).toBe(15)
    expect(UnitReportBody.safeParse(body).success).toBe(true)
  })

  it('reports lessons whose quiz is not finalised and items without a confirmed grading, and leaves them out of the scores', () => {
    const snapshot = snapshotFor('수학')
    const body = buildUnitReport({ student, theme, subjects: [{
      subject: '수학', key_question: 'q', snapshot,
      // 4차시 응답은 있지만 최종 확인이 안 됐다 → 쓰지 않는다. 2차시 3번은 확인된 차시인데 정오 기록이 없다.
      quiz: [...quizRows([1, 2, 4])].filter((r) => !(r.lesson_no === 2 && r.quiz_no === 3)),
      finalizedLessons: [1, 2],
      gradings: [gradingFor(snapshot, 1)],
    }] }, reportCopy)
    const s = body.subjects[0]
    expect(s.missing).toEqual({ lessons: [3, 4, 5], quiz_answers: [{ lesson_no: 2, quiz_no: 3 }], items: [{ item_no: 2, kind: '논술형' }] })
    expect(s.quizzes.map((q) => q.lesson_no)).toEqual([1, 1, 1, 2, 2])
    expect([s.quiz_correct, s.quiz_total]).toEqual([5, 5])
    expect(s.assessment.map((a) => a.kind)).toEqual(['서술형'])
    expect(s.summary).toBe('수학: 퀴즈 5문항 중 5문항 정답, 평가 6점 중 6점')
    // 단원 평가 차시(6, 퀴즈 없음)는 빠진 차시가 아니다
    expect(s.missing.lessons).not.toContain(6)
    expect(body.radar.reduce((t, a) => t + a.possible, 0)).toBe(5 + 6)
  })

  it('summary template follows what data exists; nothing at all → neutral overall comment', () => {
    const snapshot = snapshotFor('영어')
    const base = { subject: '영어', key_question: 'q', snapshot }
    const of = (quiz: ReturnType<typeof quizRows>, finalizedLessons: number[], gradings: ReturnType<typeof gradingFor>[]) => buildUnitReport({ student, theme, subjects: [{ ...base, quiz, finalizedLessons, gradings }] }, reportCopy)
    expect(of(quizRows([1]), [1], []).subjects[0].summary).toBe('영어: 퀴즈 3문항 중 3문항 정답')
    expect(of([], [], [gradingFor(snapshot, 2, 1)]).subjects[0].summary).toBe('영어: 평가 16점 중 12점')
    const empty = of([], [], [])
    expect(empty.subjects[0].summary).toBe('영어: 아직 확인된 기록이 없습니다.')
    expect(empty.radar.every((a) => a.ratio === null && a.count === 0)).toBe(true)
    expect(empty.overall_comment).toBe(reportCopy.overall.neutral({ studentName: '김OO', themeTitle: theme.title }))
    // 퀴즈만(꼬리표 없음) → 자료 있는 축이 하나뿐 → 중립 문장
    expect(of(quizRows([1], ['1-1']), [1], []).overall_comment).toBe(empty.overall_comment)
    expect(UnitReportBody.safeParse(empty).success).toBe(true)
  })

  it('uses the first attempt when an item has several confirmed gradings, and clamps points into 0..max', () => {
    const snapshot = snapshotFor('수학')
    const first = { ...gradingFor(snapshot, 1, 1), attempt: 1 }; const second = { ...gradingFor(snapshot, 1, 0), attempt: 2 }
    const odd = { item_no: 2, final_criteria: [{ name: '해석의 타당성', points: 9, max: 4 }, { name: '제안과 근거의 연결', points: -1, max: 4 }] }
    const body = buildUnitReport({ student, theme, subjects: [{ subject: '수학', key_question: 'q', snapshot, quiz: [], finalizedLessons: [], gradings: [second, first, odd] }] }, reportCopy)
    expect(body.subjects[0].assessment[0].points).toBe(3)
    expect(body.subjects[0].assessment[1].criteria.map((c) => [c.points, c.max, c.competency])).toEqual([[4, 4, '과정·기능'], [0, 4, '가치·태도']])
  })
})

describe('문구 고르기(결정적)', () => {
  const bank = { good: ['잘한 점 하나입니다', '잘한 점 둘입니다', '잘한 점 셋입니다'], improve: ['보완할 점 하나입니다', '보완할 점 둘입니다'] }

  it('same student and criterion → same phrase every time; the threshold is 0.75', () => {
    const a = choosePhrase(bank, 0.8, 7, '해석의 타당성')
    expect(choosePhrase(bank, 0.8, 7, '해석의 타당성')).toEqual(a)
    expect(a.kind).toBe('good'); expect(bank.good).toContain(a.text)
    expect(choosePhrase(bank, 0.75, 7, 'x').kind).toBe('good')
    expect(choosePhrase(bank, 0.74, 7, 'x').kind).toBe('improve')
    expect(bank.improve).toContain(choosePhrase(bank, 0, 7, 'x').text)
    expect(stableHash('7|해석의 타당성')).toBe(stableHash('7|해석의 타당성'))
    expect(Number.isInteger(stableHash('가나다')) && stableHash('가나다') >= 0).toBe(true)
  })

  it('different students get varied phrases across a class', () => {
    const seen = new Set(Array.from({ length: 30 }, (_, i) => choosePhrase(bank, 1, i + 1, '해석의 타당성').text))
    expect(seen.size).toBe(3)
  })

  it('no bank (or an empty list) → phrase null', () => {
    expect(choosePhrase(null, 1, 1, 'x')).toEqual({ kind: 'good', text: null })
    expect(choosePhrase({ good: [], improve: ['보완할 점 하나입니다'] }, 1, 1, 'x').text).toBeNull()
    expect(choosePhrase(undefined, 0.2, 1, 'x')).toEqual({ kind: 'improve', text: null })
  })

  it('the whole report is repeatable, and the phrase depends on the student seq', () => {
    const subjects = [fullSubject('수학', { drop: 1 })]
    const one = buildUnitReport({ student, theme, subjects }, reportCopy)
    expect(buildUnitReport({ student, theme, subjects }, reportCopy)).toEqual(one)
    const phrasesOf = (seq: number) => buildUnitReport({ student: { name: 'a', seq }, theme, subjects }, reportCopy).subjects[0].assessment.flatMap((a) => a.criteria.map((c) => c.phrase)).join('|')
    expect(new Set(Array.from({ length: 12 }, (_, i) => phrasesOf(i + 1))).size).toBeGreaterThan(1)
  })
})

describe('과목 고르기(includeSubjects)', () => {
  const subjects = [fullSubject('영어', { drop: 2, wrong: ['1-1', '1-2', '1-3'] }), fullSubject('수학'), fullSubject('과학', { variant: '과학' })]

  it('radar and overall comment come from the included subjects only', () => {
    const all = buildUnitReport({ student, theme, subjects }, reportCopy)
    const mathOnly = buildUnitReport({ student, theme, subjects, includeSubjects: ['수학'] }, reportCopy)
    expect(mathOnly.included_subjects).toEqual(['수학']); expect(mathOnly.subjects.map((s) => s.subject)).toEqual(['수학'])
    expect(mathOnly.radar.filter((a) => a.ratio !== null).every((a) => a.ratio === 1)).toBe(true)
    expect(mathOnly.overall_comment).toBe(reportCopy.overall.even({ studentName: '김OO', themeTitle: theme.title }))
    expect(axis(all.radar, '지식·이해').possible).toBe(3 * 21); expect(axis(mathOnly.radar, '지식·이해').possible).toBe(21)
    expect(all.overall_comment).not.toBe(mathOnly.overall_comment)
  })

  it('keeps input order, ignores unknown names, and an empty list includes nothing', () => {
    const two = buildUnitReport({ student, theme, subjects, includeSubjects: ['과학', '영어', '음악'] }, reportCopy)
    expect(two.included_subjects).toEqual(['영어', '과학'])
    const none = buildUnitReport({ student, theme, subjects, includeSubjects: [] }, reportCopy)
    expect(none.subjects).toEqual([]); expect(none.radar.every((a) => a.ratio === null)).toBe(true)
    expect(UnitReportBody.safeParse(none).success).toBe(true)
  })
})

describe('buildRadar · overallComment', () => {
  it('an axis with one item is sparse; an axis with none has ratio null', () => {
    const radar = buildRadar([
      { competency: '자료 읽기', earned: 1, possible: 1 },
      { competency: '글로 표현하기', earned: 1, possible: 4 }, { competency: '글로 표현하기', earned: 2, possible: 4 },
    ])
    expect(axis(radar, '자료 읽기')).toEqual({ competency: '자료 읽기', earned: 1, possible: 1, count: 1, ratio: 1, sparse: true })
    expect(axis(radar, '글로 표현하기')).toMatchObject({ earned: 3, possible: 8, count: 2, ratio: 0.375, sparse: false })
    expect(axis(radar, '지식·이해')).toMatchObject({ ratio: null, count: 0 })
    expect(overallComment(radar, { studentName: 'a', themeTitle: 't' }, reportCopy)).toBe(reportCopy.overall.strongAndWeak({ studentName: 'a', themeTitle: 't', strong: '자료 읽기', weak: '글로 표현하기' }))
  })

  it('with two or more non-sparse axes, strongest/weakest come from the non-sparse axes only', () => {
    const radar = buildRadar([
      { competency: '지식·이해', earned: 1, possible: 1 },                                                        // 1문항(sparse) 100%
      { competency: '자료 읽기', earned: 3, possible: 4 }, { competency: '자료 읽기', earned: 3, possible: 4 },       // 75%
      { competency: '글로 표현하기', earned: 1, possible: 4 }, { competency: '글로 표현하기', earned: 2, possible: 4 }, // 37.5%
      { competency: '가치·태도', earned: 0, possible: 1 },                                                        // 1문항(sparse) 0%
    ])
    expect(overallComment(radar, { studentName: 'a', themeTitle: 't' }, reportCopy)).toBe(reportCopy.overall.strongAndWeak({ studentName: 'a', themeTitle: 't', strong: '자료 읽기', weak: '글로 표현하기' }))
  })

  it('non-sparse axes that tie give the even sentence even when a sparse axis differs', () => {
    const radar = buildRadar([
      { competency: '지식·이해', earned: 0, possible: 1 },
      { competency: '자료 읽기', earned: 1, possible: 2 }, { competency: '자료 읽기', earned: 1, possible: 2 },
      { competency: '과정·기능', earned: 2, possible: 4 }, { competency: '과정·기능', earned: 2, possible: 4 },
    ])
    expect(overallComment(radar, { studentName: 'a', themeTitle: 't' }, reportCopy)).toBe(reportCopy.overall.even({ studentName: 'a', themeTitle: 't' }))
  })

  it('only one non-sparse axis → falls back to every axis with data', () => {
    const radar = buildRadar([
      { competency: '지식·이해', earned: 1, possible: 1 },
      { competency: '자료 읽기', earned: 1, possible: 4 }, { competency: '자료 읽기', earned: 1, possible: 4 },
    ])
    expect(overallComment(radar, { studentName: 'a', themeTitle: 't' }, reportCopy)).toBe(reportCopy.overall.strongAndWeak({ studentName: 'a', themeTitle: 't', strong: '지식·이해', weak: '자료 읽기' }))
  })

  it('ties are broken by axis order so the sentence never flips', () => {
    const radar = buildRadar([
      { competency: '지식·이해', earned: 1, possible: 1 }, { competency: '자료 읽기', earned: 1, possible: 1 },
      { competency: '과정·기능', earned: 0, possible: 1 }, { competency: '가치·태도', earned: 0, possible: 1 },
    ])
    expect(overallComment(radar, { studentName: 'a', themeTitle: 't' }, reportCopy)).toBe(reportCopy.overall.strongAndWeak({ studentName: 'a', themeTitle: 't', strong: '지식·이해', weak: '가치·태도' }))
  })
})

describe('순수 모듈', () => {
  it('report.ts and radar.ts import no fs, supabase or server-only, and carry no Korean sentence templates', () => {
    for (const f of ['lib/classroom/report.ts', 'lib/classroom/report-schema.ts', 'lib/classroom/radar.ts']) {
      const src = readFileSync(f, 'utf8')
      expect(src).not.toMatch(/from ['"](node:)?fs['"]|supabase|server-only/)
    }
    const code = readFileSync('lib/classroom/report.ts', 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')
    expect(code).not.toMatch(/[가-힣]/)
    const tsx = readFileSync('components/classroom/RadarChart.tsx', 'utf8').replace(/\{\/\*[\s\S]*?\*\/\}|\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')
    expect(tsx).not.toMatch(/[가-힣]/)
    expect(TEACHING_LESSONS).toHaveLength(5)
  })
})
