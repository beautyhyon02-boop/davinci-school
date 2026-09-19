import { STAGE_SCHEMAS, Review, type Stage, type ReviewT } from './schemas'
import { buildPrompt, buildReviewPrompt, type Ctx } from './prompts/stages'
import { checkReconstructionFidelity } from './fidelity'
import { callStructured } from '@/lib/ai/claude'
import type { ZodType } from 'zod'

export type StageStatus = { state: 'idle' | 'generated' | 'reviewed' | 'accepted' | 'failed'; attempt: number; output?: unknown; review?: ReviewT; error?: string; updated_at: string }
export type Repo = {
  loadContext(itemSetId: string): Promise<Ctx & { outputs: Record<number, unknown>; statuses?: Record<number, StageStatus> }>
  saveOutput(itemSetId: string, stage: Stage, output: unknown): Promise<void>
  saveStatus(itemSetId: string, stage: Stage, status: StageStatus): Promise<void>
  log(entry: { itemSetId: string; stage: Stage; role: 'generate' | 'review'; attempt: number; model: string; input: number; output: number; cacheRead: number; ok: boolean; issues?: unknown; error?: string }): Promise<void>
}
const MAX_ATTEMPTS: Partial<Record<Stage, number>> = { 5: 3 }

export async function runStage({ itemSetId, stage, action, repo }: { itemSetId: string; stage: Stage; action: 'generate' | 'review' | 'accept'; repo: Repo }) {
  const ctx = await repo.loadContext(itemSetId)
  const prev = ctx.statuses?.[stage] ?? { state: 'idle', attempt: 0, updated_at: '' }
  // 이전 단계의 확정 출력만 prior로 넘긴다
  for (let s = 0; s < stage; s++) if (ctx.outputs[s] !== undefined) ctx.prior[`stage${s}`] = ctx.outputs[s]
  const now = () => new Date().toISOString()

  if (action === 'generate') {
    const attempt = prev.attempt + 1
    const p = buildPrompt(stage, ctx)
    try {
      const r = await callStructured({ stage, role: 'generate', schema: STAGE_SCHEMAS[stage] as ZodType<unknown>, system: p.system, user: p.user,
        effort: stage === 5 ? 'xhigh' : 'high', fixtureKey: p.fixtureKey,
        log: e => repo.log({ itemSetId, stage, role: 'generate', attempt, ...e }) })
      await repo.saveOutput(itemSetId, stage, r.data)
      const status: StageStatus = { state: 'generated', attempt, output: r.data, updated_at: now() }
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
    if (stage === 2) {
      const f = checkReconstructionFidelity((output as { reconstruction: string }).reconstruction, ctx.standards.map(s => s.text))
      if (!f.ok) review = { pass: false, issues: [{ kind: 'fidelity', detail: `원문에 없는 표현: ${f.unknownTokens.join(', ')}` }] }
    }
    if (!review) {
      const p = buildReviewPrompt(stage, ctx, output)
      const r = await callStructured({ stage, role: 'review', schema: Review, system: p.system, user: p.user, fixtureKey: p.fixtureKey,
        log: e => repo.log({ itemSetId, stage, role: 'review', attempt: prev.attempt, ...e }) })
      review = r.data
    }
    const exhausted = !review.pass && prev.attempt >= (MAX_ATTEMPTS[stage] ?? 1)
    const status: StageStatus = { state: 'reviewed', attempt: prev.attempt, output, review, updated_at: now(), ...(exhausted ? { error: '검토 반복 한도 도달 — 관리자가 직접 수정' } : {}) }
    await repo.saveStatus(itemSetId, stage, status); return { status }
  }

  // accept
  if (prev.state !== 'reviewed' || !prev.review?.pass) throw new Error('accept requires a passing review')
  const status: StageStatus = { ...prev, state: 'accepted', updated_at: now() }
  await repo.saveStatus(itemSetId, stage, status); return { status }
}
