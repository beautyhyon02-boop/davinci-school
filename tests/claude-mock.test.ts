import { describe, it, expect, beforeAll } from 'vitest'
import { z } from 'zod'
import { callStructured, isMock } from '@/lib/ai/claude'

beforeAll(() => { process.env.AI_MOCK = '1'; delete process.env.ANTHROPIC_API_KEY })

describe('isMock', () => {
  const env = process.env as Record<string, string | undefined>
  it('is in mock mode without a key (test env)', () => { expect(isMock()).toBe(true) })
  it('AI_MOCK=1 forces mock even with a key', () => {
    env.ANTHROPIC_API_KEY = 'x'
    try { expect(isMock()).toBe(true) } finally { delete env.ANTHROPIC_API_KEY }
  })
  it('is NOT mock with a key and AI_MOCK empty', () => {
    env.ANTHROPIC_API_KEY = 'x'; env.AI_MOCK = ''
    try { expect(isMock()).toBe(false) } finally { delete env.ANTHROPIC_API_KEY; env.AI_MOCK = '1' }
  })
  it('throws in production without a key unless AI_MOCK=1', () => {
    const prevEnv = env.NODE_ENV
    env.NODE_ENV = 'production'; env.AI_MOCK = ''
    try {
      expect(() => isMock()).toThrow('ANTHROPIC_API_KEY is not set')
      env.AI_MOCK = '1'
      expect(isMock()).toBe(true)
    } finally { env.NODE_ENV = prevEnv; env.AI_MOCK = '1' }
  })
})

describe('callStructured (mock)', () => {
  it('returns the fixture parsed by the schema', async () => {
    const schema = z.object({ hello: z.string() })
    const r = await callStructured({ stage: 0, role: 'generate', schema, system: 's', user: 'u', fixtureKey: 'test-hello' })
    expect(r.data.hello).toBe('world')
    expect(r.model).toBe('mock')
  })
  it('throws a clear error when the fixture is missing', async () => {
    const schema = z.object({ x: z.string() })
    await expect(callStructured({ stage: 0, role: 'generate', schema, system: 's', user: 'u', fixtureKey: 'nope' })).rejects.toThrow(/fixture/)
  })
})
