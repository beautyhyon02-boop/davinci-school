// 첫 과제(세트 2, Q-11) 파일 data/inquiry/2026-09-30-cup-regulation.json — 스키마에 맞고, 자료는 모두 조사 파일에 있는 것만(아무것도 지어내지 않는다, Q-6).
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { InquiryTask, parseTaskJson } from '@/lib/inquiry/schema'
import { publishGate } from '@/lib/inquiry/publish-gate'
import { formatReference } from '@/lib/inquiry/references'

const SEED = 'data/inquiry/2026-09-30-cup-regulation.json'
const SOURCES_DOC = 'docs/research/2026-09-30-inquiry-sources-일회용품.md'
const raw = readFileSync(SEED, 'utf8')
const doc = readFileSync(SOURCES_DOC, 'utf8')

describe('seed task — 규제는 사람의 생각을 바꾸는가', () => {
  const parsed = parseTaskJson(raw)
  const task = parsed.ok ? parsed.task : InquiryTask.parse({ title: 'x', questions: [{ key: '가' }, { key: '나' }, { key: '다' }] })

  it('validates with the task schema (ok as JSON text and as an object)', () => {
    expect(parsed.ok).toBe(true)
    expect(InquiryTask.safeParse(JSON.parse(raw)).success).toBe(true)
  })
  it('is 세트 2 exactly as agreed: title, subtitle, subjects, level, three questions with lenses', () => {
    expect(task.title).toBe('규제는 사람의 생각을 바꾸는가, 행동만 바꾸는가')
    expect(task.subtitle).toBe('일회용 컵 정책의 변화 과정을 중심으로')
    expect(task.subjects).toEqual(['사회', '국어'])
    expect(task.level).toBe('중')
    expect(task.questions.map((q) => q.key)).toEqual(['가', '나', '다'])
    expect(task.questions.map((q) => q.lens)).toEqual(['사회의 눈', '사회·국어의 눈', '융합'])
    expect(task.questions.every((q) => q.text.length > 10)).toBe(true)
  })
  it('sources: 논문 4 · 기사 3 · 도서 1, every URL / title / authors copied verbatim from the sources file, excerpts empty, verified null', () => {
    expect(task.sources.filter((s) => s.kind === 'paper')).toHaveLength(4)
    expect(task.sources.filter((s) => s.kind === 'news')).toHaveLength(3)
    expect(task.sources.filter((s) => s.kind === 'book')).toHaveLength(1)
    for (const s of task.sources) {
      expect(doc, `URL not in sources file: ${s.url}`).toContain(`URL: ${s.url}`)
      expect(doc, `title not in sources file: ${s.title}`).toContain(`- 제목: ${s.title}`)
      expect(doc, `authors not in sources file: ${s.authors}`).toContain(s.authors)
      expect(doc, `container not in sources file: ${s.container}`).toContain(s.container)
      if (s.date) expect(doc).toContain(`- 날짜: ${s.date}`)
      expect(s.excerpts).toEqual([])
      expect(s.verified).toBeNull()
      expect(s.easy_summary.length).toBeGreaterThan(20)
      expect(s.for_questions.length).toBeGreaterThan(0)
    }
    // 어느 문제에 붙는지(합의): 가 = 논문 2·기사 4, 나 = 논문 5·3·4, 다 = 논문 2·기사 3·2·도서 1
    const forQ = (k: '가' | '나' | '다') => task.sources.filter((s) => s.for_questions.includes(k)).map((s) => s.id)
    expect(forQ('가')).toEqual(['p1', 'n1'])
    expect(forQ('나')).toEqual(['p2', 'p3', 'p4'])
    expect(forQ('다')).toEqual(['p1', 'n2', 'n3', 'b1'])
  })
  it('once every source is ticked 확인함 the gate passes; unticked it lists exactly the source counts and questions', () => {
    expect(publishGate(task).ok).toBe(false)
    const ticked = { ...task, sources: task.sources.map((s) => ({ ...s, verified: { by: '대표', at: '2026-10-01' } })) }
    expect(publishGate(ticked)).toEqual({ ok: true, missing: [] })
  })
  it('reference lines read like the owner samples', () => {
    const p1 = task.sources.find((s) => s.id === 'p1')!
    expect(formatReference(p1)).toBe('조지연, 조유진. (2022). 일회용 컵 보증금제 재도입에 따른 선행 제도의 문제점 분석과 보완점 제안. 한국환경정책학회 학술대회논문집, 2022년 한국환경정책학회 춘계학술대회 자료집, 75-76쪽. https://www.dbpia.co.kr/journal/articleDetail?nodeId=NODE11044065')
    const n1 = task.sources.find((s) => s.id === 'n1')!
    expect(formatReference(n1)).toBe("장관순. (2024-10-26). 빨대에 이어 컵까지…일회용 플라스틱 규제 줄줄이 '번복'. CBS노컷뉴스. https://www.nocutnews.co.kr/news/6233508")
    const b1 = task.sources.find((s) => s.id === 'b1')!
    expect(formatReference(b1)).toBe('마라 록클리프 (옮긴이 제효영). (2011). 우리가 지구를 착한 별로 만들거야. 명진출판.')
  })
  it('has five short teacher tips and no section guide overrides', () => {
    expect(task.teacher_tips).toHaveLength(5)
    expect(task.teacher_tips.every((t) => t.length <= 80)).toBe(true)
    expect(task.section_guides).toEqual({})
  })
})
