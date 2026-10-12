// tests/quiz-keywords.test.ts
// 대표 2026-10-12(L-22): 새 세트의 단답형 퀴즈는 정답 표기를 여러 꼴로 + 핵심어(keywords) 1~3개 — 핵심어가 모두 들어 있으면 글자가 달라도 정답.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { judgeQuiz, matchKind } from '@/lib/classroom/quiz'
import { QuizItem } from '@/lib/studio/schemas'
import { staticIssues, quizNeedsKeywords } from '@/lib/studio/checks'

describe('judgeQuiz — 핵심어(keywords)', () => {
  const key = { type: 'short' as const, answer: '사용량이 많다는 사실로 부탁을 뒷받침하려고', choices: null, keywords: ['사실', '뒷받침'] }
  it('핵심어가 모두 들어 있으면 표기가 달라도 정답', () => {
    expect(judgeQuiz(key, '일회용 컵을 많이 쓴다는 사실로 부탁을 뒷받침하려고')).toBe(true)
    expect(judgeQuiz(key, '사실을 근거로 부탁을 뒷 받침함')).toBe(true)   // 띄어쓰기 차이
  })
  it('핵심어가 하나라도 빠지면 글자 비교로만 본다', () => {
    expect(judgeQuiz(key, '일회용 컵의 낭비가 심하다는 것을 숫자로 보여줌')).toBe(false)
    expect(judgeQuiz(key, '사용량이 많다는 사실로 부탁을 뒷받침하려고')).toBe(true)
  })
  it('영어 핵심어는 대소문자를 가리지 않고, 핵심어가 없거나 비어 있으면 지금과 같다', () => {
    expect(judgeQuiz({ type: 'short', answer: 'bring your own cup', choices: null, keywords: ['Cup', 'own'] }, 'Bring your OWN cup from home')).toBe(true)
    expect(judgeQuiz({ type: 'short', answer: 'bring your own cup', choices: null, keywords: [] }, 'bring your own cup from home')).toBe(false)
    expect(judgeQuiz({ type: 'short', answer: 'bring your own cup', choices: null }, 'bring your own cup from home')).toBe(false)
  })
})

describe('QuizItem 스키마 — keywords 는 선택(옛 판에는 없다), 1~3개', () => {
  const base = { q: '질문입니다', type: 'short', choices: null, answer: '상대도수 / 상대 도수', explanation: '해설입니다' }
  it('없어도 되고, 있으면 1~3개의 빈 문자열 아닌 낱말', () => {
    expect(QuizItem.safeParse(base).success).toBe(true)
    expect(QuizItem.safeParse({ ...base, keywords: ['상대도수'] }).success).toBe(true)
    expect(QuizItem.safeParse({ ...base, keywords: ['a', 'b', 'c', 'd'] }).success).toBe(false)
    expect(QuizItem.safeParse({ ...base, keywords: [''] }).success).toBe(false)
  })
})

describe('[TS] 참고 메모 — 핵심어 없는 단답형 퀴즈(L-22, 막지 않음)', () => {
  type L = { no: number; formative_check: { quiz: Record<string, unknown>[] } }
  const fixture = JSON.parse(readFileSync('data/studio-fixtures/stage3-generate.json', 'utf8'))
  const withQuiz = (f: (q: Record<string, unknown>) => Record<string, unknown>) => ({ ...fixture, lessons: fixture.lessons.map((l: L) => ({ ...l, formative_check: { ...l.formative_check, quiz: l.formative_check.quiz.map(f) } })) })
  const bare = withQuiz((q) => Object.fromEntries(Object.entries(q).filter(([k]) => k !== 'keywords')))   // 핵심어를 뗀 옛 판 모양
  const ctx = { standards: [{ code: '[9수04-02]', text: 'x' }, { code: '[9수04-03]', text: 'y' }], prior: {} }
  it('핵심어가 없는 단답형 퀴즈마다 자리와 함께 적는다(kind other) — 정답이 숫자·범위뿐인 문항은 빼고', () => {
    const notes = staticIssues(3, bare, ctx).filter((i) => i.detail.includes('핵심어'))
    const expected = bare.lessons.flatMap((l: L) => l.formative_check.quiz.map((q, i) => (quizNeedsKeywords(q.answer as string) ? `${l.no}차시 퀴즈 ${i + 1}: 핵심어(keywords)가 없음 — 정답 표기를 여러 꼴로 적고 핵심어 1~3개를 함께 적는다(L-22)` : null)).filter(Boolean))
    expect(expected.length).toBeGreaterThan(0)
    expect(notes.map((n) => n.detail)).toEqual(expected)
    for (const n of notes) expect(n.kind).toBe('other')
    expect(quizNeedsKeywords('4 / 4곳')).toBe(false); expect(quizNeedsKeywords('5회 이상 10회 미만 / 5 이상 10 미만')).toBe(false); expect(quizNeedsKeywords('계급')).toBe(true)
  })
  it('핵심어를 채우면 메모가 사라진다(스크립트가 넣은 fixture 도 메모가 없다)', () => {
    const filled = withQuiz((q) => ({ ...q, keywords: ['핵심'] }))
    expect(staticIssues(3, filled, ctx).filter((i) => i.detail.includes('핵심어'))).toEqual([])
    expect(staticIssues(3, fixture, ctx).filter((i) => i.detail.includes('핵심어'))).toEqual([])
  })
})

