// 교과융합 탐구보고서 — 순수 부분(스키마·목차·게시 관문·참고문헌). 설계 docs/superpowers/specs/2026-09-30-inquiry-report-design.md §4~§7
import { describe, it, expect } from 'vitest'
import { InquiryTask, InquiryReport, Outline, parseTaskJson, emptyTask, effectiveQuestions, SECTION_MAX_CHARS, type InquirySource } from '@/lib/inquiry/schema'
import { buildOutline, writingBoxes, activeTextKeys, hiddenTextKeys, progressOf, guideFor } from '@/lib/inquiry/outline'
import { publishGate, gateMessages, visibleSources } from '@/lib/inquiry/publish-gate'
import { formatReference, referenceLines } from '@/lib/inquiry/references'
import { app } from '@/content/site'

const copy = app.inquiry

const src = (over: Partial<InquirySource> & { id: string; kind: InquirySource['kind'] }): InquirySource => ({
  title: `제목 ${over.id}`, authors: '홍길동', year: '2020', date: '', container: '학술지', detail: '1(2), 3-4쪽', url: 'https://example.com/' + over.id,
  note: '', easy_summary: '', excerpts: [], for_questions: ['가'], verified: { by: '관리자', at: '2026-10-01' }, ...over,
})
const fullTask = () => ({
  ...emptyTask(), title: '규제는 생각을 바꾸는가', subjects: ['사회', '국어'] as ('사회' | '국어')[],
  questions: [{ key: '가' as const, text: '문제 가', lens: '사회' }, { key: '나' as const, text: '문제 나', lens: '국어' }, { key: '다' as const, text: '문제 다', lens: '융합' }],
  sources: [
    src({ id: 'p1', kind: 'paper', for_questions: ['가', '다'] }), src({ id: 'p2', kind: 'paper', for_questions: ['나'] }),
    src({ id: 'n1', kind: 'news', for_questions: ['다'], date: '2024-10-26' }), src({ id: 'b1', kind: 'book', for_questions: ['다'] }),
  ],
})

describe('InquiryTask schema', () => {
  it('accepts a minimal draft (title only) and fills defaults', () => {
    const r = InquiryTask.safeParse({ title: 'x', questions: [{ key: '가' }, { key: '나' }, { key: '다' }] })
    expect(r.success).toBe(true)
    if (r.success) { expect(r.data.subjects).toEqual([]); expect(r.data.level).toBe('중'); expect(r.data.sources).toEqual([]) }
  })
  it('requires exactly three questions in 가·나·다 order', () => {
    expect(InquiryTask.safeParse({ title: 'x', questions: [{ key: '가' }, { key: '나' }] }).success).toBe(false)
    expect(InquiryTask.safeParse({ title: 'x', questions: [{ key: '나' }, { key: '가' }, { key: '다' }] }).success).toBe(false)
  })
  it('rejects non-http urls, duplicate source ids and unknown subjects', () => {
    const base = fullTask()
    expect(InquiryTask.safeParse({ ...base, sources: [src({ id: 'a', kind: 'paper', url: 'ftp://x' })] }).success).toBe(false)
    expect(InquiryTask.safeParse({ ...base, sources: [src({ id: 'a', kind: 'paper' }), src({ id: 'a', kind: 'news' })] }).success).toBe(false)
    expect(InquiryTask.safeParse({ ...base, subjects: ['사회', '한국사'] }).success).toBe(false)
    expect(InquiryTask.safeParse({ ...base, subjects: ['사회', '사회'] }).success).toBe(true)
  })
  it('parseTaskJson reads a JSON string and never carries a verified mark in', () => {
    const json = JSON.stringify({ ...fullTask() })
    const r = parseTaskJson(json)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.task.sources.every((s) => s.verified === null)).toBe(true)
    expect(parseTaskJson('{not json')).toEqual({ ok: false, error: 'json' })
    expect(parseTaskJson('{"title":""}')).toEqual({ ok: false, error: 'shape' })
  })
  it('report sections drop unknown keys and cap length; questions fall back to the task', () => {
    const r = InquiryReport.safeParse({ sections: { motive: 'a', bogus: 'b' } })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.sections).toEqual({ motive: 'a' })
    expect(InquiryReport.safeParse({ sections: { motive: 'x'.repeat(SECTION_MAX_CHARS + 1) } }).success).toBe(false)
    const qs = effectiveQuestions(fullTask(), { questions: [{ key: '나', text: '내가 고친 나' }] })
    expect(qs.map((q) => q.text)).toEqual(['문제 가', '내가 고친 나', '문제 다'])
    expect(Outline.parse({})).toEqual({ method: 'none', career: true })
  })
})

