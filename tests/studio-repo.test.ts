// lib/studio/repo.ts 의 Supabase 저장/읽기 대응을 가짜 클라이언트로 검사한다(마이그레이션 0011 의 unit_plan·reconstruction_detail·notice_plan 열).
import { describe, it, expect } from 'vitest'
import { buildStatuses, createSupabaseRepo } from '@/lib/studio/repo'
import type { StageStatus } from '@/lib/studio/stages'

type Row = Record<string, unknown>
type Result = { data: unknown; error: { message: string } | null }
type Builder = {
  select: (cols?: string) => Builder
  eq: (col: string, value: unknown) => Builder
  update: (patch: Row) => Builder
  single: () => Promise<Result>
  then: (res: (v: Result) => unknown, rej?: (e: unknown) => unknown) => Promise<unknown>
}

// 최소 가짜 Supabase: select 열 목록은 무시하고 행 전체를 돌려준다. update(...).eq(...) 는 맞는 행에 patch 를 덮어쓴다.
function fakeSupabase(tables: Record<string, Row[]>) {
  function from(table: string): Builder {
    const filters: [string, unknown][] = []
    let patch: Row | null = null
    const matching = () => (tables[table] ?? []).filter((r) => filters.every(([c, v]) => r[c] === v))
    const run = (): Result => {
      if (patch) {
        for (const r of matching()) Object.assign(r, structuredClone(patch))
        return { data: null, error: null }
      }
      return { data: structuredClone(matching()), error: null }
    }
    const b: Builder = {
      select: () => b,
      eq: (c, v) => { filters.push([c, v]); return b },
      update: (p) => { patch = p; return b },
      single: async () => {
        const r = run()
        if (patch) return r
        const first = (r.data as Row[])[0]
        return first ? { data: first, error: null } : { data: null, error: { message: 'not found' } }
      },
      then: (res, rej) => Promise.resolve(run()).then(res, rej),
    }
    return b
  }
  async function rpc(fn: string, args: { p_item_set_id: string; p_key: string; p_value: unknown }) {
    if (fn !== 'set_stage_status') return { data: null, error: { message: `unknown rpc ${fn}` } }
    const row = tables.item_sets.find((r) => r.id === args.p_item_set_id)!
    row.stage_status = { ...(row.stage_status as Row), [args.p_key]: structuredClone(args.p_value) }
    return { data: null, error: null }
  }
  return { from, rpc }
}

const standards = [
  { code: '[9수04-02]', text: '자료를 줄기와 잎 그림, 도수분포표, 히스토그램, 도수분포다각형으로 나타내고 해석할 수 있다.' },
  { code: '[9수04-03]', text: '상대도수를 구하고, 상대도수의 분포를 표나 그래프로 나타내고 해석할 수 있다.' },
]
const stage2 = {
  standards: standards.map((s) => ({ code: s.code, original_text: s.text, reconstruction_type: '유지', merged_with: [], reconstructed_text: s.text, reason: ['4~6차시 압축'], learning_elements: ['도수분포표'] })),
  reconstruction: standards[1].text,
  learning_goals: [{ text: '도수분포표의 뜻을 설명할 수 있다.', axis: '지식·이해' }, { text: '상대도수를 구할 수 있다.', axis: '과정·기능' }, { text: '통계의 유용성을 인식한다.', axis: '가치·태도' }],
  level_anchor: [{ code: '[9수04-02]', level: 'C', statement: '도수분포표를 만들 수 있다.' }],
  key_question_candidates: ['자료는 무엇을 말하는가?', '왜 비율로 비교하는가?'],
}
const stage3 = {
  unit_plan: {
    set_title: '축제 쓰레기 통계', set_key_question: '자료는 무엇을 말하는가?',
    lesson_map: [1, 2, 3, 4].map((n) => ({ lesson_no: n, standards: ['[9수04-02]'], topic: `주제 ${n}` })),
    assessment_plan: { formative: '퀴즈', summative_placement: [{ lesson_no: 2, kind: '서술형1' }, { lesson_no: 4, kind: '논술형' }], rubric_note: { 상: 'a', 중: 'b', 하: 'c' } },
  },
  lessons: [1, 2, 3, 4].map((n) => ({ no: n, topic: `주제 ${n}` })),
}
const noticePlan = { per_lesson: [{ lesson_no: 1, topic_summary: '요약', preview: '예고', home_study_suggestion: '해 봅시다', quiz_notes: [], criteria_phrases: null }], footer_disclaimer: '본 안내장은 학교생활기록부가 아니며, 학원 자체 학습 기록입니다.' }

