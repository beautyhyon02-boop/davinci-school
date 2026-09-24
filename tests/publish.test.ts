import { describe, it, expect } from 'vitest'
import type { z } from 'zod'
import { canPublish, buildSnapshot, collectReferences, upgradeSnapshot } from '@/lib/studio/publish'
import type { Material } from '@/lib/studio/schemas'
import type { StageStatus } from '@/lib/studio/stages'

type MaterialT = z.infer<typeof Material>

function accepted(model = 'mock'): StageStatus {
  return { state: 'accepted', attempt: 1, model, updated_at: '2026-01-01T00:00:00.000Z' }
}

const allAccepted: Record<string, StageStatus | undefined> = {
  stage2: accepted('claude-a'),
  stage3: accepted('claude-b'),
  stage4: accepted(),
  stage5: accepted(),
  stage6: accepted(),
  stage7: accepted(),
}

describe('canPublish', () => {
  it('passes when stages 2-7 are accepted, all standards verified, and a key question is set', () => {
    const r = canPublish({
      statuses: allAccepted,
      standards: [{ code: '[9수04-02]', verified: true }],
      keyQuestion: '왜 재활용이 어려울까?',
    })
    expect(r).toEqual({ ok: true, blockers: [] })
  })

  // 대표 결정 2026-09-26: 검토는 참고 — 게시는 구조만 본다(확인·성취기준·핵심질문·단답형 퀴즈)
  it('ignores review results and static notes on confirmed stages (advisory only)', () => {
    const advisory: StageStatus = { ...accepted(), review: { pass: false, issues: [{ kind: 'other', detail: 'AI 의견' }] }, notes: [{ kind: 'fidelity', detail: '메모' }], error: '검토 반복 한도 도달 — 관리자가 직접 수정' }
    const r = canPublish({
      statuses: { ...allAccepted, stage2: advisory, stage5: advisory },
      standards: [{ code: '[9수04-02]', verified: true }],
      keyQuestion: 'q',
    })
    expect(r).toEqual({ ok: true, blockers: [] })
  })

  it('blocks with stageNotAccepted:<n> for each stage 2-7 that is not accepted', () => {
    const r = canPublish({
      statuses: { ...allAccepted, stage3: { state: 'reviewed', attempt: 1, updated_at: '' }, stage5: undefined },
      standards: [{ code: '[9수04-02]', verified: true }],
      keyQuestion: 'q',
    })
    expect(r.ok).toBe(false)
    expect(r.blockers).toContain('stageNotAccepted:3')
    expect(r.blockers).toContain('stageNotAccepted:5')
    expect(r.blockers).not.toContain('stageNotAccepted:2')
  })

  it('blocks stageNotAccepted:7 when the notice plan is not accepted', () => {
    const r = canPublish({ statuses: { ...allAccepted, stage7: undefined }, standards: [], keyQuestion: 'q' })
    expect(r.blockers).toContain('stageNotAccepted:7')
    const reviewed = canPublish({ statuses: { ...allAccepted, stage7: { state: 'reviewed', attempt: 1, updated_at: '' } }, standards: [], keyQuestion: 'q' })
    expect(reviewed).toEqual({ ok: false, blockers: ['stageNotAccepted:7'] })
  })

  it('blocks with unverifiedStandard:<code> for each unverified standard', () => {
    const r = canPublish({
      statuses: allAccepted,
      standards: [
        { code: '[9수04-02]', verified: true },
        { code: '[9국03-04]', verified: false },
      ],
      keyQuestion: 'q',
    })
    expect(r.ok).toBe(false)
    expect(r.blockers).toEqual(['unverifiedStandard:[9국03-04]'])
  })

  it('blocks with noKeyQuestion when the key question is missing or blank', () => {
    expect(canPublish({ statuses: allAccepted, standards: [], keyQuestion: null }).blockers).toContain('noKeyQuestion')
    expect(canPublish({ statuses: allAccepted, standards: [], keyQuestion: '' }).blockers).toContain('noKeyQuestion')
    expect(canPublish({ statuses: allAccepted, standards: [], keyQuestion: '   ' }).blockers).toContain('noKeyQuestion')
  })

  it('blocks with quizChoice:<lesson no> when a draft still carries a choice quiz (대표 2026-09-26: 퀴즈는 단답형만)', () => {
    const short = { type: 'short', choices: null }
    const choice = { type: 'choice', choices: ['①', '②', '③'] }
    const lesson = (no: number, quiz: { type: string; choices: unknown }[]) => ({ no, formative_check: { quiz } })
    const base = { statuses: allAccepted, standards: [], keyQuestion: 'q' }
    // 3단계를 2026-09-26 이전에 확정한 초안: 선택형이 남은 차시마다 하나씩(선택지 달린 단답형도 막는다)
    const r = canPublish({ ...base, lessons: [lesson(1, [short, short, short]), lesson(2, [short, choice, choice]), lesson(3, [short, short, { type: 'short', choices: ['6', '7'] }]), lesson(6, [])] })
    expect(r).toEqual({ ok: false, blockers: ['quizChoice:2', 'quizChoice:3'] })
    // 단답형만이면 막지 않는다 — 단원 평가 차시(퀴즈 0)와 퀴즈 칸이 없는 차시도
    expect(canPublish({ ...base, lessons: [lesson(1, [short, short, short]), lesson(6, []), { no: 7 }] })).toEqual({ ok: true, blockers: [] })
    // 초안 차시가 없거나(null) 배열이 아니면 검사를 건너뛴다(3단계 미확정은 stageNotAccepted 가 막는다)
    expect(canPublish({ ...base, lessons: null })).toEqual({ ok: true, blockers: [] })
    expect(canPublish({ ...base, lessons: {} as never })).toEqual({ ok: true, blockers: [] })
  })

  it('does not touch published snapshots: an old published 판 with choice quizzes still reads back unchanged', () => {
    // 검사는 초안(item_sets.lessons)에만 돈다 — 게시 판 읽기(upgradeSnapshot)는 옛 선택형 퀴즈를 그대로 돌려준다
    const quiz = { q: '다음 중 알맞은 것은?', type: 'choice', choices: ['①', '②'], answer: '②', explanation: '옛 판의 선택형 퀴즈이다.' }
    const lessons = [{ no: 1, kind: 'teaching', assessment: [], formative_check: { quiz: [quiz] } }]
    const raw = { schema_version: 2, cover: { title: 'T', subject: '수학', level: '중', grade: 1, version: 1, published_at: '' }, standards: [], intro: '', reconstruction: '',
      reconstruction_detail: [], learning_goals: [], key_question: '', unit_plan: null, lessons, materials: [], assessment: null, teacher_guide: null,
      notice_plan: null, references: [], generated_with: { models: [] } }
    const s = upgradeSnapshot(raw)
    expect(s.lessons[0].formative_check.quiz[0]).toEqual(quiz)
  })

  it('can report multiple blockers at once', () => {
    const r = canPublish({
      statuses: {},
      standards: [{ code: '[9수04-02]', verified: false }],
      keyQuestion: null,
    })
    expect(r.ok).toBe(false)
    expect(r.blockers).toEqual([
      'stageNotAccepted:2',
      'stageNotAccepted:3',
      'stageNotAccepted:4',
      'stageNotAccepted:5',
      'stageNotAccepted:6',
      'stageNotAccepted:7',
      'unverifiedStandard:[9수04-02]',
      'noKeyQuestion',
    ])
  })
})

