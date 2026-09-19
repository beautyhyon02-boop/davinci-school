import { STAGE_SCHEMAS, Review, type Stage, type ReviewT } from './schemas'
import { buildPrompt, buildReviewPrompt, type Ctx } from './prompts/stages'
import { checkReconstructionFidelity } from './fidelity'
import { callStructured } from '@/lib/ai/claude'
import type { ZodType } from 'zod'

export type StageStatus = {
  state: 'idle' | 'generated' | 'reviewed' | 'accepted' | 'failed'
  attempt: number
  output?: unknown
  review?: ReviewT
  error?: string
  /** 출력을 만든 모델('mock'이면 fixture). UI가 가짜 출력임을 배지로 표시할 수 있게 둔다. */
  model?: string
  updated_at: string
}
export type LogRow = { itemSetId: string; stage: Stage; role: 'generate' | 'review'; attempt: number; model: string; input: number; output: number; cacheRead: number; ok: boolean; issues?: unknown; error?: string }
export type Repo = {
  loadContext(itemSetId: string): Promise<Ctx & { outputs: Record<number, unknown>; statuses?: Record<number, StageStatus> }>
  saveOutput(itemSetId: string, stage: Stage, output: unknown): Promise<void>
  saveStatus(itemSetId: string, stage: Stage, status: StageStatus): Promise<void>
  log(entry: LogRow): Promise<void>
}
const MAX_ATTEMPTS: Partial<Record<Stage, number>> = { 5: 3 }

export async function runStage({ itemSetId, stage, action, repo }: { itemSetId: string; stage: Stage; action: 'generate' | 'review' | 'accept'; repo: Repo }) {
  const ctx = await repo.loadContext(itemSetId)
  const prev = ctx.statuses?.[stage] ?? { state: 'idle', attempt: 0, updated_at: '' }
  // 세트는 소단원 하나 = 성취기준 2~6개(스펙 §1). 2단계부터는 성취기준이 없으면 프롬프트가 비고 원문 이탈 검사가 전부 걸리므로 먼저 막는다.
  if (stage >= 2 && ctx.standards.length < 2) throw new Error('세트에 성취기준이 2개 이상 연결되어야 합니다')
  // 이전 단계의 '확정(accepted)' 출력만 prior로 넘긴다 — 검토 실패·미검토 출력은 다음 단계의 근거가 되지 않는다
  for (let s = 0; s < stage; s++) {
    if (ctx.statuses?.[s]?.state === 'accepted' && ctx.outputs[s] !== undefined) ctx.prior[`stage${s}`] = ctx.outputs[s]
  }
  const now = () => new Date().toISOString()

  if (action === 'generate') {
    // [다음]을 눌러야 확정(스펙 §2): n단계 생성은 n-1단계가 accepted 여야 한다(0단계는 예외)
    if (stage >= 1 && ctx.statuses?.[stage - 1]?.state !== 'accepted') throw new Error(`stage ${stage - 1} must be accepted first`)
    const attempt = prev.attempt + 1
    const p = buildPrompt(stage, ctx)
    try {
      const r = await callStructured({ stage, role: 'generate', schema: STAGE_SCHEMAS[stage] as ZodType<unknown>, system: p.system, user: p.user,
        effort: stage === 5 ? 'xhigh' : 'high', fixtureKey: p.fixtureKey,
        log: e => repo.log({ itemSetId, stage, role: 'generate', attempt, ...e }) })
      await repo.saveOutput(itemSetId, stage, r.data)
      const status: StageStatus = { state: 'generated', attempt, output: r.data, model: r.model, updated_at: now() }
      await repo.saveStatus(itemSetId, stage, status); return { status }
    } catch (e) {
      const status: StageStatus = { state: 'failed', attempt, error: (e as Error).message, updated_at: now() }
      await repo.saveStatus(itemSetId, stage, status); return { status }
    }
  }

  const output = ctx.outputs[stage]
  if (output === undefined) throw new Error('nothing to review: generate first')

  if (action === 'review') {
    let review: ReviewT | null = null
    // 검토 결과({pass, issues})를 generation_log.issues 에 남기기 위해, 성공한 호출의 로그 행은 검토 결과가 나온 뒤에 기록한다
    let pending: LogRow | null = null
    if (stage === 2) {
      const f = checkReconstructionFidelity((output as { reconstruction: string }).reconstruction, ctx.standards.map(s => s.text))
      if (!f.ok) {
        review = { pass: false, issues: [{ kind: 'fidelity', detail: `원문에 없는 표현: ${f.unknownTokens.join(', ')}` }] }
        pending = { itemSetId, stage, role: 'review', attempt: prev.attempt, model: 'local-fidelity', input: 0, output: 0, cacheRead: 0, ok: true }
      }
    }
    if (!review) {
      const p = buildReviewPrompt(stage, ctx, output)
      const r = await callStructured({ stage, role: 'review', schema: Review, system: p.system, user: p.user, fixtureKey: p.fixtureKey,
        log: async e => {
          const row: LogRow = { itemSetId, stage, role: 'review', attempt: prev.attempt, ...e }
          if (e.ok) pending = row; else await repo.log(row)
        } })
      review = r.data
    }
    if (pending) await repo.log({ ...pending, issues: { pass: review.pass, issues: review.issues } })
    const exhausted = !review.pass && prev.attempt >= (MAX_ATTEMPTS[stage] ?? 1)
    const status: StageStatus = { state: 'reviewed', attempt: prev.attempt, output, review, updated_at: now(),
      ...(prev.model ? { model: prev.model } : {}),
      ...(exhausted ? { error: '검토 반복 한도 도달 — 관리자가 직접 수정' } : {}) }
    await repo.saveStatus(itemSetId, stage, status); return { status }
  }

  // accept
  if (prev.state !== 'reviewed' || !prev.review?.pass) throw new Error('accept requires a passing review')
  const status: StageStatus = { ...prev, state: 'accepted', updated_at: now() }
  await repo.saveStatus(itemSetId, stage, status); return { status }
}
