// 단원 리포트 한 부(UnitReportView)를 서버 렌더로 확인한다 — 설계 2026-09-29 §5.4. 화면 문구(app.classroom.report)의 조사 규칙도 여기서 본다.
import { describe, it, expect, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { buildUnitReport } from '@/lib/classroom/report'
import { applyEdits, editKey, editsFromStored } from '@/lib/classroom/report-edit'
import { COMPETENCIES } from '@/lib/studio/competency'
import { NOTICE_DISCLAIMER } from '@/lib/studio/schemas'
import { UnitReportView } from '@/components/classroom/UnitReportView'
import { app } from '@/content/site'
import { kstDateTime, todayKst } from '@/lib/classroom/notice'
import { fullSubject, snapshotFor, quizRows, gradingFor, student, theme, SIX_AXIS_TAGS } from './fixtures/unit-report'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('@/app/teacher/reports/[themeId]/[studentId]/actions', () => ({ saveReportDraft: vi.fn(), confirmReport: vi.fn(), reopenReport: vi.fn() }))
const { ReportEditor } = await import('@/app/teacher/reports/[themeId]/[studentId]/ReportEditor')

const copy = app.classroom.report
const v = copy.view
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/\s+/g, ' ')
const count = (html: string, needle: string) => html.split(needle).length - 1
const render = (body: ReturnType<typeof buildUnitReport>, draft = false) =>
  renderToStaticMarkup(createElement(UnitReportView, { body, academyName: '다빈치 하늘원', date: '2026-09-29', draft }))
/** 비교·등수 낱말(R-7). */
const COMPARISON = ['등수', '석차', '순위', '평균', '다른 학생', '상위', '하위', '백분위', '반에서']

/** 본문에 있는 종합 코멘트 줄의 열쇠(자리 + 가리키는 것). */
const lineKey = (body: ReturnType<typeof buildUnitReport>, kind: 'attitude' | 'strength' | 'practice' | 'subject') => editKey.overallLine(kind, body.overall_lines!.find((l) => l.kind === kind)!.ref)

const two = buildUnitReport({ student, theme, subjects: [fullSubject('영어', { wrong: ['2-1', '4-3'], drop: 1, tags: SIX_AXIS_TAGS }), fullSubject('수학', { wrong: ['1-2'], tags: SIX_AXIS_TAGS })] }, copy.build)
const FIVE = ['국어', '영어', '수학', '과학', '사회']
const five = buildUnitReport({ student, theme, subjects: FIVE.map((s, i) => fullSubject(s, { variant: s === '과학' ? '과학' : '수학', wrong: [`${i + 1}-1`, `${i + 1}-3`], drop: i % 3, tags: s === '과학' ? undefined : SIX_AXIS_TAGS })) }, copy.build)

