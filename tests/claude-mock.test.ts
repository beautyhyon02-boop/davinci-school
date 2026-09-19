import { describe, it, expect, beforeAll } from 'vitest'
import { z } from 'zod'
import { callStructured, isMock } from '@/lib/ai/claude'

beforeAll(() => { process.env.AI_MOCK = '1'; delete process.env.ANTHROPIC_API_KEY })

describe('callStructured (mock)', () => {
  it('is in mock mode without a key', () => { expect(isMock()).toBe(true) })
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
