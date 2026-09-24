import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { z, type ZodType } from 'zod'
import { loadFixture } from './mock'

export const MODELS = { generate: 'claude-opus-5', review: 'claude-opus-5', grade: 'claude-sonnet-5' } as const
export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max'
/**
 * 출력 방식.
 * - 'structured': output_config.format(문법 제약 구조화 출력). SDK 가 parsed_output 을 채운다.
 * - 'json': 형식 제약 없이 시스템 프롬프트 끝에 JSON 스키마를 붙이고, 응답 텍스트에서 JSON 을 꺼내 zod 로 검증한다.
 *   스키마가 커서 API 가 "compiled grammar is too large"(400)로 거절하는 단계(3·5·6·7, lib/studio/stages.ts STAGE_OUTPUT_MODE)용.
 */
export type OutputMode = 'structured' | 'json'

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
  /** 기본 'structured'. 'structured'가 문법 크기 400으로 거절되면 같은 시도 안에서 'json'으로 자동 대체한다. */
  mode?: OutputMode
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

/**
 * 'structured'가 "compiled grammar is too large"로 거절된 스키마. 프로세스가 살아 있는 동안 이 스키마는 곧바로 JSON 모드로 보낸다
 * (같은 400 을 매번 한 번씩 헛되이 받지 않게). 스키마 객체 자체를 키로 쓴다(STAGE_SCHEMAS 의 값은 모듈 상수).
 */
let grammarFallback = new WeakSet<object>()
/** 테스트 전용. 자동 대체 기억을 지운다. */
export function resetGrammarFallbackForTests() { grammarFallback = new WeakSet() }

const GRAMMAR_TOO_LARGE = 'compiled grammar is too large'
function isGrammarTooLarge(e: unknown): boolean {
  if (!(e instanceof Anthropic.APIError) || e.status !== 400) return false
  let body = ''
  try { body = JSON.stringify(e.error ?? '') } catch { /* 순환 등 — 메시지만 본다 */ }
  return `${String(e.message ?? '')} ${body}`.toLowerCase().includes(GRAMMAR_TOO_LARGE)
}

export const JSON_MODE_INSTRUCTION = '다음 JSON 스키마에 맞는 JSON 객체 하나만 출력한다. 코드 펜스·설명 없이 JSON만.'
const schemaTextCache = new WeakMap<object, string>()
/**
 * JSON 모드 시스템 블록에 붙이는 스키마 텍스트. 모델이 쓰는 것은 schema.parse 의 '입력'이므로 io:'input' 으로 만든다.
 * 크기(2026-09-26 측정, 문자 수): 3단계 4,808 · 5단계 4,666 · 6단계 2,152 · 7단계 1,322 — 설명(description)이 없고 작아서 압축본은 두지 않는다.
 */
export function jsonSchemaText(schema: ZodType<unknown>): string {
  let t = schemaTextCache.get(schema)
  if (t === undefined) {
    t = JSON.stringify(z.toJSONSchema(schema, { io: 'input' }))
    schemaTextCache.set(schema, t)
  }
  return t
}

/** 로그·에러 메시지에 붙일 원인 요약. 요청 본문·키는 절대 포함하지 않는다. */
function briefMessage(e: unknown): string {
  return String((e as { message?: unknown } | undefined)?.message ?? e ?? '').replace(/\s+/g, ' ').trim().slice(0, 400)
}

const MAX_ATTEMPTS = 2
const MAX_TOKENS = 48000 // adaptive thinking 토큰이 max_tokens에 포함되므로 5단계(xhigh)를 감안해 넉넉히 잡는다
const RETRY_DELAY_MS = process.env.NODE_ENV === 'test' ? 0 : 1000

function usageOf(m: Pick<Anthropic.Message, 'usage'> | undefined) {
  return { input: m?.usage?.input_tokens ?? 0, output: m?.usage?.output_tokens ?? 0, cacheRead: m?.usage?.cache_read_input_tokens ?? 0 }
}

