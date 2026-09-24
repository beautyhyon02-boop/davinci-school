// publish.upgradeSnapshot = 게시 판 읽기 입구. v2 표시가 붙은 판이라도 대주제 공유 자료가 v1 모양(source 문자열, role·images 없음)으로
// 실려 있을 수 있다 — 그 자료만 고치고, 멀쩡한 v2 자료와 고칠 것 없는 판은 같은 객체로 돌려준다.
import { describe, it, expect } from 'vitest'
import { upgradeSnapshot } from '@/lib/studio/publish'

const v2Material = () => ({ id: 'B', title: '세트 자료', kind: 'text', body: '본문', table: null, source: { kind: '공개', attribution: '통계청(2024)', ai_assisted: true }, role: 'context', images: ['https://x.test/b.png'] })
const snapshotWith = (materials: unknown[]) => ({
  schema_version: 2, cover: { title: 'T', subject: '수학', level: '중', grade: 1, version: 1, published_at: '' }, standards: [], intro: '', reconstruction: '',
  reconstruction_detail: [], learning_goals: [], key_question: '', unit_plan: null, lessons: [], materials, assessment: null, teacher_guide: null,
  notice_plan: null, references: [], generated_with: { models: [] },
})

describe('publish.upgradeSnapshot (material repair on v2-stamped snapshots)', () => {
  it('repairs v1-shaped materials and returns genuine v2 materials by reference', () => {
    const legacy = { id: 'A', title: '공유 자료', kind: 'table', body: null, table: { columns: ['x'], rows: [[1]] }, source: '자작' }
    const good = v2Material()
    const raw = snapshotWith([legacy, good])
    const s = upgradeSnapshot(raw)
    expect(s.materials[0]).toEqual({ ...legacy, source: { kind: '자작', attribution: null, ai_assisted: false }, role: 'raw', images: [] })
    expect(s.materials[1]).toBe(good)
    expect(s.materials).toHaveLength(2)
    expect(raw.materials[0]).toBe(legacy)   // 입력은 바꾸지 않는다
    expect((legacy as { role?: string }).role).toBeUndefined()
  })
  it('repairs a v2-shaped material missing only images, keeping its context role and source', () => {
    const noImages = { ...v2Material(), images: undefined }
    const s = upgradeSnapshot(snapshotWith([noImages]))
    expect(s.materials[0]).toMatchObject({ role: 'context', source: { kind: '공개', attribution: '통계청(2024)', ai_assisted: true }, images: [] })
  })
  it('passes a fully v2 snapshot through as the same object', () => {
    const raw = snapshotWith([v2Material(), { ...v2Material(), id: 'C', role: 'raw', images: [] }])
    expect(upgradeSnapshot(raw)).toBe(raw)
  })
})
