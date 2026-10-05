// tests/internal-field-names.test.ts
// 대표 2026-10-06(국어·과학 세트 6단계 교사용 지침서: "merge_guide에 따라", "(merge_guide 참고)", "척도표의 example 문장"):
// 원장이 읽는 글에 안쪽 칸 이름(영문 필드 이름)이 새지 않게 한다(C-43). 참고 메모일 뿐 막지 않는다.
import { describe, it, expect } from 'vitest'
import { staticIssues, internalFieldName } from '@/lib/studio/checks'
import { NOTICE_DISCLAIMER } from '@/lib/studio/schemas'

const leakNotes = (issues: { kind: string; detail: string }[]) => issues.filter((i) => i.detail.includes('안쪽 칸 이름'))

describe('internalFieldName — 글에 섞인 안쪽 칸 이름(C-43)', () => {
  it.each([
    ['1·2차시는 인원이 적거나 진도가 밀릴 때 merge_guide에 따라 120분 한 덩어리로 합쳐 진행할 수 있습니다.', 'merge_guide'],
    ['1·2차시와 4·5차시는 한 번에 몰아 진행할 수 있고(merge_guide 참고), 그때는 120분을 재편성합니다.', 'merge_guide'],
    ['척도표의 example 문장을 기준선으로 삼아 답안 옆에 표시하세요.', 'example'],
    ['차시마다 per_lesson 메모를 먼저 읽어 주세요.', 'per_lesson'],
    ['병합할 때는 time_budget_120의 분 배분을 따릅니다.', 'time_budget_120'],
    ['요소마다 descriptor 문장을 소리 내어 읽으며 판단합니다.', 'descriptor'],
    // 검토 2026-10-06: 괄호·따옴표 안, 문장 맨 앞, 두 글자로 시작하는 칸 이름
    ['점수가 애매하면 예시답안을 봅니다(example 참고).', 'example'],
    ["답안 옆에 'example' 문장보다 위인지 아래인지 표시하세요.", 'example'],
    ['example 문장을 기준선으로 삼으세요.', 'example'],
    ['막히는 학생에게는 if_stuck 칸의 힌트를 그대로 읽어 줍니다.', 'if_stuck'],
  ])('짚는다: %s', (text, name) => {
    expect(internalFieldName(text)).toBe(name)
  })
  it.each([
    ['한국어만', '1·2차시는 아래 병합 안내에 따라 120분 한 덩어리로 합쳐 진행할 수 있습니다.'],
    ['영어 문장 속 낱말', 'Bring your own cup, for example, and get a discount.'],
    ['영어 예시를 가리키는 말', "학생이 'For example'로 문장을 시작하면 예를 든 것으로 인정합니다."],
    ['누리집 주소', '공개 자료 원문은 기후에너지환경부 누리집(mcee.go.kr) 보도자료에서 찾을 수 있습니다.'],
    ['재질 표시·단위', '제품 바닥의 PET, PP, PS 표시와 5.00 g, 1t당 처리비를 확인합니다.'],
    ['빈 글', ''],
    // 검토 2026-10-06: 수학·과학의 아래 첨자 표기, 파일 이름·전자우편, 한국어 낱말 뒤에 괄호로 단 풀이
    ['수열의 아래 첨자', '수열 a_n의 일반항을 구하게 합니다.'],
    ['처음 속도', '처음 속도 v_0를 표에서 찾게 합니다.'],
    ['로그', 'log_2 8의 값을 먼저 묻습니다.'],
    ['파일 이름', '활동지 파일 work_sheet.pdf를 미리 인쇄합니다.'],
    ['전자우편', '문의는 kim_teacher@school.kr로 보내 주세요.'],
    ['괄호로 단 풀이', '채점 기준표(rubric)를 함께 펴 두고 봅니다.'],
  ])('짚지 않는다 — %s', (_why, text) => {
    expect(internalFieldName(text)).toBeNull()
  })
  it('영어 세트: 수업 내용인 영어 낱말(example·rubric …)은 짚지 않고, 밑줄로 이은 칸 이름만 짚는다', () => {
    expect(internalFieldName('낱말 example의 철자를 한 번 더 확인하게 합니다.', { english: true })).toBeNull()
    expect(internalFieldName('학생이 example 하나만 들면 2점입니다.', { english: true })).toBeNull()
    expect(internalFieldName('진도가 밀릴 때 merge_guide에 따라 합쳐 진행합니다.', { english: true })).toBe('merge_guide')
  })
})

