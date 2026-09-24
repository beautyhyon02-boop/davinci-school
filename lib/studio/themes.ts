import type { z } from 'zod'
import { SUBJECTS, LEVELS, Materials, type Subject, type Level } from '@/lib/studio/schemas'
import { app } from '@/content/site'

const errors = app.studio.errors

/** Task 4의 대주제 생성 폼이 쓰는 필드 이름. 폼과 파서가 이 상수로 어긋나지 않게 한다. */
export const THEME_FIELDS = { title: 'title', level: 'level', grade: 'grade', subjects: 'subjects' } as const

const GRADE_RANGE: Record<Level, [number, number]> = { 초: [1, 6], 중: [1, 3], 고: [1, 3] }

export type ThemeInput = { title: string; level: Level; grade: number; subjects: Subject[] }

export function parseTheme(formData: FormData): { ok: true; data: ThemeInput } | { ok: false; error: string } {
  const title = String(formData.get(THEME_FIELDS.title) ?? '').trim()
  if (!title) return { ok: false, error: errors.titleRequired }

  const levelRaw = String(formData.get(THEME_FIELDS.level) ?? '')
  if (!(LEVELS as readonly string[]).includes(levelRaw)) return { ok: false, error: errors.levelInvalid }
  const level = levelRaw as Level

  const gradeRaw = formData.get(THEME_FIELDS.grade)
  const grade = Number(gradeRaw)
  const [min, max] = GRADE_RANGE[level]
  if (!Number.isInteger(grade) || grade < min || grade > max) return { ok: false, error: errors.gradeInvalid }

  const subjectsRaw = formData.getAll(THEME_FIELDS.subjects).map((v) => String(v))
  const subjects = Array.from(new Set(subjectsRaw))
  if (subjects.length === 0) return { ok: false, error: errors.subjectsRequired }
  for (const s of subjects) {
    if (!(SUBJECTS as readonly string[]).includes(s)) return { ok: false, error: errors.subjectInvalid }
  }

  return { ok: true, data: { title, level, grade, subjects: subjects as Subject[] } }
}

/**
 * 대주제 생성 후 과목을 추가한다. toAdd 는 SUBJECTS 안의 값이어야 하고, current(기존 순서)에
 * 이미 있는 과목은 건너뛴다(중복 방지). toAdd 가 비어 있으면(중복만 보냈거나 아예 안 보냈으면) 저장할 게 없다는 오류를 낸다.
 */
export function addThemeSubjects(
  current: string[],
  toAdd: string[],
): { ok: true; subjects: Subject[] } | { ok: false; error: string } {
  const requested = Array.from(new Set(toAdd.map((s) => s.trim()).filter((s) => s.length > 0)))
  if (requested.length === 0) return { ok: false, error: errors.subjectsRequired }
  for (const s of requested) {
    if (!(SUBJECTS as readonly string[]).includes(s)) return { ok: false, error: errors.subjectInvalid }
  }

  // 이미 대주제에 있는 과목을 다시 보냈다면 더할 게 없다 — 중복만 있는 요청도 "추가 없음"으로 취급한다.
  const additions = requested.filter((s) => !current.includes(s))
  if (additions.length === 0) return { ok: false, error: errors.subjectsRequired }

  return { ok: true, subjects: [...current, ...additions] as Subject[] }
}

/**
 * 대주제에서 과목 하나를 뺀다. 그 과목으로 이미 세트가 있으면(subjectsWithSets) 뺄 수 없다 — 세트가 대주제 과목을 전제로 하기 때문.
 * 대주제에 없는 과목이거나 마지막 남은 과목이어도 거부한다(대주제는 과목이 하나 이상이어야 한다). 나머지 순서는 그대로 둔다.
 */
export function removeThemeSubject(
  current: string[],
  subject: string,
  subjectsWithSets: string[],
): { ok: true; subjects: Subject[] } | { ok: false; error: string } {
  const s = subject.trim()
  if (!current.includes(s)) return { ok: false, error: errors.subjectNotInTheme }
  if (subjectsWithSets.includes(s)) return { ok: false, error: app.studio.theme.addSubjects.remove.hasSet }
  const subjects = current.filter((x) => x !== s)
  if (subjects.length === 0) return { ok: false, error: app.studio.theme.addSubjects.remove.lastSubject }
  return { ok: true, subjects: subjects as Subject[] }
}

