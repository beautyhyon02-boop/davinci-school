import { isSido, type Sido } from './sido'

/** 공개 지도에 나가는 가맹원 한 줄 — 이름·시도·홈페이지뿐(설계 2026-10-25 §2.2). */
export type MapAcademy = { name: string; sido: Sido; website: string }
export type SidoGroup = { count: number; items: MapAcademy[] }
export type MapGroups = { total: number; bySido: Partial<Record<Sido, SidoGroup>> }

/** 시·도별로 묶고 이름 순으로. 시·도가 17개 밖이면 버린다(지도에 자리가 없다). */
export function groupBySido(rows: MapAcademy[]): MapGroups {
  const bySido: Partial<Record<Sido, SidoGroup>> = {}
  let total = 0
  for (const r of rows) {
    if (!isSido(r.sido)) continue
    const g = (bySido[r.sido] ??= { count: 0, items: [] })
    g.items.push(r); g.count += 1; total += 1
  }
  for (const g of Object.values(bySido)) g!.items.sort((a, b) => a.name.localeCompare(b.name, 'ko'))
  return { total, bySido }
}
