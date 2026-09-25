import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { rulesFor, allRuleIds, COMMON_RULES, LESSON_RULES, SUBJECT_RULES, NOTICE_RULES, GRADING_RULES_V2, GRADING_PROMPT_RULES } from '@/lib/studio/prompts/rules/index'

describe('rules v2', () => {
  it('every rule id is unique and appears exactly once in the spec appendix', () => {
    const ids = allRuleIds()
    expect(new Set(ids).size).toBe(ids.length)
    const spec = readFileSync('docs/superpowers/specs/2026-09-25-item-studio-v2-design.md', 'utf8')
    for (const id of ids) expect(spec.split(`| ${id} |`).length - 1, id).toBe(1)
    // 부록 A: 공통 36(C-31 대표 확정값, C-32 조건=지침(2026-09-26), C-33 자료 설계·유형(대표 연수 2기), C-34·C-36·C-37 경기2025 포함) + 차시 12 + 과목 37(국6·수7·사6·역3·과8·영7) + 채점 10(G-10 경기2025) + 안내장 12
    expect(ids.length).toBe(36 + 12 + 37 + 10 + 12)
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
    for (const id of ['C-14', 'C-15', 'C-31', 'L-05', 'L-08', 'L-09', 'L-10', 'S-수-01', 'S-수-02', 'S-과-03', 'S-영-05']) {
      const r = text(id)
      const row = spec.split('\n').find((line) => line.startsWith(`| ${id} |`))!
      // 이번에 고친 행은 스펙 부록 A 문장이 코드 문장과 글자까지 같다
      expect(row, id).toContain(`| ${id} | ${r.text} |`)
    }
  })
  it('L-10·L-08 (대표 2026-09-26, "차시 설계나 퀴즈가 너무 쉬운 수준이 아닌지"): 퀴즈 3문항은 성취수준 D~E·C·B 하나씩, 문장 베끼기 금지; 전개는 C 목표 + A~B 확장 1개; 스펙 부록 A 행과 같은 문장', () => {
    const spec = readFileSync('docs/superpowers/specs/2026-09-25-item-studio-v2-design.md', 'utf8')
    const row = (id: string) => spec.split('\n').find((line) => line.startsWith(`| ${id} |`))!
    const l10 = LESSON_RULES.find((r) => r.id === 'L-10')!
    expect(l10.nature).toBe('PS'); expect(l10.tags).toContain('대표')
    for (const s of ['모두 단답형이되 수준을 나눈다', '회상(D~E: 용어·사실)', '이해·적용(C: 도달점 수준의 적용·계산·설명 핵심어)', '관계·추론(B: 두 개념의 관계, 이유, 새 사례 적용)',
      'level_ref', '정답이 자료·대본에 그대로 적힌 문장을 옮겨 적는 문항은 금지', '회상 문항도 낱말을 묻되 문장 베끼기는 안 됨']) expect(l10.text, s).toContain(s)
    expect(l10.text).not.toMatch(/워밍업|단일 조회/)
    expect(row('L-10')).toBe(`| L-10 | ${l10.text} | P+S | [WP11-3][WP11-9][대표] |`)
    const l08 = LESSON_RULES.find((r) => r.id === 'L-08')!
    expect(l08.text).toContain('전개 활동은 C(도달점)를 목표로 하고 A~B 학생용 확장 활동(발문 또는 활동지 도전 과제) 1개를 포함한다')
    expect(l08.tags).toContain('대표')
    expect(row('L-08')).toBe(`| L-08 | ${l08.text} | P+S | [WP7 §3(e)][WP1 §5][대표] |`)
    // 생성 프롬프트 규칙 블록에 들어간다
    expect(rulesFor('수학')).toMatch(/^L-10 퀴즈 3문항은 모두 단답형이되 수준을 나눈다/m)
    expect(rulesFor('과학')).toMatch(/^L-08 .*A~B 학생용 확장 활동/m)
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

// 경기 논술형 평가 장학자료(2025.7, WP9 §7) 채택분 — 대표님 결정 불필요(2026-09-25). C-35(분량 미감점)·조건 0개 허용(C-32 개정안)은 대표님 결정 대기(docs/STATUS.md), 채택하지 않는다.
describe('경기2025: 사다리 설계·동점 두 줄·답안 틀·오류 이월·과학 타당성, C-14 입장별 예시답안 보강', () => {
  const all = [...COMMON_RULES, ...LESSON_RULES, ...Object.values(SUBJECT_RULES).flat()]
  const spec = readFileSync('docs/superpowers/specs/2026-09-25-item-studio-v2-design.md', 'utf8')
  const row = (id: string) => spec.split('\n').find((line) => line.startsWith(`| ${id} |`))!
  it('C-34·C-36·C-37 exist with the 경기2025 tag and reach the generation prompt (rulesFor)', () => {
    const c34 = all.find((r) => r.id === 'C-34')!
    expect(c34.nature).toBe('PS'); expect(c34.tags).toContain('경기2025')
    expect(c34.text).toContain('사다리'); expect(c34.text).toContain('앞부분'); expect(c34.text).toContain('뒷부분')
    const c36 = all.find((r) => r.id === 'C-36')!
    expect(c36.nature).toBe('PS'); expect(c36.tags).toContain('경기2025')
    expect(c36.text).toContain('X만 충족'); expect(c36.text).toContain('Y만 충족'); expect(c36.text).toContain('같은 점수의 두 줄')
    const c37 = all.find((r) => r.id === 'C-37')!
    expect(c37.nature).toBe('P'); expect(c37.tags).toContain('경기2025')
    expect(c37.text).toContain('답안 틀'); expect(c37.text).toContain('[A][B]')
    for (const r of [c34, c36, c37]) {
      expect(row(r.id), r.id).toContain(`| ${r.id} | ${r.text} |`)
      expect(rulesFor('수학'), r.id).toMatch(new RegExp(`^${r.id} `, 'm'))
    }
  })
  it('C-14 is amended in place (no new id) to add one exemplar per position when students choose a side; spec row identical', () => {
    const c14 = all.find((r) => r.id === 'C-14')!
    expect(c14.text).toContain('입장을 선택하는 논술형은 입장별로 예시답안을 각 1편씩 만든다')
    expect(c14.text).toMatch(/6점이면 6·5·4·3·2·1/)
    expect(c14.tags).toContain('경기2025')
    expect(row('C-14')).toContain(`| C-14 | ${c14.text} |`)
  })
  it('C-38 ("피드백 시 유의점" 필드안) is NOT a new schema field — AssessmentItem has no dedicated place for it, so its text is folded into C-16 (rubric.notes guidance) instead; no C-38 id exists', () => {
    expect(all.some((r) => r.id === 'C-38')).toBe(false)
    const c16 = all.find((r) => r.id === 'C-16')!
    expect(c16.text).toContain('전용 칸이 없으므로'); expect(c16.text).toContain('피드백 시 유의점')
    expect(c16.tags).toContain('경기2025')
    expect(row('C-16')).toContain(`| C-16 | ${c16.text} |`)
  })
  it('G-10 (오류 이월 인정) is a grading rule and reaches GRADING_PROMPT_RULES; spec row identical', () => {
    const g10 = GRADING_RULES_V2.find((r) => r.id === 'G-10')!
    expect(g10.nature).toBe('P'); expect(g10.tags).toContain('경기2025')
    expect(g10.text).toContain('오류 이월 인정')
    expect(GRADING_PROMPT_RULES).toMatch(/^G-10 /m)
    expect(row('G-10')).toContain(`| G-10 | ${g10.text} |`)
  })
  it('S-과-08 (과학 타당성 평가 소문항) exists, distinct from C-27, and reaches the 과학 generation prompt; spec row identical', () => {
    const s08 = SUBJECT_RULES['과학'].find((r) => r.id === 'S-과-08')!
    expect(s08.nature).toBe('P'); expect(s08.tags).toContain('경기2025')
    expect(s08.text).toContain('가치 판단만 한 의견을 정답으로 인정하지 않는다')
    expect(row('S-과-08')).toContain(`| S-과-08 | ${s08.text} |`)
    expect(rulesFor('과학')).toMatch(/^S-과-08 /m)
  })
  it('C-35(분량 미감점)와 조건 0개 허용(C-32 개정안)은 채택하지 않는다 — 대표님 결정 대기', () => {
    expect(all.some((r) => r.id === 'C-35')).toBe(false)
    const c32 = all.find((r) => r.id === 'C-32')!
    expect(c32.text).toContain('논술형 문항에만 2~4개')
    const docs = readFileSync('docs/STATUS.md', 'utf8')
    expect(docs).toContain('C-35')
  })
})
