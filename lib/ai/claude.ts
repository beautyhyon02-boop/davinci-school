import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import type { ZodType } from 'zod'
import { loadFixture } from './mock'

export const MODELS = { generate: 'claude-opus-5', review: 'claude-opus-5', grade: 'claude-sonnet-5' } as const
export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max'

export function isMock(): boolean {
  return process.env.AI_MOCK === '1' || !process.env.ANTHROPIC_API_KEY
}

export type CallInput<T> = {
  stage: number
  role: 'generate' | 'review'
  schema: ZodType<T>
  system: string            // 고정 규칙 블록 (캐시 대상)
  user: string              // 이번 호출의 가변 입력
  effort?: Effort
  fixtureKey: string
  log?: (entry: { model: string; input: number; output: number; cacheRead: number; ok: boolean; error?: string }) => Promise<void>
}
export type CallResult<T> = { data: T; usage: { input: number; output: number; cacheRead: number }; model: string }

let client: Anthropic | null = null
function getClient() { return (client ??= new Anthropic()) }

export async function callStructured<T>(inp: CallInput<T>): Promise<CallResult<T>> {
  if (isMock()) {
    const data = inp.schema.parse(loadFixture(inp.fixtureKey))
    await inp.log?.({ model: 'mock', input: 0, output: 0, cacheRead: 0, ok: true })
    return { data, usage: { input: 0, output: 0, cacheRead: 0 }, model: 'mock' }
  }
  const model = MODELS[inp.role]
  const request = {
    model,
    max_tokens: 16000,
    thinking: { type: 'adaptive' as const },
    output_config: { effort: inp.effort ?? 'high', format: zodOutputFormat(inp.schema) },
    system: [{ type: 'text' as const, text: inp.system, cache_control: { type: 'ephemeral' as const } }],
    messages: [{ role: 'user' as const, content: inp.user }],
  }
  for (let attempt = 1; attempt <= 2; attempt++) {
    const res = await getClient().messages.parse(request)
    const usage = { input: res.usage.input_tokens, output: res.usage.output_tokens, cacheRead: res.usage.cache_read_input_tokens ?? 0 }
    if (res.stop_reason === 'refusal') {
      await inp.log?.({ model, ...usage, ok: false, error: 'refusal' })
      throw new Error('AI refused the request')
    }
    if (res.parsed_output) {
      await inp.log?.({ model, ...usage, ok: true })
      return { data: res.parsed_output as T, usage, model }
    }
    await inp.log?.({ model, ...usage, ok: false, error: `unparsable (attempt ${attempt})` })
  }
  throw new Error('AI output could not be parsed after 2 attempts')
}
