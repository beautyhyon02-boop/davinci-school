// 세트별 공동 자료 선택(대표 결정 2026-09-28, 마이그레이션 0013 item_sets.shared_material_ids)의 순수 함수.
import { describe, it, expect } from 'vitest'
import { parseSharedMaterialIds, validateSharedMaterialIds, selectSharedMaterials, nextSetMaterialLetter, selectionChangeNeedsNotice } from '@/lib/studio/shared-selection'
import { toggleSharedId } from '@/app/admin/items/[themeId]/SharedMaterialCheckboxes'

const theme = ['A', 'B', 'C', 'D'].map((id) => ({ id, title: `공동 ${id}` }))

describe('parseSharedMaterialIds (저장된 jsonb 읽기)', () => {
  it('keeps unique single capital letters, sorted', () => {
    expect(parseSharedMaterialIds(['D', 'B', 'D'])).toEqual(['B', 'D'])
  })
  it('legacy / junk → empty selection (옛 세트는 공동 자료를 쓰지 않는다)', () => {
    for (const raw of [undefined, null, 'B', {}, 3]) expect(parseSharedMaterialIds(raw)).toEqual([])
    expect(parseSharedMaterialIds([1, 'b', 'BB', null, 'C'])).toEqual(['C'])
  })
})

describe('validateSharedMaterialIds (서버 동작의 입력 검사)', () => {
  it('accepts IDs the theme has, deduped and sorted; empty is valid (기본 = 아무것도 안 씀)', () => {
    expect(validateSharedMaterialIds(['D', 'B', 'B'], ['A', 'B', 'C', 'D'])).toEqual({ ok: true, ids: ['B', 'D'] })
    expect(validateSharedMaterialIds([], ['A', 'B'])).toEqual({ ok: true, ids: [] })
    expect(validateSharedMaterialIds([], [])).toEqual({ ok: true, ids: [] })
  })
  it('rejects IDs the theme does not have and names them', () => {
    expect(validateSharedMaterialIds(['B', 'Q', 'Q'], ['A', 'B'])).toEqual({ ok: false, invalid: ['Q'] })
    expect(validateSharedMaterialIds(['A'], [])).toEqual({ ok: false, invalid: ['A'] })
  })
  it('rejects a non-array or non-string entries', () => {
    expect(validateSharedMaterialIds('B', ['B'])).toEqual({ ok: false, invalid: [] })
    expect(validateSharedMaterialIds([1], ['B'])).toEqual({ ok: false, invalid: [] })
  })
})

describe('selectSharedMaterials', () => {
  it('returns only the selected theme materials, in theme order', () => {
    expect(selectSharedMaterials(theme, ['D', 'B']).map((m) => m.id)).toEqual(['B', 'D'])
  })
  it('empty / legacy selection or no theme materials → []', () => {
    expect(selectSharedMaterials(theme, [])).toEqual([])
    expect(selectSharedMaterials(theme, null)).toEqual([])
    expect(selectSharedMaterials(null, ['A'])).toEqual([])
  })
  it('ignores a selected ID the theme no longer has', () => {
    expect(selectSharedMaterials(theme, ['B', 'Q']).map((m) => m.id)).toEqual(['B'])
  })
})

describe('nextSetMaterialLetter (세트 자료 ID는 대주제 공동 자료 전체 뒤에서 잇는다)', () => {
  it('continues after the highest theme letter, not after the selected ones', () => {
    expect(nextSetMaterialLetter(['A', 'B', 'C', 'D'])).toBe('E')
    expect(nextSetMaterialLetter(['D', 'B'])).toBe('E')
  })
  it('no theme materials → A; Z already used → null', () => {
    expect(nextSetMaterialLetter([])).toBe('A')
    expect(nextSetMaterialLetter(['Z'])).toBeNull()
  })
})

describe('selectionChangeNeedsNotice (3단계 이후가 있으면 안내만, 막지 않음)', () => {
  it('true when any of stage 3~7 exists (not idle)', () => {
    expect(selectionChangeNeedsNotice({ stage3: { state: 'generated' } })).toBe(true)
    expect(selectionChangeNeedsNotice({ stage2: { state: 'accepted' }, stage5: { state: 'failed' } })).toBe(true)
  })
  it('false before stage 3 or when later stages are idle', () => {
    expect(selectionChangeNeedsNotice({ stage2: { state: 'accepted' } })).toBe(false)
    expect(selectionChangeNeedsNotice({ stage3: { state: 'idle' } })).toBe(false)
    expect(selectionChangeNeedsNotice(null)).toBe(false)
  })
})

describe('toggleSharedId (체크 목록)', () => {
  it('adds or removes an ID and keeps the list sorted', () => {
    expect(toggleSharedId(['D'], 'B')).toEqual(['B', 'D'])
    expect(toggleSharedId(['B', 'D'], 'B')).toEqual(['D'])
  })
})
