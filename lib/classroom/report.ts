import type { SnapshotV2 } from '@/lib/studio/compat'
import { NOTICE_DISCLAIMER } from '@/lib/studio/schemas'
import { COMPETENCIES, competencyOf, type Competency } from '@/lib/studio/competency'
import type { UnitReportBody, ReportSubject, ReportQuiz, ReportAssessmentItem, ReportCriterion, ReportMissing, RadarAxis } from './report-schema'

export type { UnitReportBody, ReportSubject, ReportQuiz, ReportAssessmentItem, ReportCriterion, ReportMissing, RadarAxis }

/**
 * 단원 리포트 계산(순수 함수 — 파일·DB·AI 를 쓰지 않는다. 서버·클라이언트·테스트 어디서나 부를 수 있다).
 * 설계: docs/superpowers/specs/2026-09-29-unit-report-design.md §5.1~5.3
 * 문장은 여기서 만들지 않는다 — 틀은 copy(화면 문구, content/site.ts)로 받고, 문구는 게시 판의 안내장 틀(notice_plan)에서 고른다.
 * 다른 학생과의 비교는 어디에도 없다(R-7): 입력이 학생 한 명뿐이다.
 */

/** 점수 비율이 이 값 이상이면 잘한 점(good), 아니면 보완할 점(improve) 문구를 고른다. */
export const GOOD_PHRASE_RATIO = 0.75
/** 문항 수가 이보다 적은 축은 sparse(흐리게 + "문항 수 적음"). */
export const SPARSE_COUNT = 2

export type ReportSubjectSummaryArgs = {
  subject: string
  quizCorrect: number
  quizTotal: number
  /** 확정된 평가 문항 점수 합·만점 합. 확정된 문항이 없으면 둘 다 0. */
  assessmentPoints: number
  assessmentMax: number
}
export type ReportOverallArgs = { studentName: string; themeTitle: string }

/** 문장 틀(화면 문구). 페이지가 content/site.ts 에서 넘긴다. */
export type UnitReportCopy = {
  /** 과목 한 줄 요약 — 있는 자료에 따라 넷 중 하나. */
  subjectSummary: {
    quizAndAssessment: (a: ReportSubjectSummaryArgs) => string
    quizOnly: (a: ReportSubjectSummaryArgs) => string
    assessmentOnly: (a: ReportSubjectSummaryArgs) => string
    none: (a: ReportSubjectSummaryArgs) => string
  }
  overall: {
    /** 가장 높은 축과 가장 낮은 축이 다를 때. */
    strongAndWeak: (a: ReportOverallArgs & { strong: Competency; weak: Competency }) => string
    /** 자료가 있는 축의 비율이 모두 같을 때(높고 낮음을 가를 수 없다). */
    even: (a: ReportOverallArgs) => string
    /** 자료가 있는 축이 2개 미만일 때의 중립 문장. */
    neutral: (a: ReportOverallArgs) => string
  }
}

export type ReportQuizInput = { lesson_no: number; quiz_no: number; correct: boolean }
export type ReportGradingInput = {
  item_no: number
  /** 있으면 같은 문항의 여러 확정 채점 중 가장 앞 회차를 쓴다(안내장과 같다 — 첫 답안 점수). 없으면 먼저 온 것. */
  attempt?: number
  final_criteria: { name: string; points: number; max: number }[]
}
export type ReportSubjectInput = {
  subject: string
  key_question: string
  /** 배정이 묶인 게시 판(upgradeSnapshot 을 거친 v2 모양). */
  snapshot: SnapshotV2
  /** 최종 확인된 차시의 퀴즈 정오. 확인되지 않은 차시의 줄이 섞여 와도 쓰지 않는다. */
  quiz: ReportQuizInput[]
  finalizedLessons: number[]
  /** 확정된 채점만(호출하는 쪽이 status 'confirmed' 로 거른다). */
  gradings: ReportGradingInput[]
}
export type UnitReportInput = {
  student: { name: string; seq: number | string }
  theme: { title: string }
  subjects: ReportSubjectInput[]
  /** 리포트에 넣을 과목(R-4). 없으면 전부. 육각형·종합 코멘트는 넣은 과목으로만 계산한다. */
  includeSubjects?: string[]
}

