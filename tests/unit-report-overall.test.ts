// 단원 리포트 — 역량 뜻 표와 줄마다 쓰는 종합 코멘트(수업 태도 · 잘한 점 · 더 연습할 점 · 과목 한마디). 대표 요청 2026-09-30.
import { describe, it, expect, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { buildUnitReport, overallLines, rebuildOverall, completeAttitude, type UnitReportBody } from '@/lib/classroom/report'
import {
  UnitReportBody as BodySchema, ReportAttitude, ATTITUDE_PARTICIPATION, ATTITUDE_TRAITS, ATTITUDE_CLOSING, MAX_ATTITUDE_TRAITS,
  type AttitudeTrait, type OverallLineKind,
} from '@/lib/classroom/report-schema'
import { applyEdits, editsFromStored, editKey, parseAttitude, reportDataKey, restrictReport, legacyOverall, MAX_SENTENCE } from '@/lib/classroom/report-edit'
import { COMPETENCIES } from '@/lib/studio/competency'
import { UnitReportView } from '@/components/classroom/UnitReportView'
import { app } from '@/content/site'
import { reportCopy, fullSubject, snapshotFor, quizRows, gradingFor, student, theme, SIX_AXIS_TAGS, TEACHING_LESSONS } from './fixtures/unit-report'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('@/app/teacher/reports/[themeId]/[studentId]/actions', () => ({ saveReportDraft: vi.fn(), confirmReport: vi.fn(), reopenReport: vi.fn() }))
const { ReportEditor } = await import('@/app/teacher/reports/[themeId]/[studentId]/ReportEditor')

const copy = app.classroom.report
const build = copy.build
const o = build.overall
const v = copy.view
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/\s+/g, ' ')
const count = (html: string, needle: string) => html.split(needle).length - 1
const line = (body: UnitReportBody, kind: OverallLineKind) => body.overall_lines?.find((l) => l.kind === kind)
const keyOf = (body: UnitReportBody, kind: OverallLineKind) => editKey.overallLine(kind, line(body, kind)!.ref)
const picked = { participation: 'active', traits: ['asks', 'listens'], closing: 'expect' } satisfies ReportAttitude
const who = { studentName: '김OO', themeTitle: theme.title }

/** 판정하는 말·비교하는 말(쓰지 않는다). */
const FORBIDDEN = ['못한다', '못했', '못하', '실패', '부족', '등수', '석차', '순위', '평균', '다른 학생', '상위', '하위', '백분위', '반에서', '뒤처']

describe('수업 태도 문장 — 낱말만 골라 완성(조사)', () => {
  const NAMES = ['김하늘', '이바다', '김다빈', '박서우']   // 받침 있는 이름·없는 이름

  it('the word lists are the ones the owner gave, in order', () => {
    expect(ATTITUDE_PARTICIPATION.map((k) => o.attitudeWords.participation[k])).toEqual(['적극적으로', '꾸준히', '차분하게', '조금씩 더 활발하게'])
    expect(ATTITUDE_TRAITS.map((k) => o.attitudeWords.traits[k])).toEqual(['질문을 자주 하는', '자기 생각을 분명히 말하는', '친구의 의견을 잘 듣는', '끝까지 집중하는', '맡은 활동을 성실히 마치는', '어려운 문제도 다시 시도하는'])
    expect(ATTITUDE_CLOSING.map((k) => o.attitudeWords.closing[k])).toEqual(['앞으로가 더 기대됩니다', '꾸준함이 돋보입니다', '자신감이 자라고 있습니다', '성장이 눈에 보입니다'])
    expect(MAX_ATTITUDE_TRAITS).toBe(2)
  })

  it('one trait and two traits read as whole sentences', () => {
    expect(o.attitude({ studentName: '김다빈', participation: 'steady', traits: ['focuses'], closing: 'growth' }))
      .toBe('김다빈 학생은 이번 단원 수업에 꾸준히 참여하였고, 끝까지 집중하는 모습을 보였습니다. 성장이 눈에 보입니다.')
    expect(o.attitude({ studentName: '이바다', participation: 'growing', traits: ['retries', 'speaks'], closing: 'confidence' }))
      .toBe('이바다 학생은 이번 단원 수업에 조금씩 더 활발하게 참여하였고, 어려운 문제도 다시 시도하는 모습과 자기 생각을 분명히 말하는 모습을 보였습니다. 자신감이 자라고 있습니다.')
  })

  it('every combination: the name is followed by 「학생은」, each trait by 「모습」, and the sentence is well formed', () => {
    const traitSets: AttitudeTrait[][] = [...ATTITUDE_TRAITS.map((t) => [t]), ...ATTITUDE_TRAITS.flatMap((a) => ATTITUDE_TRAITS.filter((b) => b !== a).map((b) => [a, b]))]
    let n = 0
    for (const name of NAMES) for (const participation of ATTITUDE_PARTICIPATION) for (const closing of ATTITUDE_CLOSING) for (const traits of traitSets) {
      const s = o.attitude({ studentName: name, participation, traits, closing })
      n++
      expect(s.startsWith(`${name} 학생은 이번 단원 수업에 ${o.attitudeWords.participation[participation]} 참여하였고, `), s).toBe(true)
      expect(s.endsWith(` 모습을 보였습니다. ${o.attitudeWords.closing[closing]}.`), s).toBe(true)
      expect(count(s, '모습과'), s).toBe(traits.length - 1)
      expect(count(s, '모습을'), s).toBe(1)
      for (const t of traits) expect(s, s).toContain(`${o.attitudeWords.traits[t]} 모습`)
      expect(s, s).not.toMatch(/\s{2}|\.\.|undefined|null|\(|\)/)
      expect(s.length, s).toBeLessThanOrEqual(MAX_SENTENCE)
    }
    expect(n).toBe(4 * 4 * 4 * (6 + 30))
  })
})

