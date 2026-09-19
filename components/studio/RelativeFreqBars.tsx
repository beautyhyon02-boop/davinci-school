import { relativeFrequencies } from '@/lib/studio/charts'
import { app } from '@/content/site'

const copy = app.studio.charts

const WIDTH = 600
const HEIGHT = 320
const MARGIN = { top: 44, right: 20, bottom: 56, left: 50 }
const INNER_WIDTH = WIDTH - MARGIN.left - MARGIN.right
const INNER_HEIGHT = HEIGHT - MARGIN.top - MARGIN.bottom

const AXIS_COLOR = '#1f2430' // ink-900 (app/globals.css)
const GRID_COLOR = '#cfd4dd' // ink-300 (app/globals.css)

// app/globals.css의 mint/lemon/lavender 계열 (열이 늘어나면 순서대로 순환)
const PALETTE = [
  '#2bb08a', // mint-500
  '#e6b800', // lemon-500
  '#8268cf', // lavender-500
  '#1f8f70', // mint-600
  '#b38f00', // lemon-600
  '#6a50b5', // lavender-600
]

export function RelativeFreqBars({
  rows,
  columns,
  title,
}: {
  rows: { label: string; counts: number[] }[]
  columns: string[]
  title: string
}) {
  const { rows: relRows } = relativeFrequencies(rows)
  if (relRows.length === 0) return null

  const maxRel = Math.max(...relRows.flatMap((r) => r.rel), 0.0001)
  const yMax = Math.min(1, Math.ceil((maxRel + 0.03) * 10) / 10)
  const tickCount = Math.round(yMax * 10)
  const yTicks = Array.from({ length: tickCount + 1 }, (_, i) => i / 10)

  const groupCount = relRows.length
  const seriesCount = columns.length
  const groupWidth = INNER_WIDTH / groupCount
  const groupPadding = groupWidth * 0.12
  const barWidth = (groupWidth - groupPadding * 2) / seriesCount

  const yAt = (rel: number) => MARGIN.top + INNER_HEIGHT - (rel / yMax) * INNER_HEIGHT

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      width={WIDTH}
      height={HEIGHT}
      role="img"
      xmlns="http://www.w3.org/2000/svg"
    >
      <title>{title}</title>

      {/* y축 눈금선 + 라벨 */}
      {yTicks.map((tick) => {
        const y = yAt(tick)
        return (
          <g key={tick}>
            <line
              x1={MARGIN.left}
              x2={MARGIN.left + INNER_WIDTH}
              y1={y}
              y2={y}
              stroke={GRID_COLOR}
              strokeWidth={1}
            />
            <text x={MARGIN.left - 8} y={y + 4} textAnchor="end" fontSize={11} fill={AXIS_COLOR}>
              {tick.toFixed(1)}
            </text>
          </g>
        )
      })}

      {/* 그룹별 막대 */}
      {relRows.map((row, gi) => {
        const groupX = MARGIN.left + gi * groupWidth + groupPadding
        return (
          <g key={row.label}>
            {row.rel.map((rel, si) => {
              const x = groupX + si * barWidth
              const y = yAt(rel)
              const h = MARGIN.top + INNER_HEIGHT - y
              return (
                <g key={si}>
                  <rect
                    x={x}
                    y={y}
                    width={Math.max(barWidth - 2, 0)}
                    height={h}
                    fill={PALETTE[si % PALETTE.length]}
                  />
                  <text
                    x={x + barWidth / 2}
                    y={y - 4}
                    textAnchor="middle"
                    fontSize={10}
                    fill={AXIS_COLOR}
                  >
                    {rel.toFixed(2)}
                  </text>
                </g>
              )
            })}
            <text
              x={MARGIN.left + gi * groupWidth + groupWidth / 2}
              y={MARGIN.top + INNER_HEIGHT + 16}
              textAnchor="middle"
              fontSize={11}
              fill={AXIS_COLOR}
            >
              {row.label}
            </text>
          </g>
        )
      })}

      {/* 축 */}
      <line
        x1={MARGIN.left}
        x2={MARGIN.left + INNER_WIDTH}
        y1={MARGIN.top + INNER_HEIGHT}
        y2={MARGIN.top + INNER_HEIGHT}
        stroke={AXIS_COLOR}
        strokeWidth={1}
      />
      <line
        x1={MARGIN.left}
        x2={MARGIN.left}
        y1={MARGIN.top}
        y2={MARGIN.top + INNER_HEIGHT}
        stroke={AXIS_COLOR}
        strokeWidth={1}
      />

      {/* y축 제목 */}
      <text
        x={14}
        y={MARGIN.top + INNER_HEIGHT / 2}
        textAnchor="middle"
        fontSize={12}
        fill={AXIS_COLOR}
        transform={`rotate(-90 14 ${MARGIN.top + INNER_HEIGHT / 2})`}
      >
        {copy.relative}
      </text>

      {/* 차트 제목 */}
      <text x={MARGIN.left} y={16} fontSize={13} fontWeight={700} fill={AXIS_COLOR}>
        {title}
      </text>

      {/* 범례: 열이 여러 개면 세로로 나열해 겹치지 않게 한다 */}
      {columns.map((col, i) => {
        const legendX = WIDTH - MARGIN.right - 160
        const legendY = 16
        return (
          <g key={col} transform={`translate(0, ${i * 14})`}>
            <rect x={legendX} y={legendY - 9} width={10} height={10} fill={PALETTE[i % PALETTE.length]} />
            <text x={legendX + 14} y={legendY} fontSize={10} fill={AXIS_COLOR}>
              {col}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
