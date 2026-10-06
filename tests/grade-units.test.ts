// tests/grade-units.test.ts
// 대표 2026-10-07: 학년을 정한 대주제에서 수학·과학은 그 학년 교과서 단원(= 교육과정 순서) 안에서만 — 국어·영어·사회는 출판사·학교마다
// 배치가 달라 학년군 안이면 된다(C-44). 단원 목록은 data/textbooks/grade-units.json(비상 2022 목차).
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { standardGrade, outOfGradeStandards, gradeUnitBlock, GRADE_STRICT_SUBJECTS } from '@/lib/studio/grade-units'
import { staticIssues } from '@/lib/studio/checks'
import { buildPrompt, buildReviewPrompt } from '@/lib/studio/prompts/stages'

describe('grade-units — 과목·학년별 교과서 단원', () => {
  it('수학·과학만 학년을 엄격히 본다', () => {
    expect(GRADE_STRICT_SUBJECTS).toEqual(['수학', '과학'])
  })
  it('성취기준 코드로 학년과 단원을 찾는다', () => {
    expect(standardGrade('중', '수학', '[9수02-12]')).toEqual({ grade: 2, unit: '부등식과 연립방정식(일차부등식·연립일차방정식)' })
    expect(standardGrade('중', '과학', '[9과10-04]')).toEqual({ grade: 2, unit: '빛과 파동' })
    expect(standardGrade('중', '수학', '[9수02-20]')?.grade).toBe(3)
    expect(standardGrade('중', '과학', '[9과01-01]')?.grade).toBe(1)
    expect(standardGrade('중', '수학', '[9수99-99]')).toBeNull()
    expect(standardGrade('중', '국어', '[9국03-03]')).toBeNull()
  })
  it('학년 밖 성취기준만 골라낸다 — 학년이 없거나 엄격 과목이 아니면 빈 배열', () => {
    expect(outOfGradeStandards('중', '수학', 2, ['[9수02-12]', '[9수02-13]', '[9수02-20]'])).toEqual([{ code: '[9수02-20]', grade: 3, unit: '다항식의 곱셈과 인수분해·이차방정식' }])
    expect(outOfGradeStandards('중', '수학', null, ['[9수02-20]'])).toEqual([])
    expect(outOfGradeStandards('중', '국어', 2, ['[9국03-03]'])).toEqual([])
    expect(outOfGradeStandards('중', '수학', 2, ['[9수99-99]'])).toEqual([])   // 모르는 코드는 짚지 않는다
    expect(outOfGradeStandards('초', '수학', 2, ['[9수02-20]'])).toEqual([])   // 초등·고등 대주제는 중학교 단원표를 쓰지 않는다(검토 2026-10-07)
  })
  it('프롬프트 블록: 그 학년 단원과 코드를 한 줄씩 — 엄격 과목이 아니거나 학년이 없으면 빈 문자열', () => {
    const b = gradeUnitBlock('중', '과학', 2)
    expect(b).toContain('중학교 2학년 과학 교과서 단원')
    expect(b).toMatch(/- 빛과 파동: \[9과10-01\] · \[9과10-02\] · \[9과10-03\] · \[9과10-04\]/)
    expect(b).not.toContain('화학 반응의 규칙성')
    expect(gradeUnitBlock('중', '국어', 2)).toBe('')
    expect(gradeUnitBlock('중', '수학', null)).toBe('')
    expect(gradeUnitBlock('초', '수학', 2)).toBe('')
    expect(gradeUnitBlock('고', '과학', 1)).toBe('')
  })
  it('자료 무결성: 중학교 수학·과학 성취기준이 빠짐없이 한 학년에만 있다', () => {
    const raw = JSON.parse(readFileSync('data/textbooks/grade-units.json', 'utf8')) as { levels: Record<string, Record<string, Record<string, { unit: string; codes: string[] }[]>>> }
    for (const subject of ['수학', '과학']) {
      const db = (JSON.parse(readFileSync(`data/standards/${subject}.json`, 'utf8')) as { level: string; code: string }[]).filter((s) => s.level === '중').map((s) => s.code)
      const listed = Object.values(raw.levels['중'][subject]).flat().flatMap((u) => u.codes)
      expect(listed.slice().sort()).toEqual(db.slice().sort())
      expect(new Set(listed).size).toBe(listed.length)
    }
  })
})

