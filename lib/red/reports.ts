/**
 * RED 보고서(대표 2026-10-15): 생성기가 매일 만드는 교사용 완성보고서 + 학생용 작성양식(docx)을 홈페이지 탐구보고서 페이지에서
 * 가맹 원장만 내려받게 한다. 구분은 BASIC(초등) / ADVANCED(중고등). 파일은 비공개 저장소(bucket 'resources'), 줄은 resources 표(0018 열).
 * 이 모듈은 순수 함수만 — 파일 이름 읽기, 세트(교사용+학생용) 묶기. DB·저장소는 app/admin/red·app/(public)/programs/inquiry 쪽.
 */

export const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

/**
 * 내려받기 헤더(2026-10-15, 대표: "파일명이 한글이 아니다"): 서명 URL 의 download 매개변수는 한글 이름을 그대로 못 전해서,
 * 서버 라우트(/api/red/download/[id])가 파일을 읽어 RFC 6266 꼴로 돌려준다 — filename* 에 UTF-8 로 적고, 그것을 못 읽는 옛 브라우저용 ASCII 이름도 함께.
 */
export function contentDisposition(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_')
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`
}

export type RedCategory = 'BASIC' | 'ADVANCED'
export type RedKind = 'teacher' | 'student'

export type RedReportRow = {
  id: string
  filename: string
  category: RedCategory
  kind: RedKind
  series: string
  subject: string
  title: string
  report_date: string          // YYYY-MM-DD(서울)
  storage_path: string
  hidden: boolean
  size_bytes: number | null
  uploaded_at: string
}

export type ParsedRedFilename =
  | { ok: true; category: RedCategory; kind: RedKind; series: string; subject: string; title: string }
  | { ok: false; reason: 'extension' | 'pattern' }

const KIND_BY_LABEL: Record<string, RedKind> = { '교사용 완성보고서': 'teacher', '학생용 작성양식': 'student' }
const CATEGORY_BY_LEVEL: Record<string, RedCategory> = { '초등': 'BASIC', '중고등': 'ADVANCED', '중고': 'ADVANCED', '중등': 'ADVANCED', '고등': 'ADVANCED' }

/**
 * 생성기(build.js)의 이름: `RED Basic {series}_{fileStem} {교사용 완성보고서|학생용 작성양식}({초등|중고등}).docx`.
 * series 는 "사물놀이 물리"처럼 시리즈 + 과목 두 낱말일 수 있다(마지막 낱말을 과목으로) — 한 낱말이면 과목은 빈 값.
 */
export function parseRedFilename(filename: string): ParsedRedFilename {
  const name = filename.trim()
  if (!/\.docx$/i.test(name)) return { ok: false, reason: 'extension' }
  const m = name.replace(/\.docx$/i, '').match(/^RED Basic (.+?)_(.+) (교사용 완성보고서|학생용 작성양식)\((초등|중고등|중고|중등|고등)\)$/)
  if (!m) return { ok: false, reason: 'pattern' }
  const words = m[1].trim().split(/\s+/)
  const series = words[0]
  const subject = words.length > 1 ? words.slice(1).join(' ') : ''
  return { ok: true, category: CATEGORY_BY_LEVEL[m[4]], kind: KIND_BY_LABEL[m[3]], series, subject, title: m[2].trim() }
}

/** 교사용·학생용을 한 세트로 묶는 키 — 구분·시리즈·과목·제목이 같으면 같은 세트. */
export function redSetKey(r: Pick<RedReportRow, 'category' | 'series' | 'subject' | 'title'>): string {
  return [r.category, r.series, r.subject, r.title].map((s) => s.trim()).join('|')
}

export type RedSet = { key: string; category: RedCategory; series: string; subject: string; title: string; date: string; teacher: RedReportRow | null; student: RedReportRow | null }

/** 숨긴 줄을 빼고 세트로 묶어 최신 날짜(같으면 올린 시각)가 앞에 오게. category 를 주면 그 구분만. */
export function groupRedSets(rows: RedReportRow[], category?: RedCategory): RedSet[] {
  const sets = new Map<string, RedSet>()
  for (const r of rows) {
    if (r.hidden) continue
    if (category && r.category !== category) continue
    const key = redSetKey(r)
    const set = sets.get(key) ?? { key, category: r.category, series: r.series, subject: r.subject, title: r.title, date: r.report_date, teacher: null, student: null }
    if (r.kind === 'teacher') set.teacher = r; else set.student = r
    if (r.report_date > set.date) set.date = r.report_date
    sets.set(key, set)
  }
  const latestUpload = (s: RedSet) => [s.teacher?.uploaded_at ?? '', s.student?.uploaded_at ?? ''].sort().at(-1) ?? ''
  return [...sets.values()].sort((a, b) => (b.date.localeCompare(a.date)) || latestUpload(b).localeCompare(latestUpload(a)))
}

/**
 * 저장소 경로: red/{구분}/{날짜}/{id}.docx — Supabase Storage 는 키에 한글을 받지 않는다("Invalid key", 2026-10-15 실제 올리기에서 확인).
 * 한글 파일 이름은 resources.filename 에만 두고 내려받을 때 그 이름으로 준다(createSignedUrl download). id 는 uuid 같은 ASCII 문자열.
 */
export function redStoragePath(category: RedCategory, date: string, id: string): string {
  const safe = id.replace(/[^A-Za-z0-9._-]/g, '_')
  return `red/${category}/${date}/${safe}.docx`
}
