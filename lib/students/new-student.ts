import { LEVELS } from '@/lib/studio/schemas'

export type NewStudent = { name: string; level: (typeof LEVELS)[number]; grade: number }
export type ParseResult = { ok: true; data: NewStudent } | { ok: false; error: 'nameMissing' | 'levelInvalid' | 'gradeInvalid' }

/** 폼 → 검증. error 는 app.classroom.students.errors 의 키. */
export function parseNewStudent(formData: FormData): ParseResult {
  const name = String(formData.get('name') ?? '').trim()
  const level = String(formData.get('level') ?? '')
  const grade = Number.parseInt(String(formData.get('grade') ?? ''), 10)
  if (!name) return { ok: false, error: 'nameMissing' }
  if (!(LEVELS as readonly string[]).includes(level)) return { ok: false, error: 'levelInvalid' }
  if (!Number.isInteger(grade) || grade < 1 || grade > 6) return { ok: false, error: 'gradeInvalid' }
  return { ok: true, data: { name, level: level as NewStudent['level'], grade } }
}

/** 아이디 = 원 코드 + '-' + 번호(세 자리 채움). 로그인 이메일은 toLoginEmail(아이디). */
export function buildLoginId(academyCode: string, seq: number): string {
  return `${academyCode}-${String(seq).padStart(3, '0')}`
}
