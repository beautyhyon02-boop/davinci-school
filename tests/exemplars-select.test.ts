// tests/exemplars-select.test.ts
import { describe, it, expect } from 'vitest'
import { selectExemplars, scoreExemplar, exemplarCard, exemplarsBlock, exemplarFull, exemplarsBlockFull, FULL_MAX, loadExemplarBank, type ExemplarRecord } from '@/lib/reference/exemplars'

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

describe('학년 선택(대표 2026-09-26): 학년 없는 질의', () => {
  it('ignores grade when the query has none (null or missing) — no grade bonus, same pick otherwise', () => {
    const { grade: _g, ...noGradeQ } = q
    void _g
    expect(scoreExemplar(rec({}), { ...q, grade: null })).toBe(4 + 3 + 2 + 3 + 1 + 1)
    expect(scoreExemplar(rec({}), noGradeQ)).toBe(4 + 3 + 2 + 3 + 1 + 1)
    expect(scoreExemplar(rec({ grade: 3 }), { ...q, grade: null })).toBe(scoreExemplar(rec({ grade: 1 }), { ...q, grade: null }))
  })
})

describe('통째 예시(5단계, 대표 2026-09-26): exemplarFull · exemplarsBlockFull', () => {
  const flat = (s: string) => s.replace(/\s+/g, ' ').trim()
  const sourceOf = (r: ExemplarRecord) => `출처: ${r.source.file}${r.source.pages.length ? ` p.${r.source.pages[0]}${r.source.pages.length > 1 ? `-${r.source.pages[r.source.pages.length - 1]}` : ''}` : ''}`
  const expectWhole = (r: ExemplarRecord, full: string) => {
    expect(full.startsWith(`[예시 ${r.id}]`)).toBe(true)
    expect(full, r.id).toContain('채점 기준표(')
    for (const c of r.rubric.criteria) {
      expect(full, `${r.id} ${c.name}`).toContain(`· ${flat(c.name)} (만점 `)
      for (const l of c.levels) expect(full, `${r.id} ${c.name} ${l.points}`).toContain(`${l.points ?? '-'}점 ${typeof l.desc === 'string' ? flat(l.desc) : ''}`)
    }
    for (const a of r.exemplar_answers) expect(full, `${r.id} ${a.level}`).toContain(`  (${flat(a.level)}) ${flat(a.text)}`)
    if (r.rubric.notes) expect(full).toContain(flat(r.rubric.notes))
    for (const c of r.conditions) expect(full).toContain(flat(c))
    expect(full.split('\n').at(-1)).toBe(sourceOf(r))
  }

  it('renders a real record whole: every rubric element × every scale step (0점 first), every answer with its level, notes, conditions, source', () => {
    const r = loadExemplarBank().find((x) => x.id === 'math-guidebook-ms-001')!
    expect(r.rubric.criteria.length).toBe(4); expect(r.exemplar_answers.length).toBe(3)
    const full = exemplarFull(r)
    expectWhole(r, full)
    expect(full.length).toBeLessThanOrEqual(FULL_MAX)
    // 척도는 0점부터 오름차순으로 보인다
    for (const row of full.split('\n').filter((l) => l.startsWith('  · '))) {
      const pts = [...row.matchAll(/(?:: | \| )(\d+)점 /g)].map((m) => Number(m[1]))
      expect(pts[0]).toBe(0); expect([...pts].sort((a, b) => a - b)).toEqual(pts)
    }
    // 문두·자료·평가 요소 칸
    expect(full).toContain('문두: '); expect(full).toContain('자료·맥락: ')
  })

  it('every real-bank record with a rubric renders rubric/answers/source whole; the ones that fit are ≤3,500 chars', () => {
    for (const r of loadExemplarBank()) {
      if (!r.rubric?.criteria?.length) continue
      const full = exemplarFull(r)
      expectWhole(r, full)
      const withoutMaterials = full.split('\n').filter((l) => !l.startsWith('자료·맥락:') && !l.startsWith('  - ')).join('\n')
      if (withoutMaterials.length <= FULL_MAX - 150) expect(full.length, r.id).toBeLessThanOrEqual(FULL_MAX)
    }
  })

  it('3,500 cap cuts the 자료 text first and never the rubric, the answers or the source', () => {
    const huge = rec({
      id: 'huge', context: '맥'.repeat(5000), materials: [{ type: '표', summary: '요'.repeat(3000) }],
      rubric: { type: '분석적', criteria: [{ name: '요소 가', levels: [{ points: 0, desc: '무응답' }, { points: 1, desc: '하나만 씀' }, { points: 2, desc: '둘 다 근거와 함께 씀' }] }, { name: '요소 나', levels: [{ points: 2, desc: '형식을 지킴' }, { points: 0, desc: '형식을 어김' }] }], notes: '다른 표현도 인정' },
      exemplar_answers: [{ level: '상', text: '상'.repeat(600) }, { level: '중', text: '중'.repeat(400) }, { level: '하', text: '하'.repeat(200) }],
      source: { file: '긴-원문-자료집-이름.pdf', pages: [10, 11, 12] },
    })
    const full = exemplarFull(huge)
    expect(full.length).toBeLessThanOrEqual(FULL_MAX)
    expectWhole(huge, full)
    expect(full).toMatch(/자료·맥락: 맥+…/)
    expect(full.split('\n').at(-1)).toBe('출처: 긴-원문-자료집-이름.pdf p.10-12')
    // 짧은 레코드는 자르지 않는다
    expect(exemplarFull(rec({ context: '짧은 맥락' }))).toContain('자료·맥락: 짧은 맥락')
  })

  const bank = [
    rec({ id: 's-far', unit: '다른', standard_codes: ['[9수01-01]'] }),
    rec({ id: 's-near' }),
    rec({ id: 's-high', school_level: '고' }),
    rec({ id: 'e-near', kind: '논술형', points: 10 }),
    rec({ id: 'e-other-folder', subject: '수학', kind: '논술형', standard_codes: ['[9수04-01]'] }),   // 새 하위 폴더(경기논술형 등)도 subject 로 들어온다
    rec({ id: 'e-norubric', kind: '논술형', rubric: { type: '분석적', criteria: [] } }),
    rec({ id: 'x-sci', subject: '과학', kind: '논술형' }),
  ]
  const { kind: _k, ...fq } = q
  void _k

  it('picks 1 full 서술형 + 1 full 논술형 (closest by subject → school level → standard/unit; needs a rubric) then 2 cards, no duplicates', () => {
    const block = exemplarsBlockFull(fq, { full: 1, cards: 2 }, bank)
    const heads = [...block.matchAll(/^\[예시 ([^\]]+)\]/gm)].map((m) => m[1])
    expect(heads.slice(0, 2)).toEqual(['s-near', 'e-near'])
    // 카드는 selectExemplars 순위를 그대로 쓴다(그 종류가 3건 미만이면 다른 종류까지 넓혀 점수순 — 기존 카드 규칙)
    expect(heads.slice(2)).toEqual(['e-norubric', 'e-other-folder'])
    expect(heads).not.toContain('x-sci'); expect(heads.slice(0, 2)).not.toContain('e-norubric')
    expect(block.split('채점 기준표(').length - 1).toBe(2)
    expect(block).toMatch(/그대로 옮기지 않는다/)
  })

  it('is deterministic (same output for a shuffled bank and on repeat) and falls back across school levels / kinds', () => {
    const a = exemplarsBlockFull(fq, { full: 1, cards: 2 }, bank)
    expect(exemplarsBlockFull(fq, { full: 1, cards: 2 }, [...bank].reverse())).toBe(a)
    expect(exemplarsBlockFull(fq, { full: 1, cards: 2 }, bank)).toBe(a)
    // 이 학교급에 논술형이 없으면 다른 학교급의 논술형, 그것도 없으면 이 학교급의 다른 종류
    const onlyHighEssay = [rec({ id: 's1' }), rec({ id: 's2', unit: '다른' }), rec({ id: 'e-high', kind: '논술형', school_level: '고' })]
    expect([...exemplarsBlockFull(fq, { full: 1, cards: 0 }, onlyHighEssay).matchAll(/^\[예시 ([^\]]+)\]/gm)].map((m) => m[1])).toEqual(['s1', 'e-high'])
    const noEssay = [rec({ id: 's1' }), rec({ id: 's2', unit: '다른' })]
    expect([...exemplarsBlockFull(fq, { full: 1, cards: 0 }, noEssay).matchAll(/^\[예시 ([^\]]+)\]/gm)].map((m) => m[1])).toEqual(['s1', 's2'])
    expect(exemplarsBlockFull({ ...fq, subject: '없는과목' }, { full: 1, cards: 2 }, bank)).toBe('')
  })

  it('real bank: 수학·중 picks a full 서술형 and a full 논술형, each ≤3,500 chars, deterministically', () => {
    const b1 = exemplarsBlockFull({ ...fq, codes: ['[9수04-02]', '[9수04-03]'], unit: null })
    expect(exemplarsBlockFull({ ...fq, codes: ['[9수04-02]', '[9수04-03]'], unit: null })).toBe(b1)
    const fulls = b1.split('짧은 예시 카드(')[0].split(/\n(?=\[예시 )/).slice(1)
    expect(fulls).toHaveLength(2)
    expect(fulls[0]).toMatch(/^\[예시 \S+\] 수학 \S+ 서술형/); expect(fulls[1]).toMatch(/^\[예시 \S+\] 수학 \S+ (논술형|서·논술형)/)
    for (const f of fulls) expect(f.trimEnd().length).toBeLessThanOrEqual(FULL_MAX)
  })
})