describe('잘한 점 · 더 연습할 점 · 과목 한마디 — 문장 틀(조사)', () => {
  const criterion = (subject: string, name: string) => ({ kind: 'criterion' as const, subject, itemKind: '논술형' as const, name, points: 3, max: 4 })
  const quiz = (subject: string) => ({ kind: 'quiz' as const, subject, correct: 6, total: 6 })

  it('reads naturally whatever the last letter of the axis, the subject or the criterion', () => {
    for (const axis of COMPETENCIES) for (const subject of ['수학', '국어', '영어', '과학', '사회']) for (const name of ['해석의 타당성', '상대도수 계산', '근거']) {
      const s = o.strength({ axis, evidence: criterion(subject, name) })
      expect(s).toBe(`「${axis}」 역량이 가장 돋보였습니다. ${subject} 논술형 「${name}」 요소에서 4점 중 3점을 받았습니다.`)
      const p = o.practice({ axis, evidence: criterion(subject, name), action: '근거가 되는 자료 내용을 한 문장 더 이어 써 봅시다.' })
      expect(p).toBe(`「${axis}」 역량은 조금 더 연습하면 좋겠습니다. ${subject} 논술형 「${name}」 요소에서 4점 중 3점을 받았습니다. 근거가 되는 자료 내용을 한 문장 더 이어 써 봅시다.`)
    }
    expect(o.strength({ axis: '자료 읽기', evidence: quiz('영어') })).toBe('「자료 읽기」 역량이 가장 돋보였습니다. 영어 퀴즈의 「자료 읽기」 문항 6개 중 6개를 맞혔습니다.')
    expect(o.practice({ axis: '지식·이해', evidence: quiz('국어'), action: null })).toBe(`「지식·이해」 역량은 조금 더 연습하면 좋겠습니다. 국어 퀴즈의 「지식·이해」 문항 6개 중 6개를 맞혔습니다. ${o.practiceGeneric}`)
  })

  it('the subject line speaks of the student\'s own subjects only', () => {
    for (const [best, focus] of [['수학', '국어'], ['국어', '수학'], ['영어', '사회']]) {
      expect(o.subject({ best, focus })).toBe(`이번 단원에서는 ${best} 과목의 기록이 가장 좋았습니다. 다음 단원에서는 ${focus} 과목에 조금 더 힘을 실어 보면 좋겠습니다.`)
    }
    expect(o.subject({ best: '수학', focus: null })).toBe('이번 단원에서는 수학 과목을 공부하였습니다. 다음 단원에서도 지금처럼 이어 가면 좋겠습니다.')
  })

  it('no verdict word and no comparison word in what is printed for parents, and every sentence fits the 400-letter cap', () => {
    const sources: string[] = []
    const walk = (node: unknown) => {
      if (typeof node === 'string') sources.push(node)
      else if (typeof node === 'function') sources.push(String(node))
      else if (Array.isArray(node)) node.forEach(walk)
      else if (node && typeof node === 'object') Object.values(node).forEach(walk)
    }
    walk(copy.build); walk(copy.view)
    expect(sources.some((s) => s.includes('attitudeWords'))).toBe(true)
    for (const s of sources) for (const w of FORBIDDEN) expect(s, s).not.toContain(w)
    for (const s of [o.subjectEven(), o.pending(), o.practiceGeneric]) expect(s.length).toBeLessThanOrEqual(MAX_SENTENCE)
  })
})

