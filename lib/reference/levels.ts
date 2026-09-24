import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

export type LevelRecord = { code: string; text: string; scheme: 'A-E' | 'ABC'; levels: Record<string, string>; merged_levels: string[][]; domain: string | null; unit: string | null; school_level: '초' | '중'; subject: string }
export type DomainLevels = { domain: string; levels: Record<string, Record<string, string> | string> }
type LevelFile = { subject: string; school_level: '초' | '중'; scheme: 'A-E' | 'ABC'; standards: { code: string; text: string; domain?: string | null; unit?: string | null; levels: Record<string, string>; merged_levels?: string[][] }[]; domain_levels: { domain: string; levels: Record<string, Record<string, string> | string> }[] }

const DIR = ['data', 'reference', 'levels']
const SUBJECT_BY_LETTER: Record<string, string> = { '국': '국어', '수': '수학', '과': '과학', '사': '사회', '영': '영어', '역': '역사', '도': '도덕' }

/** 코드의 첫 숫자(2·4·6=초, 9=중)와 과목 글자로 파일을 정한다. 고등(10·12…)은 아직 파일이 없어 null. */
export function levelFileFor(code: string): string | null {
  const m = /^\[(\d+)([가-힣])/.exec(code)
  if (!m) return null
  const digit = Number(m[1]); const subject = SUBJECT_BY_LETTER[m[2]]
  if (!subject) return null
  const school = digit === 9 ? '중' : [2, 4, 6].includes(digit) ? '초' : null
  if (!school) return null
  return join(process.cwd(), ...DIR, `${subject}-${school}.json`)
}

const cache = new Map<string, LevelFile | null>()
function loadFile(path: string): LevelFile | null {
  if (!cache.has(path)) cache.set(path, existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as LevelFile) : null)
  return cache.get(path) ?? null
}

export function getLevels(code: string): LevelRecord | null {
  const path = levelFileFor(code); if (!path) return null
  const file = loadFile(path); if (!file) return null
  const s = file.standards.find((x) => x.code === code); if (!s) return null
  return { code: s.code, text: s.text, scheme: file.scheme, levels: s.levels, merged_levels: s.merged_levels ?? [], domain: s.domain ?? null, unit: s.unit ?? null, school_level: file.school_level, subject: file.subject }
}

export function getDomainLevels(code: string): DomainLevels | null {
  const r = getLevels(code); if (!r || !r.domain) return null
  const file = loadFile(levelFileFor(code)!)!
  const d = file.domain_levels.find((x) => x.domain === r.domain)
  return d ? { domain: d.domain, levels: d.levels } : null
}

export const anchorLevel = (scheme: LevelRecord['scheme']) => (scheme === 'A-E' ? 'C' : 'B') as 'C' | 'B'
export const minimumLevel = (scheme: LevelRecord['scheme']) => (scheme === 'A-E' ? 'E' : 'C') as 'E' | 'C'

/** 프롬프트용 블록: 성취기준마다 수준 문장 전부(병합 칸은 "A·B 동일"). */
export function levelsBlock(codes: string[]): string {
  const lines: string[] = []
  for (const code of codes) {
    const r = getLevels(code); if (!r) continue
    lines.push(`${code} 성취수준(도달점 = ${anchorLevel(r.scheme)}, 최소 = ${minimumLevel(r.scheme)}):`)
    const merged = new Map<string, string>()
    for (const group of r.merged_levels) for (const lv of group) merged.set(lv, group.join('·'))
    for (const [lv, text] of Object.entries(r.levels)) lines.push(`  ${merged.get(lv) ?? lv}: ${text}`)
  }
  return lines.join('\n')
}
