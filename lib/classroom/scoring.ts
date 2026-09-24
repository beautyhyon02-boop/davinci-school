export type Boundary = { grade: number; min: number; max: number; band: '상' | '중' | '하' }

export function gradeFor(boundaries: Boundary[], total: number): { grade: number; band: Boundary['band'] } | null {
  const b = boundaries.find((x) => total >= x.min && total <= x.max)
  return b ? { grade: b.grade, band: b.band } : null
}

/** 확정 점수의 합. 아직 확정되지 않은 문항(null)이 있으면 complete=false — 지금 구조는 서술형 6 + 논술형 16 = 22, 옛 판은 3 + 3 + 16 = 22(문항 수와 무관하게 같은 계산). */
export function overallFor(items: { points: number }[], finalScores: (number | null)[]) {
  const max = items.reduce((s, i) => s + i.points, 0)
  const total = finalScores.reduce<number>((s, x) => s + (x ?? 0), 0)
  return { total, max, complete: finalScores.length === items.length && finalScores.every((x) => x !== null) }
}