describe('overallLines — 줄 만들기(결정적, AI 없음)', () => {
  const subjects = () => [
    fullSubject('영어', { wrong: ['2-1', '4-3'], drop: 1, tags: SIX_AXIS_TAGS }),
    fullSubject('수학', { wrong: ['1-2'], tags: SIX_AXIS_TAGS }),
  ]
  const body = buildUnitReport({ student, theme, subjects: subjects() }, reportCopy)

  it('strongest axis with its best criterion, weakest axis with its lowest criterion and what to do next, then the subjects', () => {
    const solid = body.radar.filter((a) => a.ratio !== null && !a.sparse)
    const top = solid.reduce((a, b) => (b.ratio! > a.ratio! ? b : a))
    const low = solid.reduce((a, b) => (b.ratio! <= a.ratio! ? b : a))
    expect(body.overall_lines!.map((l) => l.kind)).toEqual(['strength', 'practice', 'subject'])
    const [s, p, sub] = body.overall_lines!
    expect(s.ref.startsWith(`${top.competency}|`)).toBe(true)
    expect(p.ref.startsWith(`${low.competency}|`)).toBe(true)
    expect(s.text.startsWith(`잘한 점: ${top.competency} — `)).toBe(true)
    expect(p.text.startsWith(`연습할 점: ${low.competency} — `)).toBe(true)
    // 근거: 그 역량의 요소 이름과 점수
    const all = body.subjects.flatMap((x) => x.assessment.flatMap((a) => a.criteria.map((c) => ({ ...c, subject: x.subject, kind: a.kind }))))
    const best = all.filter((c) => c.competency === top.competency).sort((a, b) => b.points / b.max - a.points / a.max)[0]
    const worst = all.filter((c) => c.competency === low.competency).sort((a, b) => a.points / a.max - b.points / b.max)[0]
    expect(s.text).toContain(`${best.points}/${best.max}`)
    expect(p.text).toContain(`${worst.subject} ${worst.kind} `)
    expect(p.text).toContain(`${worst.points}/${worst.max}`)
    // 다음 할 일: 그 요소의 보완 문구(문구 묶음이 있을 때)
    const chosen = all.find((c) => p.ref === [low.competency, c.subject, body.subjects.find((x) => x.subject === c.subject)!.assessment.find((a) => a.criteria.includes(body.subjects.find((x) => x.subject === c.subject)!.assessment.flatMap((a) => a.criteria).find((k) => k.name === c.name)!))!.item_no, c.name].join('|'))!
    expect(chosen.improve_tip).toBeTruthy()
    expect(p.text.endsWith(`→ ${chosen.improve_tip}`)).toBe(true)
    expect(sub).toEqual({ kind: 'subject', ref: '수학>영어', text: '과목: 수학 → 영어' })
  })

  it('is repeatable and depends on nothing but the body', () => {
    expect(buildUnitReport({ student, theme, subjects: subjects() }, reportCopy).overall_lines).toEqual(body.overall_lines)
    expect(overallLines(JSON.parse(JSON.stringify(body)), reportCopy)).toEqual(body.overall_lines)
    expect(rebuildOverall(body, reportCopy)).toEqual(body)
  })

  it('an axis that only has quiz items gives the quiz count as evidence', () => {
    const quizOnly = { quiz: ['자료 읽기', '자료 읽기', '자료 읽기'] as const }
    const b = buildUnitReport({ student, theme, subjects: [fullSubject('영어', { tags: { quiz: [...quizOnly.quiz] }, drop: 1 })] }, reportCopy)
    expect(line(b, 'strength')).toEqual({ kind: 'strength', ref: '자료 읽기|영어|quiz', text: '잘한 점: 자료 읽기 — 영어 퀴즈 15/15' })
    // 거꾸로: 퀴즈를 틀리고 요소는 만점 → 더 연습할 점의 근거가 퀴즈, 다음 할 일은 처음 틀린 차시의 가정 학습 제안
    const w = buildUnitReport({ student, theme, subjects: [fullSubject('영어', { tags: { quiz: [...quizOnly.quiz] }, wrong: ['3-2', '4-1'] })] }, reportCopy)
    const home = w.subjects[0].home_study!.find((h) => h.lesson_no === 3)!.text
    expect(home).toBeTruthy()
    expect(line(w, 'practice')).toEqual({ kind: 'practice', ref: '자료 읽기|영어|quiz', text: `연습할 점: 자료 읽기 — 영어 퀴즈 13/15 → ${home}` })
  })

  it('next action: the improve phrase → else the home study suggestion of that lesson → else the general sentence', () => {
    const p = line(body, 'practice')!
    const noTip: UnitReportBody = { ...body, subjects: body.subjects.map((s) => ({ ...s, assessment: s.assessment.map((a) => ({ ...a, criteria: a.criteria.map((c) => ({ ...c, improve_tip: null })) })) })) }
    const viaHome = overallLines(noTip, reportCopy).find((l) => l.kind === 'practice')!
    expect(viaHome.ref).toBe(p.ref)
    const lessonNo = body.subjects.find((s) => p.ref.split('|')[1] === s.subject)!.assessment.find((a) => String(a.item_no) === p.ref.split('|')[2])!.lesson_no
    const home = body.subjects.find((s) => p.ref.split('|')[1] === s.subject)!.home_study!.find((h) => h.lesson_no === lessonNo)!.text
    expect(viaHome.text.endsWith(`→ ${home}`)).toBe(true)
    const nothing: UnitReportBody = { ...noTip, subjects: noTip.subjects.map((s) => ({ ...s, home_study: [] })) }
    expect(overallLines(nothing, reportCopy).find((l) => l.kind === 'practice')!.text.endsWith('→ 일반 안내')).toBe(true)
    // 안내장 틀이 없는 옛 세트: 문구도 제안도 없다
    const legacySet = buildUnitReport({ student, theme, subjects: [fullSubject('수학', { noticePlan: false, drop: 1, tags: SIX_AXIS_TAGS })] }, build)
    expect(legacySet.subjects[0].home_study).toEqual([])
    expect(line(legacySet, 'practice')!.text.endsWith(o.practiceGeneric)).toBe(true)
  })

  it('all axes equal → the even sentence takes the place of the first two lines; still two lines', () => {
    const b = buildUnitReport({ student, theme, subjects: [fullSubject('수학'), fullSubject('영어')] }, reportCopy)
    expect(b.overall_lines).toEqual([
      { kind: 'strength', ref: 'even', text: reportCopy.overall.even(who) },
      { kind: 'subject', ref: 'even', text: '과목: 고르게' },
    ])
  })

  it('fewer than two axes with data → the neutral sentence; no record at all → a calm line saying the records will come', () => {
    const snapshot = snapshotFor('영어')
    const one = buildUnitReport({ student, theme, subjects: [{ subject: '영어', key_question: 'q', snapshot, quiz: quizRows([1], ['1-1']), finalizedLessons: [1], gradings: [] }] }, reportCopy)
    expect(one.overall_lines!.map((l) => [l.kind, l.ref])).toEqual([['strength', 'neutral'], ['subject', '영어>']])
    const none = buildUnitReport({ student, theme, subjects: [{ subject: '영어', key_question: 'q', snapshot, quiz: [], finalizedLessons: [], gradings: [] }] }, reportCopy)
    expect(none.overall_lines!.map((l) => [l.kind, l.ref])).toEqual([['strength', 'neutral'], ['subject', 'pending']])
    const empty = buildUnitReport({ student, theme, subjects: [], includeSubjects: [] }, reportCopy)
    expect(empty.overall_lines).toHaveLength(2)
  })

  it('a subject without any record is left out of the subject line', () => {
    const snapshot = snapshotFor('과학')
    const b = buildUnitReport({ student, theme, subjects: [fullSubject('수학', { drop: 1 }), { subject: '과학', key_question: 'q', snapshot, quiz: [], finalizedLessons: [], gradings: [] }] }, reportCopy)
    expect(line(b, 'subject')).toEqual({ kind: 'subject', ref: '수학>', text: '과목: 수학' })
  })

  it('always at least two generated lines, and at least three with the attitude line', () => {
    const snapshot = snapshotFor('수학')
    const inputs = [
      subjects(), [fullSubject('수학')], [fullSubject('수학', { drop: 2, wrong: ['1-1'] })], [],
      [{ subject: '수학', key_question: 'q', snapshot, quiz: quizRows(TEACHING_LESSONS), finalizedLessons: TEACHING_LESSONS, gradings: [] }],
      [{ subject: '수학', key_question: 'q', snapshot, quiz: [], finalizedLessons: [], gradings: [gradingFor(snapshot, 1, 1)] }],
      ['국어', '영어', '수학', '과학', '사회'].map((s, i) => fullSubject(s, { variant: s === '과학' ? '과학' as const : '수학' as const, drop: i % 3, wrong: [`${i + 1}-1`], tags: s === '과학' ? undefined : SIX_AXIS_TAGS })),
    ]
    for (const s of inputs) {
      const plain = buildUnitReport({ student, theme, subjects: s }, build)
      expect(plain.overall_lines!.length).toBeGreaterThanOrEqual(2)
      const withAttitude = buildUnitReport({ student, theme, subjects: s, attitude: picked }, build)
      expect(withAttitude.overall_lines!.length).toBeGreaterThanOrEqual(3)
      expect(withAttitude.overall_lines![0].kind).toBe('attitude')
      expect(withAttitude.overall_lines!.slice(1)).toEqual(plain.overall_lines)
      for (const l of withAttitude.overall_lines!) {
        expect(l.text.length).toBeLessThanOrEqual(MAX_SENTENCE)
        expect(l.text.trim()).not.toBe('')
        for (const w of FORBIDDEN) expect(l.text).not.toContain(w)
      }
      expect(withAttitude.overall_comment).toBe(withAttitude.overall_lines!.map((l) => l.text).join('\n'))
      expect(BodySchema.safeParse(withAttitude).error?.issues ?? []).toEqual([])
    }
  })
})