const baseTheme = { title: '자연보호 프로젝트', level: '중', grade: 2, intro: '학교 축제에서 일회용품을 줄이자.', materials: null as null | MaterialT[] }

const goals = [
  { text: '목표1을 설명할 수 있다.', axis: '지식·이해' as const },
  { text: '목표2를 구할 수 있다.', axis: '과정·기능' as const },
  { text: '목표3의 가치를 인식한다.', axis: '가치·태도' as const },
]

const baseItemSet = {
  subject: '수학' as const,
  level: '중',
  grade: 2,
  version: 1,
  reconstruction: '재구성 문장',
  reconstruction_detail: null,
  learning_goals: goals,
  key_question: '핵심질문',
  unit_plan: null,
  lessons: [],
  materials: null as null | MaterialT[],
  assessment: null,
  teacher_guide: null,
  notice_plan: null,
  stage_status: { stage2: accepted('claude-a'), stage4: accepted('claude-b') } as Record<string, StageStatus | undefined>,
}

function material(id: string, title: string): MaterialT {
  return { id, title, kind: 'text', body: '본문', table: null, source: { kind: '자작', attribution: null, ai_assisted: false }, role: 'raw', images: [] }
}

describe('buildSnapshot', () => {
  it('carries theme/itemSet fields into cover, intro, reconstruction, goals, key question', () => {
    const snap = buildSnapshot({ theme: baseTheme, itemSet: baseItemSet, standards: [{ code: '[9수04-02]', text: '원문' }], version: 1 })
    expect(snap.cover.title).toBe('자연보호 프로젝트')
    expect(snap.cover.subject).toBe('수학')
    expect(snap.cover.level).toBe('중')
    expect(snap.cover.grade).toBe(2)
    expect(typeof snap.cover.published_at).toBe('string')
    expect(snap.intro).toBe(baseTheme.intro)
    expect(snap.reconstruction).toBe('재구성 문장')
    expect(snap.learning_goals).toEqual(goals)
    expect(snap.key_question).toBe('핵심질문')
    expect(snap.standards).toEqual([{ code: '[9수04-02]', text: '원문' }])
  })

  it('buildSnapshot emits schema_version 2, unit_plan, reconstruction_detail, notice_plan and merged references', () => {
    const s = buildSnapshot({ theme: { ...baseTheme, materials: null }, standards: [{ code: '[9수04-02]', text: 't' }], version: 1,
      itemSet: { ...baseItemSet, unit_plan: { set_title: 'u' }, reconstruction_detail: [{ code: '[9수04-02]' }], notice_plan: { per_lesson: [] },
        assessment: { items: [{ references: [{ id: 'math-jaryojip-001', source: 'a.pdf p.1' }] }, { references: [{ id: 'math-jaryojip-001', source: 'a.pdf p.1' }, { id: 'k25-과학-01', source: 'b.pdf p.28' }] }], grade_boundaries: [], feedback_templates: { 상: '', 중: '', 하: '' } } } as never })
    expect(s.schema_version).toBe(2); expect(s.unit_plan).toEqual({ set_title: 'u' }); expect(s.notice_plan).toEqual({ per_lesson: [] })
    expect(s.reconstruction_detail).toHaveLength(1); expect(s.references.map((r) => r.id)).toEqual(['k25-과학-01', 'math-jaryojip-001'])
  })

  it('defaults the v2-only fields when the set has none yet (null columns)', () => {
    const s = buildSnapshot({ theme: baseTheme, itemSet: baseItemSet, standards: [], version: 1 })
    expect(s).toMatchObject({ schema_version: 2, reconstruction_detail: [], unit_plan: null, notice_plan: null, references: [] })
  })

  it('collectReferences ignores items without references and keeps one entry per id, sorted by id', () => {
    expect(collectReferences(null)).toEqual([])
    expect(collectReferences({ items: [{}, { references: [{ id: 'b', source: 's2' }, { id: 'a', source: 's1' }, { id: 'b', source: 's2' }] }] } as never))
      .toEqual([{ id: 'a', source: 's1' }, { id: 'b', source: 's2' }])
  })

  it('uses the version passed in verbatim — first publish (no prior item_set_versions row) is 1', () => {
    const snap = buildSnapshot({ theme: baseTheme, itemSet: baseItemSet, standards: [], version: 1 })
    expect(snap.cover.version).toBe(1)
  })

  it('uses the version passed in verbatim — with an existing max version of 3, the caller passes 4', () => {
    const snap = buildSnapshot({ theme: baseTheme, itemSet: baseItemSet, standards: [], version: 4 })
    expect(snap.cover.version).toBe(4)
  })

  // 스펙 §1: 한 대주제의 모든 과목이 자료 A~D 를 공유한다 → id 가 겹치면 공유(대주제) 자료가 이기고 세트 자료는 버린다.
  it('merges theme materials and set materials by id, theme wins on conflict, sorted by id', () => {
    const theme = { ...baseTheme, materials: [material('A', '대주제 자료 A'), material('C', '대주제 자료 C')] }
    const itemSet = { ...baseItemSet, materials: [material('B', '세트 자료 B'), material('A', '세트가 덮어쓰려 한 자료 A')] }
    const snap = buildSnapshot({ theme, itemSet, standards: [], version: 1 })
    expect(snap.materials.map((m) => m.id)).toEqual(['A', 'B', 'C'])
    expect(snap.materials.find((m) => m.id === 'A')!.title).toBe('대주제 자료 A')
    expect(snap.materials.find((m) => m.id === 'B')!.title).toBe('세트 자료 B')
    expect(snap.materials.find((m) => m.id === 'C')!.title).toBe('대주제 자료 C')
  })

  // 2A 시절 행에는 images 키가 없다 — PackageView 가 m.images.length 로 읽으므로 스냅샷에서 기본값을 채운다.
  it('normalizes materials and lessons written before `images` existed', () => {
    const legacyMaterial = { id: 'A', title: '옛 자료 A', kind: 'text' as const, body: '본문', table: null, source: '자작' as const }
    const legacyLesson = {
      no: 1,
      standards: ['[9수04-02]'],
      key_question: '자료를 어떻게 정리할까?',
      goal: '도수분포표로 정리할 수 있다.',
      flow: { intro: '도입', main: '전개', wrapup: '정리' },
      materials: ['A'],
      quiz: [],
      assessment: '논술형' as const,
      mergeable_with: null,
    }
    const theme = { ...baseTheme, materials: [legacyMaterial] as never }
    const itemSet = { ...baseItemSet, materials: null, lessons: [legacyLesson, legacyLesson, legacyLesson, legacyLesson] as never }
    const snap = buildSnapshot({ theme, itemSet, standards: [], version: 1 })
    expect(snap.materials[0].images).toEqual([])
    expect(snap.lessons.every((l) => Array.isArray(l.images))).toBe(true)
  })

  it('works when theme materials are missing (null) — only set materials appear', () => {
    const itemSet = { ...baseItemSet, materials: [material('A', '세트 자료 A')] }
    const snap = buildSnapshot({ theme: { ...baseTheme, materials: null }, itemSet, standards: [], version: 1 })
    expect(snap.materials).toEqual([material('A', '세트 자료 A')])
  })

  it('works when both theme and set materials are missing', () => {
    const snap = buildSnapshot({ theme: { ...baseTheme, materials: null }, itemSet: { ...baseItemSet, materials: null }, standards: [], version: 1 })
    expect(snap.materials).toEqual([])
  })

  it('collects unique model names from stage_status into generated_with.models', () => {
    const itemSet = {
      ...baseItemSet,
      stage_status: {
        stage2: accepted('claude-a'),
        stage3: accepted('claude-a'),
        stage4: accepted('claude-b'),
        stage5: { state: 'failed', attempt: 1, updated_at: '' } as StageStatus,
      } as Record<string, StageStatus | undefined>,
    }
    const snap = buildSnapshot({ theme: baseTheme, itemSet, standards: [], version: 1 })
    expect(snap.generated_with.models.sort()).toEqual(['claude-a', 'claude-b'])
  })
})

