import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { z } from 'zod'
import Anthropic from '@anthropic-ai/sdk'
import { callStructured, setClientForTests, type StructuredClient, type LogEntry } from '@/lib/ai/claude'

// 실제 호출 경로(가짜 모드 아님)를 가짜 클라이언트로 검증한다. 실제 SDK 동작(검증한 파일):
// - node_modules/@anthropic-ai/sdk/lib/parser.js:56-64  parseOutputFormat → JSON/zod 실패 시 AnthropicError 를 throw
// - node_modules/@anthropic-ai/sdk/lib/MessageStream.js:415-418  message_stop 에서 maybeParseMessage → throw 가 스트림 오류로 전파
// - node_modules/@anthropic-ai/sdk/lib/MessageStream.js:40-58  handleError: AnthropicError 는 그대로 'error' 로 emit → finalMessage() reject
// - node_modules/@anthropic-ai/sdk/core/error.d.ts:2-4  APIError extends AnthropicError
const schema = z.object({ answer: z.number() })

type Msg = Anthropic.Message & { parsed_output: unknown }
type Step = { resolve: Partial<Msg> } | { reject: Error; snapshot?: Partial<Anthropic.Message> }

function msg(p: Partial<Msg>): Msg {
  return { id: 'm', type: 'message', role: 'assistant', model: 'claude-opus-5', content: [], stop_reason: 'end_turn', stop_sequence: null,
    usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 3, cache_creation_input_tokens: 0 }, parsed_output: null, ...p } as unknown as Msg
}

function fakeClient(steps: Step[]) {
  const calls: unknown[] = []
  const client: StructuredClient = {
    messages: {
      stream(params) {
        calls.push(params)
        const step = steps.shift()
        if (!step) throw new Error('fake: no more steps')
        let listener: ((e: Anthropic.MessageStreamEvent, s: Anthropic.Message) => void) | null = null
        return {
          on(_event, fn) { listener = fn; return this },
          async finalMessage() {
            if ('resolve' in step) return msg(step.resolve)
            if (step.snapshot) listener?.({ type: 'message_delta' } as Anthropic.MessageStreamEvent, msg(step.snapshot))
            throw step.reject
          },
        }
      },
    },
  }
  return { client, calls }
}

const env = process.env as Record<string, string | undefined>
let saved: Record<string, string | undefined>
beforeAll(() => { saved = { AI_MOCK: env.AI_MOCK, ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY }; env.AI_MOCK = ''; env.ANTHROPIC_API_KEY = 'test-key-not-real' })
afterAll(() => { env.AI_MOCK = saved.AI_MOCK; env.ANTHROPIC_API_KEY = saved.ANTHROPIC_API_KEY; setClientForTests(null) })
let logs: LogEntry[]
beforeEach(() => { logs = [] })
const log = async (e: LogEntry) => { logs.push(e) }
const base = { stage: 5 as const, role: 'generate' as const, schema, system: ['rules', 'extra'], user: 'u', fixtureKey: 'unused', log }