describe('수업 태도 낱말 — 열쇠 확인', () => {
  it('completeAttitude: a sentence only when all three are picked', () => {
    expect(completeAttitude(picked)).toEqual(picked)
    expect(completeAttitude({ ...picked, traits: ['asks'] })).toEqual({ ...picked, traits: ['asks'] })
    for (const a of [null, undefined, { ...picked, participation: null }, { ...picked, traits: [] }, { ...picked, closing: null }]) expect(completeAttitude(a)).toBeNull()
  })
  it('parseAttitude: keys from the lists only, at most two traits', () => {
    expect(parseAttitude(picked)).toEqual({ ok: true, attitude: picked })
    expect(parseAttitude(null)).toEqual({ ok: true, attitude: null })
    expect(parseAttitude(undefined)).toEqual({ ok: true, attitude: null })
    expect(parseAttitude({ participation: null, traits: [], closing: null })).toEqual({ ok: true, attitude: null })
    expect(parseAttitude({ participation: 'calm', traits: [], closing: null })).toEqual({ ok: true, attitude: { participation: 'calm', traits: [], closing: null } })
    for (const bad of [{ ...picked, traits: ['asks', 'listens', 'focuses'] }, { ...picked, traits: ['asks', 'asks'] }, { ...picked, participation: '적극적으로' }, { ...picked, closing: 'best' }, { ...picked, extra: 1 }, { traits: [] }, 'x', 1, []]) {
      expect(parseAttitude(bad), JSON.stringify(bad)).toEqual({ ok: false })
    }
  })
})