describe('6단계 참고 메모 — 교사용 지침서(C-43)', () => {
  const guide = (over: Record<string, unknown> = {}) => ({
    general: { materials: ['자료 B·C 출력물(모둠당 1부)'], schedule_note: '총 6차시이며 1·2차시는 아래 병합 안내에 따라 합쳐 진행할 수 있습니다.', purpose: '자료를 근거로 방안을 제안하게 합니다.' },
    glossary: [{ term: '가설', explanation: '탐구 문제에 대해 미리 세워 보는 잠정적인 답입니다.' }],
    merge_guide: [],
    grading_guide: { common_errors: [{ item_no: 1, error: '한 재질의 값만 보고 결론을 씀', how_to_read: '세 재질의 값을 둘 이상 견주었는지 봅니다.' }], review_tips: ['채점은 요소별로 봅니다.', '척도표의 예시 문장을 기준선으로 삼습니다.'], retry_guidance: '못 받은 요소 하나만 고쳐 쓰게 합니다.' },
    per_lesson: [{ no: 1, notes: ['자료 B의 수치를 가릴 때는 종이를 덮어 보여 줍니다.'] }],
    ...over,
  })
  it('칸 이름이 없는 지침서에는 메모가 없다', () => {
    expect(leakNotes(staticIssues(6, guide(), { standards: [], prior: {} }))).toEqual([])
  })
  it('차시 운영 메모·검수 팁·차시별 유의점에 섞인 칸 이름을 자리와 함께 적는다(kind other — 막지 않음)', () => {
    const leaky = guide({
      general: { materials: ['자료 B·C 출력물(모둠당 1부)'], schedule_note: '1·2차시는 진도가 밀릴 때 merge_guide에 따라 합쳐 진행할 수 있습니다.', purpose: '자료를 근거로 방안을 제안하게 합니다.' },
      grading_guide: { common_errors: [{ item_no: 1, error: '한 재질의 값만 보고 결론을 씀', how_to_read: '세 재질의 값을 둘 이상 견주었는지 봅니다.' }], review_tips: ['채점은 요소별로 봅니다.', '척도표의 example 문장을 기준선으로 삼습니다.'], retry_guidance: '못 받은 요소 하나만 고쳐 쓰게 합니다.' },
      per_lesson: [{ no: 3, notes: ['이 차시의 feedback_plan에 적힌 확인 사항을 먼저 봅니다.'] }],
    })
    expect(leakNotes(staticIssues(6, leaky, { standards: [], prior: {} }))).toEqual([
      { kind: 'other', detail: '차시 운영 메모: 안쪽 칸 이름("merge_guide")이 글에 그대로 있음 — 화면에 보이는 한국어 이름으로 쓴다(C-43)' },
      { kind: 'other', detail: '검수 팁 2: 안쪽 칸 이름("example")이 글에 그대로 있음 — 화면에 보이는 한국어 이름으로 쓴다(C-43)' },
      { kind: 'other', detail: '3차시 유의점: 안쪽 칸 이름("feedback_plan")이 글에 그대로 있음 — 화면에 보이는 한국어 이름으로 쓴다(C-43)' },
    ])
  })
})

describe('6단계 참고 메모 — 옛 지침서·영어 세트(C-43)', () => {
  const base = {
    general: { materials: [], schedule_note: '총 6차시입니다.', purpose: '자료를 근거로 방안을 제안하게 합니다.' },
    glossary: [], grading_guide: { common_errors: [], review_tips: ['낱말 example의 철자를 한 번 더 확인하게 합니다.'], retry_guidance: '못 받은 요소 하나만 고쳐 쓰게 합니다.' }, per_lesson: [],
  }
  it('병합 안내에 생략 활동 칸(skip_activities)이 없는 옛 지침서에서도 오류 없이 지나간다', () => {
    const old = { ...base, merge_guide: [{ lessons: [1, 2], time_budget_120: { intro_min: 10, main_min: 90, wrapup_min: 20 } }] }
    expect(() => staticIssues(6, old, { standards: [], prior: {} })).not.toThrow()
  })
  it('영어 세트의 지침서는 영어 낱말을 칸 이름으로 짚지 않는다', () => {
    const en = { ...base, merge_guide: [] }
    expect(leakNotes(staticIssues(6, en, { standards: [], prior: {}, subject: '영어' }))).toEqual([])
    expect(leakNotes(staticIssues(6, en, { standards: [], prior: {}, subject: '과학' })).map((i) => i.detail)).toEqual(['검수 팁 1: 안쪽 칸 이름("example")이 글에 그대로 있음 — 화면에 보이는 한국어 이름으로 쓴다(C-43)'])
  })
})

describe('7단계 참고 메모 — 안내장 틀(C-43)', () => {
  it('학부모에게 가는 문장에 섞인 칸 이름도 적는다', () => {
    const plan = { per_lesson: [{ lesson_no: 1, topic_summary: '자료를 읽는 활동에서 탐구 단계를 배웠습니다.', preview: '다음 시간에는 컵 재질을 비교합니다.', home_study_suggestion: '오늘 활동지의 self_check 문장을 다시 읽어 봅시다.', quiz_notes: [], criteria_phrases: null }], footer_disclaimer: NOTICE_DISCLAIMER }
    expect(leakNotes(staticIssues(7, plan, { standards: [], prior: {} }))).toEqual([
      { kind: 'other', detail: '1차시 가정 학습: 안쪽 칸 이름("self_check")이 글에 그대로 있음 — 화면에 보이는 한국어 이름으로 쓴다(C-43)' },
    ])
  })
})