// 독립 검토 2026-10-12: 핵심어 부분 일치의 오탐 — 숫자 핵심어, 부정문, 긴 답, 낱말 가운데 걸치는 일치는 핵심어로 O 를 주지 않는다(AI 판정으로 넘긴다)
describe('judgeQuiz — 핵심어 오탐 막기 (검토 2026-10-12)', () => {
  const k = (answer: string, keywords: string[]) => ({ type: 'short' as const, answer, choices: null, keywords })
  it('숫자뿐인 핵심어는 무시한다(14 가 4 를 품어도 O 가 아니다)', () => {
    expect(judgeQuiz(k('4', ['4']), '14')).toBe(false)
    expect(judgeQuiz(k('0.36', ['0.36']), '10.36')).toBe(false)
    expect(judgeQuiz(k('4 / 4곳', ['4', '곳']), '4곳')).toBe(true)   // 글자 비교로 맞는 것은 그대로
  })
  it('부정 표현이 든 답은 핵심어로 O 를 주지 않는다', () => {
    expect(judgeQuiz(k('개인 / 개인 차원', ['개인']), '개인이 아니라 사회 차원')).toBe(false)
    expect(judgeQuiz(k('분리한다 / 떼어 낸다', ['분리']), '분리하지 않고 그냥 버린다')).toBe(false)
    expect(judgeQuiz(k('플라스틱', ['플라스틱']), '플라스틱이 아님')).toBe(false)
    expect(judgeQuiz(k('bring your own cup', ['cup']), "don't bring a cup")).toBe(false)
  })
  it('핵심어는 낱말 첫머리에서만 센다 — "상대도수"는 "도수"가 아니다, "도수를"은 된다', () => {
    expect(judgeQuiz(k('도수', ['도수']), '상대도수')).toBe(false)
    expect(judgeQuiz(k('도수', ['도수']), '도수를 나타낸다')).toBe(true)
    expect(judgeQuiz(k('계급', ['계급']), '각 계급')).toBe(true)
  })
  it('정답보다 훨씬 긴 답(길이 2배 넘고 15자 넘음)은 핵심어로 O 를 주지 않는다', () => {
    expect(judgeQuiz(k('도수', ['도수']), '그래프에서 세로축이 나타내는 것은 각 계급의 도수인데 상대도수와 헷갈리기 쉽다')).toBe(false)
    expect(judgeQuiz(k('사용량이 많다는 사실로 부탁을 뒷받침하려고', ['사실', '뒷받침']), '일회용 컵을 많이 쓴다는 사실로 부탁을 뒷받침하려고')).toBe(true)
  })
  it('matchKind — 무엇으로 맞았는지: literal / keyword / null', () => {
    expect(matchKind(k('상대도수 / 상대 도수', ['상대도수']), '상대 도수')).toBe('literal')
    expect(matchKind(k('사용량이 많다는 사실로 부탁을 뒷받침하려고', ['사실', '뒷받침']), '사실로 부탁을 뒷받침함')).toBe('keyword')
    expect(matchKind(k('도수', ['도수']), '상대도수')).toBeNull()
  })
})
