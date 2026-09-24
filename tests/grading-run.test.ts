import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import * as claude from '@/lib/ai/claude'
import { runGrading, claimableOr, RUN_LEASE_MS, alignCriteria, GradingAlignError } from '@/lib/classroom/grade'
import { buildGradingPrompt } from '@/lib/classroom/grading-prompt'
import { loadFixture } from '@/lib/ai/mock'

// 모델 호출 여부를 세기 위해 callStructured 를 원본을 감싼 spy 로 바꾼다(동작은 그대로 mock fixture)
vi.mock('@/lib/ai/claude', async (importOriginal) => {
  const m = await importOriginal<typeof import('@/lib/ai/claude')>()
  return { ...m, callStructured: vi.fn(m.callStructured) }
})

type Update = { table: string; patch: Record<string, unknown>; filters: string[] }

// 최소 가짜 Supabase: from(table).select().eq()… 체인이 미리 넣어 둔 행을 돌려주고 update 를 기록한다.
// update(...).in('status', …).select() 는 "줄 잡기"로 보고, claim=false 면 잡힌 줄 없음([])을 돌려준다.
function fakeDb(rows: Record<string, unknown[]>, opts: { claim?: boolean } = {}) {
  const updates: Update[] = []
  function chain(table: string, mode: 'select' | 'update', patch?: Record<string, unknown>) {
    const self: Record<string, unknown> = {}
    const filters: string[] = []
    let returning = false
    const finish = () => {
      if (mode === 'update') {
        updates.push({ table, patch: patch!, filters })
        const isClaim = filters.some((f) => f.startsWith('in:status'))
        const data = returning ? (isClaim && opts.claim === false ? [] : [{ id: 'g1' }]) : null
        return Promise.resolve({ data, error: null })
      }
      return Promise.resolve({ data: rows[table]?.[0] ?? null, error: null })
    }
    self.select = () => { if (mode === 'update') returning = true; return self }
    self.eq = (c: string) => { filters.push(`eq:${c}`); return self }
    self.in = (c: string, v: string[]) => { filters.push(`in:${c}:${v.join(',')}`); return self }
    self.or = (f: string) => { filters.push(`or:${f}`); return self }
    for (const m of ['order', 'limit']) self[m] = () => self
    self.maybeSingle = finish; self.single = finish
    self.then = (res: (v: unknown) => void, rej?: (e: unknown) => void) => finish().then(res, rej)
    return self
  }
  return { updates, from: (table: string) => ({ select: () => chain(table, 'select'), update: (patch: Record<string, unknown>) => chain(table, 'update', patch) }) }
}

const assessment = JSON.parse(readFileSync('data/studio-fixtures/stage5-generate.json', 'utf8'))
// stage5-generate.json 은 T6 부터 v2 — 스냅샷도 v2 로 표시해야 grade.ts 의 upgradeSnapshot 이 v1 로 오인해 다시 올리지 않는다
const snapshot = { schema_version: 2, cover: { title: 'T', subject: '수학', level: '중', grade: 1, version: 1, published_at: '' }, lessons: [], materials: [], standards: [], intro: '', reconstruction: '', learning_goals: [], key_question: '', assessment, teacher_guide: null, generated_with: { models: [] } }
const answerRows = { body: 'x'.repeat(60), item_no: 1, assignment_id: 's1', assignments: { item_set_id: 'set', item_set_version: 1, student_id: 'stu' } }

