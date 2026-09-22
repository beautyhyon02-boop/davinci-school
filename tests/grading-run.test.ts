import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { runGrading } from '@/lib/classroom/grade'

// 최소 가짜 Supabase: from(table).select().eq()… 체인이 미리 넣어 둔 행을 돌려주고 update 를 기록한다
function fakeDb(rows: Record<string, unknown[]>) {
  const updates: { table: string; patch: Record<string, unknown> }[] = []
  function chain(table: string, mode: 'select' | 'update', patch?: Record<string, unknown>) {
    const self: Record<string, unknown> = {}
    const finish = () => (mode === 'update' ? (updates.push({ table, patch: patch! }), Promise.resolve({ data: null, error: null })) : Promise.resolve({ data: rows[table]?.[0] ?? null, error: null }))
    for (const m of ['select', 'eq', 'order', 'limit']) self[m] = () => self
    self.maybeSingle = finish; self.single = finish
    self.then = (res: (v: unknown) => void) => finish().then(res)
    return self
  }
  return { updates, from: (table: string) => ({ select: () => chain(table, 'select'), update: (patch: Record<string, unknown>) => chain(table, 'update', patch) }) }
}

const assessment = JSON.parse(readFileSync('data/studio-fixtures/stage5-generate.json', 'utf8'))
const snapshot = { cover: { title: 'T', subject: '수학', level: '중', grade: 1, version: 1, published_at: '' }, lessons: [], materials: [], standards: [], intro: '', reconstruction: '', learning_goals: [], key_question: '', assessment, teacher_guide: null, generated_with: { models: [] } }

describe('runGrading (mock)', () => {
  const prev = process.env.AI_MOCK
  beforeEach(() => { process.env.AI_MOCK = '1' })
  afterEach(() => { process.env.AI_MOCK = prev })

  it('moves pending → drafted with the fixture draft and model mock', async () => {
    const db = fakeDb({
      gradings: [{ id: 'g1', status: 'pending', answer_id: 'a1' }],
      answers: [{ body: 'x'.repeat(60), item_no: 1, assignment_id: 's1', assignments: { item_set_id: 'set', item_set_version: 1, student_id: 'stu' } }],
      item_set_versions: [{ snapshot }],
      students: [{ grade: 1 }],
    })
    const status = await runGrading({ gradingId: 'g1', db: db as never })
    expect(status).toBe('drafted')
    const last = db.updates.at(-1)!.patch
    expect(last.status).toBe('drafted'); expect(last.model).toBe('mock'); expect(last.ai_score).toBe(2)
  })
  it('does nothing when already drafted', async () => {
    const db = fakeDb({ gradings: [{ id: 'g1', status: 'drafted', answer_id: 'a1' }] })
    expect(await runGrading({ gradingId: 'g1', db: db as never })).toBe('drafted')
    expect(db.updates).toHaveLength(0)
  })
})
