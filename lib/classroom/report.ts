import type { SnapshotV2 } from '@/lib/studio/compat'
import { NOTICE_DISCLAIMER } from '@/lib/studio/schemas'
import { COMPETENCIES, competencyOf, type Competency } from '@/lib/studio/competency'
import type {
  UnitReportBody, ReportSubject, ReportQuiz, ReportAssessmentItem, ReportCriterion, ReportMissing, RadarAxis,
  ReportAttitude, OverallLine, AttitudeParticipation, AttitudeTrait, AttitudeClosing,
} from './report-schema'

export type { UnitReportBody, ReportSubject, ReportQuiz, ReportAssessmentItem, ReportCriterion, ReportMissing, RadarAxis, ReportAttitude, OverallLine }

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
/** 종합 코멘트의 근거 하나: 채점 요소(과목·문항 종류·요소 이름·점수) 또는 한 과목의 퀴즈 묶음(그 역량의 문항 수·정답 수). */
export type ReportEvidence =
  | { kind: 'criterion'; subject: string; itemKind: ReportAssessmentItem['kind']; name: string; points: number; max: number }
  | { kind: 'quiz'; subject: string; correct: number; total: number }
/** 수업 태도 낱말을 모두 고른 것(참여 + 수업 모습 1~2개 + 마무리). */
export type CompleteAttitude = { participation: AttitudeParticipation; traits: AttitudeTrait[]; closing: AttitudeClosing }

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
    /** 옛 본문(한 문장짜리 종합 코멘트)의 기본 문장 — 저장된 옛 초안에서 고친 문장을 알아볼 때만 쓴다. */
    strongAndWeak: (a: ReportOverallArgs & { strong: Competency; weak: Competency }) => string
    /** 자료가 있는 축의 비율이 모두 같을 때(높고 낮음을 가를 수 없다). */
    even: (a: ReportOverallArgs) => string
    /** 자료가 있는 축이 2개 미만일 때의 중립 문장. */
    neutral: (a: ReportOverallArgs) => string
    /** 첫 줄(수업 태도): 원장이 고른 낱말로 완성하는 문장. */
    attitude: (a: ReportOverallArgs & CompleteAttitude) => string
    /** 잘한 점: 가장 높은 축 + 근거. */
    strength: (a: ReportOverallArgs & { axis: Competency; evidence: ReportEvidence }) => string
    /** 더 연습할 점: 가장 낮은 축 + 근거 + 다음 할 일(action 이 null 이면 틀이 일반 문장을 쓴다). */
    practice: (a: ReportOverallArgs & { axis: Competency; evidence: ReportEvidence; action: string | null }) => string
    /** 과목 한마디: 기록이 가장 좋은 과목과(과목이 둘 이상이고 차이가 있으면) 다음에 힘을 실을 과목. 학생 자신의 기록만 말한다. */
    subject: (a: ReportOverallArgs & { best: string; focus: string | null }) => string
    /** 과목이 둘 이상인데 비율이 모두 같을 때. */
    subjectEven: (a: ReportOverallArgs) => string
    /** 기록이 있는 과목이 하나도 없을 때. */
    pending: (a: ReportOverallArgs) => string
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
  /** 원장이 고른 수업 태도 낱말(열쇠). 없거나 덜 골랐으면 종합 코멘트의 첫 줄이 빠진다. */
  attitude?: ReportAttitude | null
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
      const bank = phrases.find((p) => p.criterion_name === c.name)
      const chosen = choosePhrase(bank, points / max, seq, c.name)
      tallies.push({ competency, earned: points, possible: max })
      return { name: c.name, points, max, competency, phrase_kind: chosen.kind, phrase: chosen.text, improve_tip: choosePhrase(bank, 0, seq, c.name).text }
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
      home_study: plans
        .filter((p) => typeof p.home_study_suggestion === 'string' && p.home_study_suggestion.trim())
        .map((p) => ({ lesson_no: p.lesson_no, text: p.home_study_suggestion })),
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
type AxisPick = { kind: 'neutral' } | { kind: 'even' } | { kind: 'pair'; strong: RadarAxis; weak: RadarAxis }
function pickAxes(radar: RadarAxis[]): AxisPick {
  const withData = radar.filter((a): a is RadarAxis & { ratio: number } => a.ratio !== null)
  if (withData.length < 2) return { kind: 'neutral' }
  const solid = withData.filter((a) => !a.sparse)
  const pool = solid.length >= 2 ? solid : withData
  let strong = pool[0]; let weak = pool[0]
  for (const a of pool) {
    if (a.ratio > strong.ratio) strong = a
    if (a.ratio <= weak.ratio) weak = a
  }
  if (strong.ratio === weak.ratio) return { kind: 'even' }
  return { kind: 'pair', strong, weak }
}

