import { app } from '@/content/site'

// 문항 = 자료 + 문항 한 덩어리(대표 연수 2기 실습-2 p.18~20, 대구시교육청 실제 문항): 전제문 바로 아래에 <자료1>·<자료2> 상자가 있고
// 그 뒤에 발문이 온다. 문항 안 자료 번호는 문항마다 1부터 — materials_used 순서(= 문두가 쓰는 순서, 5단계 과제)를 따른다.
// 세트 자료 ID(자료 B 등)는 상자 라벨 옆 작은 표시로만 남긴다 — 옛 문두("자료 B는 …")도 그대로 읽히게.

export type ItemMaterialLabel = {
  /** 세트 자료 ID(A~Z) */
  id: string
  /** 문항 안 번호(1부터) */
  no: number
  /** "<자료 1>" */
  label: string
  /** "자료 B" — 세트 자료 ID 표시 */
  hint: string
}

/** 문항의 자료 라벨: materials_used 순서대로 <자료 1>, <자료 2> …(같은 ID가 두 번 있으면 처음 것만). 옛 판·손으로 고친 판도 읽는다. */
export function itemMaterialLabels(item: { materials_used?: readonly unknown[] | null }): ItemMaterialLabel[] {
  const ids = Array.isArray(item.materials_used) ? item.materials_used : []
  const seen = new Set<string>()
  const out: ItemMaterialLabel[] = []
  for (const id of ids) {
    if (typeof id !== 'string' || id.trim() === '' || seen.has(id)) continue
    seen.add(id)
    const no = out.length + 1
    out.push({ id, no, label: app.packageView.items.materialLabel(no), hint: app.packageView.items.materialHint(id) })
  }
  return out
}

/** 문항들이 안에 품은 자료 ID 전부 — 따로 선 자료 칸에서 겹치는 것을 빼는 데 쓴다(문제지 인쇄·학생 단원 평가 탭). */
export function embeddedMaterialIds(items: readonly { materials_used?: readonly unknown[] | null }[] | null | undefined): Set<string> {
  const out = new Set<string>()
  for (const it of items ?? []) for (const l of itemMaterialLabels(it)) out.add(l.id)
  return out
}
