// tests/quiz-judge.test.ts
// 대표 2026-10-12: 단답형 퀴즈가 글자 비교로 틀렸을 때만 작은 모델이 뜻으로 판정한다(맞음/부분/틀림 + 이유 한 줄). 원장의 O/X 뒤집기 일을 줄이려는 것.
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/ai/claude', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/ai/claude')>()
  return { ...actual, callStructured: vi.fn() }
})
const claude = await import('@/lib/ai/claude')
const { buildQuizJudgePrompt, judgeShortWithAi, QuizVerdict, QUIZ_JUDGE_RULES } = await import('@/lib/classroom/quiz-judge')
const { needsAiJudge } = await import('@/lib/classroom/quiz')

const input = {
  subject: '영어', level: '중', grade: 1,
  q: '자료 F를 쓴 사람이 독자에게 바라는 행동을 영어 짧은 구로 쓰시오.',
  answer: 'bring your own cup / use a reusable cup',
  explanation: '숫자 제시 뒤에 이어지는 부탁 문장이 글의 목적을 보여 준다.',
  keywords: ['cup'],
  response: 'bring your own cup from home',
}

beforeEach(() => { vi.mocked(claude.callStructured).mockReset() })

describe('퀴즈 뜻 판정 모델·규칙', () => {
  it('판정은 가장 작은 모델(Haiku)로 — MODELS.quiz', () => {
    expect(claude.MODELS.quiz).toBe('claude-haiku-5-5')
  })
  it('규칙은 "정답·해설·핵심어만 기준, 표현이 달라도 뜻이 같으면 맞음, 일부만 맞으면 부분, 이유는 한 줄"을 담는다', () => {
    for (const s of ['정답', '해설', '핵심어', '맞음', '부분', '틀림', '이유']) expect(QUIZ_JUDGE_RULES).toContain(s)
  })
})

describe('buildQuizJudgePrompt', () => {
  it('문항·정답 표기들·해설·핵심어·학생 답·과목·학년을 담고, 규칙 블록이 system 이다', () => {
    const p = buildQuizJudgePrompt(input)
    expect(p.system).toBe(QUIZ_JUDGE_RULES)
    for (const s of [input.q, 'bring your own cup', 'use a reusable cup', input.explanation, 'cup', input.response, '영어', '중학교 1학년']) expect(p.user).toContain(s)
    expect(p.fixtureKey).toBe('quiz-judge')
  })
  it('핵심어가 없으면 핵심어 줄을 빼고, 학년이 없으면 학년군으로 적는다', () => {
    const p = buildQuizJudgePrompt({ ...input, keywords: undefined, grade: null })
    expect(p.user).not.toContain('핵심어')
    expect(p.user).toContain('중학교(1~3학년군)')
  })
})

describe('QuizVerdict 스키마', () => {
  it('맞음/부분/틀림만 받고 이유는 비어 있으면 안 된다', () => {
    expect(QuizVerdict.safeParse({ verdict: '맞음', reason: '같은 뜻의 다른 표현' }).success).toBe(true)
    expect(QuizVerdict.safeParse({ verdict: '정답', reason: 'x' }).success).toBe(false)
    expect(QuizVerdict.safeParse({ verdict: '부분', reason: '' }).success).toBe(false)
  })
})

describe('judgeShortWithAi', () => {
  it('모델의 판정과 이유를 돌려주고, 역할 quiz·낮은 effort 로 부른다', async () => {
    vi.mocked(claude.callStructured).mockResolvedValue({ data: { verdict: '맞음', reason: '집에서 가져오라는 말이 더 붙었을 뿐 같은 행동' }, usage: { input: 300, output: 40, cacheRead: 0 }, model: 'claude-haiku-5-5' })
    const r = await judgeShortWithAi(input)
    expect(r).toEqual({ verdict: '맞음', reason: '집에서 가져오라는 말이 더 붙었을 뿐 같은 행동' })
    const call = vi.mocked(claude.callStructured).mock.calls[0][0]
    expect(call.role).toBe('quiz'); expect(call.effort).toBe('low'); expect(call.fixtureKey).toBe('quiz-judge')
  })
  it('AI 호출이 실패하면 null — 채점은 글자 비교 결과(X)로 남는다', async () => {
    vi.mocked(claude.callStructured).mockRejectedValue(new Error('boom'))
    expect(await judgeShortWithAi(input)).toBeNull()
  })
})

describe('needsAiJudge — AI를 부를 문항', () => {
  const short = (answer: string) => ({ type: 'short' as const, answer, choices: null })
  it('단답형이고 답이 비어 있지 않고 글자 비교로 틀린 것만', () => {
    expect(needsAiJudge(short('bring your own cup'), 'bring your own cup from home')).toBe(true)
    expect(needsAiJudge(short('bring your own cup'), 'bring your own cup')).toBe(false)
    expect(needsAiJudge(short('bring your own cup'), '')).toBe(false)
    expect(needsAiJudge({ type: 'choice', answer: '③', choices: ['①', '②', '③'] }, '②')).toBe(false)
  })
  it('정답도 숫자, 학생 답도 숫자면 부르지 않는다(값이 다르면 그냥 X)', () => {
    expect(needsAiJudge(short('6'), '7')).toBe(false)
    expect(needsAiJudge(short('30~40'), '35')).toBe(false)           // 범위도 숫자 정답 — 숫자 답이면 값이 다른 것
    expect(needsAiJudge(short('30~40'), '삼십에서 사십')).toBe(true)   // 말로 쓴 답은 AI가 본다
    expect(needsAiJudge(short('6개'), '여섯 개')).toBe(true)
  })
})