describe('runGrading (mock)', () => {
  const prev = process.env.AI_MOCK
  beforeEach(() => { process.env.AI_MOCK = '1'; vi.mocked(claude.callStructured).mockClear() })
  afterEach(() => { process.env.AI_MOCK = prev })

  it('moves pending → drafted with the fixture draft and model mock', async () => {
    const db = fakeDb({
      gradings: [{ id: 'g1', status: 'pending', answer_id: 'a1' }],
      answers: [answerRows],
      item_set_versions: [{ snapshot }],
      students: [{ grade: 1 }],
    })
    const status = await runGrading({ gradingId: 'g1', db: db as never })
    expect(status).toBe('drafted')
    const last = db.updates.at(-1)!.patch
    expect(last.status).toBe('drafted'); expect(last.model).toBe('mock'); expect(last.ai_score).toBe(4)
    // F1: drafted 쓰기도 updated_at 을 바꿔야 검수 카드가 새 초안으로 다시 그려진다
    expect(typeof last.updated_at).toBe('string')
    expect(Number.isNaN(Date.parse(last.updated_at as string))).toBe(false)
  })
  it('claims the row atomically (conditional pending update) before calling the model', async () => {
    const db = fakeDb({ gradings: [{ id: 'g1', status: 'failed', answer_id: 'a1' }], answers: [answerRows], item_set_versions: [{ snapshot }], students: [{ grade: 1 }] })
    await runGrading({ gradingId: 'g1', db: db as never })
    const claim = db.updates[0]
    expect(claim.patch).toMatchObject({ status: 'pending', error: null })
    expect(typeof claim.patch.updated_at).toBe('string')
    expect(claim.filters).toContain('in:status:pending,failed')
    expect(claim.filters.some((f) => f.startsWith('or:'))).toBe(true)
    expect(claude.callStructured).toHaveBeenCalledTimes(1)
  })
  it('F7: when the claim returns no rows, does not call the model and returns the current status', async () => {
    const db = fakeDb({ gradings: [{ id: 'g1', status: 'pending', answer_id: 'a1' }], answers: [answerRows], item_set_versions: [{ snapshot }], students: [{ grade: 1 }] }, { claim: false })
    const status = await runGrading({ gradingId: 'g1', db: db as never })
    expect(status).toBe('pending')
    expect(claude.callStructured).not.toHaveBeenCalled()
    // 잡기 시도 한 번 말고는 쓰기가 없다(drafted/failed 기록 없음)
    expect(db.updates).toHaveLength(1)
    expect(db.updates[0].filters).toContain('in:status:pending,failed')
  })
  it('does nothing when already drafted', async () => {
    const db = fakeDb({ gradings: [{ id: 'g1', status: 'drafted', answer_id: 'a1' }] })
    expect(await runGrading({ gradingId: 'g1', db: db as never })).toBe('drafted')
    expect(db.updates).toHaveLength(0)
    expect(claude.callStructured).not.toHaveBeenCalled()
  })
  it('records failed with the error when the setup phase throws (answer not found)', async () => {
    const db = fakeDb({ gradings: [{ id: 'g1', status: 'pending', answer_id: 'a1' }] })
    const status = await runGrading({ gradingId: 'g1', db: db as never })
    expect(status).toBe('failed')
    const last = db.updates.at(-1)!.patch
    expect(last).toMatchObject({ status: 'failed', error: 'answer not found' })
    expect(typeof last.updated_at).toBe('string')
    expect(claude.callStructured).not.toHaveBeenCalled()
  })
  it('clamps ai_score to item.points when the draft score exceeds it', async () => {
    const clampAssessment = JSON.parse(JSON.stringify(assessment))
    clampAssessment.items[0].points = 1
    const clampSnapshot = { ...snapshot, assessment: clampAssessment }
    const db = fakeDb({
      gradings: [{ id: 'g1', status: 'pending', answer_id: 'a1' }],
      answers: [answerRows],
      item_set_versions: [{ snapshot: clampSnapshot }],
      students: [{ grade: 1 }],
    })
    const status = await runGrading({ gradingId: 'g1', db: db as never })
    expect(status).toBe('drafted')
    expect(db.updates.at(-1)!.patch.ai_score).toBe(1)
  })
})

