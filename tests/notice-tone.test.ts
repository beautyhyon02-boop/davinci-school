// tests/notice-tone.test.ts
// 대표 2026-10-06(과학 세트 7단계: 퀴즈 오답 코멘트만 "~어요/~봐요"로 나옴 — 생성 지시가 그 칸의 종결 말투를 정하지 않았다):
// "앞으로 톤앤매너를 꼭 맞추도록 지침을 추가" → N-13. 안내장 틀의 문장은 '~습니다'·'~봅시다'로 끝맺는다. 참고 메모일 뿐 막지 않는다.
import { describe, it, expect } from 'vitest'
import { staticIssues, casualEnding } from '@/lib/studio/checks'
import { NOTICE_DISCLAIMER } from '@/lib/studio/schemas'

const toneNotes = (issues: { kind: string; detail: string }[]) => issues.filter((i) => i.detail.includes("말투가 '~요'로 끝남"))
const lesson = (over: Record<string, unknown> = {}) => ({
  lesson_no: 1,
  topic_summary: '축제 일회용품 자료를 읽고 탐구 문제를 찾는 활동에서 탐구 단계를 배웠습니다.',
  preview: '다음 시간에는 세 가지 컵 재질을 기준을 세워 비교합니다.',
  home_study_suggestion: '집에서 쓰는 컵 한 가지를 골라 궁금한 점을 질문으로 적어 봅시다.',
  quiz_notes: [
    { quiz_no: 1, wrong_note: '탐구 순서는 잘 짚었으나, 그 답의 이름을 다시 살펴봅시다.' },
    { quiz_no: 2, wrong_note: '표를 꼼꼼히 읽었고, 부스 수를 맞춘 값도 함께 따져 봅시다.' },
  ],
  criteria_phrases: null as null | { criterion_name: string; good: string[]; improve: string[] }[],
  ...over,
})
const plan = (...per_lesson: unknown[]) => ({ per_lesson, footer_disclaimer: NOTICE_DISCLAIMER })

describe("casualEnding — '~요'로 끝나는 문장(N-13)", () => {
  it.each([
    ['단계는 잘 떠올렸어요. 다만 미리 세운 답의 이름을 다시 봐요.', '떠올렸어요'],
    ['자료 선택을 고민한 점이 좋고, 두 표의 정보 차이도 보아요.', '보아요'],
    ['다시 쓰는 그릇을 잘 떠올렸고, 그 이름을 한 번 더 익혀요.', '익혀요'],
    ['함께 정하는 일임을 잘 보았고, 그 차원의 이름을 확인해요.', '확인해요'],
    ['자료 번호를 한 군데 더 붙여 보세요', '보세요'],
    ['변인을 떠올린 점이 좋아요!', '좋아요'],
    // 검토 2026-10-06: 문장 가운데(쉼표 앞), 닫는 괄호·따옴표·말줄임 앞, 띄어쓰기 없이 이어진 문장, '~죠'
    ['단계는 잘 떠올렸어요, 다만 그 답의 이름을 다시 살펴봅시다.', '떠올렸어요'],
    ['표를 꼼꼼히 읽었습니다(잘 읽었어요).', '읽었어요'],
    ['두 자료를 비교한 점이 좋아요… 정보의 종류도 살펴봅시다.', '좋아요'],
    ['변인을 잘 떠올렸어요.다음에는 이름도 익혀 봅시다.', '떠올렸어요'],
    ['탐구 순서는 잘 짚었죠. 그 답의 이름을 다시 살펴봅시다.', '짚었죠'],
  ])('짚는다: %s', (text, ending) => {
    expect(casualEnding(text)).toBe(ending)
  })
  it.each([
    '탐구 순서는 잘 짚었으나, 그 답의 이름을 다시 살펴봅시다.',
    '두 방안 모두에 자료 근거를 빠짐없이 연결했습니다.',
    '다음 시간에는 서술형과 논술형으로 단원 평가를 봅니다.',
    '필요한 자료를 골라 근거로 든 점이 좋습니다. 다만 주요 내용도 함께 적어 봅시다.',
    '',
    // 검토 2026-10-06: '요'로 끝나는 낱말(필요·개요·중요)과 따옴표 안에 인용한 물음은 말투가 아니다
    '근거를 한 가지 더 붙이는 보완이 필요.',
    '발표 내용을 처음·중간·끝으로 간추린 개요, 그리고 근거를 다시 읽어 봅시다.',
    "'왜 그럴까요?'라는 질문을 스스로 적어 봅시다.",
  ])('짚지 않는다: %s', (text) => {
    expect(casualEnding(text)).toBeNull()
  })
})

describe("7단계 참고 메모 — 안내장 틀의 말투(N-13)", () => {
  it("'~습니다'·'~봅시다'로만 쓴 틀에는 메모가 없다", () => {
    const withCriteria = lesson({ lesson_no: 2, quiz_notes: [], criteria_phrases: [{ criterion_name: '근거', good: ['두 방안 모두에 자료 근거를 빠짐없이 연결했습니다.', '근거와 방안의 관계를 매끄럽게 이어 썼습니다.'], improve: ['방안을 또렷이 제안했는데, 근거가 된 자료 번호를 밝혀 봅시다.', '한 방안에 근거를 달았는데, 나머지 방안에도 붙여 봅시다.'] }] })
    expect(toneNotes(staticIssues(7, plan(lesson(), withCriteria), { standards: [], prior: {} }))).toEqual([])
  })
  it("퀴즈 오답 코멘트·가정 학습·요소별 문구가 '~요'로 끝나면 자리와 끝말을 적는다(kind notice — 막지 않음)", () => {
    const casual = lesson({
      home_study_suggestion: '집에 있는 컵 하나의 재질 표시를 찾아 한 줄로 적어 보세요.',
      quiz_notes: [
        { quiz_no: 1, wrong_note: '단계는 잘 떠올렸어요. 다만 미리 세운 답의 이름을 다시 봐요.' },
        { quiz_no: 2, wrong_note: '표를 꼼꼼히 읽었고, 부스 수를 맞춘 값도 함께 따져 봅시다.' },
      ],
    })
    const assess = lesson({ lesson_no: 2, quiz_notes: [], criteria_phrases: [{ criterion_name: '근거', good: ['두 방안 모두에 자료 근거를 빠짐없이 연결했어요.', '근거와 방안의 관계를 매끄럽게 이어 썼습니다.'], improve: ['방안을 또렷이 제안했는데, 근거가 된 자료 번호를 밝혀 봅시다.', '한 방안에 근거를 달았는데, 나머지 방안에도 붙여 봅시다.'] }] })
    expect(toneNotes(staticIssues(7, plan(casual, assess), { standards: [], prior: {} }))).toEqual([
      { kind: 'notice', detail: "1차시 가정 학습: 말투가 '~요'로 끝남(\"보세요\") — 안내장은 '~습니다'·'~봅시다'로 맞춘다(N-13)" },
      { kind: 'notice', detail: "1차시 퀴즈 1: 말투가 '~요'로 끝남(\"떠올렸어요\") — 안내장은 '~습니다'·'~봅시다'로 맞춘다(N-13)" },
      { kind: 'notice', detail: "2차시 근거: 말투가 '~요'로 끝남(\"연결했어요\") — 안내장은 '~습니다'·'~봅시다'로 맞춘다(N-13)" },
    ])
  })
})