/** 옛 본문의 한 문장짜리 종합 코멘트(2026-09-29 판). 새 본문은 overallLines 가 줄마다 만든다. */
export function overallComment(radar: RadarAxis[], who: ReportOverallArgs, copy: UnitReportCopy): string {
  const pick = pickAxes(radar)
  if (pick.kind === 'neutral') return copy.overall.neutral(who)
  if (pick.kind === 'even') return copy.overall.even(who)
  return copy.overall.strongAndWeak({ ...who, strong: pick.strong.competency, weak: pick.weak.competency })
}

/** 셋을 모두 골랐을 때만 문장이 된다(참여 + 수업 모습 1개 이상 + 마무리). */
export function completeAttitude(a: ReportAttitude | null | undefined): CompleteAttitude | null {
  if (!a || !a.participation || !a.closing || a.traits.length === 0) return null
  return { participation: a.participation, traits: a.traits, closing: a.closing }
}

type Candidate = { evidence: ReportEvidence; ratio: number; size: number; ref: string; tip: string | null; lessonNo: number | null }

/** 한 축의 근거 후보: 그 축의 채점 요소 하나하나와, 과목마다 그 축의 퀴즈 묶음. */
function candidatesOf(subjects: ReportSubject[], axis: Competency): Candidate[] {
  const out: Candidate[] = []
  for (const s of subjects) {
    for (const a of s.assessment) {
      for (const c of a.criteria) {
        if (c.competency !== axis) continue
        out.push({
          evidence: { kind: 'criterion', subject: s.subject, itemKind: a.kind, name: c.name, points: c.points, max: c.max },
          ratio: c.points / c.max, size: c.max, ref: [s.subject, a.item_no, c.name].join('|'), tip: c.improve_tip ?? null, lessonNo: a.lesson_no,
        })
      }
    }
  }
  for (const s of subjects) {
    const mine = s.quizzes.filter((q) => q.competency === axis)
    if (!mine.length) continue
    const correct = mine.filter((q) => q.correct).length
    out.push({
      evidence: { kind: 'quiz', subject: s.subject, correct, total: mine.length },
      ratio: correct / mine.length, size: mine.length, ref: [s.subject, 'quiz'].join('|'), tip: null, lessonNo: mine.find((q) => !q.correct)?.lesson_no ?? null,
    })
  }
  return out
}

/**
 * 후보 가운데 가장 높은(또는 낮은) 것. 비율이 같으면 채점 요소가 퀴즈 묶음보다 먼저이고(요소 이름이 더 구체적인 근거다),
 * 같은 종류끼리는 배점·문항 수가 큰 것, 그것도 같으면 앞의 것.
 */
function pickCandidate(list: Candidate[], want: 'high' | 'low'): Candidate | null {
  let best: Candidate | null = null
  for (const c of list) {
    if (!best) { best = c; continue }
    const better = want === 'high' ? c.ratio > best.ratio : c.ratio < best.ratio
    if (better || (c.ratio === best.ratio && c.evidence.kind === best.evidence.kind && c.size > best.size)) best = c
  }
  return best
}

const subjectRatio = (s: ReportSubject): number | null => {
  const possible = s.quiz_total + s.assessment_max
  return possible > 0 ? (s.quiz_correct + s.assessment_points) / possible : null
}

type BodyForOverall = Pick<UnitReportBody, 'student_name' | 'theme_title' | 'subjects' | 'radar' | 'attitude'>

/**
 * 종합 코멘트의 줄들(위에서 아래로): 수업 태도(낱말을 모두 골랐을 때만) → 잘한 점 → 더 연습할 점 → 과목 한마디.
 * 본문에 적힌 것(점수·문구·낱말 열쇠)만으로 만든다 — 같은 본문이면 늘 같은 줄이 나온다(서버·화면 어디서나). AI 를 부르지 않는다(R-8).
 * 높고 낮음을 가를 수 없으면(비율이 모두 같거나 자료 있는 축이 2개 미만) 「잘한 점」 자리에 고른/중립 문장 한 줄을 두고
 * 「더 연습할 점」 줄은 없다. 그래도 만든 줄은 늘 2개 이상이다(수업 태도 줄까지 3줄 이상).
 * 과목 한마디는 이 학생의 과목끼리만 견준다 — 다른 학생과의 비교는 없다(R-7).
 */