/** subject가 theme.subjects 안에 있고, existingSubjects(이미 세트가 만들어진 과목)와 겹치지 않는지 확인한다. */
export function canCreateSet(
  theme: { subjects: string[] },
  subject: string,
  existingSubjects: string[],
): { ok: boolean; reason?: string } {
  if (!theme.subjects.includes(subject)) return { ok: false, reason: errors.subjectNotInTheme }
  if (existingSubjects.includes(subject)) return { ok: false, reason: errors.subjectDuplicate }
  return { ok: true }
}

export type StandardCandidate = { code: string; level: string; subject: string; verified: boolean }

/**
 * 성취기준 선택 규칙: 2~6개, 모두 대주제 학교급·과목과 일치해야 issues 없음.
 * 원문 미검증 성취기준은 게시를 막지 않고 warnings로만 알린다.
 */
export function validateStandardSelection(
  standards: StandardCandidate[],
  theme: { level: string; subject: string },
): { ok: boolean; issues: string[]; warnings: string[] } {
  const issues: string[] = []
  const warnings: string[] = []

  if (standards.length < 2 || standards.length > 6) issues.push(errors.standardCountInvalid)
  if (standards.some((s) => s.level !== theme.level)) issues.push(errors.standardLevelMismatch)
  if (standards.some((s) => s.subject !== theme.subject)) issues.push(errors.standardSubjectMismatch)

  const unverified = standards.filter((s) => !s.verified).map((s) => s.code)
  if (unverified.length > 0) warnings.push(errors.standardUnverified(unverified))

  return { ok: issues.length === 0, issues, warnings }
}

/**
 * 요청한 standardIds를 중복 제거하고, 모두 DB에서 실제로 찾은(foundIds) 것인지 확인한다.
 * 하나라도 못 찾았거나 요청이 비어 있으면 invalidStandards. insert 전에 먼저 호출해서
 * 존재하지 않는 id로 item_sets/item_set_standards를 만들지 않게 한다.
 */
export function validateStandardIds(
  requestedIds: string[],
  foundIds: string[],
): { ok: true; ids: string[] } | { ok: false; error: string } {
  const ids = Array.from(new Set(requestedIds))
  const foundSet = new Set(foundIds)
  if (ids.length === 0 || ids.some((id) => !foundSet.has(id))) return { ok: false, error: errors.invalidStandards }
  return { ok: true, ids }
}

export type SharedMaterial = z.infer<typeof Materials>['materials'][number]

/**
 * v2(2026-09-25)에서 자료 source 가 '자작' 문자열 → { kind, attribution, ai_assisted } 객체로 바뀌었다.
 * DB 의 themes.materials 는 v1 모양으로 저장돼 있으므로, 화면이 내려 준 배열을 다시 저장할 수 있게 문자열 source 만 객체로 올린다.
 * 나머지 필드는 그대로 두고 Materials 스키마가 검증한다('공개' 문자열이면 출처 문구가 없어 거부된다).
 */
function withV2Sources(input: unknown): unknown {
  const list = (input as { materials?: unknown } | null)?.materials
  if (!Array.isArray(list)) return input
  return {
    ...(input as object),
    materials: list.map((m) =>
      m && typeof m === 'object' && typeof (m as { source?: unknown }).source === 'string'
        ? { ...m, source: { kind: (m as { source: string }).source, attribution: null, ai_assisted: false } }
        : m,
    ),
  }
}

/**
 * 공유 자료 textarea 입력을 파싱한다. themes.materials 는 래퍼 없는 배열로 저장되지만(publish/repo 가 그렇게 읽는다)
 * 2A 스키마(`{ materials: [...] }`)를 그대로 붙여넣는 경로도 있으므로 두 모양을 모두 받는다 —
 * 그렇지 않으면 한 번 저장한 뒤 화면이 보여 주는 배열을 다시 저장할 수 없다.
 */
export function parseSharedMaterialsInput(text: string): { ok: true; materials: SharedMaterial[] } | { ok: false; error: string } {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return { ok: false, error: errors.materialsInvalid }
  }
  const wrapped = Array.isArray(parsed) ? { materials: parsed } : parsed
  const r = Materials.safeParse(withV2Sources(wrapped))
  if (!r.success) return { ok: false, error: errors.materialsInvalid }
  return { ok: true, materials: r.data.materials }
}

/** 저장된 themes.materials(배열)를 textarea 초기값으로 되돌린다 — 저장 → 표시 → 재저장이 왕복하도록 래퍼를 씌운다. */
export function sharedMaterialsJson(materials: SharedMaterial[] | null | undefined): string {
  return JSON.stringify({ materials: materials ?? [] }, null, 2)
}
