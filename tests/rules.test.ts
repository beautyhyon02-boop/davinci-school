import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { rulesFor, allRuleIds, COMMON_RULES, SUBJECT_RULES, NOTICE_RULES, GRADING_RULES_V2 } from '@/lib/studio/prompts/rules/index'

describe('rules v2', () => {
  it('every rule id is unique and appears exactly once in the spec appendix', () => {
    const ids = allRuleIds()
    expect(new Set(ids).size).toBe(ids.length)
    const spec = readFileSync('docs/superpowers/specs/2026-09-25-item-studio-v2-design.md', 'utf8')
    for (const id of ids) expect(spec.split(`| ${id} |`).length - 1, id).toBe(1)
    // 부록 A: 공통 32(C-31 대표 확정값, C-32 조건=지침(2026-09-26) 포함) + 차시 12 + 과목 36(국6·수7·사6·역3·과7·영7) + 채점 9 + 안내장 12
    expect(ids.length).toBe(32 + 12 + 36 + 9 + 12)
  })
  it('the spec appendix has no rule row that the code lacks', () => {
    const spec = readFileSync('docs/superpowers/specs/2026-09-25-item-studio-v2-design.md', 'utf8')
    const appendix = spec.slice(spec.indexOf('## 부록 A'), spec.indexOf('## 부록 B'))
    const specIds = [...appendix.matchAll(/^\| ([CLGN]-\d{2}|S-[^-|]+-\d{2}) \|/gm)].map((m) => m[1])
    expect(specIds.slice().sort()).toEqual(allRuleIds().slice().sort())
  })
  it('rulesFor joins common + lesson + subject rules with ids, excludes 운영(O) rules, and stays stable', () => {
    const math = rulesFor('수학')
    expect(math).toMatch(/^C-01 /m); expect(math).toMatch(/^L-05 /m); expect(math).toMatch(/^S-수-01 /m)
    expect(math).not.toMatch(/S-국-01/); expect(math).not.toMatch(/^C-23 /m)
    expect(rulesFor('수학')).toBe(rulesFor('수학'))
    expect(rulesFor('한국사')).toMatch(/S-역-01/); expect(rulesFor('세계사')).toMatch(/S-역-01/)
    expect(rulesFor('')).not.toMatch(/^S-/m)
  })
  it('keeps the owner-bound numbers in the text', () => {
    const all = COMMON_RULES.concat(Object.values(SUBJECT_RULES).flat()).map((r) => r.text).join('\n')
    expect(all).toMatch(/서술형 2개\(각 3점\) \+ 논술형 1개\(16점\)/)
    expect(all).toMatch(/4요소 × 0~4점/)
    expect(NOTICE_RULES.map((r) => r.id)).toEqual(Array.from({ length: 12 }, (_, i) => `N-${String(i + 1).padStart(2, '0')}`))
    expect(GRADING_RULES_V2.map((r) => r.id)[0]).toBe('G-01')
  })
  it('C-32 (대표 2026-09-26): 조건은 지침이지 풀이 힌트가 아니고 논술형에만 둔다; C-11은 풀이 단계 쪼개기를 뜻하지 않는다', () => {
    const c32 = COMMON_RULES.find((r) => r.id === 'C-32')!
    expect(c32.tags).toEqual(['대표', 'v2-0926']); expect(c32.nature).toBe('PS')
    for (const s of ['지침이지 풀이 힌트가 아니다', '논술형', '서술형에는 조건을 두지 않는다', '2~4개', '입장', '근거 개수', '인용할 자료', '분량', '초과 응답', '계산식', '반올림', '순서', '결론']) expect(c32.text, s).toContain(s)
    const c11 = COMMON_RULES.find((r) => r.id === 'C-11')!.text
    expect(c11).not.toMatch(/행동 동사 단위로 쪼개/); expect(c11).toMatch(/요건 하나당 한 줄/)
    expect(COMMON_RULES.find((r) => r.id === 'C-01')!.text).toMatch(/빈 배열/)
    // 과목 규칙도 서술형 조건·풀이 힌트를 요구하지 않는다
    const subj = Object.values(SUBJECT_RULES).flat().map((r) => r.text).join('\n')
    expect(subj).not.toMatch(/핵심 채점 포인트를 조건에 명시/); expect(subj).not.toMatch(/조건 3~5개/); expect(subj).not.toMatch(/서술형은 조건-점수/)
    const spec = readFileSync('docs/superpowers/specs/2026-09-25-item-studio-v2-design.md', 'utf8')
    expect(spec).toContain(`| C-32 | ${c32.text} |`)
  })
})