describe('UnitReportView — 두 과목', () => {
  const html = render(two)
  const t = text(html)

  it('front page: academy, student, theme, date, radar, six axes, summaries, overall comment, notes', () => {
    const front = html.slice(html.indexOf('data-report-page="front"'), html.indexOf('data-report-page="detail"'))
    const ft = text(front)
    for (const s of ['다빈치 하늘원', v.studentName('김OO'), theme.title, '2026-09-29', v.radarHeading, v.axesHeading, v.summaryHeading, v.overallHeading, v.basisNote, NOTICE_DISCLAIMER]) expect(ft).toContain(s)
    expect(count(front, '<svg')).toBe(1)
    expect(count(front, 'data-series="value"')).toBe(1)
    expect(front).toContain('#f59e0b')                                 // 오렌지색 육각형
    for (const s of two.subjects) expect(ft).toContain(s.summary)
    for (const l of two.overall_lines!) { expect(ft).toContain(l.text); expect(ft).toContain(v.overallLabels[l.kind]) }
    expect(front).not.toContain('data-report-draft')
  })

  it('역량 뜻 표: one row per competency — name, what it means (for parents), points and item count', () => {
    const list = html.slice(html.indexOf('data-report-axes'))
    const axes = list.slice(0, list.indexOf('</table>'))
    expect(html.indexOf('<svg')).toBeLessThan(html.indexOf('data-report-axes'))      // 육각형 바로 아래
    expect(text(html.slice(html.indexOf('</svg>'), html.indexOf('data-report-axes')))).toContain(v.axesHeading)
    expect(v.axesHeading).toBe('역량은 이렇게 봅니다')
    const rows = axes.split('<tr').slice(2)                                            // 머리 줄 다음부터
    expect(rows).toHaveLength(COMPETENCIES.length)
    for (const [i, a] of two.radar.entries()) {
      const cells = rows[i].split(/<t[hd]/).slice(1).map((c) => text(`<x${c}`).trim())
      expect(cells).toHaveLength(3)
      expect(cells[0]).toBe(a.competency)
      expect(cells[1]).toBe(v.meanings[a.competency])
      expect(cells[2]).toContain(a.ratio === null ? v.axisEmpty : v.axisScore(a.earned, a.possible, a.count))
      expect(rows[i]).toMatch(/<th scope="row"[^>]*font-bold/)
    }
    for (const c of COMPETENCIES) expect(v.meanings[c].length).toBeLessThanOrEqual(40)
    expect(text(axes.split('<tr')[1])).toContain(`${v.axesColumns.competency} ${v.axesColumns.meaning} ${v.axesColumns.score}`)
    const sums = html.slice(html.indexOf('data-report-summaries'))
    expect(count(sums.slice(0, sums.indexOf('</ul>')), '<li')).toBe(2)
  })

  it('detail: one block per subject that is not split across pages, with key question, quiz lines and assessment lines', () => {
    expect(count(html, 'data-report-subject=')).toBe(2)
    const blocks = html.split('data-report-subject=').slice(1)
    for (const [i, b] of blocks.entries()) {
      const s = two.subjects[i]
      expect(b.slice(0, 200)).toContain('break-inside-avoid')
      const bt = text(`<x ${b}`)
      expect(bt).toContain(s.key_question)
      expect(bt).toContain(v.quizScore(s.quiz_correct, s.quiz_total))
      expect(count(b, 'data-report-lesson=')).toBe(5)
      for (const a of s.assessment) {
        expect(bt).toContain(v.itemLine(a.kind, a.points, a.max))
        for (const c of a.criteria) expect(bt).toContain(v.criterionLine(c.name, c.points, c.max))
      }
      expect(count(b, 'data-report-criterion')).toBe(s.assessment.reduce((n, a) => n + a.criteria.length, 0))
    }
  })

  it('quiz: a line of marks per lesson, and only the wrong items beneath it with the comment on the next line', () => {
    const eng = html.split('data-report-subject=')[1]
    expect(count(eng, 'data-report-wrong')).toBe(2)
    const lesson2 = eng.split('data-report-lesson=')[2]
    expect(text(`<x ${lesson2}`)).toMatch(new RegExp(`${v.lesson(2)} ${v.markWrong} ${v.markCorrect} ${v.markCorrect}`))
    const wrong = two.subjects[0].quizzes.find((q) => q.lesson_no === 2 && q.quiz_no === 1)!
    // 문제와 코멘트는 서로 다른 <p> — 옆으로 잇지 않는다
    expect(lesson2).toContain(`>${v.wrongQuestion(1, wrong.question).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`)
    expect(text(lesson2)).toContain(wrong.wrong_note!)
    const lesson1 = eng.split('data-report-lesson=')[1]
    expect(lesson1).not.toContain('data-report-wrong')
  })

  it('criterion: name and score on one line, the chosen phrase on the next', () => {
    const c = two.subjects[0].assessment[0].criteria[0]
    expect(c.phrase).toBeTruthy()
    const at = html.indexOf(v.criterionLine(c.name, c.points, c.max))
    const after = html.slice(at, at + 600)
    expect(after.indexOf('</p>')).toBeLessThan(after.indexOf(c.phrase!.slice(0, 8)))
  })

  it('the only table is the competency table, and there is no comparison with other students', () => {
    expect(count(html, '<table')).toBe(1)
    for (const w of COMPARISON) expect(t).not.toContain(w)
  })

  it('draft mark only when asked', () => {
    expect(text(render(two, true))).toContain(v.draftMark)
    expect(render(two, true)).toContain('data-report-draft')
  })

  it('shows edited sentences and drops a removed line', () => {
    const c = two.subjects[0].assessment[0].criteria[0]
    const edited = applyEdits(two, { [lineKey(two, 'strength')]: '원장이 고친 종합 코멘트', [lineKey(two, 'subject')]: '', [editKey.phrase('영어', 1, c.name)]: '', [editKey.summary('수학')]: '' })
    const h = render(edited)
    expect(text(h)).toContain('원장이 고친 종합 코멘트')
    // 비운 줄은 이름표까지 빠진다
    expect([...h.matchAll(/data-report-overall-line="([^"]+)"/g)].map((m) => m[1])).toEqual(['strength', 'practice'])
    expect(text(h)).not.toContain(v.overallLabels.subject)
    // 지운 문구: 그 요소 줄 바로 다음이 다음 요소 줄이다(같은 문구가 다른 요소에 있을 수 있어 자리로 확인한다)
    const next = two.subjects[0].assessment[0].criteria[1]
    const th = text(h)
    const from = th.indexOf(v.criterionLine(c.name, c.points, c.max)) + v.criterionLine(c.name, c.points, c.max).length
    expect(th.slice(from, th.indexOf(v.criterionLine(next.name, next.points, next.max), from)).trim()).toBe('')
    const sums = h.slice(h.indexOf('data-report-summaries'))
    expect(count(sums.slice(0, sums.indexOf('</ul>')), '<li')).toBe(1)
  })
})

describe('UnitReportView — 다섯 과목', () => {
  const html = render(five)
  it('keeps the same structure: one radar, six axes, five summaries, five blocks in order', () => {
    expect(count(html, '<svg')).toBe(1)
    const axes = html.slice(html.indexOf('data-report-axes'))
    expect(count(axes.slice(0, axes.indexOf('</table>')), '<tr')).toBe(1 + 6)
    expect(count(html, 'data-report-overall-line=')).toBeGreaterThanOrEqual(3)
    const sums = html.slice(html.indexOf('data-report-summaries'))
    expect(count(sums.slice(0, sums.indexOf('</ul>')), '<li')).toBe(5)
    expect([...html.matchAll(/data-report-subject="([^"]+)"/g)].map((m) => m[1])).toEqual(FIVE)
    expect(count(html, 'data-report-page="detail"')).toBe(1)
    expect(html.indexOf('data-report-page="front"')).toBeLessThan(html.indexOf('data-report-page="detail"'))
    expect(text(html)).toContain(FIVE.join(' · '))
    for (const w of COMPARISON) expect(text(html)).not.toContain(w)
  })
  it('every subject block carries its own quiz and assessment sections', () => {
    for (const b of html.split('data-report-subject=').slice(1)) {
      expect(text(b)).toContain(v.quizHeading)
      expect(text(b)).toContain(v.assessmentHeading)
      expect(count(b, 'data-report-item=')).toBe(2)
    }
  })
})

describe('UnitReportView — 빠진 것', () => {
  const snap = snapshotFor('수학')
  const body = buildUnitReport({ student, theme, subjects: [{ subject: '수학', key_question: snap.key_question, snapshot: snap, quiz: quizRows([1, 3]).filter((q) => !(q.lesson_no === 3 && q.quiz_no === 2)), finalizedLessons: [1, 3], gradings: [gradingFor(snap, 1)] }] }, copy.build)
  it('says calmly what is not in yet, one line each', () => {
    const html = render(body)
    const note = html.slice(html.indexOf('data-report-missing'))
    const t = text(`<x ${note}`)
    expect(t).toContain(v.missingLessons([2, 4, 5]))
    expect(v.missingLessons([2, 4])).toBe('아직 확인되지 않은 차시: 2차시, 4차시')
    expect(t).toContain(v.missingQuiz([{ lesson_no: 3, quiz_no: 2 }]))
    expect(t).toContain(v.missingItems(['논술형']))
    expect(count(note.slice(0, note.indexOf('</ul>')), '<li')).toBe(3)
  })
  it('nothing at all: still renders, with the calm empty lines and no radar polygon', () => {
    const empty = buildUnitReport({ student, theme, subjects: [{ subject: '수학', key_question: '', snapshot: snap, quiz: [], finalizedLessons: [], gradings: [] }] }, copy.build)
    const html = render(empty, true)
    const t = text(html)
    expect(t).toContain(v.quizNone); expect(t).toContain(v.assessmentNone)
    expect(html).not.toContain('data-series="value"')
    expect(count(html, '<svg')).toBe(1)
    expect(count(t, v.axisEmpty)).toBe(COMPETENCIES.length)
    // 기록이 없어도 종합 코멘트는 두 줄(중립 문장 + 기록이 채워진다는 안내)
    expect(count(html, 'data-report-overall-line=')).toBe(2)
  })
  it('no full report without a missing note', () => {
    expect(render(two)).not.toContain('data-report-missing')
  })
})

describe('ReportEditor — 원장 화면', () => {
  const base = { themeId: 't', studentId: 's', academyName: '다빈치 하늘원', today: '2026-09-29', subjects: ['영어', '수학'], fresh: two, reportsAvailable: true }
  const renderEditor = (p: Partial<Parameters<typeof ReportEditor>[0]> = {}) => renderToStaticMarkup(createElement(ReportEditor, { ...base, stored: null, initialEdits: {}, stale: false, ...p }))

  it('nothing stored: subject checkboxes all checked, preview with the draft mark, editors, and every button enabled', () => {
    const html = renderEditor()
    const t = text(html)
    // 과목 체크 2개 + 수업 모습 낱말 6개(처음에는 아무것도 고르지 않았다)
    expect(count(html, 'type="checkbox"')).toBe(2 + 6)
    expect(count(html, 'checked=""')).toBe(2)
    for (const s of [copy.page.subjectsHeading, copy.page.saveDraft, copy.page.confirm, copy.page.print, copy.edit.heading, copy.edit.overallLine.strength, copy.edit.overallLine.practice, copy.edit.overallLine.subject, copy.edit.summary('영어')]) expect(t).toContain(s)
    expect(t).not.toContain(copy.edit.overallLine.attitude)
    expect(html).toContain('data-report-draft')
    expect(html).not.toContain('disabled=""')
    expect(t).not.toContain(copy.page.reload)
  })
  it('editors are text areas for sentences only — no number input', () => {
    const html = renderEditor()
    expect(html).not.toContain('type="number"')
    const wrongCount = two.subjects.reduce((n, s) => n + s.quizzes.filter((q) => !q.correct).length, 0)
    const criteria = two.subjects.reduce((n, s) => n + s.assessment.reduce((k, a) => k + a.criteria.length, 0), 0)
    expect(count(html, '<textarea')).toBe(two.overall_lines!.length + two.subjects.length + wrongCount + criteria)
    // 라벨은 칸 위(라벨이 먼저, 칸이 다음)
    const first = html.slice(html.indexOf(copy.edit.heading))
    expect(first.indexOf('<label')).toBeLessThan(first.indexOf('<textarea'))
  })
  it('controls are hidden on paper; the report itself is not', () => {
    const html = renderEditor()
    const report = html.indexOf('data-unit-report')
    const before = html.slice(0, report)
    expect(before).toContain('no-print')
    expect(html.slice(html.indexOf(copy.edit.heading) - 400, html.indexOf(copy.edit.heading))).toContain('no-print')
    expect(html.slice(report - 200, report)).not.toContain('no-print')
  })
  it('stored draft whose numbers changed: shows the stored body, the reload button, and rests save/confirm until the numbers are seen', () => {
    const storedBase = buildUnitReport({ student, theme, subjects: [fullSubject('영어', { wrong: ['2-1'], drop: 1, tags: SIX_AXIS_TAGS }), fullSubject('수학', { wrong: ['1-2'], tags: SIX_AXIS_TAGS })] }, copy.build)
    const stored = applyEdits(storedBase, { [lineKey(storedBase, 'subject')]: '원장이 쓴 종합' })
    const html = renderEditor({ stored: { status: 'draft', body: stored, confirmedAt: null }, initialEdits: editsFromStored(stored, two, copy.build), stale: true })
    const t = text(html)
    expect(t).toContain(copy.page.stale); expect(t).toContain(copy.page.reload)
    expect(t).toContain(stored.subjects[0].summary)                   // 저장해 둔 숫자
    expect(t).toContain('원장이 쓴 종합')
    // 원장이 보지 않은 숫자가 저장되지 않게: [초안 저장]·[확정]만 쉬고, 순서를 알려 주는 한 줄이 있다. 나머지는 그대로 누를 수 있다
    expect(t).toContain(copy.page.staleFirst)
    expect(copy.page.staleFirst).toContain(`[${copy.page.reload}]`)
    const buttons = [...html.matchAll(/<button[^>]*>([^<]*)<\/button>/g)].map((m) => [m[1], m[0].includes('disabled=""')])
    expect(buttons.filter(([, off]) => off).map(([label]) => label)).toEqual([copy.page.saveDraft, copy.page.confirm])
    expect(buttons.filter(([label]) => label === copy.page.reload || label === copy.page.print).map(([, off]) => off)).toEqual([false, false])
  })
  it('stored draft whose numbers did not change: nothing rests', () => {
    const html = renderEditor({ stored: { status: 'draft', body: two, confirmedAt: null }, initialEdits: {}, stale: false })
    expect(html).not.toContain('disabled=""')
    expect(text(html)).not.toContain(copy.page.staleFirst)
  })
  it('confirmed: no checkboxes and no editors, only reopen and print, and no draft mark', () => {
    const html = renderEditor({ stored: { status: 'confirmed', body: two, confirmedAt: kstDateTime('2026-09-28T03:00:00.000Z') }, initialEdits: {} })
    const t = text(html)
    expect(html).not.toContain('type="checkbox"'); expect(html).not.toContain('<textarea')
    expect(t).toContain(copy.page.reopen); expect(t).toContain(copy.page.print)
    expect(t).not.toContain(copy.page.saveDraft)
    expect(html).not.toContain('data-report-draft')
    expect(t).toContain(`${v.date} 2026-09-28`)
  })
  it('confirmed late in the evening (UTC): the date on the report is the Seoul date', () => {
    // 2026-09-28 16:30 UTC = 서울 2026-09-29 01:30
    expect(kstDateTime('2026-09-28T16:30:00.000Z')).toBe('2026-09-29 01:30')
    expect(kstDateTime('2026-09-28T16:30:00+00:00')).toBe('2026-09-29 01:30')
    expect(kstDateTime('2026-09-28T03:00:00.000Z')).toBe('2026-09-28 12:00')
    expect(kstDateTime('모름')).toBe('')
    expect(todayKst(new Date('2026-09-28T16:30:00.000Z'))).toBe('2026-09-29')
    const html = renderEditor({ stored: { status: 'confirmed', body: two, confirmedAt: kstDateTime('2026-09-28T16:30:00.000Z') }, initialEdits: {} })
    expect(text(html)).toContain(`${v.date} 2026-09-29`)
    expect(text(html)).not.toContain('2026-09-28')
  })
  it('migration 0014 not applied: a calm note, preview and print still there', () => {
    const t = text(renderEditor({ reportsAvailable: false }))
    expect(t).toContain(copy.page.reportsUnavailable); expect(t).toContain(copy.page.print); expect(t).toContain(v.radarHeading)
  })
})

describe('화면 문구 — 조사·비교 낱말', () => {
  const sources: string[] = []
  const walk = (node: unknown) => {
    if (typeof node === 'string') sources.push(node)
    else if (typeof node === 'function') sources.push(String(node))
    else if (Array.isArray(node)) node.forEach(walk)
    else if (node && typeof node === 'object') Object.values(node).forEach(walk)
  }
  walk(copy)

  it('collected the templates', () => {
    expect(sources.length).toBeGreaterThan(60)
    expect(sources.some((s) => s.includes('a.strong'))).toBe(true)
  })
  it('no "이(가)" style particle anywhere', () => {
    const paired = /(이\(가\)|\(이\)가|을\(를\)|\(을\)를|은\(는\)|\(은\)는|와\(과\)|과\(와\)|\(으\)로|으로\(로\)|\(이\)|이\/가|을\/를|은\/는|와\/과)/
    for (const s of sources) expect(s, s).not.toMatch(paired)
  })
  it('a placeholder is never followed directly by a particle that depends on the final consonant', () => {
    // ${…} 또는 」 바로 뒤에 이/가/을/를/은/는/와/과/으로/로 가 붙으면 받침에 따라 틀릴 수 있다
    const risky = /(\$\{[^}]+\}|」)(이|가|을|를|은|는|와|과|으로|로)(?=[\s,.]|$)/
    for (const s of sources) expect(s, s).not.toMatch(risky)
  })
  it('built sentences read naturally for names with and without a final consonant', () => {
    const b = copy.build
    for (const name of ['김하늘', '이바다']) for (const strong of COMPETENCIES) {
      const s = b.overall.strongAndWeak({ studentName: name, strong, weak: '글로 표현하기' })
      expect(s).toContain(`「${strong}」 역량이`); expect(s).toContain('「글로 표현하기」 역량은'); expect(s).toContain(`${name} 학생은`)
    }
    expect(b.subjectSummary.quizAndAssessment({ subject: '수학', quizCorrect: 12, quizTotal: 15, assessmentPoints: 18, assessmentMax: 22 })).toBe('수학 — 퀴즈 15문항 중 12문항 정답, 평가 문항 22점 중 18점')
  })
  it('no comparison words in the copy', () => {
    for (const s of sources) for (const w of COMPARISON) expect(s, s).not.toContain(w)
  })
  it('print rules: A4, the detail starts a new page, colours are kept', () => {
    const css = readFileSync('app/globals.css', 'utf8')
    expect(css).toMatch(/@page unit-report \{[^}]*size: A4/)
    expect(css).toMatch(/\[data-report-page="detail"\] \{[^}]*break-before: page/)
    expect(css).toMatch(/\[data-unit-report\] \{[^}]*print-color-adjust: exact/)
  })
  it('print rules: the radar shrinks on paper and the draft mark repeats on every page', () => {
    const css = readFileSync('app/globals.css', 'utf8')
    expect(css).toMatch(/\[data-unit-report\] svg \{[^}]*max-width: \d+mm !important/)
    expect(css).toMatch(/\[data-unit-report\] \[data-report-draft\] \{[^}]*position: fixed/)
  })
  it('the teacher menu has the report entry', () => {
    expect(app.nav.teacher.map((n) => n.href)).toContain('/teacher/reports')
  })
})
