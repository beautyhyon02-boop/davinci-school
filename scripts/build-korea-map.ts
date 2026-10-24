/**
 * Natural Earth 1:10m Admin 1 GeoJSON → data/map/korea-sido.json (설계 2026-10-25 §3).
 *   npx tsx scripts/build-korea-map.ts <ne_10m_admin_1_states_provinces.geojson>
 * 대한민국(adm0_a3 KOR) 17개 시·도만 골라 단순 투영(경도·위도 → 픽셀, 위도 36° 기준 가로 축소)으로 SVG 경로를 만든다.
 * 이름 대응이 안 되는 feature 가 있거나 17개가 아니면 멈춘다 — 지어내지 않는다.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { SIDOS, toSido, type Sido } from '../lib/academies/sido'

type Ring = [number, number][]
type Feature = { properties: Record<string, unknown>; geometry: { type: 'Polygon' | 'MultiPolygon'; coordinates: number[][][] | number[][][][] } }

/** Natural Earth 영문 이름(소문자, -do/-si/공백 제거) 앞머리 → 시·도 (name_ko 로 못 찾을 때만 쓰는 보조) */
const NAME_PREFIX: [string, Sido][] = [
  ['seoul', '서울'], ['busan', '부산'], ['daegu', '대구'], ['incheon', '인천'], ['gwangju', '광주'], ['daejeon', '대전'], ['ulsan', '울산'], ['sejong', '세종'],
  ['gyeonggi', '경기'], ['gangwon', '강원'], ['chungcheongbuk', '충북'], ['northchungcheong', '충북'], ['chungcheongnam', '충남'], ['southchungcheong', '충남'],
  ['jeollabuk', '전북'], ['northjeolla', '전북'], ['jeonbuk', '전북'], ['jeollanam', '전남'], ['southjeolla', '전남'], ['jeonnam', '전남'],
  ['gyeongsangbuk', '경북'], ['northgyeongsang', '경북'], ['gyeongbuk', '경북'], ['gyeongsangnam', '경남'], ['southgyeongsang', '경남'], ['gyeongnam', '경남'], ['jeju', '제주'],
]
function sidoOf(p: Record<string, unknown>): Sido | null {
  // 1) 한글 이름(서울특별시·충청북도 …)은 lib/academies/sido.ts 의 toSido 로.
  if (typeof p.name_ko === 'string') {
    const s = toSido(p.name_ko)
    if (s) return s
  }
  // 2) 보조: 영문 이름 앞머리.
  for (const key of ['name', 'name_en', 'gn_name', 'woe_name']) {
    const v = typeof p[key] === 'string' ? (p[key] as string).toLowerCase().replace(/-do$|-si$|-teukbyeolsi$|-gwangyeoksi$/g, '').replace(/[\s-]/g, '') : ''
    for (const [prefix, s] of NAME_PREFIX) if (v.startsWith(prefix)) return s
  }
  return null
}

// 투영: 경도 124.5~132.0, 위도 33.0~38.7. 가로는 cos(36°) 로 줄여 실제 모양에 가깝게. 너비 600 고정, 높이는 비율대로.
const LON0 = 124.5, LON1 = 132.0, LAT0 = 33.0, LAT1 = 38.7, W = 600, PAD = 10
const K = Math.cos((36 * Math.PI) / 180)
const SCALE = (W - PAD * 2) / ((LON1 - LON0) * K)
const H = Math.round((LAT1 - LAT0) * SCALE + PAD * 2)
const px = (lon: number) => +(PAD + (lon - LON0) * K * SCALE).toFixed(1)
const py = (lat: number) => +(PAD + (LAT1 - lat) * SCALE).toFixed(1)
const project = (ring: number[][]): Ring => ring.map(([lon, lat]) => [px(lon), py(lat)])

