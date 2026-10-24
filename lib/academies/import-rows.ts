import { toSido, type Sido } from './sido'
import { normalizeWebsite } from './website'

/** 대표가 주는 표 한 줄(설계 2026-10-25 §6). code 가 null 이면 스크립트가 g001 부터 붙인다. */
export type ImportRow = { name: string; sido: Sido; website: string; region: string; code: string | null }

/** 쉼표 CSV 한 줄 → 칸들(큰따옴표 안의 쉼표·겹따옴표 처리). */
function splitCsvLine(line: string): string[] {
  const out: string[] = []; let cur = ''; let q = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (q) { if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++ } else q = false } else cur += c }
    else if (c === '"') q = true
    else if (c === ',') { out.push(cur); cur = '' }
    else cur += c
  }
  out.push(cur); return out.map((s) => s.trim())
}

const HEAD = { name: ['이름', '원 이름', '가맹원', '학원명', 'name'], sido: ['시도', '시·도', '시/도', 'sido'], website: ['홈페이지', '홈페이지 주소', 'url', 'website'], region: ['시/군/구', '시군구', '지역', 'region'], code: ['코드', '원 코드', 'code'] }

/** CSV 글자 → 줄들 + 문제 목록(줄 번호는 1부터, 머리 줄이 1행). 문제 줄은 뺀다 — 지어내지 않는다. */
export function parseImportCsv(text: string): { rows: ImportRow[]; problems: string[] } {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim() !== '')
  if (lines.length === 0) return { rows: [], problems: ['비어 있음'] }
  const head = splitCsvLine(lines[0]).map((h) => h.toLowerCase())
  const col = (keys: string[]) => head.findIndex((h) => keys.map((k) => k.toLowerCase()).includes(h))
  const ix = { name: col(HEAD.name), sido: col(HEAD.sido), website: col(HEAD.website), region: col(HEAD.region), code: col(HEAD.code) }
  if (ix.name < 0 || ix.sido < 0) return { rows: [], problems: ['머리 줄에 이름·시도 열이 없음'] }
  const rows: ImportRow[] = []; const problems: string[] = []
  lines.slice(1).forEach((line, i) => {
    const n = i + 2; const c = splitCsvLine(line); const get = (k: number) => (k >= 0 ? c[k] ?? '' : '')
    const name = get(ix.name)
    if (!name) { problems.push(`${n}행: 이름이 비었음`); return }
    const sido = toSido(get(ix.sido))
    if (!sido) { problems.push(`${n}행: 시·도를 모름 "${get(ix.sido)}"`); return }
    const website = normalizeWebsite(get(ix.website))
    if (website === null) { problems.push(`${n}행: 홈페이지 주소가 틀림 "${get(ix.website)}"`); return }
    const codeRaw = get(ix.code).toLowerCase()
    if (codeRaw && !/^[a-z0-9]{3,12}$/.test(codeRaw)) { problems.push(`${n}행: 코드가 틀림 "${codeRaw}"(영문 소문자·숫자 3~12자)`); return }
    rows.push({ name, sido, website, region: get(ix.region), code: codeRaw || null })
  })
  return { rows, problems }
}

/** g001 부터 쓰지 않은 코드 n 개. */
export function nextCodes(existing: string[], n: number): string[] {
  const used = new Set(existing); const out: string[] = []
  for (let i = 1; out.length < n; i++) { const c = `g${String(i).padStart(3, '0')}`; if (!used.has(c)) out.push(c) }
  return out
}
