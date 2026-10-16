/**
 * RED 보고서(대표 2026-10-15) + RED 자료실 PRD(본사 2026-10-16): 생성기가 매일 만드는 교사용 완성보고서 + 학생용 작성양식(docx)을
 * 홈페이지 탐구보고서 페이지에서 가맹 원장만 내려받게 한다. 구분은 BASIC(초등) / ADVANCED(중고등), 종류는 R(독서연계)·E(소논문)·D(디베이트).
 * 올리면 검수대기(pending) → 본사가 [게시](published) / [보류](hold, 사유). 원장에게는 게시된 줄만 보인다.
 * 파일은 비공개 저장소(bucket 'resources'), 줄은 resources 표(0018·0019 열). 이 모듈은 순수 함수만 — 파일 이름 읽기, 세트(교사용+학생용) 묶기.
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
/** 교재 종류(PRD): R = Reading 독서연계보고서, E = Essay 소논문, D = Debate 디베이트. */
export type RedType = 'R' | 'E' | 'D'
export const RED_TYPES: RedType[] = ['R', 'E', 'D']
/** 검수 상태(PRD): 올리면 pending, 본사가 published / hold(사유). 원장에게는 published 만 보인다. */
export type RedStatus = 'pending' | 'published' | 'hold'
export const RED_STATUSES: RedStatus[] = ['pending', 'published', 'hold']
export type RedSourceLink = { label: string; url: string }

export type RedReportRow = {
  id: string
  filename: string
  category: RedCategory
  kind: RedKind
  red_type: RedType
  series: string
  subject: string
  title: string
  summary: string
  source_links: RedSourceLink[]
  report_date: string          // YYYY-MM-DD(서울)
  storage_path: string
  status: RedStatus
  hold_note: string
  published_at: string | null
  created_by: string           // 올린 사람의 profile id, 또는 'auto'(생성기 intake)
  size_bytes: number | null
  uploaded_at: string
}

export type ParsedRedFilename =
  | { ok: true; category: RedCategory; kind: RedKind; redType: RedType; series: string; subject: string; title: string }
  | { ok: false; reason: 'extension' | 'pattern' }

const KIND_BY_LABEL: Record<string, RedKind> = { '교사용 완성보고서': 'teacher', '학생용 작성양식': 'student' }
const CATEGORY_BY_LEVEL: Record<string, RedCategory> = { '초등': 'BASIC', '중고등': 'ADVANCED', '중고': 'ADVANCED', '중등': 'ADVANCED', '고등': 'ADVANCED' }
const CATEGORY_BY_WORD: Record<string, RedCategory> = { Basic: 'BASIC', Advanced: 'ADVANCED' }

/** "사물놀이 물리"처럼 시리즈 + 과목 두 낱말일 수 있다(마지막 낱말들을 과목으로) — 한 낱말이면 과목은 빈 값. */
function splitSeries(raw: string): { series: string; subject: string } {
  const words = raw.trim().split(/\s+/)
  return { series: words[0], subject: words.length > 1 ? words.slice(1).join(' ') : '' }
}

/**
 * 두 가지 이름 틀을 읽는다.
 * - 옛 틀(생성기 build.js): `RED Basic {series}_{stem} {교사용 완성보고서|학생용 작성양식}({초등|중고등}).docx` — 여기서 "Basic" 은 상표 낱말이고 수준은 괄호에서. 종류는 E(소논문).
 * - 새 틀(PRD 2026-10-16): `RED {R|E|D} {Basic|Advanced}_{series}_{stem} {종류}.docx` — 글자가 종류, 낱말이 수준. 끝에 (초등) 같은 괄호가 붙어도 된다(수준과 어긋나면 거부).
 * 시리즈와 과목은 **띄어쓰기**로("과학뉴스 생명과학"). 밑줄로 나누면 첫 밑줄까지가 시리즈, 나머지가 제목이 된다 — 생성기 이름 규칙.
 */
