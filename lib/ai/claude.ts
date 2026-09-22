import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import type { ZodType } from 'zod'
import { loadFixture } from './mock'

export const MODELS = { generate: 'claude-opus-5', review: 'claude-opus-5', grade: 'claude-sonnet-5' } as const
export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max'

/**
 * 가짜 응답(fixture) 모드 판정.
 * - `AI_MOCK=1` → 항상 fixture (키가 있어도).
 * - 키 없음 + production 아님(개발·테스트) → fixture.
 * - 키 없음 + production → 에러. 실사용자에게 수학 fixture를 "생성 결과"로 보여 주지 않는다.
 */
export function isMock(): boolean {
  if (process.env.AI_MOCK === '1') return true
  if (process.env.ANTHROPIC_API_KEY) return false
  if (process.env.NODE_ENV === 'production') throw new Error('ANTHROPIC_API_KEY is not set')
  return true
}

export type LogEntry = { model: string; input: number; output: number; cacheRead: number; ok: boolean; error?: string }
export type CallInput<T> = {
  stage: number
  role: keyof typeof MODELS
  schema: ZodType<T>
  system: string | string[]  // 첫 블록 = 고정 규칙(캐시 대상). 뒤 블록(검토자 지시 등)은 캐시하지 않는다
  user: string               // 이번 호출의 가변 입력
  effort?: Effort
  fixtureKey: string
  log?: (entry: LogEntry) => Promise<void>
}
export type CallResult<T> = { data: T; usage: { input: number; output: number; cacheRead: number }; model: string }

// 실제 SDK 클라이언트 중 이 모듈이 쓰는 표면만 정의한다(테스트에서 가짜를 주입하기 위해).
// `client.messages.stream(params)` → `finalMessage()`는 output_config.format이 있으면 parsed_output을 가진 메시지를 돌려주고,
// JSON/zod 파싱 실패 시 AnthropicError(APIError 아님)로 reject 한다(lib/parser.js parseOutputFormat, helpers/zod.js).
type StreamLike = {
  on(event: 'streamEvent', listener: (event: Anthropic.MessageStreamEvent, snapshot: Anthropic.Message) => void): unknown
  finalMessage(): Promise<Anthropic.Message & { parsed_output: unknown }>
}
export type StructuredClient = { messages: { stream(params: Anthropic.MessageStreamParams): StreamLike } }

let client: StructuredClient | null = null
function getClient(): StructuredClient { return (client ??= new Anthropic()) }
/** 테스트 전용. 가짜 클라이언트를 주입한다(null이면 다음 호출부터 실제 Anthropic 클라이언트로 복귀). 운영 코드에서 호출 금지. */
export function setClientForTests(fake: StructuredClient | null) { client = fake }

const MAX_ATTEMPTS = 2
const MAX_TOKENS = 48000 // adaptive thinking 토큰이 max_tokens에 포함되므로 5단계(xhigh)를 감안해 넉넉히 잡는다
const RETRY_DELAY_MS = process.env.NODE_ENV === 'test' ? 0 : 1000

function usageOf(m: Pick<Anthropic.Message, 'usage'> | undefined) {
  return { input: m?.usage?.input_tokens ?? 0, output: m?.usage?.output_tokens ?? 0, cacheRead: m?.usage?.cache_read_input_tokens ?? 0 }
}

export async function callStructured<T>(inp: CallInput<T>): Promise<CallResult<T>> {
  if (isMock()) {
    const data = inp.schema.parse(loadFixture(inp.fixtureKey))
    await inp.log?.({ model: 'mock', input: 0, output: 0, cacheRead: 0, ok: true })
    return { data, usage: { input: 0, output: 0, cacheRead: 0 }, model: 'mock' }
  }
  const model = MODELS[inp.role]
  const blocks = Array.isArray(inp.system) ? inp.system : [inp.system]
  const request = {
    model,
    max_tokens: MAX_TOKENS,
    thinking: { type: 'adaptive' as const },
    output_config: { effort: inp.effort ?? 'high', format: zodOutputFormat(inp.schema) },
    // 첫 블록만 캐시 브레이크포인트: 생성/검토가 같은 RULES 캐시 항목을 공유한다
    system: blocks.map((text, i) => (i === 0
      ? { type: 'text' as const, text, cache_control: { type: 'ephemeral' as const } }
      : { type: 'text' as const, text })),
    messages: [{ role: 'user' as const, content: inp.user }],
  }
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const stream = getClient().messages.stream(request)
    // 파싱 실패로 finalMessage()가 reject 되어도 stop_reason·usage를 알 수 있도록 마지막 스냅샷을 잡아 둔다
    let snapshot: Anthropic.Message | undefined
    stream.on('streamEvent', (_event, s) => { snapshot = s })
    let res: Anthropic.Message & { parsed_output: unknown }
    try {
      res = await stream.finalMessage()
    } catch (e) {
      const usage = usageOf(snapshot)
      if (snapshot?.stop_reason === 'max_tokens') {
        await inp.log?.({ model, ...usage, ok: false, error: 'max_tokens' })
        throw new Error('AI output truncated (max_tokens)')
      }
      if (snapshot?.stop_reason === 'refusal') {
        await inp.log?.({ model, ...usage, ok: false, error: 'refusal' })
        throw new Error('AI refused the request')
      }
      // 파싱/검증 실패(AnthropicError이되 APIError가 아님) → 한 번 더 시도. API 오류는 SDK가 이미 429/5xx 재시도를 했으므로 그대로 던진다.
      if (e instanceof Anthropic.AnthropicError && !(e instanceof Anthropic.APIError)) {
        await inp.log?.({ model, ...usage, ok: false, error: `unparsable (attempt ${attempt})` })
        if (attempt < MAX_ATTEMPTS && RETRY_DELAY_MS > 0) await new Promise(r => setTimeout(r, RETRY_DELAY_MS))
        continue
      }
      throw e
    }
    const usage = usageOf(res)
    if (res.stop_reason === 'refusal') {
      await inp.log?.({ model, ...usage, ok: false, error: 'refusal' })
      throw new Error('AI refused the request')
    }
    if (res.stop_reason === 'max_tokens') {
      await inp.log?.({ model, ...usage, ok: false, error: 'max_tokens' })
      throw new Error('AI output truncated (max_tokens)')
    }
    if (res.parsed_output != null) {
      await inp.log?.({ model, ...usage, ok: true })
      return { data: res.parsed_output as T, usage, model }
    }
    await inp.log?.({ model, ...usage, ok: false, error: `unparsable (attempt ${attempt})` })
  }
  throw new Error(`AI output could not be parsed after ${MAX_ATTEMPTS} attempts`)
}
