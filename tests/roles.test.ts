import { describe, it, expect } from 'vitest'
import { homePathFor, requiredRoleFor } from '@/lib/auth/roles'

describe('roles', () => {
  it('maps role to home path', () => {
    expect(homePathFor('admin')).toBe('/admin')
    expect(homePathFor('teacher')).toBe('/teacher')
    expect(homePathFor('student')).toBe('/student')
  })
  it('detects required role by pathname', () => {
    expect(requiredRoleFor('/admin')).toBe('admin')
    expect(requiredRoleFor('/admin/academies')).toBe('admin')
    expect(requiredRoleFor('/teacher/students')).toBe('teacher')
    expect(requiredRoleFor('/student')).toBe('student')
    expect(requiredRoleFor('/')).toBeNull()
    expect(requiredRoleFor('/programs/essay')).toBeNull()
    expect(requiredRoleFor('/administrator')).toBeNull()
  })
})
