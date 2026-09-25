// 마법사(StageWizard)가 StageOutput에 넘기는 3단계 출력 — 오너 규칙 2026-09-26 보완: 단원 평가 차시의 materials_used는
// 5단계 문항과 항상 같아야 한다. 저장소(repo.ts saveOutput·saveStageEdit)가 저장된 3단계 lessons 열을 이미 고치지만,
// 화면이 [확인] 직후 setStageStatus만으로 넘어가 다시 읽어 오기 전에는 예전 값(예: 무관한 공유 자료 A~D)을 들고 있을
// 수 있다 — stageOutputsFor가 StageOutput에 넘길 값만 순수하게 맞춘다(상태 자체는 손대지 않는다).
// StageWizard.tsx는 서버 액션 모듈(./actions)을 가져오므로(supabase 서버 클라이언트를 부른다) 테스트에서는 가짜로 바꾼다
// (field-editor.test.ts와 같은 방식).
import { describe, it, expect, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('@/app/admin/items/[themeId]/sets/[setId]/actions', () => ({
  chooseKeyQuestion: vi.fn(), saveStageEdit: vi.fn(), attachImage: vi.fn(), detachImage: vi.fn(),
}))
const { stageOutputsFor } = await import('@/app/admin/items/[themeId]/sets/[setId]/StageWizard')
const { StageOutput } = await import('@/app/admin/items/[themeId]/sets/[setId]/StageOutput')
const { lessonV2, assessmentSession } = await import('./studio-schemas.test')

import type { StageStatus } from '@/lib/studio/stages'
import type { WizardStage } from '@/lib/studio/wizard-stages'

const accepted = (output: unknown): StageStatus => ({ state: 'accepted', attempt: 1, output, updated_at: '2026-01-01T00:00:00.000Z' })

const unitPlan = { set_title: 't', set_key_question: 'q?', lesson_map: [], assessment_plan: { formative: 'f', summative_placement: [{ lesson_no: 2, kind: '서술형' }, { lesson_no: 2, kind: '논술형' }], rubric_note: { 상: 'a', 중: 'b', 하: 'c' } } }
// 3단계 초안: 단원 평가 차시가 대주제 공유 자료 A·B·D(이 과목과 무관)를 그대로 들고 있다(영어 세트에서 관찰된 문제).
const staleLessons = [{ ...lessonV2, no: 1 }, { ...assessmentSession(2), materials_used: ['A', 'B', 'D'] }]
const stage3Output = { unit_plan: unitPlan, lessons: staleLessons }
// 5단계 문항은 실제로는 F·H·I만 쓴다.
const stage5Output = { items: [{ kind: '서술형', points: 6, materials_used: ['F'] }, { kind: '논술형', points: 16, materials_used: ['H', 'I'] }] }

describe('stageOutputsFor (StageWizard → StageOutput)', () => {
  it('syncs the 단원 평가 차시 materials_used to the stage-5 items when both stages are accepted', () => {
    const outputs = stageOutputsFor({ 3: accepted(stage3Output), 5: accepted(stage5Output) })
    const synced = outputs[3] as typeof stage3Output
    expect(synced.lessons.find((l) => l.no === 2)!.materials_used).toEqual(['F', 'H', 'I'])
    // 교수 차시는 손대지 않는다
    expect(synced.lessons.find((l) => l.no === 1)!.materials_used).toEqual(['A'])
    // 원본 상태(effective)는 그대로 — 순수 함수라 stage3Output 자체를 고치지 않는다
    expect(stage3Output.lessons.find((l) => l.no === 2)!.materials_used).toEqual(['A', 'B', 'D'])
  })

  it('leaves outputs untouched (same reference) when stage 5 is not accepted yet', () => {
    const effective = { 3: accepted(stage3Output) }
    const outputs = stageOutputsFor(effective)
    expect(outputs[3]).toBe(stage3Output)
  })

  it('leaves outputs untouched when the union already matches (no unnecessary object churn)', () => {
    const matching = { unit_plan: unitPlan, lessons: [{ ...lessonV2, no: 1 }, { ...assessmentSession(2), materials_used: ['F', 'H', 'I'] }] }
    const outputs = stageOutputsFor({ 3: accepted(matching), 5: accepted(stage5Output) })
    expect(outputs[3]).toBe(matching)
  })

  it('renders through StageOutput with the corrected materials — the 단원 평가 차시 card shows 자료 F·H·I, not the stale A·B·D', () => {
    const outputs = stageOutputsFor({ 3: accepted(stage3Output), 5: accepted(stage5Output) })
    const html = renderToStaticMarkup(createElement(StageOutput, { stage: 3 as WizardStage, outputs, sharedMaterials: [] }))
    expect(html).toContain('자료 F, 자료 H, 자료 I')
    expect(html).not.toContain('자료 A, 자료 B, 자료 D')
  })
})
