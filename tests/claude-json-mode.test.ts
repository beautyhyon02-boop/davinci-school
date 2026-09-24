import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import { z } from 'zod'
import Anthropic from '@anthropic-ai/sdk'
import { callStructured, setClientForTests, resetGrammarFallbackForTests, jsonSchemaText, JSON_MODE_INSTRUCTION, type StructuredClient, type LogEntry } from '@/lib/ai/claude'
import { STAGE_OUTPUT_MODE } from '@/lib/studio/stages'
import { STAGE_SCHEMAS } from '@/lib/studio/schemas'

// JSON 모드(output_config.format 없이 스키마를 프롬프트에 붙이고 텍스트를 zod 로 검증)와
// 'compiled grammar is too large'(400) → JSON 모드 자동 대체를 가짜 클라이언트로 검증한다.
type Msg = Anthropic.Message & { parsed_output: unknown }
type Step = { resolve: Partial<Msg> } | { reject: Error }

function msg(p: Partial<Msg>): Msg {
  return { id: 'm', type: 'message', role: 'assistant', model: 'claude-opus-5', content: [], stop_reason: 'end_turn', stop_sequence: null,
    usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 3, cache_creation_input_tokens: 0 }, parsed_output: null, ...p } as unknown as Msg
}
const text = (t: string): Partial<Msg> => ({ content: [{ type: 'thinking', thinking: '…', signature: 's' } as unknown as Anthropic.ContentBlock, { type: 'text', text: t } as unknown as Anthropic.ContentBlock] })

function fakeClient(steps: Step[]) {
  const calls: Anthropic.MessageStreamParams[] = []
  const client: StructuredClient = {
    messages: {
      stream(params) {
        calls.push(params)
        const step = steps.shift()
        if (!step) throw new Error('fake: no more steps')
        return {
          on() { return this },
          async finalMessage() {
            if ('resolve' in step) return msg(step.resolve)
            throw step.reject
          },
        }
      },
    },
  }
  return { client, calls }
}
// 실제 SDK 가 만드는 모양: APIError.generate(400, 본문JSON, …) → BadRequestError, message = "400 {본문}"
const grammarErr = () => new Anthropic.BadRequestError(400, { type: 'error', error: { type: 'invalid_request_error',
  message: 'The compiled grammar is too large, which would cause performance issues. Simplify your tool schemas or reduce the number of strict tools.' } }, undefined, new Headers())

const env = process.env as Record<string, string | undefined>
let saved: Record<string, string | undefined>
beforeAll(() => { saved = { AI_MOCK: env.AI_MOCK, ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY }; env.AI_MOCK = ''; env.ANTHROPIC_API_KEY = 'test-key-not-real' })
afterAll(() => { env.AI_MOCK = saved.AI_MOCK; env.ANTHROPIC_API_KEY = saved.ANTHROPIC_API_KEY; setClientForTests(null); resetGrammarFallbackForTests() })
let logs: LogEntry[]
beforeEach(() => { logs = []; resetGrammarFallbackForTests(); vi.spyOn(console, 'warn').mockImplementation(() => {}) })
const log = async (e: LogEntry) => { logs.push(e) }
const schema = z.object({ answer: z.number(), note: z.string().min(2) })
const base = { stage: 3, role: 'generate' as const, schema, system: ['rules', 'extra'], user: 'u', fixtureKey: 'unused', log }

describe('callStructured JSON mode', () => {
  it('sends no output_config.format; appends the schema block last; keeps thinking/effort/first-block cache; parses a fenced reply', async () => {
    const { client, calls } = fakeClient([{ resolve: text('```json\n{"answer": 4, "note": "ok"}\n```') }])
    setClientForTests(client)
    const r = await callStructured({ ...base, mode: 'json', effort: 'xhigh' })
    expect(r.data).toEqual({ answer: 4, note: 'ok' })
    expect(r.usage).toEqual({ input: 10, output: 5, cacheRead: 3 })
    const req = calls[0]
    expect(req.output_config).toEqual({ effort: 'xhigh' })
    expect(req.thinking).toEqual({ type: 'adaptive' })
    expect(req.max_tokens).toBe(48000)
    const sys = req.system as Anthropic.TextBlockParam[]
    expect(sys).toHaveLength(3)
    expect(sys[0]).toEqual({ type: 'text', text: 'rules', cache_control: { type: 'ephemeral' } })
    expect(sys[1]).toEqual({ type: 'text', text: 'extra' })
    expect(sys[2].cache_control).toBeUndefined()
    expect(sys[2].text.startsWith(JSON_MODE_INSTRUCTION)).toBe(true)
    expect(sys[2].text).toContain(jsonSchemaText(schema))
    expect(JSON.parse(jsonSchemaText(schema)).properties.answer.type).toBe('number')
    expect(logs).toEqual([{ model: 'claude-opus-5', input: 10, output: 5, cacheRead: 3, ok: true }])
  })
  it('extracts the object from surrounding prose (first { to last })', async () => {
    const { client } = fakeClient([{ resolve: text('여기 있습니다:\n{"answer": 1, "note": "{괄호}"}\n끝.') }])
    setClientForTests(client)
    expect((await callStructured({ ...base, mode: 'json' })).data).toEqual({ answer: 1, note: '{괄호}' })
  })
  it('zod mismatch → logs "unparsable (attempt 1): …" → retries once → success', async () => {
    const { client, calls } = fakeClient([{ resolve: text('{"answer": "four", "note": "ok"}') }, { resolve: text('{"answer": 4, "note": "ok"}') }])
    setClientForTests(client)
    const r = await callStructured({ ...base, mode: 'json' })
    expect(r.data).toEqual({ answer: 4, note: 'ok' })
    expect(calls).toHaveLength(2)
    expect(logs[0].ok).toBe(false)
    expect(logs[0].error).toMatch(/^unparsable \(attempt 1\): schema mismatch \(1 issue\(s\)\): answer: /)
    expect(logs[1].ok).toBe(true)
  })
  it('parse failure twice → throws after 2 attempts with the zod/JSON message (≤400 chars in the log)', async () => {
    const { client, calls } = fakeClient([{ resolve: text('{"answer": 4, "note": ') }, { resolve: text('{"answer": 4, "note": "x"}') }])
    setClientForTests(client)
    await expect(callStructured({ ...base, mode: 'json' })).rejects.toThrow(/2 attempts: schema mismatch \(1 issue\(s\)\): note: /)
    expect(calls).toHaveLength(2)
    expect(logs[0].error).toMatch(/^unparsable \(attempt 1\): (invalid JSON|no JSON object)/)
    expect(logs[1].error).toMatch(/^unparsable \(attempt 2\): schema mismatch/)
    for (const l of logs) expect(l.error!.length).toBeLessThanOrEqual('unparsable (attempt 1): '.length + 400)
  })
  it('no text at all → unparsable with a clear reason', async () => {
    const { client } = fakeClient([{ resolve: { content: [] } }, { resolve: text('{"answer": 4, "note": "ok"}') }])
    setClientForTests(client)
    await callStructured({ ...base, mode: 'json' })
    expect(logs[0].error).toBe('unparsable (attempt 1): no JSON object in reply (text chars=0)')
  })
  it('max_tokens in JSON mode → truncation error, no retry', async () => {
    const { client, calls } = fakeClient([{ resolve: { ...text('{"answer": 4'), stop_reason: 'max_tokens' } }, { resolve: text('{}') }])
    setClientForTests(client)
    await expect(callStructured({ ...base, mode: 'json' })).rejects.toThrow(/truncated \(max_tokens\)/)
    expect(calls).toHaveLength(1)
  })
})