export function overallLines(body: BodyForOverall, copy: UnitReportCopy): OverallLine[] {
  const who: ReportOverallArgs = { studentName: body.student_name, themeTitle: body.theme_title }
  const t = copy.overall
  const lines: OverallLine[] = []

  const attitude = completeAttitude(body.attitude)
  if (attitude) lines.push({ kind: 'attitude', ref: [attitude.participation, attitude.traits.join(','), attitude.closing].join('/'), text: t.attitude({ ...who, ...attitude }) })

  const pick = pickAxes(body.radar)
  const strong = pick.kind === 'pair' ? pickCandidate(candidatesOf(body.subjects, pick.strong.competency), 'high') : null
  const weak = pick.kind === 'pair' ? pickCandidate(candidatesOf(body.subjects, pick.weak.competency), 'low') : null
  if (pick.kind === 'pair' && strong && weak) {
    lines.push({ kind: 'strength', ref: [pick.strong.competency, strong.ref].join('|'), text: t.strength({ ...who, axis: pick.strong.competency, evidence: strong.evidence }) })
    const subject = body.subjects.find((s) => s.subject === weak.evidence.subject)
    const home = weak.lessonNo === null ? null : subject?.home_study?.find((h) => h.lesson_no === weak.lessonNo)?.text ?? null
    lines.push({ kind: 'practice', ref: [pick.weak.competency, weak.ref].join('|'), text: t.practice({ ...who, axis: pick.weak.competency, evidence: weak.evidence, action: weak.tip ?? home }) })
  } else {
    const even = pick.kind !== 'neutral'
    lines.push({ kind: 'strength', ref: even ? 'even' : 'neutral', text: even ? t.even(who) : t.neutral(who) })
  }

  const ranked = body.subjects.map((s) => ({ subject: s.subject, ratio: subjectRatio(s) })).filter((s): s is { subject: string; ratio: number } => s.ratio !== null)
  if (ranked.length === 0) {
    lines.push({ kind: 'subject', ref: 'pending', text: t.pending(who) })
  } else {
    let best = ranked[0]; let focus = ranked[0]
    for (const s of ranked) {
      if (s.ratio > best.ratio) best = s
      if (s.ratio <= focus.ratio) focus = s
    }
    if (ranked.length >= 2 && best.ratio === focus.ratio) {
      lines.push({ kind: 'subject', ref: 'even', text: t.subjectEven(who) })
    } else {
      const next = ranked.length >= 2 ? focus.subject : null
      lines.push({ kind: 'subject', ref: [best.subject, next ?? ''].join('>'), text: t.subject({ ...who, best: best.subject, focus: next }) })
    }
  }
  return lines
}

/** 줄들을 이은 글(overall_comment). 빈 줄은 뺀다. */
export const joinOverall = (lines: OverallLine[]): string => lines.map((l) => l.text).filter((x) => x.trim()).join('\n')

/** 본문의 과목·육각형·수업 태도 낱말로 종합 코멘트를 기본 문장으로 다시 만든다. */
export function rebuildOverall(body: UnitReportBody, copy: UnitReportCopy): UnitReportBody {
  const attitude = body.attitude ?? null
  const overall_lines = overallLines({ ...body, attitude }, copy)
  return { ...body, attitude, overall_lines, overall_comment: joinOverall(overall_lines) }
}

export function buildUnitReport(input: UnitReportInput, copy: UnitReportCopy): UnitReportBody {
  const chosen = input.includeSubjects
  const included = chosen ? input.subjects.filter((s) => chosen.includes(s.subject)) : input.subjects
  const built = included.map((s) => buildSubject(s, input.student.seq, copy))
  const radar = buildRadar(built.flatMap((b) => b.tallies))
  return rebuildOverall({
    student_name: input.student.name,
    theme_title: input.theme.title,
    included_subjects: included.map((s) => s.subject),
    subjects: built.map((b) => b.subject),
    radar,
    overall_comment: '',
    attitude: input.attitude ?? null,
    footer_disclaimer: NOTICE_DISCLAIMER,
  }, copy)
}
