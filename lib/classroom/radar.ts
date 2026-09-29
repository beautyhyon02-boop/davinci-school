/**
 * 육각형(레이더) 도형 계산 — 순수 함수. 첫 축이 12시 방향, 시계 방향으로 돈다(SVG 좌표: y 는 아래로 자란다).
 * 축 수는 배열 길이로 정한다(단원 리포트는 6).
 */
export type RadarPoint = { x: number; y: number }

const round = (v: number) => Math.round(v * 100) / 100

/** i 번째 축의 각도(라디안). 0번 = 위(-90°). */
export function radarAngle(index: number, count: number): number {
  return -Math.PI / 2 + (2 * Math.PI * index) / count
}

/** i 번째 축 위에서 중심으로부터 distance 만큼 떨어진 점. */
export function radarVertex(index: number, count: number, distance: number, cx: number, cy: number): RadarPoint {
  const a = radarAngle(index, count)
  return { x: round(cx + distance * Math.cos(a)), y: round(cy + distance * Math.sin(a)) }
}

/**
 * 축마다 비율(0..1)만큼 나간 꼭짓점. 비율이 null(자료 없음)·NaN 이면 중심(0)에 놓는다 — 다각형을 닫기 위한 자리일 뿐이고,
 * 그 축을 0점으로 읽지 않도록 표시하는 일은 그리는 쪽(RadarChart)이 맡는다. 범위를 벗어난 값은 0..1 로 자른다.
 */
export function radarPoints(ratios: (number | null)[], radius: number, cx: number, cy: number): RadarPoint[] {
  return ratios.map((r, i) => {
    const v = typeof r === 'number' && Number.isFinite(r) ? Math.min(1, Math.max(0, r)) : 0
    return radarVertex(i, ratios.length, radius * v, cx, cy)
  })
}

/** SVG polygon 의 points 속성 문자열. */
export function pointsAttr(points: RadarPoint[]): string {
  return points.map((p) => `${p.x},${p.y}`).join(' ')
}
