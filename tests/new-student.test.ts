import { describe, it, expect } from 'vitest'
import { parseNewStudent, buildLoginId } from '@/lib/students/new-student'

function fd(o: Record<string, string>) { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f }

describe('parseNewStudent', () => {
  it('accepts a valid form', () => {
    expect(parseNewStudent(fd({ name: ' 김민준 ', level: '중', grade: '1' }))).toEqual({ ok: true, data: { name: '김민준', level: '중', grade: 1 } })
  })
  it('rejects missing name, bad level, bad grade with copy keys', () => {
    expect(parseNewStudent(fd({ name: '', level: '중', grade: '1' }))).toEqual({ ok: false, error: 'nameMissing' })
    expect(parseNewStudent(fd({ name: 'a', level: '대', grade: '1' }))).toEqual({ ok: false, error: 'levelInvalid' })
    expect(parseNewStudent(fd({ name: 'a', level: '초', grade: '7' }))).toEqual({ ok: false, error: 'gradeInvalid' })
  })
})

describe('buildLoginId', () => {
  it('formats code-NNN', () => {
    expect(buildLoginId('dgss', 7)).toBe('dgss-007')
    expect(buildLoginId('dgss', 1234)).toBe('dgss-1234')
  })
})
