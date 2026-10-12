// tests/quiz-submit-ai.test.ts
// 대표 2026-10-12: 학생 퀴즈 제출 — 글자 비교로 틀린 단답형만 AI 뜻 판정(맞음 → O, 부분·틀림 → X)하고 판정·이유를 저장한다.
// 0017(ai_verdict·ai_reason 열) 전에 배포돼도 깨지지 않는다 — 열이 없으면 판정 저장만 빼고 다시 넣는다.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { memoryDb } from './fixtures/fake-db'

const state: { session: Record<string, unknown>; db: ReturnType<typeof memoryDb>; admin: unknown } = { session: {}, db: memoryDb({}), admin: memoryDb({}) }
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/auth/session', () => ({ getSessionProfile: vi.fn(async () => state.session) }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => state.db) }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => state.admin }))
vi.mock('@/lib/ai/claude', () => ({ callStructured: vi.fn() }))
const claude = await import('@/lib/ai/claude')
const { submitQuiz } = await import('@/app/student/assignments/[id]/actions')

const quiz = (answer: string, keywords?: string[]) => ({ q: '문제', type: 'short', answer, choices: null, explanation: '풀이', ...(keywords ? { keywords } : {}) })
const lesson = { no: 1, key_question: 'q', goal: 'g', topic: 't', formative_check: { quiz: [quiz('bring your own cup / use a reusable cup'), quiz('6'), quiz('사용량이 많다는 사실로 부탁을 뒷받침하려고', ['사실', '뒷받침'])] } }
const snapshot = { schema_version: 2, cover: { title: 'T', subject: '영어', level: '중', grade: 1, version: 1, published_at: '' }, lessons: [lesson], materials: [], standards: [], assessment: null }
const tables = () => ({
  assignments: [{ id: 'a1', item_set_id: 'set', item_set_version: 1, academy_id: 'ac1', student_id: 'st-a1', open_lessons: 1, closed: false }],
  item_set_versions: [{ item_set_id: 'set', version: 1, snapshot }],
  quiz_responses: [] as Record<string, unknown>[],
  quiz_finalizations: [] as Record<string, unknown>[],
})
const stored = () => (state.admin as ReturnType<typeof memoryDb>).tables.quiz_responses.map((r) => ({ quiz_no: r.quiz_no, correct: r.correct, ai_verdict: r.ai_verdict ?? null, ai_reason: r.ai_reason ?? null, match_kind: r.match_kind ?? null }))
const verdict = (v: string, reason: string) => ({ data: { verdict: v, reason }, usage: { input: 1, output: 1, cacheRead: 0 }, model: 'mock' })

beforeEach(() => {
  state.session = { role: 'student', academyId: 'ac1', userId: 'st-a1' }
  state.db = memoryDb(tables()); state.admin = memoryDb({ quiz_responses: [], quiz_finalizations: [] })
  vi.mocked(claude.callStructured).mockReset()
})

describe('submitQuiz — AI 뜻 판정', () => {
  it('글자가 다르지만 뜻이 같은 답: AI 맞음 → O 로 저장하고 판정·이유를 남긴다; 숫자 불일치·핵심어 정답은 AI를 부르지 않는다', async () => {
    vi.mocked(claude.callStructured).mockResolvedValue(verdict('맞음', '같은 행동을 더 길게 말함'))
    const r = await submitQuiz('a1', 1, ['bring your own cup from home', '7', '컵을 많이 쓴다는 사실로 부탁을 뒷받침'])
    expect(r).toMatchObject({ ok: true, results: [{ correct: true }, { correct: false }, { correct: true }] })
    expect(stored()).toEqual([
      { quiz_no: 1, correct: true, ai_verdict: '맞음', ai_reason: '같은 행동을 더 길게 말함', match_kind: 'ai' },
      { quiz_no: 2, correct: false, ai_verdict: null, ai_reason: null, match_kind: null },
      { quiz_no: 3, correct: true, ai_verdict: null, ai_reason: null, match_kind: 'keyword' },
    ])
    expect(vi.mocked(claude.callStructured)).toHaveBeenCalledTimes(1)
  })
  it('부분·틀림은 X 로 저장하되 판정을 남긴다(부분은 원장 화면에서 확인 필요로 보인다)', async () => {
    vi.mocked(claude.callStructured).mockResolvedValueOnce(verdict('부분', '근거는 맞지만 목적이 빠짐')).mockResolvedValueOnce(verdict('틀림', '다른 행동'))
    await submitQuiz('a1', 1, ['bring a cup', '6', '숫자로 보여줌'])
    expect(stored()).toEqual([
      { quiz_no: 1, correct: false, ai_verdict: '부분', ai_reason: '근거는 맞지만 목적이 빠짐', match_kind: 'ai' },
      { quiz_no: 2, correct: true, ai_verdict: null, ai_reason: null, match_kind: 'literal' },
      { quiz_no: 3, correct: false, ai_verdict: '틀림', ai_reason: '다른 행동', match_kind: 'ai' },
    ])
  })
  it('AI 호출이 실패하거나 빈 값을 돌려주면 글자 비교 결과(X)로 저장하고 판정은 비운다 — 제출은 성공한다', async () => {
    vi.mocked(claude.callStructured).mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(undefined as never)
    const r = await submitQuiz('a1', 1, ['bring a cup', '6', '숫자로 보여줌'])
    expect(r.ok).toBe(true)
    expect(stored().map((s) => [s.correct, s.ai_verdict])).toEqual([[false, null], [true, null], [false, null]])
  })
  it('0017 전(ai_verdict 열이 없음): 판정 열을 빼고 다시 넣어 O/X 는 저장된다', async () => {
    vi.mocked(claude.callStructured).mockResolvedValue(verdict('맞음', '같은 뜻'))
    const inner = memoryDb({ quiz_responses: [], quiz_finalizations: [] })
    let rejected = 0
    state.admin = { ...inner, from: (table: string) => (table !== 'quiz_responses' ? inner.from(table) : { ...inner.from(table), insert: (rows: Record<string, unknown>[]) => {
      if (rows.some((row) => 'ai_verdict' in row || 'match_kind' in row)) { rejected += 1; return Promise.resolve({ error: { code: 'PGRST204', message: "Could not find the 'ai_verdict' column of 'quiz_responses' in the schema cache" } }) }
      return inner.from(table).insert(rows)
    } }) }
    const r = await submitQuiz('a1', 1, ['bring your own cup from home', '6', '숫자로 보여줌'])
    expect(r.ok).toBe(true); expect(rejected).toBe(1)
    // 3번도 핵심어가 빠져 AI(맞음)를 거쳤으므로 O — 두 줄 모두 판정 열 없이 저장된다
    expect(inner.tables.quiz_responses.map((row) => [row.quiz_no, row.correct, 'ai_verdict' in row || 'match_kind' in row])).toEqual([[1, true, false], [2, true, false], [3, true, false]])
  })
})
