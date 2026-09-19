import { describe, it, expect } from 'vitest'
import { canPublish, buildSnapshot } from '@/lib/studio/publish'
import type { StageStatus } from '@/lib/studio/stages'

function accepted(model = 'mock'): StageStatus {
  return { state: 'accepted', attempt: 1, model, updated_at: '2026-01-01T00:00:00.000Z' }
}

const allAccepted: Record<string, StageStatus | undefined> = {
  stage2: accepted('claude-a'),
  stage3: accepted('claude-b'),
  stage4: accepted(),
  stage5: accepted(),
  stage6: accepted(),
}

describe('canPublish', () => {
  it('passes when stages 2-6 are accepted, all standards verified, and a key question is set', () => {
    const r = canPublish({
      statuses: allAccepted,
      standards: [{ code: '[9수04-02]', verified: true }],
      keyQuestion: '왜 재활용이 어려울까?',
    })
    expect(r).toEqual({ ok: true, blockers: [] })
  })

  it('blocks with stageNotAccepted:<n> for each stage 2-6 that is not accepted', () => {
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
      'unverifiedStandard:[9수04-02]',
      'noKeyQuestion',
    ])
  })
})

const baseTheme = { title: '자연보호 프로젝트', level: '중', grade: 2, intro: '학교 축제에서 일회용품을 줄이자.', materials: null as null | { id: string; title: string; kind: 'table' | 'text' | 'chart'; body: string | null; table: null; source: '자작'; images: string[] }[] }

const baseItemSet = {
  subject: '수학' as const,
  level: '중',
  grade: 2,
  version: 1,
  reconstruction: '재구성 문장',
  learning_goals: ['목표1', '목표2', '목표3'],
  key_question: '핵심질문',
  lessons: [],
  materials: null as null | { id: string; title: string; kind: 'table' | 'text' | 'chart'; body: string | null; table: null; source: '자작'; images: string[] }[],
  assessment: null,
  teacher_guide: null,
  stage_status: { stage2: accepted('claude-a'), stage4: accepted('claude-b') } as Record<string, StageStatus | undefined>,
}

function material(id: string, title: string) {
  return { id, title, kind: 'text' as const, body: '본문', table: null, source: '자작' as const, images: [] as string[] }
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
    expect(snap.learning_goals).toEqual(['목표1', '목표2', '목표3'])
    expect(snap.key_question).toBe('핵심질문')
    expect(snap.standards).toEqual([{ code: '[9수04-02]', text: '원문' }])
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