describe('학년 선택(대표 2026-09-26): 스냅샷 cover.grade', () => {
  it('a theme without a grade publishes cover.grade = null and it round-trips through upgradeSnapshot', () => {
    const snap = buildSnapshot({ theme: { ...baseTheme, grade: null }, itemSet: { ...baseItemSet, grade: null }, standards: [{ code: '[9수04-02]', text: '원문' }], version: 1 })
    expect(snap.cover.grade).toBeNull()
    const back = upgradeSnapshot(JSON.parse(JSON.stringify(snap)))
    expect(back.cover.grade).toBeNull()
    expect(back.cover).toEqual(snap.cover)
  })
  it('an old published snapshot with grade 1 keeps its number (v2 and v1 shapes)', () => {
    const v2 = buildSnapshot({ theme: { ...baseTheme, grade: 1 }, itemSet: { ...baseItemSet, grade: 1 }, standards: [], version: 3 })
    expect(upgradeSnapshot(JSON.parse(JSON.stringify(v2))).cover.grade).toBe(1)
    const v1raw = { cover: { title: 'v1 판', subject: '수학', level: '중', grade: 1, version: 1, published_at: '2026-09-20T00:00:00.000Z' }, standards: [], intro: '', reconstruction: '', learning_goals: [], key_question: '', lessons: [], materials: [], assessment: null, teacher_guide: null, generated_with: { models: [] } }
    expect(upgradeSnapshot(v1raw).cover).toEqual(v1raw.cover)
  })
})