/** JSON 모드 응답 텍스트 → 검증된 값. 실패하면 사유를 담은 Error 를 던진다(로그에는 briefMessage 로 ≤400자). */
function parseJsonReply<T>(schema: ZodType<T>, text: string): T {
  const unfenced = text.trim().replace(/^```[a-zA-Z]*\s*/, '').replace(/\s*```$/, '')
  const a = unfenced.indexOf('{')
  const b = unfenced.lastIndexOf('}')
  if (a < 0 || b <= a) throw new Error(`no JSON object in reply (text chars=${text.length})`)
  let raw: unknown
  try {
    raw = JSON.parse(unfenced.slice(a, b + 1))
  } catch (e) {
    throw new Error(`invalid JSON: ${briefMessage(e)}`)
  }
  const r = schema.safeParse(raw)
  if (!r.success) {
    const issues = r.error.issues
    const head = issues.slice(0, 5).map(i => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ')
    throw new Error(`schema mismatch (${issues.length} issue(s)): ${head}`)
  }
  return r.data
}

type Usage = CallResult<unknown>['usage']
type Once<T> = { ok: true; data: T; usage: Usage } | { ok: false; detail: string; usage: Usage }

export async function callStructured<T>(inp: CallInput<T>): Promise<CallResult<T>> {
  if (isMock()) {
    const data = inp.schema.parse(loadFixture(inp.fixtureKey))
    await inp.log?.({ model: 'mock', input: 0, output: 0, cacheRead: 0, ok: true })
    return { data, usage: { input: 0, output: 0, cacheRead: 0 }, model: 'mock' }
  }
  const model = MODELS[inp.role]
  const blocks = Array.isArray(inp.system) ? inp.system : [inp.system]
  const effort = inp.effort ?? 'high'
  const buildRequest = (mode: OutputMode) => {
    // JSON 모드: 스키마 블록을 맨 뒤에 붙인다(캐시하지 않음). thinking·effort·첫 블록 캐시는 structured 와 같다.
    const texts = mode === 'json' ? [...blocks, `${JSON_MODE_INSTRUCTION}\n\n${jsonSchemaText(inp.schema as ZodType<unknown>)}`] : blocks
    return {
      model,
      max_tokens: MAX_TOKENS,
      thinking: { type: 'adaptive' as const },
      output_config: mode === 'json' ? { effort } : { effort, format: zodOutputFormat(inp.schema) },
      // 첫 블록만 캐시 브레이크포인트: 생성/검토가 같은 RULES 캐시 항목을 공유한다
      system: texts.map((text, i) => (i === 0
        ? { type: 'text' as const, text, cache_control: { type: 'ephemeral' as const } }
        : { type: 'text' as const, text })),
      messages: [{ role: 'user' as const, content: inp.user }],
    }
  }

  // 한 번 호출. 성공·'파싱 불가'는 값으로 돌려주고, 잘림·거절·API 오류는 던진다(재시도 없음).
  const once = async (mode: OutputMode): Promise<Once<T>> => {
    const stream = getClient().messages.stream(buildRequest(mode))
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
      if (e instanceof Anthropic.AnthropicError && !(e instanceof Anthropic.APIError)) return { ok: false, detail: briefMessage(e), usage }
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
    const content = Array.isArray(res.content) ? res.content : []
    const text = content.map(b => (b.type === 'text' ? b.text : '')).join('')
    if (mode === 'json') {
      try {
        return { ok: true, data: parseJsonReply(inp.schema, text), usage }
      } catch (e) {
        return { ok: false, detail: briefMessage(e), usage }
      }
    }
    if (res.parsed_output != null) return { ok: true, data: res.parsed_output as T, usage }
    // parsed_output이 없는데 예외도 안 남(SDK가 JSON은 얻었지만 못 채웠거나 형식이 비어 있음) — 텍스트 길이로 "JSON 없음"과 "스키마 불일치"를 가른다
    return { ok: false, detail: `no parsed_output; stop_reason=${res.stop_reason ?? 'unknown'}; content blocks=${content.length}, text chars=${text.length}`, usage }
  }

  let lastDetail = ''
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const mode: OutputMode = grammarFallback.has(inp.schema) ? 'json' : (inp.mode ?? 'structured')
    let r: Once<T>
    try {
      r = await once(mode)
    } catch (e) {
      if (mode !== 'structured' || !isGrammarTooLarge(e)) throw e
      // 문법이 너무 크다는 400 → 이 스키마는 앞으로 JSON 모드로. 같은 시도 안에서 곧바로 다시 부른다('파싱 불가' 시도로 세지 않음).
      grammarFallback.add(inp.schema)
      console.warn(`[ai] stage ${inp.stage} ${inp.role}: grammar-too-large → json`)
      await inp.log?.({ model, input: 0, output: 0, cacheRead: 0, ok: false, error: 'grammar-too-large → json' })
      r = await once('json')
    }
    if (r.ok) {
      await inp.log?.({ model, ...r.usage, ok: true })
      return { data: r.data, usage: r.usage, model }
    }
    lastDetail = r.detail
    await inp.log?.({ model, ...r.usage, ok: false, error: `unparsable (attempt ${attempt}): ${lastDetail}` })
    if (attempt < MAX_ATTEMPTS && RETRY_DELAY_MS > 0) await new Promise(done => setTimeout(done, RETRY_DELAY_MS))
  }
  throw new Error(`AI output could not be parsed after ${MAX_ATTEMPTS} attempts: ${lastDetail}`)
}
