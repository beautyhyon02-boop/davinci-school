import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import * as claude from '@/lib/ai/claude'
import { runGrading, claimableOr, RUN_LEASE_MS } from '@/lib/classroom/grade'

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
const snapshot = { cover: { title: 'T', subject: '수학', level: '중', grade: 1, version: 1, published_at: '' }, lessons: [], materials: [], standards: [], intro: '', reconstruction: '', learning_goals: [], key_question: '', assessment, teacher_guide: null, generated_with: { models: [] } }
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
    expect(last.status).toBe('drafted'); expect(last.model).toBe('mock'); expect(last.ai_score).toBe(2)
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

describe('claimableOr', () => {
  it('builds a PostgREST or-filter with a quoted lease cutoff', () => {
    const now = Date.parse('2026-09-23T10:00:00.000Z')
    const cutoff = new Date(now - RUN_LEASE_MS).toISOString()
    expect(claimableOr(['failed'], now)).toBe(`status.in.(failed),updated_at.is.null,updated_at.lt."${cutoff}"`)
    expect(claimableOr(['drafted', 'failed'], now).startsWith('status.in.(drafted,failed),')).toBe(true)
  })
})