describe('callStructured (real path, fake client)', () => {
  it('sends the request with streaming params: max_tokens, adaptive thinking, only the first system block cached', async () => {
    const { client, calls } = fakeClient([{ resolve: { parsed_output: { answer: 4 } } }])
    setClientForTests(client)
    await callStructured(base)
    const req = calls[0] as Anthropic.MessageStreamParams
    expect(req.model).toBe('claude-opus-5')
    expect(req.max_tokens).toBe(48000)
    expect(req.thinking).toEqual({ type: 'adaptive' })
    expect(req.output_config?.effort).toBe('high')
    expect(req.output_config?.format?.type).toBe('json_schema')
    const sys = req.system as Anthropic.TextBlockParam[]
    expect(sys).toHaveLength(2)
    expect(sys[0].cache_control).toEqual({ type: 'ephemeral' })
    expect(sys[1].cache_control).toBeUndefined()
    expect(sys[1].text).toBe('extra')
  })
  it('unparsable (AnthropicError, not APIError) → retry once → success', async () => {
    const { client, calls } = fakeClient([
      { reject: new Anthropic.AnthropicError('Failed to parse structured output: boom'), snapshot: { stop_reason: 'end_turn' } },
      { resolve: { parsed_output: { answer: 4 } } },
    ])
    setClientForTests(client)
    const r = await callStructured(base)
    expect(r.data).toEqual({ answer: 4 })
    expect(r.model).toBe('claude-opus-5')
    expect(r.usage).toEqual({ input: 10, output: 5, cacheRead: 3 })
    expect(calls).toHaveLength(2)
    expect(logs.map(l => [l.ok, l.error])).toEqual([[false, 'unparsable (attempt 1): Failed to parse structured output: boom'], [true, undefined]])
  })
  it('unparsable twice → throws after exactly 2 attempts, with the last underlying message', async () => {
    const { client, calls } = fakeClient([
      { reject: new Anthropic.AnthropicError('Failed to parse structured output: 1') },
      { reject: new Anthropic.AnthropicError('Failed to parse structured output: 2') },
      { resolve: { parsed_output: { answer: 4 } } },
    ])
    setClientForTests(client)
    await expect(callStructured(base)).rejects.toThrow(/2 attempts: Failed to parse structured output: 2/)
    expect(calls).toHaveLength(2)
    expect(logs.map(l => l.error)).toEqual(['unparsable (attempt 1): Failed to parse structured output: 1', 'unparsable (attempt 2): Failed to parse structured output: 2'])
  })
  it('unparsable via missing parsed_output (no exception) → logs stop_reason and content size, not just "unparsable"', async () => {
    const { client, calls } = fakeClient([
      { resolve: { parsed_output: null, stop_reason: 'end_turn', content: [{ type: 'text', text: 'not json enough' } as unknown as Anthropic.ContentBlock] } },
      { resolve: { parsed_output: { answer: 4 } } },
    ])
    setClientForTests(client)
    const r = await callStructured(base)
    expect(r.data).toEqual({ answer: 4 })
    expect(calls).toHaveLength(2)
    expect(logs[0].error).toBe('unparsable (attempt 1): no parsed_output; stop_reason=end_turn; content blocks=1, text chars=15')
  })
  it('refusal → throws without retry', async () => {
    const { client, calls } = fakeClient([{ resolve: { stop_reason: 'refusal' } }, { resolve: { parsed_output: { answer: 4 } } }])
    setClientForTests(client)
    await expect(callStructured(base)).rejects.toThrow(/refused/)
    expect(calls).toHaveLength(1)
    expect(logs).toEqual([expect.objectContaining({ ok: false, error: 'refusal' })])
  })
  it('max_tokens on the final message → throws a distinct truncation error without retry', async () => {
    const { client, calls } = fakeClient([{ resolve: { stop_reason: 'max_tokens' } }, { resolve: { parsed_output: { answer: 4 } } }])
    setClientForTests(client)
    await expect(callStructured(base)).rejects.toThrow(/truncated \(max_tokens\)/)
    expect(calls).toHaveLength(1)
    expect(logs).toEqual([expect.objectContaining({ ok: false, error: 'max_tokens' })])
  })
  it('max_tokens seen in the stream snapshot when parsing throws → truncation error, not a retry', async () => {
    // 실제 SDK 에서는 잘린 JSON 이 message_stop 에서 파싱 실패로 reject 되므로, 스냅샷의 stop_reason 으로 구분해야 한다
    const { client, calls } = fakeClient([
      { reject: new Anthropic.AnthropicError('Failed to parse structured output as JSON: Unexpected end'), snapshot: { stop_reason: 'max_tokens', usage: { input_tokens: 7, output_tokens: 48000, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } as Anthropic.Usage } },
      { resolve: { parsed_output: { answer: 4 } } },
    ])
    setClientForTests(client)
    await expect(callStructured(base)).rejects.toThrow(/truncated \(max_tokens\)/)
    expect(calls).toHaveLength(1)
    expect(logs).toEqual([expect.objectContaining({ ok: false, error: 'max_tokens', output: 48000 })])
  })
  it('APIError → rethrown as-is without retry', async () => {
    const apiErr = new Anthropic.APIError(500, { error: { type: 'api_error' } }, 'server exploded', new Headers())
    const { client, calls } = fakeClient([{ reject: apiErr }, { resolve: { parsed_output: { answer: 4 } } }])
    setClientForTests(client)
    await expect(callStructured(base)).rejects.toBe(apiErr)
    expect(calls).toHaveLength(1)
    expect(logs).toEqual([])
  })
  it('400 that is not the grammar-size error → rethrown as-is, no JSON fallback', async () => {
    const apiErr = new Anthropic.BadRequestError(400, { type: 'error', error: { type: 'invalid_request_error', message: 'messages: field required' } }, undefined, new Headers())
    const { client, calls } = fakeClient([{ reject: apiErr }, { resolve: { parsed_output: { answer: 4 } } }])
    setClientForTests(client)
    await expect(callStructured(base)).rejects.toBe(apiErr)
    expect(calls).toHaveLength(1)
    expect(logs).toEqual([])
  })
  it('non-SDK errors are rethrown without retry', async () => {
    const { client, calls } = fakeClient([{ reject: new TypeError('fetch failed') }, { resolve: { parsed_output: { answer: 4 } } }])
    setClientForTests(client)
    await expect(callStructured(base)).rejects.toThrow('fetch failed')
    expect(calls).toHaveLength(1)
  })
})
