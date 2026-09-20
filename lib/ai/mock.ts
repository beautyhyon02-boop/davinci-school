import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { SUBJECTS } from '@/lib/studio/schemas'

const FIXTURE_DIR = ['data', 'studio-fixtures']

/**
 * 과목별 fixture 키(`stage3-generate-과학`)에서 과목 꼬리를 뗀 기본 키(`stage3-generate`).
 * 과목 파일이 없으면 기본(수학 샘플) 파일로 떨어지도록 하기 위한 것이다.
 */
function baseKey(key: string): string | null {
  for (const subject of SUBJECTS) {
    if (key.endsWith(`-${subject}`)) return key.slice(0, -(subject.length + 1))
  }
  return null
}

function fixturePath(key: string) { return join(process.cwd(), ...FIXTURE_DIR, `${key}.json`) }

/**
 * 가짜 응답(fixture)을 읽는다. `<key>.json`이 없고 키가 `-<과목>`으로 끝나면 과목을 뗀 기본 키로 한 번 더 찾는다
 * (과학 fixture는 있고 국어 fixture는 없을 때 국어 세트가 기본 수학 fixture로 진행되도록).
 */
export function loadFixture(key: string): unknown {
  const p = fixturePath(key)
  if (existsSync(p)) return JSON.parse(readFileSync(p, 'utf8'))
  const base = baseKey(key)
  if (base) {
    const bp = fixturePath(base)
    if (existsSync(bp)) return JSON.parse(readFileSync(bp, 'utf8'))
  }
  throw new Error(`AI mock fixture not found: ${p}`)
}
