import { radarPoints, radarVertex, pointsAttr } from '@/lib/classroom/radar'

// 단원 리포트의 육각형(설계 §5.4) — 손으로 쓴 SVG, 차트 라이브러리 없음. 훅이 없어 서버에서 그대로 그려진다.
// 문구(축 이름·"문항 수 적음"·aria-label)는 모두 props 로 받는다.

const WIDTH = 500
const HEIGHT = 340
const CX = WIDTH / 2
const CY = HEIGHT / 2
const RADIUS = 110
// 축 이름은 꼭짓점 바깥에 쓴다. 옆 꼭짓점은 글자가 바깥쪽으로 자라므로(text-anchor start/end) 좌우 여백을 넉넉히 둔다:
// 옆 꼭짓점 x = 중심 ± 95, 이름 시작 = ± 109, 한글 10자(12px) ≈ 125px → ± 234 < 250.
const LABEL_GAP = 14
const LINE = 14

const FILL = '#f59e0b' // orange(amber-500) — 반투명으로 칠한다
const STROKE = '#c2410c' // orange-700 — 흑백 인쇄에서도 테두리가 진하게 남는다
const AXIS_COLOR = '#1f2430' // ink-900 (app/globals.css)
const MUTED_COLOR = '#6b7280' // 문항 수가 적은 축·자료 없는 축의 글자
const GRID_COLOR = '#cfd4dd' // ink-300 (app/globals.css)
const GRID_STEPS = [0.25, 0.5, 0.75, 1]
const NO_DATA = '–'

export type RadarChartAxis = { label: string; ratio: number | null; sparse: boolean }

export function RadarChart({
  axes,
  sparseNote,
  ariaLabel,
  size,
}: {
  /** 정확히 6개(COMPETENCIES 순서). 첫 축이 12시 방향, 시계 방향. */
  axes: RadarChartAxis[]
  /** 문항 수가 적은 축 이름 아래에 붙는 말. */
  sparseNote: string
  ariaLabel: string
  /** 최대 폭(px). 없으면 컨테이너 폭에 맞춘다. 높이는 viewBox 비율을 따른다. */
  size?: number
}) {
  const n = axes.length
  if (n === 0) return null

  // 자료 없는 축(ratio null): 다각형은 닫혀야 하므로 그 축의 꼭짓점을 중심(0)에 두고 양옆 축의 값과 잇는다.
  // 다만 0점으로 읽히지 않도록 그 축에는 꼭짓점 표시를 그리지 않고, 이름 아래 백분율 자리에 "–" 를 흐리게 쓴다.
  const points = radarPoints(axes.map((a) => a.ratio), RADIUS, CX, CY)
  const hasData = axes.some((a) => a.ratio !== null)

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      width="100%"
      className="h-auto w-full"
      style={size ? { maxWidth: size } : undefined}
      role="img"
      aria-label={ariaLabel}
      xmlns="http://www.w3.org/2000/svg"
    >
      <title>{ariaLabel}</title>

      {/* 눈금 육각형 25·50·75·100% */}
      {GRID_STEPS.map((step) => (
        <polygon
          key={step}
          data-grid={step}
          points={pointsAttr(axes.map((_, i) => radarVertex(i, n, RADIUS * step, CX, CY)))}
          fill="none"
          stroke={step === 1 ? AXIS_COLOR : GRID_COLOR}
          strokeWidth={1}
        />
      ))}

      {/* 축 선 */}
      {axes.map((_, i) => {
        const end = radarVertex(i, n, RADIUS, CX, CY)
        return <line key={i} x1={CX} y1={CY} x2={end.x} y2={end.y} stroke={GRID_COLOR} strokeWidth={1} />
      })}

      {/* 학생 값 */}
      {hasData && (
        <polygon
          data-series="value"
          points={pointsAttr(points)}
          fill={FILL}
          fillOpacity={0.35}
          stroke={STROKE}
          strokeWidth={2.5}
          strokeLinejoin="round"
        />
      )}

      {/* 꼭짓점 표시: 보통은 채운 점, 문항 수가 적은 축은 속이 빈 점선 원, 자료 없는 축은 없음 */}
      {axes.map((a, i) => {
        if (a.ratio === null) return null
        const p = points[i]
        return a.sparse ? (
          <circle key={i} data-marker="sparse" cx={p.x} cy={p.y} r={5} fill="#ffffff" stroke={STROKE} strokeWidth={1.5} strokeDasharray="2 2" />
        ) : (
          <circle key={i} data-marker="solid" cx={p.x} cy={p.y} r={4} fill={STROKE} />
        )
      })}

      {/* 축 이름 + 백분율(+ 문항 수 적음) */}
      {axes.map((a, i) => {
        const at = radarVertex(i, n, RADIUS + LABEL_GAP, CX, CY)
        const dx = at.x - CX
        const dy = at.y - CY
        const anchor = Math.abs(dx) < 1 ? 'middle' : dx > 0 ? 'start' : 'end'
        const faded = a.ratio === null || a.sparse
        const lines = [a.label, a.ratio === null ? NO_DATA : `${Math.round(a.ratio * 100)}%`]
        if (a.ratio !== null && a.sparse) lines.push(sparseNote)
        // 위쪽 꼭짓점은 글줄이 위로 쌓이고, 아래쪽은 아래로, 옆은 꼭짓점 높이를 가운데로
        const top = Math.abs(dx) < 1
          ? dy < 0 ? at.y - (lines.length - 1) * LINE - 2 : at.y + LINE - 2
          : at.y - ((lines.length - 1) * LINE) / 2 + 4
        return (
          <text key={i} data-axis={i} x={at.x} y={top} textAnchor={anchor} fill={faded ? MUTED_COLOR : AXIS_COLOR}>
            <tspan x={at.x} fontSize={12} fontWeight={faded ? 400 : 700}>{lines[0]}</tspan>
            <tspan x={at.x} dy={LINE} fontSize={11}>{lines[1]}</tspan>
            {lines[2] ? <tspan x={at.x} dy={LINE} fontSize={10}>{lines[2]}</tspan> : null}
          </text>
        )
      })}
    </svg>
  )
}