describe('저장된 본문 — 옛 본문과 새 본문', () => {
  const subjects = () => [fullSubject('영어', { wrong: ['2-1', '4-3'], drop: 1, tags: SIX_AXIS_TAGS }), fullSubject('수학', { wrong: ['1-2'], tags: SIX_AXIS_TAGS })]
  const fresh = buildUnitReport({ student, theme, subjects: subjects() }, build)
  /** 2026-09-29 판이 저장한 모양: 새 칸이 하나도 없고 종합 코멘트는 한 문장. */
  const legacyOf = (b: UnitReportBody, comment?: string): UnitReportBody => {
    const raw = JSON.parse(JSON.stringify(b)) as Record<string, unknown> & { subjects: (Record<string, unknown> & { assessment: { criteria: Record<string, unknown>[] }[] })[] }
    delete raw.attitude; delete raw.overall_lines
    for (const s of raw.subjects) { delete s.home_study; for (const a of s.assessment) for (const c of a.criteria) delete c.improve_tip }
    raw.overall_comment = comment ?? legacyOverall(b, build)
    return BodySchema.parse(raw)
  }

  it('a body stored before the new fields still parses, and renders its one-sentence comment', () => {
    const old = legacyOf(fresh)
    expect(old.overall_lines).toBeUndefined(); expect(old.attitude).toBeUndefined()
    expect(old.subjects[0].home_study).toBeUndefined()
    expect(old.subjects[0].assessment[0].criteria[0].improve_tip).toBeUndefined()
    const html = renderToStaticMarkup(createElement(UnitReportView, { body: old, academyName: '다빈치스쿨 ○○원', date: '2026-09-30' }))
    expect(text(html)).toContain(old.overall_comment)
    expect(count(html, 'data-report-overall-line=')).toBe(0)
    expect(count(html.slice(html.indexOf('data-report-axes'), html.indexOf('</table>')), '<tr')).toBe(7)
    expect(reportDataKey(old)).toBe(reportDataKey(fresh))
  })

  it('an old draft: an untouched comment gives way to the new lines; an edited one moves to the 「잘한 점」 line', () => {
    expect(editsFromStored(legacyOf(fresh), fresh, build)).toEqual({})
    const edits = editsFromStored(legacyOf(fresh, '원장이 예전에 쓴 종합 코멘트'), fresh, build)
    expect(edits).toEqual({ [keyOf(fresh, 'strength')]: '원장이 예전에 쓴 종합 코멘트' })
    const next = applyEdits(fresh, edits)
    expect(line(next, 'strength')!.text).toBe('원장이 예전에 쓴 종합 코멘트')
    expect(next.overall_lines!.length).toBe(3)
    // 옛 본문 위에서 낱말을 골라도(저장해 둔 숫자를 보는 동안) 줄이 만들어진다
    expect(rebuildOverall({ ...legacyOf(fresh), attitude: picked }, build).overall_lines!.map((l) => l.kind)).toEqual(['attitude', 'strength', 'practice', 'subject'])
  })

  it('the schema refuses keys outside the lists and a third trait', () => {
    expect(BodySchema.safeParse({ ...fresh, attitude: picked }).success).toBe(true)
    expect(BodySchema.safeParse({ ...fresh, attitude: null }).success).toBe(true)
    expect(BodySchema.safeParse({ ...fresh, attitude: { ...picked, traits: ['asks', 'listens', 'focuses'] } }).success).toBe(false)
    expect(BodySchema.safeParse({ ...fresh, attitude: { ...picked, closing: '기대됩니다' } }).success).toBe(false)
    expect(BodySchema.safeParse({ ...fresh, overall_lines: [{ kind: 'rank', ref: '', text: 'x' }] }).success).toBe(false)
  })

  it('picking attitude words is not a change of numbers', () => {
    const withWords = buildUnitReport({ student, theme, subjects: subjects(), attitude: picked }, build)
    expect(reportDataKey(withWords)).toBe(reportDataKey(fresh))
    expect(reportDataKey(restrictReport({ ...fresh, attitude: picked }, ['영어', '수학'], build))).toBe(reportDataKey(fresh))
    expect(restrictReport({ ...fresh, attitude: picked }, ['영어', '수학'], build)).toEqual(withWords)
    expect(reportDataKey(withWords)).not.toContain('active')
  })

  describe('점수 다시 불러오기 — 고친 줄', () => {
    const base = buildUnitReport({ student, theme, subjects: subjects(), attitude: picked }, build)
    const stored = applyEdits(base, { [keyOf(base, 'attitude')]: '원장이 고친 수업 태도', [keyOf(base, 'strength')]: '원장이 고친 잘한 점', [keyOf(base, 'practice')]: '원장이 고친 연습할 점' })

    it('finds the edited lines only', () => {
      expect(editsFromStored(base, fresh, build)).toEqual({})
      expect(Object.keys(editsFromStored(stored, fresh, build)).sort()).toEqual([keyOf(base, 'attitude'), keyOf(base, 'strength'), keyOf(base, 'practice')].sort())
      expect(applyEdits(restrictReport({ ...fresh, attitude: stored.attitude }, stored.included_subjects, build), editsFromStored(stored, fresh, build))).toEqual(stored)
    })

    it('numbers changed but the lines still point at the same axis and criterion: every edited line stays', () => {
      // 영어 4차시 3번이 O 로 바뀐다(자료 읽기 축) — 가장 높은 축·가장 낮은 축과 그 근거 요소는 그대로
      const changed = subjects(); changed[0] = fullSubject('영어', { wrong: ['2-1'], drop: 1, tags: SIX_AXIS_TAGS })
      const now = buildUnitReport({ student, theme, subjects: changed }, build)
      expect(reportDataKey(now)).not.toBe(reportDataKey(stored))
      expect(keyOf(now, 'strength')).toBe(keyOf(base, 'strength')); expect(keyOf(now, 'practice')).toBe(keyOf(base, 'practice'))
      const next = applyEdits(restrictReport({ ...now, attitude: stored.attitude }, stored.included_subjects, build), editsFromStored(stored, now, build))
      expect(next.overall_lines!.map((l) => l.text).slice(0, 3)).toEqual(['원장이 고친 수업 태도', '원장이 고친 잘한 점', '원장이 고친 연습할 점'])
      expect(next.attitude).toEqual(picked)
    })

    it('the weakest axis moved to another criterion: that edited line is dropped, the attitude line is kept', () => {
      // 영어 「수학적 표현과 서술」(글로 표현하기)이 0점이 된다 → 가장 낮은 축이 바뀐다
      const changed = subjects(); changed[0] = fullSubject('영어', { wrong: ['2-1', '4-3'], drop: { '수학적 표현과 서술': 4, '상대도수 계산': 1 }, tags: SIX_AXIS_TAGS })
      const now = buildUnitReport({ student, theme, subjects: changed }, build)
      expect(keyOf(now, 'practice')).not.toBe(keyOf(base, 'practice'))
      const next = applyEdits(restrictReport({ ...now, attitude: stored.attitude }, stored.included_subjects, build), editsFromStored(stored, now, build))
      expect(line(next, 'attitude')!.text).toBe('원장이 고친 수업 태도')
      expect(line(next, 'practice')!.text).toBe(line(now, 'practice')!.text)
      expect(line(next, 'practice')!.text).toContain('「글로 표현하기」')
    })

    it('other words picked: the generated sentence follows the new words; the same words again bring the edited one back', () => {
      const edits = editsFromStored(stored, fresh, build)
      const other = applyEdits(restrictReport({ ...fresh, attitude: { ...picked, closing: 'growth' } }, stored.included_subjects, build), edits)
      expect(line(other, 'attitude')!.text).toBe(o.attitude({ studentName: '김OO', ...picked, closing: 'growth' }))
      const same = applyEdits(restrictReport({ ...fresh, attitude: picked }, stored.included_subjects, build), edits)
      expect(line(same, 'attitude')!.text).toBe('원장이 고친 수업 태도')
    })

    it('an emptied line is remembered as emptied, and leaves the report', () => {
      const emptied = applyEdits(base, { [keyOf(base, 'subject')]: '  ' })
      expect(line(emptied, 'subject')!.text).toBe('')
      expect(emptied.overall_comment.split('\n')).toHaveLength(3)
      expect(editsFromStored(emptied, fresh, build)).toEqual({ [keyOf(base, 'subject')]: '' })
      expect(BodySchema.safeParse(emptied).success).toBe(true)
    })
  })
})