describe('alignCriteria (strict by name; ai_criteria max follows the rubric)', () => {
  const cr = (name: string, points: number, max = 4) => ({ name, points, max, evidence: 'e', note: 'n' })
  const essay = { criteria: [{ name: 'A 요소', max: 4 }, { name: 'B 요소', max: 4 }, { name: 'C 요소', max: 4 }, { name: 'D 요소', max: 4 }] }
  it('sets max from the rubric criterion of the same name and caps points', () => {
    const r = alignCriteria([cr('서술형 채점표', 4)], { criteria: [{ name: '서술형 채점표', max: 3 }] })
    expect(r.criteria).toEqual([{ name: '서술형 채점표', points: 3, max: 3, evidence: 'e', note: 'n' }])
    expect(r.score).toBe(3)
  })
  it('reorders by name into rubric order and matches names ignoring surrounding/repeated spaces', () => {
    const r = alignCriteria([cr('D 요소', 1), cr(' B  요소 ', 3), cr('A 요소', 4), cr('C 요소', 2)], essay)
    expect(r.criteria.map((c) => [c.name, c.points])).toEqual([['A 요소', 4], ['B 요소', 3], ['C 요소', 2], ['D 요소', 1]])
    expect(r.score).toBe(10)
  })
  it('fails with the missing criterion named when the AI omits one', () => {
    expect(() => alignCriteria([cr('A 요소', 1), cr('B 요소', 1), cr('C 요소', 1)], essay)).toThrow(GradingAlignError)
    try { alignCriteria([cr('A 요소', 1), cr('B 요소', 1), cr('C 요소', 1)], essay) } catch (e) {
      expect((e as GradingAlignError).missing).toEqual(['D 요소']); expect((e as Error).message).toContain('D 요소')
    }
  })
  it('fails with the extra name when the AI invents or renames a criterion (no positional fallback)', () => {
    try { alignCriteria([cr('채점표', 2, 3)], { criteria: [{ name: '서술형 채점표', max: 3 }] }); expect.unreachable() } catch (e) {
      expect(e).toBeInstanceOf(GradingAlignError)
      expect((e as GradingAlignError).missing).toEqual(['서술형 채점표']); expect((e as GradingAlignError).extra).toEqual(['채점표'])
    }
  })
  it('fails when a name is repeated (count differs after matching)', () => {
    expect(() => alignCriteria([cr('A 요소', 1), cr('A 요소', 2), cr('B 요소', 1), cr('C 요소', 1), cr('D 요소', 1)], essay)).toThrow(/A 요소/)
  })
})

describe('runGrading fails loudly on a draft that does not match the rubric', () => {
  const prev = process.env.AI_MOCK
  beforeEach(() => { process.env.AI_MOCK = '1'; vi.mocked(claude.callStructured).mockClear() })
  afterEach(() => { process.env.AI_MOCK = prev })
  it('records failed with the missing criterion named and writes no partial draft', async () => {
    vi.mocked(claude.callStructured).mockResolvedValueOnce({
      data: { criteria: [{ name: '엉뚱한 요소', points: 2, max: 3, evidence: 'e', note: 'n' }], score: 2, strengths: ['잘한 점 문장'], improvements: ['보완할 점 문장'] },
      usage: { input: 0, output: 0, cacheRead: 0 }, model: 'mock',
    } as never)
    const db = fakeDb({ gradings: [{ id: 'g1', status: 'pending', answer_id: 'a1' }], answers: [answerRows], item_set_versions: [{ snapshot }], students: [{ grade: 1 }] })
    expect(await runGrading({ gradingId: 'g1', db: db as never })).toBe('failed')
    const last = db.updates.at(-1)!.patch
    expect(last.status).toBe('failed')
    expect(String(last.error)).toContain(assessment.items[0].rubric.criteria[0].name)
    expect(typeof last.updated_at).toBe('string')
    expect(db.updates.some((u) => u.patch.status === 'drafted' || 'ai_criteria' in u.patch)).toBe(false)
  })
})

