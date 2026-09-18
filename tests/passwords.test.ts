import { describe, it, expect } from 'vitest'
import { generatePassword } from '@/lib/auth/passwords'

describe('generatePassword', () => {
  it('is 10 chars without confusable characters', () => {
    for (let i = 0; i < 50; i++) {
      const p = generatePassword()
      expect(p).toHaveLength(10)
      expect(p).not.toMatch(/[0O1lI]/)
    }
  })
})