function area(r: Ring): number { let a = 0; for (let i = 0; i < r.length; i++) { const [x1, y1] = r[i], [x2, y2] = r[(i + 1) % r.length]; a += x1 * y2 - x2 * y1 } return Math.abs(a) / 2 }
function centroid(r: Ring): [number, number] {
  let a = 0, cx = 0, cy = 0
  for (let i = 0; i < r.length; i++) { const [x1, y1] = r[i], [x2, y2] = r[(i + 1) % r.length]; const f = x1 * y2 - x2 * y1; a += f; cx += (x1 + x2) * f; cy += (y1 + y2) * f }
  a /= 2; return [+(cx / (6 * a)).toFixed(1), +(cy / (6 * a)).toFixed(1)]
}
const MIN_AREA = 4 // px² — 이보다 작은 섬(약 2~3km²)은 뺀다. 울릉도는 남고 독도는 표식으로 따로 찍는다.
/** 숫자 자리 보정(작거나 치우친 곳). 경기의 중심은 서울 쪽으로 쏠리므로 바깥으로 민다. 화면을 보고 맞춘 값. */
const LABEL_OFFSET: Partial<Record<Sido, [number, number]>> = { 경기: [24, 27] }

/** 점이 고리 안인가(짝수-홀수 규칙). */
function inRing(x: number, y: number, r: Ring): boolean {
  let inside = false
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i], [xj, yj] = r[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

function main() {
  const src = process.argv[2]
  if (!src) throw new Error('GeoJSON 파일 경로를 주세요')
  const fc = JSON.parse(readFileSync(src, 'utf8')) as { features: Feature[] }
  const kr = fc.features.filter((f) => f.properties.adm0_a3 === 'KOR' || f.properties.iso_a2 === 'KR')
  const out: { code: Sido; d: string; label: [number, number] }[] = []
  const seen = new Set<Sido>()
  for (const f of kr) {
    const code = sidoOf(f.properties)
    if (!code) throw new Error(`이름 대응 실패: ${JSON.stringify({ name: f.properties.name, name_ko: f.properties.name_ko })}`)
    if (seen.has(code)) throw new Error(`시·도 겹침: ${code}`)
    seen.add(code)
    const polys: number[][][][] = f.geometry.type === 'Polygon' ? [f.geometry.coordinates as number[][][]] : (f.geometry.coordinates as number[][][][])
    // 다각형마다 바깥 고리 + 구멍(예: 경기 안의 서울). 가장 큰 바깥 고리가 아니면 MIN_AREA 미만 고리는 뺀다(구멍은 자기 바깥 고리가 남았을 때만).
    const shapes = polys.map((poly) => ({ outer: project(poly[0]), holes: poly.slice(1).map(project) }))
    const main = shapes.reduce((a, b) => (area(a.outer) >= area(b.outer) ? a : b))
    const rings: Ring[] = []
    for (const sh of shapes) {
      if (sh !== main && area(sh.outer) < MIN_AREA) continue
      rings.push(sh.outer, ...sh.holes.filter((h) => area(h) >= MIN_AREA))
    }
    const d = rings.map((r) => 'M' + r.map(([x, y]) => `${x},${y}`).join('L') + 'Z').join('')
    const [cx, cy] = centroid(main.outer)
    const [dx, dy] = LABEL_OFFSET[code] ?? [0, 0]
    const label: [number, number] = [+(cx + dx).toFixed(1), +(cy + dy).toFixed(1)]
    if (!inRing(label[0], label[1], main.outer) || main.holes.some((h) => inRing(label[0], label[1], h)))
      throw new Error(`${code} 숫자 자리 (${label[0]},${label[1]}) 가 경계 밖/구멍 안 — LABEL_OFFSET 보정 필요`)
    out.push({ code, d, label })
  }
  if (out.length !== 17) throw new Error(`시·도가 17개가 아님: ${out.length} (${[...seen].join(', ')})`)
  out.sort((a, b) => SIDOS.indexOf(a.code) - SIDOS.indexOf(b.code))
  const data = {
    viewBox: `0 0 ${W} ${H}`,
    source: 'Natural Earth 1:10m Admin 1 – States, Provinces (public domain), naturalearthdata.com',
    sidos: out,
    markers: [{ name: '독도', x: px(131.87), y: py(37.24) }],
  }
  mkdirSync('data/map', { recursive: true })
  writeFileSync('data/map/korea-sido.json', JSON.stringify(data))
  console.log(`썼음: data/map/korea-sido.json (${JSON.stringify(data).length} bytes, viewBox ${data.viewBox})`)
}
main()
