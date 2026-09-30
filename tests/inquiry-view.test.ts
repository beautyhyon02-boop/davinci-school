// 탐구보고서 한 부(InquiryReportView)와 학생 쓰기 화면(InquiryWriter)을 서버 렌더로 확인한다 — 설계 §6·§7.
import { describe, it, expect, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { InquiryReportView } from '@/components/inquiry/InquiryReportView'
import { parseTaskJson, emptyReport, type InquiryReport } from '@/lib/inquiry/schema'
import { app } from '@/content/site'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('@/app/student/inquiry/[assignmentId]/actions', () => ({ saveInquiryPatch: vi.fn(), submitInquiry: vi.fn() }))
const { InquiryWriter } = await import('@/app/student/inquiry/[assignmentId]/InquiryWriter')

const copy = app.inquiry
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#x27;/g, "'").replace(/\s+/g, ' ')
const seed = parseTaskJson(readFileSync('data/inquiry/2026-09-30-cup-regulation.json', 'utf8'))
const task = seed.ok ? seed.task : (() => { throw new Error('seed') })()
const sources = task.sources.map((s) => ({ ...s, verified: { by: '대표', at: '2026-10-01T00:00:00.000Z' } }))

const report: InquiryReport = {
  ...emptyReport(),
  sections: { motive: '카페에서 컵 보증금 안내문을 보고 궁금했다.', background: '보증금제는 2002년에 처음 시작됐다.', method: '설문을 했다(숨김)', result_가: '규제는 세 번 바뀌었다.', result_나: '', result_다: '반납이 쉬워야 한다.', conclusion: '규칙은 행동을 먼저 바꾼다.', reflection: '생각이 달라졌다.' },
  questions: [{ key: '나', text: '내가 고친 나 문제' }],
  used_source_ids: ['p1', 'n1', 'b1'],
  career_field: '환경 기자',
}

describe('InquiryReportView', () => {
  const html = renderToStaticMarkup(createElement(InquiryReportView, { task, outline: { method: 'none', career: true }, report, sources, studentName: '김하늘', academyName: '다빈치 하늘원' }))
  const t = text(html)

  it('cover: title, subtitle, blank 학년·반·번호 lines, the name from the profile, 융합 과목, 희망 진로', () => {
    const cover = html.slice(html.indexOf('data-inquiry-page="cover"'), html.indexOf('data-inquiry-page="toc"'))
    const c = text(cover)
    expect(c).toContain(task.title); expect(c).toContain(task.subtitle)
    expect(c).toContain('김하늘'); expect(c).toContain('다빈치 하늘원')
    expect(c).toContain(copy.view.subjectsLine(['사회', '국어']))
    expect(c).toContain(copy.view.careerLine('환경 기자'))
    for (const f of [copy.view.coverFields.grade, copy.view.coverFields.klass, copy.view.coverFields.number, copy.view.coverFields.name]) expect(c).toContain(f)
    expect(cover.split('data-inquiry-blank').length - 1).toBe(4)
  })
  it('차례 and body chapters: Ⅰ 서론 … Ⅵ 참고문헌 with 탐구 방법 omitted (numbering pulled forward)', () => {
    expect(t).toContain('Ⅰ. 서론'); expect(t).toContain('Ⅱ. 이론적 배경'); expect(t).toContain('Ⅲ. 탐구 결과')
    expect(t).toContain('Ⅳ. 결론'); expect(t).toContain('Ⅴ. 배우고 느낀 점'); expect(t).toContain('Ⅵ. 참고문헌')
    expect(t).not.toContain('탐구 방법'); expect(t).not.toContain('숨김')
    expect(html.split('data-inquiry-chapter=').length - 1).toBe(6)
  })
  it('body: motive, the student-edited question, result boxes with the question above, empty box note, references only for checked sources', () => {
    expect(t).toContain('카페에서 컵 보증금 안내문을 보고 궁금했다.')
    expect(t).toContain('내가 고친 나 문제')
    expect(t).toContain(copy.view.emptySection)          // result_나 is empty
    const refs = html.slice(html.indexOf('data-inquiry-references'))
    expect(refs.split('<li').length - 1).toBe(3)
    expect(text(refs)).toContain('조지연, 조유진. (2022).')
    expect(text(refs)).toContain('장관순. (2024-10-26).')
    expect(text(refs)).toContain('명진출판.')
    expect(text(refs)).not.toContain('정진영')
  })
  it('with 탐구 방법 chosen the chapter appears as Ⅲ and the hidden text comes back', () => {
    const h = text(renderToStaticMarkup(createElement(InquiryReportView, { task, outline: { method: 'survey', career: false }, report, sources, studentName: '김하늘' })))
    expect(h).toContain('Ⅲ. 탐구 방법'); expect(h).toContain('설문을 했다(숨김)'); expect(h).toContain('Ⅳ. 탐구 결과'); expect(h).toContain('Ⅶ. 참고문헌')
    expect(h).not.toContain(copy.view.careerLine('환경 기자'))
  })
})

describe('InquiryWriter (server render)', () => {
  const props = { assignmentId: '11111111-1111-4111-8111-111111111111', task, outline: { method: 'none' as const, career: true }, sources, initial: report, status: 'assigned' as const, studentName: '김하늘', academyName: '다빈치 하늘원' }
  const html = renderToStaticMarkup(createElement(InquiryWriter, props))
  const t = text(html)

  it('stacks the boxes in outline order with title, guide, length, char count and the 3 prefilled questions', () => {
    const order = [...html.matchAll(/data-inquiry-box="([^"]+)"/g)].map((m) => m[1])
    expect(order).toEqual(['career', 'motive', 'questions', 'background', 'result_가', 'result_나', 'result_다', 'conclusion', 'reflection', 'references'])
    expect(t).toContain(copy.section.motive.guide); expect(t).toContain(copy.section.motive.length)
    expect(t).toContain(copy.section.result.title('가'))
    expect(html).toContain('내가 고친 나 문제')
    expect(html).toContain(task.questions[0].text)
    expect(t).toContain(copy.student.page.maxChars(report.sections.motive!.length, 3000))
  })
  it('shows each result box only the sources attached to that question, with easy summary and a new-tab link; references checklist previews formatted lines', () => {
    const boxOf = (key: string) => { const i = html.indexOf(`data-inquiry-box="${key}"`); const j = html.indexOf('data-inquiry-box=', i + 1); return html.slice(i, j < 0 ? undefined : j) }
    const ga = boxOf('result_가'); const na = boxOf('result_나')
    expect([...ga.matchAll(/data-inquiry-source="([^"]+)"/g)].map((m) => m[1])).toEqual(['p1', 'n1'])
    expect([...na.matchAll(/data-inquiry-source="([^"]+)"/g)].map((m) => m[1])).toEqual(['p2', 'p3', 'p4'])
    expect(text(ga)).toContain(sources[0].easy_summary)
    expect(ga).toContain('target="_blank"'); expect(ga).toContain(sources[0].url)
    const refs = boxOf('references')
    expect(refs.split('type="checkbox"').length - 1).toBe(8)
    expect(refs.split('checked=""').length - 1).toBe(3)
    expect(text(refs)).toContain('조지연, 조유진. (2022).')
    expect(t).toContain(copy.student.page.submit)
    expect(t).toContain(copy.student.page.emptyBoxes(1))
  })
  it('after submit it is read-only: the note and the report view, no textarea', () => {
    const h = renderToStaticMarkup(createElement(InquiryWriter, { ...props, status: 'submitted' }))
    expect(h).not.toContain('<textarea')
    expect(text(h)).toContain(copy.student.page.submittedNote)
    expect(h).toContain('data-inquiry-report')
  })
})
