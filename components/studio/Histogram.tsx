import { histogramBins, type HistogramBin } from '@/lib/studio/charts'
import { app } from '@/content/site'

const copy = app.studio.charts

const WIDTH = 600
const HEIGHT = 320
const MARGIN = { top: 36, right: 20, bottom: 56, left: 50 }
const INNER_WIDTH = WIDTH - MARGIN.left - MARGIN.right
const INNER_HEIGHT = HEIGHT - MARGIN.top - MARGIN.bottom

const BAR_FILL = '#2bb08a' // mint-500 (app/globals.css)
const AXIS_COLOR = '#1f2430' // ink-900 (app/globals.css)
const GRID_COLOR = '#cfd4dd' // ink-300 (app/globals.css)

const LINE_COLOR = '#1f2430' // 도수분포다각형 — 흑백 인쇄에서도 보이게 진한 선

/**
 * 히스토그램. values + binSize(원자료를 세어 그림) 또는 bins(이미 센 도수분포표 — 읽기용 완성 그래프)를 받는다.
 * polygon 이면 직사각형 윗변의 중점을 이은 도수분포다각형을 함께 그린다(양 끝에 도수 0인 계급을 하나씩 둔다).
 */
export function Histogram({
  values,
  binSize,
  bins: given,
  polygon = false,
  title,
}: {
  values?: number[]
  binSize?: number
  bins?: HistogramBin[]
  polygon?: boolean
  title: string
}) {
  const counted = given ?? histogramBins(values ?? [], binSize ?? 10)
  if (counted.length === 0) return null
  const size = counted[0].to - counted[0].from
  // 도수분포다각형은 양 끝의 도수 0인 계급까지 이어야 닫힌다 — 그릴 자리를 한 칸씩 더 둔다
  const bins: HistogramBin[] = polygon
    ? [{ from: counted[0].from - size, to: counted[0].from, count: 0 }, ...counted, { from: counted[counted.length - 1].to, to: counted[counted.length - 1].to + size, count: 0 }]
    : counted

  const maxCount = Math.max(...bins.map((b) => b.count), 1)
  const tickStep = Math.max(1, Math.ceil(maxCount / 5))
  const yMax = Math.ceil(maxCount / tickStep) * tickStep
  const yTicks = Array.from({ length: yMax / tickStep + 1 }, (_, i) => i * tickStep)

  const barWidth = INNER_WIDTH / bins.length
  const boundaries = [...bins.map((b) => b.from), bins[bins.length - 1].to]

  const xAt = (i: number) => MARGIN.left + i * barWidth
  const yAt = (count: number) => MARGIN.top + INNER_HEIGHT - (count / yMax) * INNER_HEIGHT

  // 폭은 컨테이너에 맞추고 높이는 viewBox 비율대로 따라오게 한다 — 고정 600×320이면 휴대폰에서 넘친다.
  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      width="100%"
      className="h-auto w-full"
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
              {tick}
            </text>
          </g>
        )
      })}

      {/* 막대 (붙여서 표시) */}
      {bins.map((bin, i) => {
        const x = xAt(i)
        const y = yAt(bin.count)
        const h = MARGIN.top + INNER_HEIGHT - y
        return (
          <g key={`${bin.from}-${bin.to}`}>
            <rect
              x={x}
              y={y}
              width={Math.max(barWidth - 1, 0)}
              height={h}
              fill={BAR_FILL}
              stroke="#ffffff"
              strokeWidth={1}
            />
            {bin.count > 0 && (
              <text
                x={x + barWidth / 2}
                y={y - 6}
                textAnchor="middle"
                fontSize={11}
                fill={AXIS_COLOR}
              >
                {bin.count}
              </text>
            )}
          </g>
        )
      })}

      {/* 도수분포다각형: 윗변의 중점을 잇는다(양 끝은 도수 0) */}
      {polygon && (
        <g data-chart-polygon>
          <polyline
            points={bins.map((bin, i) => `${xAt(i) + barWidth / 2},${yAt(bin.count)}`).join(' ')}
            fill="none"
            stroke={LINE_COLOR}
            strokeWidth={2}
          />
          {bins.map((bin, i) => (
            <circle key={`p-${bin.from}`} cx={xAt(i) + barWidth / 2} cy={yAt(bin.count)} r={3} fill={LINE_COLOR} />
          ))}
        </g>
      )}

      {/* x축 눈금 라벨 (계급 경계) */}
      {boundaries.map((b, i) => (
        <text
          key={b}
          x={xAt(i)}
          y={MARGIN.top + INNER_HEIGHT + 16}
          textAnchor="middle"
          fontSize={11}
          fill={AXIS_COLOR}
        >
          {b}
        </text>
      ))}

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

      {/* 축 제목 */}
      <text
        x={MARGIN.left + INNER_WIDTH / 2}
        y={HEIGHT - 8}
        textAnchor="middle"
        fontSize={12}
        fill={AXIS_COLOR}
      >
        {copy.value}
      </text>
      <text
        x={14}
        y={MARGIN.top + INNER_HEIGHT / 2}
        textAnchor="middle"
        fontSize={12}
        fill={AXIS_COLOR}
        transform={`rotate(-90 14 ${MARGIN.top + INNER_HEIGHT / 2})`}
      >
        {copy.count}
      </text>

      {/* 차트 제목 */}
      <text x={MARGIN.left} y={18} fontSize={13} fontWeight={700} fill={AXIS_COLOR}>
        {title}
      </text>
    </svg>
  )
}