describe('grammar-too-large → JSON fallback', () => {
  it('structured 400 "compiled grammar is too large" → JSON mode within the same attempt → success (not counted as unparsable)', async () => {
    const { client, calls } = fakeClient([{ reject: grammarErr() }, { resolve: text('{"answer": 4, "note": "ok"}') }])
    setClientForTests(client)
    const r = await callStructured(base) // mode 생략 = structured
    expect(r.data).toEqual({ answer: 4, note: 'ok' })
    expect(calls).toHaveLength(2)
    expect(calls[0].output_config?.format?.type).toBe('json_schema')
    expect(calls[1].output_config).toEqual({ effort: 'high' })
    expect(logs.map(l => [l.ok, l.error])).toEqual([[false, 'grammar-too-large → json'], [true, undefined]])
  })
  it('fallback then a parse failure still gets its one retry (in JSON mode)', async () => {
    const { client, calls } = fakeClient([{ reject: grammarErr() }, { resolve: text('nope') }, { resolve: text('{"answer": 4, "note": "ok"}') }])
    setClientForTests(client)
    const r = await callStructured(base)
    expect(r.data).toEqual({ answer: 4, note: 'ok' })
    expect(calls).toHaveLength(3)
    expect(calls[2].output_config?.format).toBeUndefined()
    expect(logs.map(l => l.error)).toEqual(['grammar-too-large → json', 'unparsable (attempt 1): no JSON object in reply (text chars=4)', undefined])
  })
  it('sticky per schema: the next call with the same schema skips the structured request; other schemas are unaffected', async () => {
    const other = z.object({ answer: z.number() })
    const { client, calls } = fakeClient([
      { reject: grammarErr() }, { resolve: text('{"answer": 4, "note": "ok"}') },
      { resolve: text('{"answer": 5, "note": "ok"}') },
      { resolve: { parsed_output: { answer: 6 } } },
    ])
    setClientForTests(client)
    await callStructured(base)
    const r2 = await callStructured(base)
    expect(r2.data).toEqual({ answer: 5, note: 'ok' })
    expect(calls).toHaveLength(3)
    expect(calls[2].output_config?.format).toBeUndefined()
    const r3 = await callStructured({ ...base, schema: other })
    expect(r3.data).toEqual({ answer: 6 })
    expect(calls[3].output_config?.format?.type).toBe('json_schema')
  })
  it('grammar 400 in JSON mode is not retried in a loop — it is rethrown', async () => {
    const err = grammarErr()
    const { client, calls } = fakeClient([{ reject: err }, { resolve: text('{}') }])
    setClientForTests(client)
    await expect(callStructured({ ...base, mode: 'json' })).rejects.toBe(err)
    expect(calls).toHaveLength(1)
  })
})

describe('stage defaults and schema size', () => {
  it('stages 3·5·6·7 generate in JSON mode; 0·1·2·4 structured', () => {
    expect(STAGE_OUTPUT_MODE).toEqual({ 0: 'structured', 1: 'structured', 2: 'structured', 3: 'json', 4: 'structured', 5: 'json', 6: 'json', 7: 'json' })
  })
  it('JSON-schema text for the JSON-mode stages stays small (prompt cost guard, < 25k chars)', () => {
    for (const s of [3, 5, 6, 7] as const) {
      const t = jsonSchemaText(STAGE_SCHEMAS[s] as z.ZodType<unknown>)
      expect(t.length).toBeGreaterThan(500)
      expect(t.length).toBeLessThan(25_000)
    }
  })
})
