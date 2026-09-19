import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { standardsSchema } from '@/lib/standards/parse'

// 코드(예: "[9국03-01]", "[10공수2-01-07]")를 마지막 "-일련번호"
// 앞부분(prefix)으로 묶으면, 같은 prefix 안에서 일련번호는 01부터
// 빠짐없이 연속되어야 한다(교육과정이 그렇게 번호를 매긴다). 이 검사는
// 성취기준 코드를 지우거나 다시 매기지 않고, 추출 결과에 빠진 코드가
// 있는지(예: 파싱 중 성취기준 하나가 통째로 누락)만 확인한다.
const dir = join(__dirname, '..', 'data', 'standards')
const files = readdirSync(dir).filter((f) => f.endsWith('.json'))

function groupKeyAndNum(code: string): [string, number] | null {
  const body = code.slice(1, -1) // strip [ ]
  const m = body.match(/^(.*)-(\d{1,2})$/)
  if (!m) return null
  return [m[1], Number(m[2])]
}

// 2026-09-19 기준 6개 과목 파일 전체를 조사한 결과, 코드가 마지막
// "-일련번호" 없이 끝나는 경우도 없고, 어떤 영역(prefix)에서도 일련번호가
// 비는 경우가 없었다(모두 01..N 연속). 이후 재추출로 실제 교육과정에
// 존재하는 정당한 결번이 발견되면, 아래 KNOWN_GAPS에 "파일:prefix"를
// 키로, 빠진 번호 배열을 값으로 추가하고 근거(별책/쪽수)를 주석으로
// 남긴다. KNOWN_GAPS에 없는 새로운 결번은 실수(추출 누락)일 가능성이
// 높으므로 테스트가 실패해 드러나야 한다.
const KNOWN_GAPS: Record<string, number[]> = {}

describe('data/standards/*.json code continuity', () => {
  it.each(files)('%s: codes are contiguous (01..N) within each prefix group', (file) => {
    const raw = JSON.parse(readFileSync(join(dir, file), 'utf8'))
    const rows = standardsSchema.parse(raw)

    const groups = new Map<string, number[]>()
    const unparsable: string[] = []
    for (const r of rows) {
      const parsed = groupKeyAndNum(r.code)
      if (!parsed) {
        unparsable.push(r.code)
        continue
      }
      const [prefix, num] = parsed
      const key = `${file}:${prefix}`
      const arr = groups.get(key) ?? []
      arr.push(num)
      groups.set(key, arr)
    }

    expect(unparsable, `코드에서 "-일련번호"를 찾지 못함: ${unparsable.join(', ')}`).toEqual([])

    const unexpectedGaps: string[] = []
    for (const [key, nums] of groups) {
      const unique = Array.from(new Set(nums)).sort((a, b) => a - b)
      const max = unique[unique.length - 1]
      const missing: number[] = []
      for (let n = 1; n <= max; n++) {
        if (!unique.includes(n)) missing.push(n)
      }
      const known = KNOWN_GAPS[key] ?? []
      const reallyMissing = missing.filter((n) => !known.includes(n))
      const dupes = nums.length !== unique.length
      if (reallyMissing.length > 0) {
        unexpectedGaps.push(`${key}: 있음=[${unique.join(',')}] 결번=[${reallyMissing.join(',')}]`)
      }
      if (dupes) {
        unexpectedGaps.push(`${key}: 중복된 일련번호 있음 (${nums.join(',')})`)
      }
    }

    expect(
      unexpectedGaps,
      `예상하지 못한 코드 결번/중복 발견 (KNOWN_GAPS에 없음):\n${unexpectedGaps.join('\n')}`
    ).toEqual([])
  })
})
