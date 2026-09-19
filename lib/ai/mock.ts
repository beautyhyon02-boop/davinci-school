import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

export function loadFixture(key: string): unknown {
  const p = join(process.cwd(), 'data', 'studio-fixtures', `${key}.json`)
  if (!existsSync(p)) throw new Error(`AI mock fixture not found: ${p}`)
  return JSON.parse(readFileSync(p, 'utf8'))
}
