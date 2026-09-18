import { describe, it, expect } from 'vitest'
import { toLoginEmail, isEmail } from '@/lib/auth/login-id'

describe('login id', () => {
  it('passes emails through', () => {
    expect(toLoginEmail('ceo@davinci-lab.kr')).toBe('ceo@davinci-lab.kr')
  })
  it('converts student/teacher ids to internal email', () => {
    expect(toLoginEmail('seoul01-023')).toBe('seoul01-023@id.davinci-lab.kr')
    expect(toLoginEmail('  Seoul01-023 ')).toBe('seoul01-023@id.davinci-lab.kr')
  })
  it('isEmail', () => {
    expect(isEmail('a@b.c')).toBe(true)
    expect(isEmail('seoul01-023')).toBe(false)
  })
})
