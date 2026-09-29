import { buildRadar, overallComment, overallLines, rebuildOverall, joinOverall, type UnitReportCopy, type UnitReportBody, type ReportSubject, type OverallLine } from './report'
import { ReportAttitude, type OverallLineKind } from './report-schema'
import type { Competency } from '@/lib/studio/competency'

/**
 * 단원 리포트의 「문장 고치기」·과목 고르기·점수 다시 불러오기(순수 함수 — 서버·클라이언트·테스트 어디서나 부른다).
 * 설계: docs/superpowers/specs/2026-09-29-unit-report-design.md §5.4, R-4·R-8
 *
 * 원칙: 숫자(점수·정오·문항 수)는 언제나 서버가 DB 에서 다시 만든 본문에서 오고, 화면에서 오는 것은 "고친 문장"뿐이다.
 * 고친 문장은 자리 번호가 아니라 뜻이 있는 열쇠로 찾는다 — 과목 + 차시·퀴즈 번호, 과목 + 문항 번호 + 요소 이름,
 * 종합 코멘트는 줄의 자리(kind) + 그 줄이 가리키는 것(ref: 역량·과목·요소, 수업 태도는 고른 낱말).
 * 수업 태도 낱말(열쇠)은 숫자가 아니다 — reportDataKey 에 들어가지 않으므로 낱말을 골라도 "점수가 바뀌었다"로 보지 않는다.
 */

/** 고친 문장 묶음: 열쇠 → 문장. 열쇠가 없으면 기본 문장, 빈 문장이면 그 줄을 뺀다. */
export type ReportEdits = Record<string, string>

export const MAX_SENTENCE = 400
const SEP = '|'

export const editKey = {
  /** 종합 코멘트 한 줄. 가리키는 것(ref)이 바뀌면 열쇠도 달라져, 옛 문장이 다른 역량·요소의 줄에 덮이지 않는다. */
  overallLine: (kind: OverallLineKind, ref: string) => ['overall', kind, ref].join(SEP),
  summary: (subject: string) => ['summary', subject].join(SEP),
  quiz: (subject: string, lessonNo: number, quizNo: number) => ['quiz', subject, lessonNo, quizNo].join(SEP),
  phrase: (subject: string, itemNo: number, criterionName: string) => ['phrase', subject, itemNo, criterionName].join(SEP),
}

type Tally = { competency: Competency; earned: number; possible: number }

/** 본문에 적힌 점수로 육각형 재료를 다시 만든다(퀴즈 1문항 = 1점, 채점 요소 = 그 요소의 max — buildUnitReport 와 같다). */
export function talliesOf(subjects: ReportSubject[]): Tally[] {
  return subjects.flatMap((s) => [
    ...s.quizzes.map((q) => ({ competency: q.competency, earned: q.correct ? 1 : 0, possible: 1 })),
    ...s.assessment.flatMap((a) => a.criteria.map((c) => ({ competency: c.competency, earned: c.points, possible: c.max }))),
  ])
}

/** 과목 한 줄 요약의 기본 문장(있는 자료에 따라 넷 중 하나 — buildUnitReport 와 같은 규칙). */
export function defaultSummary(s: ReportSubject, copy: UnitReportCopy): string {
  const args = { subject: s.subject, quizCorrect: s.quiz_correct, quizTotal: s.quiz_total, assessmentPoints: s.assessment_points, assessmentMax: s.assessment_max }
  const t = copy.subjectSummary
  return s.quizzes.length && s.assessment.length ? t.quizAndAssessment(args)
    : s.quizzes.length ? t.quizOnly(args)
    : s.assessment.length ? t.assessmentOnly(args)
    : t.none(args)
}

/** 종합 코멘트의 기본 줄들(본문의 점수·문구·수업 태도 낱말로). */
export function defaultOverallLines(body: UnitReportBody, copy: UnitReportCopy): OverallLine[] {
  return overallLines({ ...body, attitude: body.attitude ?? null }, copy)
}

/** 옛 본문(overall_lines 가 없는, 한 문장짜리 종합 코멘트)의 기본 문장. */
export function legacyOverall(body: UnitReportBody, copy: UnitReportCopy): string {
  return overallComment(body.radar, { studentName: body.student_name, themeTitle: body.theme_title }, copy)
}