/** 같은 (학생 번호, 요소 이름)이면 늘 같은 수(FNV-1a 32비트). 실행 환경·순서와 무관하다. */
export function stableHash(text: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** 문구 고르기(§5.3): 비율로 good/improve 를 정하고, 그 목록에서 (학생 번호, 요소 이름) 해시로 하나를 고른다. */
export function choosePhrase(
  bank: { good?: string[] | null; improve?: string[] | null } | null | undefined,
  ratio: number,
  seq: number | string,
  criterionName: string,
): { kind: 'good' | 'improve'; text: string | null } {
  const kind = ratio >= GOOD_PHRASE_RATIO ? 'good' as const : 'improve' as const
  const list = (bank?.[kind] ?? []).filter((s) => typeof s === 'string' && s.trim())
  if (!list.length) return { kind, text: null }
  return { kind, text: list[stableHash(`${seq}|${criterionName}`) % list.length] }
}

type Tagged = { competency?: unknown; axis?: unknown }
type Tally = { competency: Competency; earned: number; possible: number }

function buildSubject(inp: ReportSubjectInput, seq: number | string, copy: UnitReportCopy): { subject: ReportSubject; tallies: Tally[] } {
  const snapshot = inp.snapshot
  const plans = snapshot.notice_plan?.per_lesson ?? []
  const tallies: Tally[] = []
  const missing: ReportMissing = { lessons: [], quiz_answers: [], items: [] }

  // 퀴즈: 최종 확인된 차시만(§4.1). 퀴즈가 없는 차시(단원 평가 차시)는 빠진 것으로 세지 않는다.
  const quizzes: ReportQuiz[] = []
  for (const lesson of snapshot.lessons ?? []) {
    const items = lesson.formative_check?.quiz ?? []
    if (!items.length) continue
    if (!inp.finalizedLessons.includes(lesson.no)) { missing.lessons.push(lesson.no); continue }
    const notes = plans.find((p) => p.lesson_no === lesson.no)?.quiz_notes ?? []
    for (const [i, q] of items.entries()) {
      const quiz_no = i + 1
      const r = inp.quiz.find((x) => x.lesson_no === lesson.no && x.quiz_no === quiz_no)
      if (!r) { missing.quiz_answers.push({ lesson_no: lesson.no, quiz_no }); continue }
      const competency = competencyOf(q as Tagged)
      quizzes.push({
        lesson_no: lesson.no, quiz_no, question: q.q, competency, correct: r.correct,
        wrong_note: r.correct ? null : notes.find((n) => n.quiz_no === quiz_no)?.wrong_note ?? null,
      })
      tallies.push({ competency, earned: r.correct ? 1 : 0, possible: 1 })
    }
  }

  // 평가 문항: 확정된 채점만. 요소 이름은 세트 안에서 겹치지 않으므로 문구·역량을 이름으로 찾는다(이름이 다르면 자리로).
  const phrases = plans.flatMap((p) => p.criteria_phrases ?? [])
  const assessment: ReportAssessmentItem[] = []
  for (const [i, item] of (snapshot.assessment?.items ?? []).entries()) {
    const item_no = i + 1
    const grading = inp.gradings
      .filter((g) => g.item_no === item_no)
      .sort((a, b) => (a.attempt ?? 0) - (b.attempt ?? 0))[0]
    if (!grading) { missing.items.push({ item_no, kind: item.kind }); continue }
    const rubric = item.rubric?.criteria ?? []
    const criteria: ReportCriterion[] = grading.final_criteria.map((c, k) => {
      const max = Math.max(1, c.max)
      const points = Math.min(max, Math.max(0, c.points))
      const competency = competencyOf((rubric.find((x) => x.name === c.name) ?? rubric[k] ?? {}) as Tagged)
      const chosen = choosePhrase(phrases.find((p) => p.criterion_name === c.name), points / max, seq, c.name)
      tallies.push({ competency, earned: points, possible: max })
      return { name: c.name, points, max, competency, phrase_kind: chosen.kind, phrase: chosen.text }
    })
    assessment.push({
      item_no, kind: item.kind, lesson_no: item.lesson_no,
      points: criteria.reduce((s, c) => s + c.points, 0),
      // 만점은 확정 채점의 요소 max 합(점수와 같은 자로 잰다). 요소가 비어 있으면 게시 판의 문항 배점.
      max: Math.max(1, criteria.length ? criteria.reduce((s, c) => s + c.max, 0) : item.points),
      criteria,
    })
  }

  const args: ReportSubjectSummaryArgs = {
    subject: inp.subject,
    quizCorrect: quizzes.filter((q) => q.correct).length, quizTotal: quizzes.length,
    assessmentPoints: assessment.reduce((s, a) => s + a.points, 0), assessmentMax: assessment.reduce((s, a) => s + a.max, 0),
  }
  const t = copy.subjectSummary
  const summary = quizzes.length && assessment.length ? t.quizAndAssessment(args)
    : quizzes.length ? t.quizOnly(args)
    : assessment.length ? t.assessmentOnly(args)
    : t.none(args)

  return {
    tallies,
    subject: {
      subject: inp.subject, key_question: inp.key_question, quizzes,
      quiz_correct: args.quizCorrect, quiz_total: args.quizTotal,
      assessment, assessment_points: args.assessmentPoints, assessment_max: args.assessmentMax,
      summary, missing,
    },
  }
}

/** 육각형 6축(§5.2): COMPETENCIES 순서. 퀴즈 1문항 = 1점, 채점 요소 = 그 요소의 max. */
export function buildRadar(tallies: { competency: Competency; earned: number; possible: number }[]): RadarAxis[] {
  return COMPETENCIES.map((competency) => {
    const mine = tallies.filter((t) => t.competency === competency)
    const earned = mine.reduce((s, t) => s + t.earned, 0)
    const possible = mine.reduce((s, t) => s + t.possible, 0)
    return { competency, earned, possible, count: mine.length, ratio: possible > 0 ? earned / possible : null, sparse: mine.length < SPARSE_COUNT }
  })
}

/**
 * 종합 코멘트: 자료가 있는 축 가운데 가장 높은 축과 가장 낮은 축. 비율이 같으면 높은 쪽은 앞 축, 낮은 쪽은 뒤 축
 * (COMPETENCIES 순서)으로 정해 늘 같은 문장이 나온다. 자료가 있는 축이 2개 미만이면 중립 문장.
 * 문항 수가 충분한(sparse 가 아닌) 축이 2개 이상이면 그 축들 안에서만 고른다 — 문항 하나짜리 축이 "가장 높은/낮은 역량"으로
 * 불리지 않게. 그런 축이 2개 미만이면 자료가 있는 축 전체에서 고른다(종전 동작).
 */
export function overallComment(radar: RadarAxis[], who: ReportOverallArgs, copy: UnitReportCopy): string {
  const withData = radar.filter((a): a is RadarAxis & { ratio: number } => a.ratio !== null)
  if (withData.length < 2) return copy.overall.neutral(who)
  const solid = withData.filter((a) => !a.sparse)
  const pool = solid.length >= 2 ? solid : withData
  let strong = pool[0]; let weak = pool[0]
  for (const a of pool) {
    if (a.ratio > strong.ratio) strong = a
    if (a.ratio <= weak.ratio) weak = a
  }
  if (strong.ratio === weak.ratio) return copy.overall.even(who)
  return copy.overall.strongAndWeak({ ...who, strong: strong.competency, weak: weak.competency })
}

export function buildUnitReport(input: UnitReportInput, copy: UnitReportCopy): UnitReportBody {
  const chosen = input.includeSubjects
  const included = chosen ? input.subjects.filter((s) => chosen.includes(s.subject)) : input.subjects
  const built = included.map((s) => buildSubject(s, input.student.seq, copy))
  const radar = buildRadar(built.flatMap((b) => b.tallies))
  return {
    student_name: input.student.name,
    theme_title: input.theme.title,
    included_subjects: included.map((s) => s.subject),
    subjects: built.map((b) => b.subject),
    radar,
    overall_comment: overallComment(radar, { studentName: input.student.name, themeTitle: input.theme.title }, copy),
    footer_disclaimer: NOTICE_DISCLAIMER,
  }
}