describe('runGrading stores rubric-aligned criteria', () => {
  const prev = process.env.AI_MOCK
  beforeEach(() => { process.env.AI_MOCK = '1'; vi.mocked(claude.callStructured).mockClear() })
  afterEach(() => { process.env.AI_MOCK = prev })
  it('논술형 mock draft: ai_criteria names and max equal the item 2 rubric, ai_score = sum', async () => {
    const db = fakeDb({ gradings: [{ id: 'g1', status: 'pending', answer_id: 'a1' }], answers: [{ ...answerRows, item_no: 2 }], item_set_versions: [{ snapshot }], students: [{ grade: 1 }] })
    expect(await runGrading({ gradingId: 'g1', db: db as never })).toBe('drafted')
    const last = db.updates.at(-1)!.patch as { ai_criteria: { name: string; max: number; points: number }[]; ai_score: number }
    expect(last.ai_criteria.map((c) => [c.name, c.max])).toEqual(assessment.items[1].rubric.criteria.map((c: { name: string; max: number }) => [c.name, c.max]))
    expect(last.ai_score).toBe(last.ai_criteria.reduce((s, c) => s + c.points, 0))
  })
})

describe('mock grading fixtures are keyed by subject (I1)', () => {
  const prev = process.env.AI_MOCK
  beforeEach(() => { process.env.AI_MOCK = '1'; vi.mocked(claude.callStructured).mockClear() })
  afterEach(() => { process.env.AI_MOCK = prev })
  const sci = JSON.parse(readFileSync('data/studio-fixtures/stage5-generate-과학.json', 'utf8'))
  const sciSnapshot = { ...snapshot, cover: { ...snapshot.cover, subject: '과학' }, assessment: sci }
  it('buildGradingPrompt asks for grading-{kind}-{subject} (mock falls back to grading-{kind})', () => {
    expect(buildGradingPrompt({ snapshot: sciSnapshot as never, itemNo: 2, studentGrade: 1, answer: 'x' }).fixtureKey).toBe('grading-논술형-과학')
    expect(buildGradingPrompt({ snapshot: sciSnapshot as never, itemNo: 1, studentGrade: 1, answer: 'x' }).fixtureKey).toBe('grading-서술형-과학')
    expect(buildGradingPrompt({ snapshot: snapshot as never, itemNo: 1, studentGrade: 1, answer: 'x' }).fixtureKey).toBe('grading-서술형-수학')
    expect(loadFixture('grading-논술형-수학')).toEqual(JSON.parse(readFileSync('data/studio-fixtures/grading-논술형.json', 'utf8')))
    // 서술형은 과목마다 채점 요소가 다르다(2026-09-26 6점 문항) — 과학 파일이 따로 있다
    expect(loadFixture('grading-서술형-과학')).toEqual(JSON.parse(readFileSync('data/studio-fixtures/grading-서술형-과학.json', 'utf8')))
  })
  for (const [label, snap, a, itemNo] of [['과학 논술형', sciSnapshot, sci, 2], ['과학 서술형', sciSnapshot, sci, 1], ['수학 논술형', snapshot, assessment, 2], ['수학 서술형', snapshot, assessment, 1]] as const) {
    it(`${label}: the mock draft aligns with the item rubric (no GradingAlignError)`, async () => {
      const db = fakeDb({ gradings: [{ id: 'g1', status: 'pending', answer_id: 'a1' }], answers: [{ ...answerRows, item_no: itemNo }], item_set_versions: [{ snapshot: snap }], students: [{ grade: 1 }] })
      const status = await runGrading({ gradingId: 'g1', db: db as never })
      expect(db.updates.at(-1)!.patch.error ?? null).toBeNull()
      expect(status).toBe('drafted')
      const last = db.updates.at(-1)!.patch as { ai_criteria: { name: string; max: number }[] }
      expect(last.ai_criteria.map((c) => [c.name, c.max])).toEqual(a.items[itemNo - 1].rubric.criteria.map((c: { name: string; max: number }) => [c.name, c.max]))
    })
  }
})

describe('claimableOr', () => {
  it('builds a PostgREST or-filter with a quoted lease cutoff', () => {
    const now = Date.parse('2026-09-23T10:00:00.000Z')
    const cutoff = new Date(now - RUN_LEASE_MS).toISOString()
    expect(claimableOr(['failed'], now)).toBe(`status.in.(failed),updated_at.is.null,updated_at.lt."${cutoff}"`)
    expect(claimableOr(['drafted', 'failed'], now).startsWith('status.in.(drafted,failed),')).toBe(true)
  })
})