/**
 * 화면·서버에서 온 수업 태도 낱말을 확인한다. 없음(null·undefined)과 하나도 고르지 않은 것은 null.
 * 허용 목록에 없는 열쇠, 수업 모습 3개 이상, 같은 낱말 두 번, 모르는 칸은 모두 통과하지 못한다.
 */
export function parseAttitude(raw: unknown): { ok: true; attitude: ReportAttitude | null } | { ok: false } {
  if (raw === null || raw === undefined) return { ok: true, attitude: null }
  const parsed = ReportAttitude.safeParse(raw)
  if (!parsed.success) return { ok: false }
  const a = parsed.data
  return { ok: true, attitude: a.participation || a.closing || a.traits.length ? a : null }
}

/**
 * 넣을 과목만 남긴다(R-4). 육각형과 종합 코멘트는 남은 과목으로 다시 계산한다 — buildUnitReport 의 includeSubjects 와 같은 결과.
 * 본문에 없는 과목 이름은 무시한다. 종합 코멘트는 기본 문장으로 돌아간다(고친 문장은 applyEdits 가 다시 덮는다).
 * 수업 태도 낱말은 본문의 것을 그대로 쓴다.
 */
export function restrictReport(body: UnitReportBody, subjects: string[], copy: UnitReportCopy): UnitReportBody {
  const kept = body.subjects.filter((s) => subjects.includes(s.subject))
  const radar = buildRadar(talliesOf(kept))
  return rebuildOverall({ ...body, included_subjects: kept.map((s) => s.subject), subjects: kept, radar }, copy)
}

const clean = (v: string) => v.trim().slice(0, MAX_SENTENCE)
const has = (edits: ReportEdits, key: string) => Object.prototype.hasOwnProperty.call(edits, key) && typeof edits[key] === 'string'

/**
 * 고친 문장을 본문에 덮는다. 본문에 그 자리가 있을 때만 — 없는 열쇠는 버린다. 숫자·정오·역량·이름은 건드리지 않는다.
 * 맞은 퀴즈에는 코멘트를 달지 않는다(wrong_note 는 틀린 문항에만).
 * 종합 코멘트는 줄마다 — 자리와 가리키는 것이 같은 줄에만 덮는다. 비운 줄은 글이 빈 채로 남고 리포트에는 나오지 않는다.
 */
export function applyEdits(body: UnitReportBody, edits: ReportEdits): UnitReportBody {
  const nullable = (key: string, fallback: string | null) => (has(edits, key) ? clean(edits[key]) || null : fallback)
  const plain = (key: string, fallback: string) => (has(edits, key) ? clean(edits[key]) : fallback)
  const lines = body.overall_lines?.map((l) => ({ ...l, text: plain(editKey.overallLine(l.kind, l.ref), l.text) }))
  return {
    ...body,
    ...(lines ? { overall_lines: lines, overall_comment: joinOverall(lines) } : {}),
    subjects: body.subjects.map((s) => ({
      ...s,
      summary: plain(editKey.summary(s.subject), s.summary),
      quizzes: s.quizzes.map((q) => (q.correct ? q : { ...q, wrong_note: nullable(editKey.quiz(s.subject, q.lesson_no, q.quiz_no), q.wrong_note) })),
      assessment: s.assessment.map((a) => ({
        ...a,
        criteria: a.criteria.map((c) => ({ ...c, phrase: nullable(editKey.phrase(s.subject, a.item_no, c.name), c.phrase) })),
      })),
    })),
  }
}

/**
 * 숫자만 모은 비교 열쇠(문장·날짜는 뺀다). 저장한 뒤 점수·O/X·빠진 것이 바뀌었는지 볼 때 쓴다(안내장의 noticeDataKey 와 같은 방식).
 */
export function reportDataKey(body: UnitReportBody): string {
  return JSON.stringify(body.subjects.map((s) => [
    s.subject,
    s.quizzes.map((q) => [q.lesson_no, q.quiz_no, q.correct]),
    s.assessment.map((a) => [a.item_no, a.criteria.map((c) => [c.name, c.points, c.max])]),
    s.missing.lessons,
    s.missing.quiz_answers.map((m) => [m.lesson_no, m.quiz_no]),
    s.missing.items.map((m) => m.item_no),
  ]))
}

