// 세트별 공동 자료 선택(대표 결정 2026-09-28, 마이그레이션 0013 item_sets.shared_material_ids).
// 대주제 공동(공유) 자료 A~D 는 이제 세트마다 골라 쓴다 — 기본값은 아무것도 쓰지 않음([]). 체크하지 않은 공동 자료는
// 그 세트의 AI 입력(loadContext 의 prior.shared_materials), 자동 검사(sharedMaterialIds), 제작소 4·5단계 탭, 게시 판(buildSnapshot)
// 어디에도 들어가지 않는다. 이 파일은 순수 함수만 둔다 — 서버 동작(setSharedMaterialIds·createItemSet)과 화면이 같이 쓴다.

/** 자료 ID 모양: 대문자 한 글자(A~Z). 대주제 공동 자료·세트 자료 모두 같은 글자 공간을 쓴다. */
const MATERIAL_ID = /^[A-Z]$/

/**
 * 저장된 선택(jsonb)을 읽는다. 배열이 아니면(열이 없던 옛 행, null) 빈 선택 — 옛 세트는 공동 자료를 쓰지 않는다.
 * 대문자 한 글자 문자열만 남기고 중복을 없애 오름차순으로 돌려준다.
 */
export function parseSharedMaterialIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return [...new Set(raw.filter((id): id is string => typeof id === 'string' && MATERIAL_ID.test(id)))].sort()
}

/**
 * 관리자가 보낸 선택을 대주제 공동 자료 ID 와 맞춰 본다. 문자열 배열이어야 하고, 모든 ID 가 대주제 자료에 있어야 한다
 * (없는 ID 는 invalid 로 돌려주고 아무것도 저장하지 않는다). 통과하면 중복을 없앤 오름차순 ID.
 */
export function validateSharedMaterialIds(ids: unknown, themeMaterialIds: readonly string[]): { ok: true; ids: string[] } | { ok: false; invalid: string[] } {
  if (!Array.isArray(ids) || ids.some((id) => typeof id !== 'string')) return { ok: false, invalid: [] }
  const known = new Set(themeMaterialIds)
  const invalid = [...new Set((ids as string[]).filter((id) => !known.has(id)))]
  if (invalid.length > 0) return { ok: false, invalid }
  return { ok: true, ids: [...new Set(ids as string[])].sort() }
}

/** 대주제 공동 자료 중 이 세트가 고른 것만(대주제 자료 순서 그대로). 선택이 비었거나 대주제 자료가 없으면 빈 배열. */
export function selectSharedMaterials<M extends { id: string }>(themeMaterials: readonly M[] | null | undefined, selected: unknown): M[] {
  const ids = new Set(parseSharedMaterialIds(selected))
  if (ids.size === 0 || !Array.isArray(themeMaterials)) return []
  return themeMaterials.filter((m) => ids.has(m.id))
}

/**
 * 세트 자료 ID 를 이어 붙일 첫 글자: 대주제 공동 자료 **전체**(고르지 않은 것 포함) 중 가장 뒤 글자의 다음 글자.
 * 고른 것 뒤가 아니라 전체 뒤에서 잇는 까닭 — 세트가 [B, D] 만 골랐어도 나중에 A·C 를 체크할 수 있으므로 세트 자료가
 * 그 글자를 먼저 차지하면 ID 가 겹친다(겹치면 게시 판에서 공동 자료가 이기고 세트 자료가 빠진다). Z 까지 찼으면 null.
 */
export function nextSetMaterialLetter(themeMaterialIds: readonly string[]): string | null {
  const ids = themeMaterialIds.filter((id) => MATERIAL_ID.test(id)).sort()
  if (ids.length === 0) return 'A'
  const last = ids[ids.length - 1]
  return last < 'Z' ? String.fromCharCode(last.charCodeAt(0) + 1) : null
}

/**
 * 선택을 바꿀 때 "뒤 단계를 다시 만들어야 할 수 있음" 안내를 띄울지 — 3단계(차시 설계) 이후가 하나라도 만들어져 있으면 참.
 * 안내일 뿐 저장을 막지 않는다(대표 결정 2026-09-26: 확인만 누르면 진행). 3단계부터 차시 materials_used 가 자료 ID 를 적는다.
 */
export function selectionChangeNeedsNotice(stageStatus: Record<string, { state?: string } | undefined> | null | undefined): boolean {
  for (let s = 3; s <= 7; s++) {
    const st = stageStatus?.[`stage${s}`]?.state
    if (st && st !== 'idle') return true
  }
  return false
}
