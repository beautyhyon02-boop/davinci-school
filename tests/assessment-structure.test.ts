import { describe, it, expect } from 'vitest'
import {
  SET_ITEMS, SET_ORDER, SET_ITEM_COUNT, SET_TOTAL, SHORT_POINTS, ESSAY_POINTS, SHORT_TOTAL, LEGACY_SET_ITEMS,
  structureOf, structureIssues, itemLabels, isShortKind,
  LESSON_KINDS, TEACHING_LESSONS, ASSESSMENT_SESSION, ESSAY_MIN_MINUTES, sessionPlacementIssues, lessonAssessments, isAssessmentSession,
} from '@/lib/studio/assessment-structure'
import { GRADE_TABLE_22 } from '@/lib/studio/level-map'

describe('세트 평가 구조 (대표 2026-09-26: 서술형 1 + 논술형 1)', () => {
  it('one source of truth: 서술형 1 × 6점 + 논술형 1 × 16점 = 22점, 서술형 → 논술형 순서', () => {
    expect(SET_ITEMS).toEqual({ 서술형: { count: 1, points: 6 }, 논술형: { count: 1, points: 16 } })
    expect(SET_ORDER).toEqual(['서술형', '논술형'])
    expect(SET_ITEM_COUNT).toBe(2); expect(SET_TOTAL).toBe(22)
    expect(SHORT_POINTS).toBe(6); expect(ESSAY_POINTS).toBe(16); expect(SHORT_TOTAL).toBe(6)
  })
  it('keeps the 7-band grade table: total 22 = the table top', () => {
    expect(Math.max(...GRADE_TABLE_22.map((b) => b.max))).toBe(SET_TOTAL)
  })
  it('the legacy structure (판 before 2026-09-26) is 서술형 2 × 3점 + 논술형 16점 = 22점 as well', () => {
    expect(LEGACY_SET_ITEMS).toEqual({ 서술형: { count: 2, points: 3 }, 논술형: { count: 1, points: 16 } })
  })
  it('structureOf tells the current set from the legacy one and rejects anything else', () => {
    const it = (kind: string, points: number) => ({ kind, points })
    expect(structureOf([it('서술형', 6), it('논술형', 16)])).toBe('current')
    expect(structureOf([it('서술형', 3), it('서술형', 3), it('논술형', 16)])).toBe('legacy')
    expect(structureOf([it('논술형', 16), it('서술형', 6)])).toBeNull()
    expect(structureOf([it('서술형', 3), it('논술형', 16)])).toBeNull()
    expect(structureOf([it('서술형', 6), it('서술형', 6), it('논술형', 16)])).toBeNull()
    expect(structureOf([])).toBeNull()
  })
  it('structureIssues names what is wrong with a set against the current structure', () => {
    const it = (kind: string, points: number) => ({ kind, points })
    expect(structureIssues([it('서술형', 6), it('논술형', 16)])).toEqual([])
    expect(structureIssues([it('서술형', 3), it('서술형', 3), it('논술형', 16)]).join(' ')).toMatch(/문항 2개/)
    expect(structureIssues([it('논술형', 16), it('서술형', 6)]).join(' ')).toMatch(/서술형 → 논술형/)
    expect(structureIssues([it('서술형', 3), it('논술형', 16)]).join(' ')).toMatch(/서술형은 6점/)
    expect(structureIssues([it('서술형', 6), it('논술형', 12)]).join(' ')).toMatch(/논술형은 16점/)
  })
  it('itemLabels numbers 서술형 only when a (legacy) set has more than one', () => {
    expect(itemLabels([{ kind: '서술형' }, { kind: '논술형' }])).toEqual(['서술형', '논술형'])
    expect(itemLabels([{ kind: '서술형' }, { kind: '서술형' }, { kind: '논술형' }])).toEqual(['서술형1', '서술형2', '논술형'])
  })
  it('isShortKind accepts the legacy lesson labels 서술형1·서술형2', () => {
    expect(['서술형', '서술형1', '서술형2', '논술형'].map(isShortKind)).toEqual([true, true, true, false])
  })
})

describe('단원 평가 차시 (대표 2026-09-26 보완: 서·논술형은 마지막 교수 차시 뒤에 함께)', () => {
  const teaching = (no: number) => ({ no, kind: 'teaching', assessment: [] as string[] })
  const session = (no: number, assessment: string[] = ['서술형', '논술형']) => ({ no, kind: 'assessment', assessment })
  it('the session is 60 min = 5 + (서술형 15 + 논술형 35) + 5 and keeps the 35-minute essay rule', () => {
    const t = ASSESSMENT_SESSION.time_budget
    expect(t.intro_min + t.main_min + t.wrapup_min).toBe(60)
    expect(ASSESSMENT_SESSION.steps.reduce((s, x) => s + x.minutes, 0)).toBe(t.main_min)
    expect(ASSESSMENT_SESSION.steps.find((s) => s.step_label.includes('논술형'))!.minutes).toBeGreaterThanOrEqual(ESSAY_MIN_MINUTES)
    expect(LESSON_KINDS).toEqual(['teaching', 'assessment'])
    expect(TEACHING_LESSONS).toEqual({ min: 3, max: 5 })
  })
  it('sessionPlacementIssues: 5 teaching lessons + session 6 holding 서술형 → 논술형 is the shape', () => {
    expect(sessionPlacementIssues([1, 2, 3, 4, 5].map(teaching).concat(session(6)))).toEqual([])
    expect(sessionPlacementIssues([1, 2, 3, 4].map(teaching).concat(session(5)))).toEqual([])
    expect(sessionPlacementIssues([1, 2, 3, 4, 5].map(teaching)).join(' ')).toMatch(/정확히 1개/)
    expect(sessionPlacementIssues([session(1), ...[2, 3, 4, 5].map(teaching)]).join(' ')).toMatch(/마지막/)
    expect(sessionPlacementIssues([1, 2, 3, 4].map(teaching).concat(session(5, ['논술형']))).join(' ')).toMatch(/서술형 → 논술형/)
    expect(sessionPlacementIssues([...[1, 2, 3].map(teaching), { ...teaching(4), assessment: ['서술형'] }, session(5, ['논술형'])]).join(' ')).toMatch(/4차시: 교수 차시에는/)
    expect(sessionPlacementIssues([1, 2, 3, 4, 5, 6].map(teaching).concat(session(7))).join(' ')).toMatch(/교수 차시는 3~5개/)
  })
  it('lessonAssessments reads arrays and the old string/null shape', () => {
    expect(lessonAssessments({ assessment: ['서술형', '논술형'] })).toEqual(['서술형', '논술형'])
    expect(lessonAssessments({ assessment: '서술형1' })).toEqual(['서술형1'])
    expect(lessonAssessments({ assessment: null })).toEqual([])
    expect(isAssessmentSession({ kind: 'assessment' })).toBe(true); expect(isAssessmentSession({})).toBe(false)
  })
})