describe('outline (Q-7·§5·§6)', () => {
  it('omits 탐구 방법 by default and pulls the numbering forward', () => {
    const chapters = buildOutline({ method: 'none', career: true })
    expect(chapters.map((c) => `${c.roman} ${c.key}`)).toEqual(['Ⅰ intro', 'Ⅱ background', 'Ⅲ results', 'Ⅳ conclusion', 'Ⅴ reflection', 'Ⅵ references'])
    const withMethod = buildOutline({ method: 'survey', career: false })
    expect(withMethod.map((c) => `${c.roman} ${c.key}`)).toEqual(['Ⅰ intro', 'Ⅱ background', 'Ⅲ method', 'Ⅳ results', 'Ⅴ conclusion', 'Ⅵ reflection', 'Ⅶ references'])
    expect(withMethod[3].sections.map((s) => (s.kind === 'text' ? s.key : s.kind))).toEqual(['result_가', 'result_나', 'result_다'])
  })
  it('writing boxes: career first when enabled, then motive → questions → … → references', () => {
    const keys = writingBoxes({ method: 'data', career: true }).map((b) => (b.kind === 'text' ? b.key : b.kind))
    expect(keys).toEqual(['career', 'motive', 'questions', 'background', 'method', 'result_가', 'result_나', 'result_다', 'conclusion', 'reflection', 'references'])
    expect(writingBoxes({ method: 'none', career: false })[0]).toEqual({ kind: 'text', key: 'motive' })
    expect(activeTextKeys({ method: 'none', career: false })).not.toContain('method')
  })
  it('hides (does not delete) text written in a section removed from the outline; progress counts active boxes', () => {
    const sections = { motive: '동기', method: '설문을 했다', result_가: '가' }
    expect(hiddenTextKeys({ method: 'none', career: true }, sections)).toEqual(['method'])
    expect(hiddenTextKeys({ method: 'survey', career: true }, sections)).toEqual([])
    expect(progressOf({ method: 'none', career: true }, { sections, career_field: '' })).toEqual({ filled: 2, total: 8 })
    expect(progressOf({ method: 'survey', career: false }, { sections, career_field: '' })).toEqual({ filled: 3, total: 8 })
    expect(progressOf({ method: 'none', career: true }, { sections, career_field: '교사' })).toEqual({ filled: 3, total: 8 })
  })
  it('guideFor: task overrides win, method guide follows the chosen method, result boxes carry the question key', () => {
    const task = { section_guides: { motive: { question: '왜 궁금했나요', length: '3줄' }, background: { question: '', length: '' } } }
    expect(guideFor({ kind: 'text', key: 'motive' }, task, { method: 'none', career: true }, copy)).toEqual({ title: copy.section.motive.title, guide: '왜 궁금했나요', length: '3줄' })
    expect(guideFor({ kind: 'text', key: 'background' }, task, { method: 'none', career: true }, copy).guide).toBe(copy.section.background.guide)
    expect(guideFor({ kind: 'text', key: 'method' }, task, { method: 'experiment', career: true }, copy).guide).toBe(copy.methodGuide.experiment)
    expect(guideFor({ kind: 'text', key: 'result_나', question: '나' }, task, { method: 'none', career: true }, copy).title).toBe(copy.section.result.title('나'))
    expect(guideFor({ kind: 'references' }, task, { method: 'none', career: true }, copy).title).toBe(copy.section.references.title)
  })
})

