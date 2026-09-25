import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { rulesFor, allRuleIds, COMMON_RULES, LESSON_RULES, SUBJECT_RULES, NOTICE_RULES, GRADING_RULES_V2 } from '@/lib/studio/prompts/rules/index'

describe('rules v2', () => {
  it('every rule id is unique and appears exactly once in the spec appendix', () => {
    const ids = allRuleIds()
    expect(new Set(ids).size).toBe(ids.length)
    const spec = readFileSync('docs/superpowers/specs/2026-09-25-item-studio-v2-design.md', 'utf8')
    for (const id of ids) expect(spec.split(`| ${id} |`).length - 1, id).toBe(1)
    // 부록 A: 공통 33(C-31 대표 확정값, C-32 조건=지침(2026-09-26), C-33 자료 설계·유형(대표 연수 2기) 포함) + 차시 12 + 과목 36(국6·수7·사6·역3·과7·영7) + 채점 9 + 안내장 12
    expect(ids.length).toBe(33 + 12 + 36 + 9 + 12)
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
    expect(all).toMatch(/서술형 1문항\(6점, 채점 요소 2~3개\) \+ 논술형 1문항\(16점, 4요소 × 0~4점\) = 22점/)
    expect(all).toMatch(/4요소 × 0~4점/)
    expect(NOTICE_RULES.map((r) => r.id)).toEqual(Array.from({ length: 12 }, (_, i) => `N-${String(i + 1).padStart(2, '0')}`))
    expect(GRADING_RULES_V2.map((r) => r.id)[0]).toBe('G-01')
  })
  it('세트 구조 (대표 2026-09-26): C-31·C-15·C-14·L-09 와 과목 규칙이 서술형 1 + 논술형 1, 단원 평가 차시를 말한다', () => {
    const text = (id: string) => [...COMMON_RULES, ...LESSON_RULES, ...Object.values(SUBJECT_RULES).flat()].find((r) => r.id === id)!
    expect(text('C-31').tags).toContain('대표'); expect(text('C-31').text).toMatch(/두 문항 모두 분석적 \+ 총체적/); expect(text('C-31').text).toMatch(/0~6/)
    expect(text('C-15').text).toMatch(/서술형·논술형 모두/); expect(text('C-15').text).not.toMatch(/holistic=null|분석적 하나만/); expect(text('C-15').tags).toContain('대표')
    expect(text('C-14').text).toMatch(/6점이면 6·5·4·3·2·1/)
    const l09 = text('L-09').text
    expect(l09).toMatch(/마지막 교수 차시까지 모두/); expect(l09).toMatch(/단원 평가 차시/); expect(l09).toMatch(/서술형 작성 15/); expect(l09).toMatch(/논술형 작성 35/)
    expect(l09).not.toMatch(/서술형1·2|논술형을 배치한 차시는 마무리 퀴즈 0문항/)
    // 대표 2026-09-26: 서논술 과정이라 객관식은 없다 — 퀴즈는 단답형만(L-09·L-10), 어느 규칙도 선택형 퀴즈를 말하지 않는다
    expect(l09).toMatch(/모두 단답형 — 낱말·수치·짧은 구를 직접 쓰는 문항, 선택지 없음/); expect(l09).not.toMatch(/선택형/)
    expect(text('L-10').text).toMatch(/답은 낱말·수치·짧은 구; 정답과 한두 줄 해설/)
    // 필수 용어는 문두(전제문·발문)에 — 조건에 쓰지 않는다(C-32와 충돌 해소, 리드 판정 2026-09-26)
    expect(text('S-과-03').text).toMatch(/문두/); expect(text('S-과-03').text).toMatch(/조건에는 쓰지 않/)
    expect(text('S-영-05').text).toMatch(/C-32/)
    expect(text('S-수-02').text).not.toMatch(/저배점\(3점\)/)
    const all = [...COMMON_RULES, ...LESSON_RULES, ...Object.values(SUBJECT_RULES).flat()].map((r) => r.text).join('\n')
    expect(all).not.toMatch(/서술형 2개|서술형1|서술형2|서술형 두 문항/)
    expect(all).not.toMatch(/선택형\/단답형|선택형 퀴즈/)
    const spec = readFileSync('docs/superpowers/specs/2026-09-25-item-studio-v2-design.md', 'utf8')
    for (const id of ['C-14', 'C-15', 'C-31', 'L-05', 'L-09', 'L-10', 'S-수-01', 'S-수-02', 'S-과-03', 'S-영-05']) {
      const r = text(id)
      const row = spec.split('\n').find((line) => line.startsWith(`| ${id} |`))!
      // 이번에 고친 행은 스펙 부록 A 문장이 코드 문장과 글자까지 같다
      expect(row, id).toContain(`| ${id} | ${r.text} |`)
    }
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

// 대표 연수 2기 실습-2(2026-09-02): 핵심질문 6단계(p.3~14) → L-04, 자료 설계·유형(p.15~17) → C-33. 스펙 부록 A 행은 코드 문장과 글자까지 같다.
describe('대표 연수 2기: L-04 핵심질문 6단계, C-33 자료 설계·유형', () => {
  const spec = readFileSync('docs/superpowers/specs/2026-09-25-item-studio-v2-design.md', 'utf8')
  const row = (id: string) => spec.split('\n').find((line) => line.startsWith(`| ${id} |`))!
  it('L-04 names the 6 steps, the two axes (무엇인가 + 어떻게 알 수 있는가), 주장·감상 as 입장/인상 + 근거, reuse across materials, and "not an item sentence"', () => {
    const l04 = LESSON_RULES.find((r) => r.id === 'L-04')!
    expect(l04.nature).toBe('P'); expect(l04.tags).toContain('대표-연수2기')
    for (const s of ['6단계', '기능어', '핵심 이해', '질문형', '수업 전체를 끌고 가는지', '문항과 구분', '"무엇인가?" + "어떻게 알 수 있는가?"',
      '그렇게 판단할 수 있는 단서는 무엇인가', '무엇이 같고 다르며', '주장한다는 입장 + 근거', '감상한다는 인상 + 근거', '자료를 바꿔도 반복해 쓸 수 있고',
      '단원 평가 문항', '문항 문장이 아니므로', '자료 지시·응답 방식', '도입 제시·전개 상기·정리 재확인']) expect(l04.text, s).toContain(s)
    expect(row('L-04')).toContain(`| L-04 | ${l04.text} |`)
    expect(row('L-04')).toContain('[대표-연수2기]')
  })
  it('C-33 carries the material type table by 기능어 and the design principles (PS, 대표-연수2기), and reaches the generation prompt', () => {
    const c33 = COMMON_RULES.find((r) => r.id === 'C-33')!
    expect(c33.nature).toBe('PS'); expect(c33.tags).toEqual(['대표-연수2기'])
    for (const s of ['형식보다 사고를 먼저', '기능어 → 핵심 단서 → 최종 답안의 방향',
      '추론형은 짧은 대화문·메시지·안내문·광고문·이메일·짧은 글', '주장형은 서로 다른 입장이 드러나는 짧은 자료 2개·통계 사례·찬반 상황 자료',
      '비교형은 두 대상 소개문·표·그래프·설명글 2개', '파악형은 연표·사료·기사·요약문·개념도·설명문', '이해·적용형은 실험 결과·생활 사례·그림·도식·조건 제시문',
      '친숙하게', '노골적이지도 너무 모호하지도', '표현·어조·반복·상황 맥락']) expect(c33.text, s).toContain(s)
    expect(row('C-33')).toContain(`| C-33 | ${c33.text} | P+S | [대표-연수2기] |`)
    expect(rulesFor('과학')).toMatch(/^C-33 자료는 형식보다 사고를 먼저/m)
    // 태그 범례에 출처가 있다
    expect(spec).toContain('`[대표-연수2기]` 대표 교사 연수 2기 실습-2')
  })
  it('C-32 cites the material by its item-local number (<자료 1>), not by a set letter', () => {
    const c32 = COMMON_RULES.find((r) => r.id === 'C-32')!.text
    expect(c32).toContain('<자료 1>의 수치를 근거로'); expect(c32).not.toContain('자료 B의 수치')
  })
})

describe('학년 선택(대표 2026-09-26): 규칙은 학교급(학년군) 수준을 말한다', () => {
  const all = [...COMMON_RULES, ...LESSON_RULES, ...Object.values(SUBJECT_RULES).flat()]
  const spec = readFileSync('docs/superpowers/specs/2026-09-25-item-studio-v2-design.md', 'utf8')
  it('C-24 says 교육과정 학교급(학년군) 수준 and S-영-07·S-국-01·S-수-05·S-수-06 no longer pin 중1; spec 부록 A rows are identical', () => {
    const c24 = all.find((r) => r.id === 'C-24')!
    expect(c24.text).toContain('교육과정 학교급(학년군) 수준')
    expect(c24.text).not.toMatch(/교육과정 학년 수준/)
    expect(c24.tags).toContain('v2-0926')
    const e07 = all.find((r) => r.id === 'S-영-07')!
    expect(e07.text).not.toMatch(/중1/); expect(e07.text).toMatch(/학년군/)
    const pinned = ['S-국-01', 'S-수-05', 'S-수-06'].map((id) => all.find((r) => r.id === id)!)
    expect(pinned[0].text).toContain('중학교는 각 200~400자'); expect(pinned[1].text).toContain('중학교는 선택')
    expect(pinned[2].text).toContain('학년을 정하지 않았으면 성취기준 원문에')
    for (const r of [c24, e07, ...pinned]) {
      const row = spec.split('\n').find((line) => line.startsWith(`| ${r.id} |`))!
      expect(row, r.id).toContain(`| ${r.id} | ${r.text} |`)
    }
  })
  it('no generation rule pins a single grade (중1·N학년) — 학생 학년 어휘(채점 G-05)는 학생 학년이라 그대로', () => {
    const text = all.map((r) => r.text).join('\n')
    expect(text).not.toMatch(/중1은|중1 이하|중1 어휘|[1-6]학년 /)
    expect(text).not.toMatch(/교육과정 학년 수준/)
  })
})