function seed() {
  return {
    item_sets: [{
      id: 'set1', theme_id: 'th1', subject: '수학', level: '중', grade: 1, key_question: '자료는 무엇을 말하는가?', stage_status: {},
      reconstruction: null, reconstruction_detail: null, learning_goals: null, unit_plan: null, lessons: null, materials: null,
      assessment: null, teacher_guide: null, notice_plan: null,
    }] as Row[],
    themes: [{ id: 'th1', title: '축제', subjects: ['수학'], materials: null, intro_ideas: null }] as Row[],
    item_set_standards: standards.map((s) => ({ item_set_id: 'set1', standards: s })) as Row[],
  }
}

describe('createSupabaseRepo (v2 columns)', () => {
  it('saveOutput 2/3/7 then loadContext round-trips the full v2 outputs, unit_plan included', async () => {
    const tables = seed()
    const repo = createSupabaseRepo(fakeSupabase(tables) as never)
    const accepted = (output: unknown): StageStatus => ({ state: 'accepted', attempt: 1, output, updated_at: '' })
    await repo.saveOutput('set1', 2, stage2); await repo.saveStatus('set1', 2, accepted(stage2))
    await repo.saveOutput('set1', 3, stage3); await repo.saveStatus('set1', 3, accepted(stage3))
    await repo.saveOutput('set1', 7, noticePlan); await repo.saveStatus('set1', 7, { state: 'generated', attempt: 1, output: noticePlan, updated_at: '' })

    const row = tables.item_sets[0]
    expect(row).toMatchObject({ reconstruction: stage2.reconstruction, reconstruction_detail: stage2.standards, learning_goals: stage2.learning_goals, unit_plan: stage3.unit_plan, lessons: stage3.lessons, notice_plan: noticePlan })
    expect(row.key_question).toBe('자료는 무엇을 말하는가?')   // 새 후보에 있으므로 유지

    const ctx = await repo.loadContext('set1')
    expect(ctx.outputs[2]).toEqual(stage2)
    expect(ctx.outputs[3]).toEqual(stage3)
    expect((ctx.outputs[3] as typeof stage3).unit_plan.assessment_plan.summative_placement).toHaveLength(2)
    expect(ctx.outputs[7]).toEqual(noticePlan)
    expect(ctx.statuses?.[7]?.state).toBe('generated')
    expect(ctx.standards.map((s) => s.code)).toEqual(['[9수04-02]', '[9수04-03]'])
  })

  it('stage 2 save clears a chosen key question that is no longer a candidate', async () => {
    const tables = seed()
    const repo = createSupabaseRepo(fakeSupabase(tables) as never)
    await repo.saveOutput('set1', 2, { ...stage2, key_question_candidates: ['다른 질문은 무엇일까?', '또 다른 질문은?'] })
    expect(tables.item_sets[0].key_question).toBeNull()
  })

  // T6 관찰: 대주제 공유 자료는 v1 모양(source 문자열, role 없음)으로 저장돼 있다 — prior 로 넘길 때 v2 기본값을 입혀
  // 5단계 [TS] '원자료(raw) 1개 이상' 검사가 공유 자료만 인용한 문항을 잘못 반려하지 않게 한다. context 로 적힌 자료는 그대로.
  it('loadContext gives theme shared materials v2 defaults (source object, role raw unless context)', async () => {
    const tables = seed()
    tables.themes[0].materials = [
      { id: 'A', title: '공유 A', kind: 'table', body: null, table: { columns: ['x'], rows: [[1]] }, source: '자작' },
      { id: 'D', title: '공유 D', kind: 'text', body: '배경', table: null, source: { kind: '공개', attribution: '환경부(2024)' }, role: 'context', images: ['https://x.test/a.png'] },
    ]
    const ctx = await createSupabaseRepo(fakeSupabase(tables) as never).loadContext('set1')
    expect(ctx.prior.shared_materials).toEqual([
      { id: 'A', title: '공유 A', kind: 'table', body: null, table: { columns: ['x'], rows: [[1]] }, source: { kind: '자작', attribution: null, ai_assisted: false }, role: 'raw', images: [] },
      { id: 'D', title: '공유 D', kind: 'text', body: '배경', table: null, source: { kind: '공개', attribution: '환경부(2024)', ai_assisted: false }, role: 'context', images: ['https://x.test/a.png'] },
    ])
  })

  it('loadContext leaves outputs empty for stages whose columns are still null', async () => {
    const ctx = await createSupabaseRepo(fakeSupabase(seed()) as never).loadContext('set1')
    expect(Object.keys(ctx.outputs)).toEqual([])
  })
})

describe('buildStatuses', () => {
  it('loads stages 1..7 from stage_status (7 = 안내장 틀) and stage 0 from themes.intro_ideas', () => {
    const st = (state: StageStatus['state']): StageStatus => ({ state, attempt: 1, updated_at: '' })
    const statuses = buildStatuses({ stage1: st('accepted'), stage6: st('accepted'), stage7: st('reviewed') }, st('accepted'))
    expect(Object.keys(statuses).map(Number)).toEqual([0, 1, 6, 7])
    expect(statuses[7]?.state).toBe('reviewed')
  })
})