/**
 * 저장된 본문에서 "원장이 고친 문장"만 골라낸다. fresh 는 지금 DB 로 새로 만든 본문(모든 과목).
 * - 과목 요약: 저장된 숫자로 만든 기본 문장과 다르면 고친 것(숫자가 바뀌어도 고친 문장은 남는다).
 *   기본 문장 그대로였다면 고친 것이 아니므로 새 숫자의 기본 문장이 쓰인다.
 * - 종합 코멘트: 줄마다 — 저장된 본문으로 만든 기본 줄과 다르면 고친 것. 열쇠에 그 줄이 가리키는 역량·과목·요소가 들어 있어,
 *   지금 기록의 줄이 같은 것을 가리킬 때만 다시 덮인다(가리키는 것이 바뀌었으면 새 기본 문장). 수업 태도 줄은 고른 낱말이
 *   본문에 함께 저장되므로 늘 남는다.
 * - 옛 본문(한 문장짜리 종합 코멘트)에서 고친 문장은 「잘한 점」 자리로 옮긴다(원장이 쓴 글을 잃지 않게).
 * - 퀴즈 코멘트: 그 문항이 지금도 있고 지금도 틀린 문항일 때, 기본 코멘트와 다르면 고친 것.
 * - 요소 문구: 그 요소가 지금도 있고 잘한 점/보완할 점 쪽이 그대로일 때, 기본 문구와 다르면 고친 것
 *   (점수가 바뀌어 쪽이 뒤집혔으면 옛 문장을 버리고 새 기본 문구를 쓴다).
 */
export function editsFromStored(stored: UnitReportBody, fresh: UnitReportBody, copy: UnitReportCopy): ReportEdits {
  const edits: ReportEdits = {}
  if (stored.overall_lines) {
    const defaults = defaultOverallLines(stored, copy)
    for (const l of stored.overall_lines) {
      const d = defaults.find((x) => x.kind === l.kind && x.ref === l.ref)
      if (!d || d.text !== l.text) edits[editKey.overallLine(l.kind, l.ref)] = l.text
    }
  } else if (stored.overall_comment !== legacyOverall(stored, copy)) {
    const now = restrictReport(fresh, stored.included_subjects, copy).overall_lines?.find((l) => l.kind === 'strength')
    if (now) edits[editKey.overallLine('strength', now.ref)] = stored.overall_comment
  }
  for (const s of stored.subjects) {
    const now = fresh.subjects.find((x) => x.subject === s.subject)
    if (!now) continue
    if (s.summary !== defaultSummary(s, copy)) edits[editKey.summary(s.subject)] = s.summary
    for (const q of s.quizzes) {
      if (q.correct) continue
      const cur = now.quizzes.find((x) => x.lesson_no === q.lesson_no && x.quiz_no === q.quiz_no)
      if (cur && !cur.correct && (q.wrong_note ?? '') !== (cur.wrong_note ?? '')) edits[editKey.quiz(s.subject, q.lesson_no, q.quiz_no)] = q.wrong_note ?? ''
    }
    for (const a of s.assessment) {
      const item = now.assessment.find((x) => x.item_no === a.item_no)
      if (!item) continue
      for (const c of a.criteria) {
        const cur = item.criteria.find((x) => x.name === c.name)
        if (cur && cur.phrase_kind === c.phrase_kind && (c.phrase ?? '') !== (cur.phrase ?? '')) edits[editKey.phrase(s.subject, a.item_no, c.name)] = c.phrase ?? ''
      }
    }
  }
  return edits
}

/** 화면에서 온 고친 문장 묶음을 걸러 낸다(문자열만, 길이 제한, 개수 제한). 모양이 아니면 빈 묶음. */
export function sanitizeEdits(raw: unknown): ReportEdits {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out: ReportEdits = {}
  for (const [k, v] of Object.entries(raw as Record<string, unknown>).slice(0, 500)) {
    if (typeof v === 'string' && k.length <= 300) out[k] = clean(v)
  }
  return out
}