describe('[TS] 참고 메모 — 고른 성취기준이 학년 단원 밖(C-44)', () => {
  const theme = { title: '도서관', level: '중', grade: 2 }
  it('1단계 추천에 다른 학년 단원의 성취기준이 있으면 grade_level 메모(막지 않는 참고)', () => {
    const out = { recommended: [{ code: '[9수02-12]', reason: 'a' }, { code: '[9수02-20]', reason: 'b' }] }
    expect(staticIssues(1, out, { standards: [], prior: {}, subject: '수학', theme })).toEqual([
      { kind: 'grade_level', detail: '[9수02-20]은 중학교 2학년 수학 교과서 단원에 없음 — 3학년 「다항식의 곱셈과 인수분해·이차방정식」(C-44)' },
    ])
  })
  it('2단계 재구성 표의 성취기준도 같은 메모', () => {
    const out = { standards: [{ code: '[9과01-01]', original_text: '과학적 탐구 방법을 이해하고, 일상생활의 문제에 대한 과학적 해결 방안을 제안할 수 있다.', reconstruction_type: '유지', reconstructed_text: '과학적 탐구 방법을 이해하고, 일상생활의 문제에 대한 과학적 해결 방안을 제안할 수 있다.', reason: ['학원 60분 최적화'], merged_with: [], learning_elements: ['탐구'] }],
      reconstruction: '과학적 탐구 방법을 이해하고, 일상생활의 문제에 대한 과학적 해결 방안을 제안할 수 있다.', learning_goals: [], key_question_candidates: [], criteria_draft: [] }
    const standards = [{ code: '[9과01-01]', text: out.standards[0].original_text }]
    const notes = staticIssues(2, out, { standards, prior: {}, subject: '과학', theme }).filter((i) => i.kind === 'grade_level')
    expect(notes).toEqual([{ kind: 'grade_level', detail: '[9과01-01]은 중학교 2학년 과학 교과서 단원에 없음 — 1학년 「과학과 인류의 지속가능한 삶」(C-44)' }])
  })
  it('학년이 없거나(학년군) 국어·영어·사회면 메모가 없다', () => {
    const out = { recommended: [{ code: '[9수02-20]', reason: 'b' }] }
    expect(staticIssues(1, out, { standards: [], prior: {}, subject: '수학', theme: { title: '도서관', level: '중', grade: null } })).toEqual([])
    expect(staticIssues(1, out, { standards: [], prior: {}, subject: '수학' })).toEqual([])
    expect(staticIssues(1, { recommended: [{ code: '[9국03-03]', reason: 'c' }] }, { standards: [], prior: {}, subject: '국어', theme })).toEqual([])
    expect(staticIssues(1, out, { standards: [], prior: {}, subject: '수학', theme: { title: '초등 주제', level: '초', grade: 2 } })).toEqual([])
  })
})