describe('UnitReportView — 역량 뜻 표와 종합 코멘트 줄', () => {
  const FIVE = ['국어', '영어', '수학', '과학', '사회']
  const body = buildUnitReport({
    student: { name: '김다빈', seq: 7 }, theme, attitude: picked,
    subjects: FIVE.map((s, i) => fullSubject(s, { variant: s === '과학' ? '과학' : '수학', wrong: [`${i + 1}-1`, `${i + 1}-3`], drop: i % 3, tags: s === '과학' ? undefined : SIX_AXIS_TAGS })),
  }, build)
  const html = renderToStaticMarkup(createElement(UnitReportView, { body, academyName: '다빈치스쿨 ○○원', date: '2026-09-30', draft: true }))
  const front = html.slice(html.indexOf('data-report-page="front"'), html.indexOf('data-report-page="detail"'))

  it('front page: the definition table has six rows — name in bold, meaning, score', () => {
    const table = front.slice(front.indexOf('data-report-axes'), front.indexOf('</table>'))
    expect(text(front)).toContain('역량은 이렇게 봅니다')
    const rows = table.split('<tr').slice(2)
    expect(rows).toHaveLength(6)
    expect(rows.map((r) => text(`<x${r.split(/<t[hd]/)[1]}`).trim())).toEqual([...COMPETENCIES])
    expect(rows.map((r) => text(`<x${r.split(/<t[hd]/)[2]}`).trim())).toEqual([
      '배운 개념과 용어를 정확히 알고 있는가', '표·글·그림에서 필요한 정보를 찾아내는가', '이유와 근거를 들어 자기 생각을 설명하는가',
      '읽는 사람이 이해하기 쉽게 문장과 글로 쓰는가', '계산, 절차, 탐구 방법을 순서에 맞게 해내는가', '무엇이 중요한지 판단하고 실천하려는 마음을 보이는가',
    ])
    for (const [i, a] of body.radar.entries()) expect(text(`<x${rows[i].split(/<t[hd]/)[3]}`).trim()).toBe(`${a.earned}/${a.possible}점 · 문항 ${a.count}개`)
  })

  it('a thin axis keeps its note, an empty axis says so — inside the score cell', () => {
    const snapshot = snapshotFor('수학', { tags: { criteria: { '상대도수 계산': '글로 표현하기' } } })
    const thin = buildUnitReport({ student, theme, subjects: [{ subject: '수학', key_question: 'q', snapshot, quiz: quizRows([1]), finalizedLessons: [1], gradings: [gradingFor(snapshot, 1)] }] }, build)
    const h = renderToStaticMarkup(createElement(UnitReportView, { body: thin, academyName: '', date: '2026-09-30' }))
    const rows = h.slice(h.indexOf('data-report-axes'), h.indexOf('</table>')).split('<tr').slice(2)
    const cell = (name: string) => text(`<x${rows[COMPETENCIES.indexOf(name as never)].split(/<t[hd]/)[3]}`).trim()
    expect(cell('글로 표현하기')).toBe(`${v.axisScore(2, 2, 1)} ${v.sparseNote}`)
    expect(cell('자료 읽기')).toBe(v.axisEmpty)
  })

  it('the comment has at least three lines, one <li> each with its label above, in order', () => {
    const block = front.slice(front.indexOf('data-report-overall'))
    const list = block.slice(0, block.indexOf('</ul>'))
    expect(count(list, '<li')).toBe(4)
    expect([...list.matchAll(/data-report-overall-line="([^"]+)"/g)].map((m) => m[1])).toEqual(['attitude', 'strength', 'practice', 'subject'])
    for (const l of body.overall_lines!) {
      const li = list.split('<li').slice(1).find((x) => x.includes(`data-report-overall-line="${l.kind}"`))!
      const ps = li.split('<p').slice(1).map((p) => text(`<p${p}`).trim())
      expect(ps).toEqual([v.overallLabels[l.kind], l.text])
    }
    expect(text(list)).toContain('김다빈 학생은 이번 단원 수업에 적극적으로 참여하였고, 질문을 자주 하는 모습과 친구의 의견을 잘 듣는 모습을 보였습니다. 앞으로가 더 기대됩니다.')
  })

  it('without attitude words the first line is simply not there', () => {
    const plain = buildUnitReport({ student, theme, subjects: [fullSubject('수학', { drop: 1, tags: SIX_AXIS_TAGS })] }, build)
    const h = renderToStaticMarkup(createElement(UnitReportView, { body: plain, academyName: '', date: '2026-09-30' }))
    expect([...h.matchAll(/data-report-overall-line="([^"]+)"/g)].map((m) => m[1])).toEqual(['strength', 'practice', 'subject'])
    expect(text(h)).not.toContain(v.overallLabels.attitude)
  })
})

describe('ReportEditor — 수업 태도 낱말 고르기', () => {
  const two = buildUnitReport({ student, theme, subjects: [fullSubject('영어', { wrong: ['2-1'], drop: 1, tags: SIX_AXIS_TAGS }), fullSubject('수학', { tags: SIX_AXIS_TAGS })] }, build)
  const props = { themeId: 't', studentId: 's', academyName: '다빈치스쿨 ○○원', today: '2026-09-30', subjects: ['영어', '수학'], fresh: two, reportsAvailable: true, initialEdits: {}, stale: false }
  const render = (p: Partial<Parameters<typeof ReportEditor>[0]> = {}) => renderToStaticMarkup(createElement(ReportEditor, { ...props, stored: null, ...p }))
  const pickerOf = (html: string) => { const at = html.indexOf('data-attitude-picker'); return html.slice(at, html.indexOf('</section>', at)) }

  it('three groups, label above, every word offered, nothing picked at first, and a calm lemon note that is not printed', () => {
    const html = render()
    const picker = pickerOf(html)
    const t = text(picker)
    expect(count(picker, '<fieldset')).toBe(3)
    expect(count(picker, 'type="radio"')).toBe(4 + 4)
    expect(count(picker, 'type="checkbox"')).toBe(6)
    expect(picker).not.toContain('checked=""'); expect(picker).not.toContain('disabled=""')
    for (const w of [...Object.values(o.attitudeWords.participation), ...Object.values(o.attitudeWords.traits), ...Object.values(o.attitudeWords.closing)]) expect(t).toContain(w)
    const order = [copy.page.attitudeHeading, copy.page.attitudeGroups.participation, '적극적으로', copy.page.attitudeGroups.traits, '질문을 자주 하는', copy.page.attitudeGroups.closing, '앞으로가 더 기대됩니다'].map((s) => t.indexOf(s))
    expect(order).toEqual([...order].sort((a, b) => a - b)); expect(order[0]).toBeGreaterThanOrEqual(0)
    expect(picker).toMatch(/data-attitude-empty[^>]*bg-lemon-50/)
    expect(t).toContain(copy.page.attitudeEmpty)
    expect(picker).not.toContain('data-attitude-preview')
    // 인쇄되지 않는 칸 안에 있다
    expect(html.lastIndexOf('no-print', html.indexOf('data-attitude-picker'))).toBeLessThan(html.indexOf('data-attitude-picker'))
    expect(html.indexOf('data-attitude-picker')).toBeLessThan(html.indexOf('data-unit-report'))
    // 고르지 않아도 저장·확정·인쇄 단추는 그대로 누를 수 있다
    expect(html).not.toContain('disabled=""')
    expect(text(html.slice(html.indexOf('data-unit-report')))).not.toContain(copy.page.attitudeEmpty)
  })

  it('a stored draft with words: they are checked, the finished sentence shows, and the report carries it as its first line', () => {
    const stored = buildUnitReport({ student, theme, attitude: picked, subjects: [fullSubject('영어', { wrong: ['2-1'], drop: 1, tags: SIX_AXIS_TAGS }), fullSubject('수학', { tags: SIX_AXIS_TAGS })] }, build)
    const html = render({ stored: { status: 'draft', body: stored, confirmedAt: null } })
    const picker = pickerOf(html)
    expect(count(picker, 'checked=""')).toBe(4)
    // 두 개를 골랐으면 나머지 수업 모습 네 개는 쉰다(두 개까지)
    expect(count(picker, 'disabled=""')).toBe(4)
    const sentence = o.attitude({ studentName: '김OO', ...picked })
    expect(text(picker)).toContain(`${copy.page.attitudePreview} ${sentence}`)
    expect(picker).not.toContain('data-attitude-empty')
    expect(text(picker)).toContain(copy.page.attitudeClear)
    const report = html.slice(html.indexOf('data-unit-report'))
    expect([...report.matchAll(/data-report-overall-line="([^"]+)"/g)].map((m) => m[1])).toEqual(['attitude', 'strength', 'practice', 'subject'])
    expect(text(report)).toContain(sentence)
    expect(text(html)).toContain(copy.edit.overallLine.attitude)
    expect(count(html, '<textarea')).toBe(4 + 2 + stored.subjects.reduce((n, s) => n + s.quizzes.filter((q) => !q.correct).length + s.assessment.reduce((k, a) => k + a.criteria.length, 0), 0))
  })

  it('partly picked: the note names what is still open', () => {
    const stored = buildUnitReport({ student, theme, attitude: { participation: 'calm', traits: [], closing: null }, subjects: [fullSubject('수학', { tags: SIX_AXIS_TAGS })] }, build)
    const picker = pickerOf(render({ subjects: ['수학'], stored: { status: 'draft', body: stored, confirmedAt: null } }))
    expect(text(picker)).toContain(copy.page.attitudeIncomplete(['수업 모습', '마무리']))
    expect(copy.page.attitudeIncomplete(['수업 모습', '마무리'])).toBe('세 가지를 모두 고르면 문장이 완성됩니다. 아직 고르지 않은 것: 수업 모습, 마무리')
  })

  it('confirmed: the words cannot be changed, the stored sentence stays', () => {
    const stored = applyEdits(buildUnitReport({ student, theme, attitude: picked, subjects: [fullSubject('수학', { drop: 1, tags: SIX_AXIS_TAGS })] }, build), { [editKey.overallLine('attitude', 'active/asks,listens/expect')]: '원장이 고친 수업 태도' })
    const html = render({ subjects: ['수학'], stored: { status: 'confirmed', body: stored, confirmedAt: '2026-09-30 10:00' } })
    expect(html).not.toContain('data-attitude-picker')
    expect(html).not.toContain('type="radio"')
    expect(text(html)).toContain('원장이 고친 수업 태도')
  })
})
