/**
 * data/standards/*.json(정규식으로 별책 PDF에서 추출한 성취기준)을
 * data/reference/levels/*.json(평가원 성취수준 PDF를 scripts/parse_levels.py로
 * 파싱한 독립 원문)과 코드 기준으로 대조해 보고서를 쓴다. DB는 건드리지 않는다
 * (DB 갱신은 /admin/standards의 "원문 자동 대조" 서버 액션이 한다 —
 * `app/admin/standards/actions.ts`의 `runStandardsCrosscheck`).
 *
 *   npx tsx scripts/crosscheck_standards.ts
 *
 * data/standards/README.md "원문 대조 (2026-09-26)" 절 참고.
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { standardsSchema } from '../lib/standards/parse'
import { getAllLevelRecords } from '../lib/reference/levels'
import { crosscheckStandards, type DbStandardRow, type CrosscheckResult } from '../lib/standards/crosscheck'

const STANDARDS_DIR = 'data/standards'
const REPORT_PATH = join(STANDARDS_DIR, 'crosscheck-2026-09-26.md')

function loadDbRows(): DbStandardRow[] {
  const files = readdirSync(STANDARDS_DIR).filter((f) => f.endsWith('.json'))
  const rows: DbStandardRow[] = []
  for (const f of files) {
    const parsed = standardsSchema.parse(JSON.parse(readFileSync(join(STANDARDS_DIR, f), 'utf8')))
    // data/standards/*.json에는 DB의 uuid가 없다(이 스크립트는 파일 대 파일 대조이지 DB 조회가
    // 아니다) — code가 파일 전체에서 고유하므로(README "과목별 건수" 절) code를 id로 쓴다.
    for (const r of parsed) rows.push({ id: r.code, code: r.code, subject: r.subject, text: r.text })
  }
  return rows
}

function buildReport(dbRows: DbStandardRow[], result: CrosscheckResult): string {
  const subjectOf = new Map(dbRows.map((r) => [r.id, r.subject]))
  const bySubject = new Map<string, { verified: number; mismatched: number; unmatched: number }>()
  const bump = (subject: string, key: 'verified' | 'mismatched' | 'unmatched') => {
    const row = bySubject.get(subject) ?? { verified: 0, mismatched: 0, unmatched: 0 }
    row[key] += 1
    bySubject.set(subject, row)
  }
  for (const r of result.verified) bump(subjectOf.get(r.id) ?? '?', 'verified')
  for (const r of result.mismatched) bump(subjectOf.get(r.id) ?? '?', 'mismatched')
  for (const r of result.unmatched) bump(subjectOf.get(r.id) ?? '?', 'unmatched')

  const subjects = [...bySubject.keys()].sort((a, b) => a.localeCompare(b, 'ko'))
  const lines: string[] = []
  lines.push('# 성취기준 원문 대조 보고서 (2026-09-26)')
  lines.push('')
  lines.push(
    '`data/standards/*.json`(별책 PDF에서 정규식으로 추출)을 `data/reference/levels/*.json`' +
      '(평가원 성취수준 PDF를 `scripts/parse_levels.py`로 독립 파싱한 원문)과 코드 기준으로 대조한 결과다.' +
      ' 방법: `lib/standards/crosscheck.ts`의 `crosscheckStandards()` — 같은 코드의 문장을' +
      ' `normalizeStandardText()`(공백 정리·가운뎃점 통일·후행 마침표 제거)로 정규화한 뒤 비교한다.' +
      ' 생성: `npx tsx scripts/crosscheck_standards.ts`.',
  )
  lines.push('')
  lines.push('## 과목별 요약')
  lines.push('')
  lines.push('| 과목 | 검증됨 | 불일치 | 대조 불가 | 합계 |')
  lines.push('| --- | --- | --- | --- | --- |')
  let totalVerified = 0
  let totalMismatched = 0
  let totalUnmatched = 0
  for (const subject of subjects) {
    const row = bySubject.get(subject)!
    const total = row.verified + row.mismatched + row.unmatched
    lines.push(`| ${subject} | ${row.verified} | ${row.mismatched} | ${row.unmatched} | ${total} |`)
    totalVerified += row.verified
    totalMismatched += row.mismatched
    totalUnmatched += row.unmatched
  }
  const grandTotal = totalVerified + totalMismatched + totalUnmatched
  lines.push(`| **합계** | **${totalVerified}** | **${totalMismatched}** | **${totalUnmatched}** | **${grandTotal}** |`)
  lines.push('')
  lines.push(
    '대조 불가(unmatched)는 틀렸다는 뜻이 아니라, 그 코드가 평가원 성취수준 PDF 자체에 없다는 뜻이다' +
      '(고등학교 전 과목·한국사/세계사 일부는 성취수준 PDF가 없거나 `data/reference/levels/`에 아직' +
      ' 파일이 없다 — `lib/reference/levels.ts`의 `levelFileFor()` 참고).',
  )
  lines.push('')
  lines.push('## 불일치 목록')
  lines.push('')
  if (result.mismatched.length === 0) {
    lines.push('없음.')
  } else {
    lines.push('| 코드 | DB 원문(별책 추출) | 성취수준 원문(출처) |')
    lines.push('| --- | --- | --- |')
    for (const m of [...result.mismatched].sort((a, b) => a.code.localeCompare(b.code, 'ko'))) {
      const dbText = m.dbText.replace(/\|/g, '\\|').replace(/\n/g, ' ')
      const levelText = m.levelText.replace(/\|/g, '\\|').replace(/\n/g, ' ')
      lines.push(`| ${m.code} | ${dbText} | ${levelText} (${m.source}) |`)
    }
  }
  lines.push('')
  return lines.join('\n')
}

function main(): void {
  const dbRows = loadDbRows()
  const levelRecords = getAllLevelRecords()
  const result = crosscheckStandards(dbRows, levelRecords)

  writeFileSync(REPORT_PATH, buildReport(dbRows, result), 'utf8')

  const total = dbRows.length
  console.log(
    `성취기준 ${total}건 대조: 검증됨 ${result.verified.length} / 불일치 ${result.mismatched.length} / 대조 불가 ${result.unmatched.length}`,
  )
  console.log(`보고서: ${REPORT_PATH}`)
}

main()