// 대표 2026-09-26: 세트는 문항·차시가 실제로 쓰는 자료만 싣는다(실제 서논술 문항은 자료 2~4개). 영어 세트가 대주제 공유 A~D(수학 표)까지 싣던 문제.
describe('buildSnapshot: 참조하는 자료만 싣는다(materials_omitted)', () => {
  const theme = { ...baseTheme, materials: ['A', 'B', 'C', 'D'].map((id) => material(id, `공유 자료 ${id}`)) }
  const setMaterials = ['E', 'F', 'G', 'H', 'I'].map((id) => material(id, `세트 자료 ${id}`))
  const items = [{ materials_used: ['B', 'E'], references: [] }, { materials_used: ['E', 'F'], references: [] }]
  const assessment = { items, grade_boundaries: [], feedback_templates: { 상: '', 중: '', 하: '' } } as never

  it('shared A–D + set E–I, items use B·E·F → snapshot keeps B·E·F and lists the rest in materials_omitted', () => {
    const snap = buildSnapshot({ theme, itemSet: { ...baseItemSet, materials: setMaterials, assessment }, standards: [], version: 1 })
    expect(snap.materials.map((m) => m.id)).toEqual(['B', 'E', 'F'])
    expect(snap.materials_omitted).toEqual(['A', 'C', 'D', 'G', 'H', 'I'])
  })

  it('never drops a material a lesson uses (materials_used) or mentions in its worksheet text', () => {
    const lessons = [
      { no: 1, materials_used: ['G'], worksheet: { tasks: [{ prompt: '자료 C와 D를 비교해 보자.' }], self_check: [] } },
    ] as never
    const snap = buildSnapshot({ theme, itemSet: { ...baseItemSet, materials: setMaterials, assessment, lessons }, standards: [], version: 1 })
    expect(snap.materials.map((m) => m.id)).toEqual(['B', 'C', 'D', 'E', 'F', 'G'])
    expect(snap.materials_omitted).toEqual(['A', 'H', 'I'])
  })

  it('keeps every material when nothing references any yet (early draft preview)', () => {
    const snap = buildSnapshot({ theme, itemSet: { ...baseItemSet, materials: setMaterials }, standards: [], version: 1 })
    expect(snap.materials).toHaveLength(9)
    expect(snap.materials_omitted).toEqual([])
  })
})