export function parseRedFilename(filename: string): ParsedRedFilename {
  const name = filename.trim().replace(/\s+\.docx$/i, '.docx')   // 확장자 앞 공백은 지운다(검토 2026-10-16)
  if (!/\.docx$/i.test(name)) return { ok: false, reason: 'extension' }
  const stem = name.replace(/\.docx$/i, '')
  // 수준 표시는 "(초등)" 이 원칙이지만 괄호가 빠지거나("…완성보고서초등") 띄어쓰기로 붙어도("… 중고등") 읽는다(본사 2026-10-16 실제 파일).
  const fresh = stem.match(/^RED ([RED]) (Basic|Advanced)_(.+?)_(.+?) (교사용 완성보고서|학생용 작성양식)(?:\s*\(?(초등|중고등|중고|중등|고등)\)?)?$/)
  if (fresh) {
    const category = CATEGORY_BY_WORD[fresh[2]]
    if (fresh[6] && CATEGORY_BY_LEVEL[fresh[6]] !== category) return { ok: false, reason: 'pattern' }   // Basic 인데 (중고등) 처럼 어긋나면 거부
    return { ok: true, category, kind: KIND_BY_LABEL[fresh[5]], redType: fresh[1] as RedType, ...splitSeries(fresh[3]), title: fresh[4].trim() }
  }
  const legacy = stem.match(/^RED Basic (.+?)_(.+) (교사용 완성보고서|학생용 작성양식)\s*\(?(초등|중고등|중고|중등|고등)\)?$/)
  if (!legacy) return { ok: false, reason: 'pattern' }
  return { ok: true, category: CATEGORY_BY_LEVEL[legacy[4]], kind: KIND_BY_LABEL[legacy[3]], redType: 'E', ...splitSeries(legacy[1]), title: legacy[2].trim() }
}

/** 교사용·학생용을 한 세트로 묶는 키 — 구분·종류·시리즈·과목·제목이 같으면 같은 세트. */
export function redSetKey(r: Pick<RedReportRow, 'category' | 'red_type' | 'series' | 'subject' | 'title'>): string {
  return [r.category, r.red_type, r.series, r.subject, r.title].map((s) => s.trim()).join('|')
}

export type RedSet = {
  key: string; category: RedCategory; redType: RedType; series: string; subject: string; title: string; summary: string; sourceLinks: RedSourceLink[]
  date: string; teacher: RedReportRow | null; student: RedReportRow | null
}

/** 게시된 줄만 세트로 묶어 최신 날짜(같으면 올린 시각)가 앞에 오게. category 를 주면 그 구분만. 요약·참고 링크는 교사용 줄 것을 우선. */
export function groupRedSets(rows: RedReportRow[], category?: RedCategory): RedSet[] {
  const sets = new Map<string, RedSet>()
  for (const r of rows) {
    if (r.status !== 'published') continue
    if (category && r.category !== category) continue
    const key = redSetKey(r)
    const set = sets.get(key) ?? { key, category: r.category, redType: r.red_type, series: r.series, subject: r.subject, title: r.title, summary: '', sourceLinks: [], date: r.report_date, teacher: null, student: null }
    if (r.kind === 'teacher') set.teacher = r; else set.student = r
    if (r.report_date > set.date) set.date = r.report_date
    if (r.kind === 'teacher' || !set.summary) set.summary = r.summary || set.summary
    if (r.kind === 'teacher' || set.sourceLinks.length === 0) set.sourceLinks = r.source_links?.length ? r.source_links : set.sourceLinks
    sets.set(key, set)
  }
  const latestUpload = (s: RedSet) => [s.teacher?.uploaded_at ?? '', s.student?.uploaded_at ?? ''].sort().at(-1) ?? ''
  return [...sets.values()].sort((a, b) => (b.date.localeCompare(a.date)) || latestUpload(b).localeCompare(latestUpload(a)))
}

/**
 * 저장소 경로: red/{구분}/{날짜}/{id}.docx — Supabase Storage 는 키에 한글을 받지 않는다("Invalid key", 2026-10-15 실제 올리기에서 확인).
 * 한글 파일 이름은 resources.filename 에만 두고 내려받을 때 그 이름으로 준다(/api/red/download/[id]). id 는 uuid 같은 ASCII 문자열.
 */
export function redStoragePath(category: RedCategory, date: string, id: string): string {
  const safe = id.replace(/[^A-Za-z0-9._-]/g, '_')
  return `red/${category}/${date}/${safe}.docx`
}

/** 목록을 읽을 때 쓰는 열 목록(본사 화면·원장 화면·내려받기가 같은 것을 쓴다). */
export const RED_COLUMNS = 'id, filename, category, kind, red_type, series, subject, title, summary, source_links, report_date, storage_path, status, hold_note, published_at, created_by, size_bytes, uploaded_at'
