// tests/exemplars-select.test.ts
import { describe, it, expect } from 'vitest'
import { selectExemplars, scoreExemplar, exemplarCard, exemplarsBlock, loadExemplarBank, type ExemplarRecord } from '@/lib/reference/exemplars'

const rec = (over: Partial<ExemplarRecord>): ExemplarRecord => ({
  id: 'x', subject: '수학', school_level: '중', grade: 1, unit: '자료의 정리', standard_codes: ['[9수04-02]'], kind: '서술형', points: 3, context: 'c', materials: [],
  stem: '도수분포표를 완성하시오.', conditions: ['표를 채울 것'], answer_format: '표', rubric: { type: '분석적', criteria: [{ name: '표 완성', levels: [{ points: 3, desc: '정확' }] }], notes: '반올림 허용' },
  exemplar_answers: [{ level: '만점', text: 'a'.repeat(400) }], feedback: 'f', cognitive: ['과정·기능'], source: { file: 'x.pdf', pages: [1, 2] }, ...over,
})
const q = { subject: '수학', school_level: '중' as const, grade: 1, codes: ['[9수04-02]'], unit: '자료의 정리', kind: '서술형' as const }

describe('exemplar selection', () => {
  it('scores by code > domain prefix > unit > grade > kind > rubric/answers > 2025', () => {
    expect(scoreExemplar(rec({}), q)).toBe(4 + 3 + 2 + 2 + 3 + 1 + 1)
    expect(scoreExemplar(rec({ standard_codes: ['[9수04-05]'], unit: '다른' }), q)).toBe(3 + 2 + 3 + 1 + 1)
    expect(scoreExemplar(rec({ kind: '논술형' }), { ...q, kind: '논술형' })).toBe(4 + 3 + 2 + 2 + 3 + 1 + 1)
    expect(scoreExemplar(rec({ id: 'k25-과학-01', requires_drawing: true }), { ...q, answerMode: 'screen' })).toBe(4 + 3 + 2 + 2 + 3 + 1 + 1 + 1 - 2)
  })
  it('is deterministic (ties by id) and widens school level when fewer than 3 candidates', () => {
    const bank = [rec({ id: 'b', school_level: '고' }), rec({ id: 'a' }), rec({ id: 'c', school_level: '고' })]
    expect(selectExemplars(q, 3, bank).map((r) => r.id)).toEqual(['a', 'b', 'c'])
  })
  it('card is compact and cites the source; block lists 3~5 cards', () => {
    const card = exemplarCard(rec({}))
    expect(card.length).toBeLessThanOrEqual(900)
    expect(card).toContain('x.pdf p.1-2'); expect(card).toContain('반올림 허용')
    const block = exemplarsBlock(q, 4, [rec({ id: '1' }), rec({ id: '2' }), rec({ id: '3' })])
    expect(block.split('\n[예시 ').length - 1).toBe(3)
    expect(block).toMatch(/그대로 옮기지 않는다/)
  })
  it('loads the real bank once and finds 수학·중 records for [9수04-02] neighbours', () => {
    const bank = loadExemplarBank()
    expect(bank.length).toBeGreaterThan(400)
    const picked = selectExemplars(q, 4)
    expect(picked.length).toBeGreaterThanOrEqual(3)
    expect(picked.every((r) => r.subject === '수학')).toBe(true)
  })
  it('every real-bank card stays <=900 chars and always cites the full, untruncated source', () => {
    const bank = loadExemplarBank()
    for (const r of bank) {
      const card = exemplarCard(r)
      expect(card.length).toBeLessThanOrEqual(900)
      const firstLine = card.split('\n')[0]
      expect(firstLine.startsWith(`[예시 ${r.id}]`)).toBe(true)
      const pages = r.source.pages.length ? ` p.${r.source.pages[0]}${r.source.pages.length > 1 ? `-${r.source.pages[r.source.pages.length - 1]}` : ''}` : ''
      const expectedSource = `출처: ${r.source.file}${pages}`
      const sourceLine = card.split('\n').find((l) => l.startsWith('출처: '))
      expect(sourceLine).toBe(expectedSource)
    }
  })
  it('keeps the source line intact even when every field is absurdly long', () => {
    const huge = rec({
      context: 'c'.repeat(3000), stem: 's'.repeat(3000), conditions: ['d'.repeat(3000)],
      rubric: { type: '분석적', criteria: [{ name: 'n'.repeat(500), levels: [{ points: 3, desc: '정확' }] }], notes: 'm'.repeat(3000) },
      exemplar_answers: [{ level: '만점', text: 'a'.repeat(3000) }], source: { file: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.pdf', pages: [1, 2] },
    })
    const card = exemplarCard(huge)
    expect(card.length).toBeLessThanOrEqual(900)
    expect(card).toContain('출처: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.pdf p.1-2')
    expect(card.split('\n').at(-1)).toBe('출처: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.pdf p.1-2')
    expect(card.startsWith(`[예시 ${huge.id}]`)).toBe(true)
  })
})