describe('프롬프트 — 학년 단원 블록과 C-44 문장', () => {
  const math = { theme: { title: '도서관', level: '중', grade: 2, subjects: ['수학', '국어'] }, subject: '수학',
    standards: [{ code: '[9수02-12]', text: '일차부등식을 풀 수 있고, 이를 활용하여 문제를 해결할 수 있다.' }], prior: {} }
  const korean = { ...math, subject: '국어', standards: [{ code: '[9국03-08]', text: '쓰기 과정과 전략을 점검⋅조정하며 글을 쓰고, 독자를 고려하여 글을 고쳐 쓴다.' }] }
  it('1·2·3단계 생성에 그 학년 단원 블록이 붙는다(수학·과학 + 학년) — 국어·학년 없음은 안 붙는다', () => {
    for (const stage of [1, 2, 3] as const) expect(buildPrompt(stage, math).user, `stage ${stage}`).toMatch(/중학교 2학년 수학 교과서 단원[^\n]*\(C-44\):\n- 유리수의 표현과 식의 계산[^\n]*\n- 부등식과 연립방정식\(일차부등식·연립일차방정식\): \[9수02-11\] · \[9수02-12\] · \[9수02-13\]/)
    for (const stage of [1, 2] as const) expect(buildReviewPrompt(stage, math, {}).user, `review ${stage}`).toContain('중학교 2학년 수학 교과서 단원')
    expect(buildPrompt(1, korean).user).not.toContain('교과서 단원')
    expect(buildPrompt(1, { ...math, theme: { ...math.theme, grade: null } }).user).not.toContain('교과서 단원')
    expect(buildPrompt(5, math).user).not.toContain('교과서 단원')
    // 검토 2026-10-07: 초등·고등 대주제(학년 2)에 중학교 단원표가 붙으면 모든 성취기준을 부적합으로 만든다
    const elem = { ...math, theme: { ...math.theme, level: '초', grade: 2 }, standards: [{ code: '[4수01-01]', text: '큰 수' }] }
    expect(buildPrompt(1, elem).user).not.toContain('교과서 단원')
    expect(buildPrompt(1, elem).user.split('과제: ')[1]).toMatch(/몇 학년에 배우는 내용인지는 따지지 않는다/)
  })
  it('1단계: 수학·과학 + 학년이면 학년 단원 밖 성취기준을 부적합(grade_level)으로 — 국어는 학년군만 본다', () => {
    const task = buildPrompt(1, math).user.split('과제: ')[1]
    expect(task).toMatch(/위 2학년 단원 목록에 없는 성취기준은 추천하지 않는다\(recommended에서 뺀다, C-44\)/)
    expect(task).toMatch(/학교급 적합성은 성취기준 코드로 본다/); expect(task).not.toMatch(/코드로만 본다/)
    expect(task).not.toMatch(/몇 학년에 배우는 내용인지는 따지지 않는다/)
    const review = buildReviewPrompt(1, math, {}).user.split('검토 초점: ')[1]
    expect(review).toMatch(/위 2학년 단원 목록에 없으면 grade_level\(C-44\)/)
    expect(review).toMatch(/이 학교급의 성취기준인지 본다/); expect(review).not.toMatch(/인지만 본다/)
    const kTask = buildPrompt(1, korean).user.split('과제: ')[1]
    expect(kTask).toMatch(/몇 학년에 배우는 내용인지는 따지지 않는다/)
    expect(buildReviewPrompt(1, korean, {}).user.split('검토 초점: ')[1]).toMatch(/그것으로 반려하지 않는다/)
  })
  it('3·5단계: 성취기준 원문에 없는 개념·활동으로 차시·문항을 설계하지 않는다(C-44)', () => {
    expect(buildPrompt(3, korean).user.split('과제: ')[1]).toMatch(/성취기준 원문에 없는 개념·활동을 차시 목표·발문·퀴즈 정답으로 삼지 않는다\(C-44\)/)
    expect(buildPrompt(5, korean).user.split('과제: ')[1]).toMatch(/성취기준 원문에 없는 개념·활동을 평가 요소·채점 요소·예시답안의 핵심으로 삼지 않는다\(C-44\)/)
    expect(buildReviewPrompt(3, korean, {}).user.split('검토 초점: ')[1]).toMatch(/원문에 없는 개념이 차시 목표·퀴즈 정답이면 fidelity\(C-44\)/)
    expect(buildReviewPrompt(5, korean, {}).user.split('검토 초점: ')[1]).toMatch(/원문에 없는 개념이 채점 요소·예시답안의 핵심이면 fidelity\(C-44\)/)
    expect(buildPrompt(3, math).user.split('과제: ')[1]).toMatch(/다른 학년 단원의 개념을 가르치거나 묻지 않는다\(C-44\)/)
  })
})
