import { SUBJECTS, LEVELS, type Subject, type Level } from '@/lib/studio/schemas'
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