describe('publish gate (§4)', () => {
  it('passes the full task and only counts verified sources', () => {
    expect(publishGate(fullTask())).toEqual({ ok: true, missing: [] })
    const t = fullTask(); t.sources[1] = { ...t.sources[1], verified: null }
    const g = publishGate(t)
    expect(g.ok).toBe(false)
    expect(g.missing).toEqual([{ kind: 'papers', need: 1 }, { kind: 'question', key: '나' }])
    expect(visibleSources(t).map((s) => s.id)).toEqual(['p1', 'n1', 'b1'])
  })
  it('lists everything missing in Korean copy without blocking anything else', () => {
    const t = { ...emptyTask(), title: '' }
    const g = publishGate(t)
    const msgs = gateMessages(g.missing, copy.gate)
    expect(msgs).toContain(copy.gate.title)
    expect(msgs).toContain(copy.gate.subjects)
    expect(msgs).toContain(copy.gate.questionText('가'))
    expect(msgs).toContain(copy.gate.papers(2))
    expect(msgs).toContain(copy.gate.news)
    expect(msgs).toContain(copy.gate.book)
    expect(msgs).toContain(copy.gate.question('다'))
    for (const m of msgs) expect(/[가-힣]/.test(m)).toBe(true)
  })
  it('a verified source without title or url is flagged', () => {
    const t = fullTask(); t.sources[0] = { ...t.sources[0], url: '' }
    expect(publishGate(t).missing).toEqual([{ kind: 'sourceIncomplete', title: '제목 p1' }])
  })
})

describe('references', () => {
  it('formats paper / news / book like the owner samples', () => {
    expect(formatReference(src({ id: 'p', kind: 'paper', authors: '조지연, 조유진', year: '2022', title: '선행 제도의 문제점', container: '한국환경정책학회 학술대회논문집', detail: '75-76쪽', url: 'https://d/1' })))
      .toBe('조지연, 조유진. (2022). 선행 제도의 문제점. 한국환경정책학회 학술대회논문집, 75-76쪽. https://d/1')
    expect(formatReference(src({ id: 'n', kind: 'news', authors: '장관순', year: '2024', date: '2024-10-26', title: "규제 줄줄이 '번복'", container: 'CBS노컷뉴스', detail: '', url: 'https://n/1' })))
      .toBe("장관순. (2024-10-26). 규제 줄줄이 '번복'. CBS노컷뉴스. https://n/1")
    expect(formatReference(src({ id: 'b', kind: 'book', authors: '마라 록클리프 (옮긴이 제효영)', year: '2011', title: '우리가 지구를 착한 별로 만들거야', container: '명진출판', detail: '224쪽', url: 'https://b/1' })))
      .toBe('마라 록클리프 (옮긴이 제효영). (2011). 우리가 지구를 착한 별로 만들거야. 명진출판.')
  })
  it('skips empty parts and orders checked sources paper → news → book', () => {
    expect(formatReference(src({ id: 'x', kind: 'book', authors: '', year: '', container: '', detail: '', title: '제목만.' }))).toBe('제목만.')
    const t = fullTask()
    expect(referenceLines(t.sources, ['b1', 'n1', 'p2', 'zzz']).map((l) => l.split('.')[0])).toEqual(['홍길동', '홍길동', '홍길동'])
    expect(referenceLines(t.sources, ['b1', 'n1', 'p2']).map((l) => l.includes('제목 ') && l.match(/제목 (\w+)/)?.[1])).toEqual(['p2', 'n1', 'b1'])
    expect(referenceLines(t.sources, [])).toEqual([])
  })
})
