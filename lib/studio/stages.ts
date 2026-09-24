import { STAGE_SCHEMAS, Review, type Stage, type ReviewT } from './schemas'
import { buildPrompt, buildReviewPrompt, type Ctx } from './prompts/stages'
import { staticIssues, type Issue } from './checks'
import { enrichOutput } from './enrich'
import { callStructured } from '@/lib/ai/claude'
import { MAX_ATTEMPTS, EXHAUSTED_ERROR } from './max-attempts'
import type { ZodType } from 'zod'

export { MAX_ATTEMPTS, EXHAUSTED_ERROR }

/** runStage/runThemeIntro가 던지는 '알려진' 오류의 코드. API 라우트가 이 코드로 400을 매핑한다(그 외는 500). */
export const STAGE_ERRORS = {
  PREV_NOT_ACCEPTED: 'stage-prev-not-accepted',
  TOO_FEW_STANDARDS: 'too-few-standards',
  NOTHING_TO_REVIEW: 'nothing-to-review',
  ACCEPT_REQUIRES_REVIEW: 'accept-requires-review',
  INVALID_EDIT: 'invalid-edit',
} as const
export type StageErrorCode = (typeof STAGE_ERRORS)[keyof typeof STAGE_ERRORS]

export class StageError extends Error {
  code: StageErrorCode
  constructor(code: StageErrorCode, message: string) {
    super(message)
    this.name = 'StageError'
    this.code = code
  }
}

export type StageStatus = {
  state: 'idle' | 'generated' | 'reviewed' | 'accepted' | 'failed'
  attempt: number
  output?: unknown
  review?: ReviewT
  /**
   * 생성 직후 돈 [TS] 정적 검사의 지적(참고용 '자동 검사 메모'). 대표 결정 2026-09-26: 세트 단계는 검토로 막지 않는다 —
   * 이 메모는 확인([확인]·게시)을 막지 않는다. 옛 행에는 없다(선택 필드).
   */
  notes?: Issue[]
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
// 대주제 소개(0단계)는 세트(item_sets)가 아니라 대주제(themes)에 저장된다 — 세트 여러 개가 같은 대주제 소개를 공유하기 때문.
export type ThemeLogRow = { themeId: string; stage: 0; role: 'generate' | 'review'; attempt: number; model: string; input: number; output: number; cacheRead: number; ok: boolean; issues?: unknown; error?: string }
export type ThemeRepo = {
  loadTheme(themeId: string): Promise<{ title: string; level: string; grade: number; subjects: string[]; intro_ideas: StageStatus | null }>
  saveThemeIntro(themeId: string, status: StageStatus, accepted?: { intro: string; subject_ideas: { subject: string; idea: string }[] }): Promise<void>
  log(entry: ThemeLogRow): Promise<void>
}

export type ThemeIntroAction = 'generate' | 'review' | 'accept' | 'edit'
export type ThemeIntroOutput = { intro: string; subject_ideas: { subject: string; idea: string }[] }

/**
 * 관리자가 직접 고친 소개(action 'edit')를 다듬고 검증한다. 앞뒤 공백을 걷어 낸 뒤 STAGE_SCHEMAS[0]으로 검사하고,
 * 대주제에 없는 과목의 아이디어는 받지 않는다. 실패하면 INVALID_EDIT(화면이 content/site.ts 문구로 바꿔 보여 준다).
 */
function parseIntroEdit(edit: unknown, subjects: string[]): ThemeIntroOutput {
  const raw = (edit ?? {}) as { intro?: unknown; subject_ideas?: unknown }
  const ideas = Array.isArray(raw.subject_ideas) ? raw.subject_ideas : []
  const candidate = {
    intro: typeof raw.intro === 'string' ? raw.intro.trim() : raw.intro,
    subject_ideas: ideas.map((i) => {
      const o = (i ?? {}) as { subject?: unknown; idea?: unknown }
      return { subject: o.subject, idea: typeof o.idea === 'string' ? o.idea.trim() : o.idea }
    }),
  }
  const r = STAGE_SCHEMAS[0].safeParse(candidate)
  if (!r.success) {
    const where = r.error.issues.map((i) => i.path.join('.') || '(root)').join(', ')
    throw new StageError(STAGE_ERRORS.INVALID_EDIT, `invalid edit: ${where}`)
  }
  const out = r.data as ThemeIntroOutput
  const outside = out.subject_ideas.filter((i) => !subjects.includes(i.subject)).map((i) => i.subject)
  if (outside.length > 0) throw new StageError(STAGE_ERRORS.INVALID_EDIT, `invalid edit: subject not in theme (${outside.join(', ')})`)
  return out
}

export async function runThemeIntro({ themeId, action, repo, edit }: { themeId: string; action: ThemeIntroAction; repo: ThemeRepo; edit?: unknown }) {
  const theme = await repo.loadTheme(themeId)
  const prev = theme.intro_ideas ?? { state: 'idle', attempt: 0, updated_at: '' }
  const now = () => new Date().toISOString()
  const ctx: Ctx = { theme: { title: theme.title, level: theme.level, grade: theme.grade, subjects: theme.subjects }, subject: '', standards: [], prior: {} }

  // 직접 수정: 검토 AI를 거치지 않고 관리자가 고친 내용을 그대로 확정한다(검토 한도에 닿아도 막히지 않도록).
  // 시도 횟수는 그대로 두고, 확정본은 themes.intro 에도 저장한다.
  if (action === 'edit') {
    const output = parseIntroEdit(edit, theme.subjects)
    const status: StageStatus = { state: 'accepted', attempt: prev.attempt, output, review: { pass: true, issues: [] }, model: 'manual', updated_at: now() }
    await repo.saveThemeIntro(themeId, status, output)
    return { status }
  }

  // 생성은 검토 한도에 닿은 뒤에도 언제든 다시 할 수 있다 — 한도 표지(EXHAUSTED_ERROR)는 안내일 뿐 잠금이 아니다.
  // 시도 횟수는 계속 늘고, 새 상태에는 error 가 없으므로 한도 표지는 지워진다.
  if (action === 'generate') {
    const attempt = prev.attempt + 1
    const p = buildPrompt(0, ctx)
    try {
      const r = await callStructured({ stage: 0, role: 'generate', schema: STAGE_SCHEMAS[0] as ZodType<unknown>, system: p.system, user: p.user,
        effort: 'high', fixtureKey: p.fixtureKey,
        log: e => repo.log({ themeId, stage: 0, role: 'generate', attempt, ...e }) })
      const status: StageStatus = { state: 'generated', attempt, output: r.data, model: r.model, updated_at: now() }
      await repo.saveThemeIntro(themeId, status); return { status }
    } catch (e) {
      const status: StageStatus = { state: 'failed', attempt, error: (e as Error).message, updated_at: now() }
      await repo.saveThemeIntro(themeId, status); return { status }
    }
  }

  const output = prev.output
  if (output === undefined) throw new StageError(STAGE_ERRORS.NOTHING_TO_REVIEW, 'nothing to review: generate first')

  if (action === 'review') {
    const p = buildReviewPrompt(0, ctx, output)
    let pending: ThemeLogRow | null = null
    const r = await callStructured({ stage: 0, role: 'review', schema: Review, system: p.system, user: p.user, fixtureKey: p.fixtureKey,
      log: async e => {
        const row: ThemeLogRow = { themeId, stage: 0, role: 'review', attempt: prev.attempt, ...e }
        if (e.ok) pending = row; else await repo.log(row)
      } })
    const review = r.data
    if (pending) await repo.log({ ...(pending as ThemeLogRow), issues: { pass: review.pass, issues: review.issues } })
    const exhausted = !review.pass && prev.attempt >= (MAX_ATTEMPTS[0] ?? 1)
    const status: StageStatus = { state: 'reviewed', attempt: prev.attempt, output, review, updated_at: now(),
      ...(prev.model ? { model: prev.model } : {}),
      ...(exhausted ? { error: EXHAUSTED_ERROR } : {}) }
    await repo.saveThemeIntro(themeId, status); return { status }
  }

  // accept
  if (prev.state !== 'reviewed' || !prev.review?.pass) throw new StageError(STAGE_ERRORS.ACCEPT_REQUIRES_REVIEW, 'accept requires a passing review')
  const status: StageStatus = { ...prev, state: 'accepted', updated_at: now() }
  const accepted = output as ThemeIntroOutput
  await repo.saveThemeIntro(themeId, status, accepted)
  return { status }
}

/**
 * staticIssues 를 부른다. 검사는 zod 를 통과한 v2 출력을 전제하므로, 형식이 다른 출력(v2 이전에 저장된 판, 손으로 고친 판)에서
 * 던지면 500 대신 '다시 생성' 메모 하나로 돌려준다.
 */
function staticCheck(stage: Stage, output: unknown, ctx: { standards: { code: string; text: string }[]; prior: Record<string, unknown>; theme?: { title: string } }): Issue[] {
  try {
    return staticIssues(stage, output, { standards: ctx.standards, prior: ctx.prior, ...(ctx.theme ? { theme: { title: ctx.theme.title } } : {}) })
  } catch (e) {
    // 옛 데이터가 아니라 checks.ts 회귀일 수도 있으므로 서버 로그에 흔적을 남긴다
    console.error('[studio] staticIssues threw', { stage, err: e })
    return [{ kind: 'other', detail: `출력 형식을 검사할 수 없음(${(e as Error).message}) — 다시 생성해야 합니다` }]
  }
}

/**
 * 저장소 문맥(loadContext)으로 한 단계 출력의 [TS] 자동 검사 메모를 만든다 — 관리자 JSON 편집(saveStageEdit) 뒤에도
 * 생성 직후와 같은 메모를 보여 주기 위해 둔다. prior 는 runStage 와 같이 앞 단계의 '확인(accepted)' 출력만 넣는다.
 */
export function stageNotes(ctx: Awaited<ReturnType<Repo['loadContext']>>, stage: Stage, output: unknown): Issue[] {
  const prior: Record<string, unknown> = { ...ctx.prior }
  for (let s = 0; s < stage; s++) {
    if (ctx.statuses?.[s]?.state === 'accepted' && ctx.outputs[s] !== undefined) prior[`stage${s}`] = ctx.outputs[s]
  }
  return staticCheck(stage, output, { ...ctx, prior })
}

/**
 * 세트 단계 실행(대표 결정 2026-09-26: 검토는 참고, [확인]으로 진행 — 마법사는 검토 때문에 멈추지 않는다).
 * - generate: 이전 단계가 확인(accepted)돼 있어야 한다. 생성 직후 [TS] 정적 검사를 돌려 그 지적을 status.notes(자동 검사 메모)로
 *   남긴다 — 모델 호출 없음, 막지 않음. 지적이 있으면 generation_log 에 model 'static' 행을 남긴다.
 * - review(선택, 'AI 검토 의견'): [TS] 메모를 새로 계산한 뒤 검토 AI 를 한 번 부르고 그 결과를 status.review 에 참고로 둔다.
 *   error·한도 표지를 세우지 않고 아무것도 막지 않는다.
 * - accept([확인]): 확인할 출력(생성됨·검토 의견 받음 상태)만 있으면 된다. 검토 통과는 요구하지 않는다.
 * 시도 횟수(attempt)는 기록용일 뿐 한도로 막지 않는다.
 */
export async function runStage({ itemSetId, stage, action, repo }: { itemSetId: string; stage: Stage; action: 'generate' | 'review' | 'accept'; repo: Repo }) {
  const ctx = await repo.loadContext(itemSetId)
  const prev = ctx.statuses?.[stage] ?? { state: 'idle', attempt: 0, updated_at: '' }
  // 세트는 소단원 하나 = 성취기준 2~6개(스펙 §1). 2단계부터는 성취기준이 없으면 프롬프트가 비고 원문 이탈 검사가 전부 걸리므로 먼저 막는다.
  if (stage >= 2 && ctx.standards.length < 2) throw new StageError(STAGE_ERRORS.TOO_FEW_STANDARDS, '세트에 성취기준이 2개 이상 연결되어야 합니다')
  // 이전 단계의 '확인(accepted)' 출력만 prior로 넘긴다 — 확인 전 출력은 다음 단계의 근거가 되지 않는다
  for (let s = 0; s < stage; s++) {
    if (ctx.statuses?.[s]?.state === 'accepted' && ctx.outputs[s] !== undefined) ctx.prior[`stage${s}`] = ctx.outputs[s]
  }
  const now = () => new Date().toISOString()
  // [TS] 지적이 있으면 generation_log 에 model 'static' 행으로 남긴다(검토 통과 여부가 아니라 메모 기록)
  const logStatic = async (attempt: number, notes: Issue[]) => {
    if (notes.length > 0) await repo.log({ itemSetId, stage, role: 'review', attempt, model: 'static', input: 0, output: 0, cacheRead: 0, ok: false, issues: { pass: false, issues: notes } })
  }

  if (action === 'generate') {
    // n단계 생성은 n-1단계가 확인(accepted)돼 있어야 한다(0단계는 예외)
    if (stage >= 1 && ctx.statuses?.[stage - 1]?.state !== 'accepted') throw new StageError(STAGE_ERRORS.PREV_NOT_ACCEPTED, `stage ${stage - 1} must be accepted first`)
    const attempt = prev.attempt + 1
    const p = buildPrompt(stage, ctx)
    let status: StageStatus
    try {
      const r = await callStructured({ stage, role: 'generate', schema: STAGE_SCHEMAS[stage] as ZodType<unknown>, system: p.system, user: p.user,
        effort: stage === 5 ? 'xhigh' : 'high', fixtureKey: p.fixtureKey,
        log: e => repo.log({ itemSetId, stage, role: 'generate', attempt, ...e }) })
      // 서버가 채우는 값(2단계 level_anchor, 5단계 min_competency)을 넣은 뒤 저장한다 — 모델 원출력이 아니라 이것이 검사·확인·게시의 대상
      const data = enrichOutput(stage, r.data, { standards: ctx.standards, prior: ctx.prior })
      await repo.saveOutput(itemSetId, stage, data)
      status = { state: 'generated', attempt, output: data, model: r.model, updated_at: now() }
    } catch (e) {
      status = { state: 'failed', attempt, error: (e as Error).message, updated_at: now() }
      await repo.saveStatus(itemSetId, stage, status); return { status }
    }
    const notes = staticCheck(stage, status.output, ctx)
    await logStatic(attempt, notes)
    status = { ...status, notes }
    await repo.saveStatus(itemSetId, stage, status); return { status }
  }

  const output = ctx.outputs[stage]
  if (output === undefined) throw new StageError(STAGE_ERRORS.NOTHING_TO_REVIEW, 'nothing to review: generate first')

  if (action === 'review') {
    // 선택 기능(AI 검토 의견): [TS] 메모를 새로 계산하고(JSON 편집 뒤에도 최신이 되게), 검토 AI 를 한 번 부른다. 결과는 참고일 뿐이다.
    const notes = staticCheck(stage, output, ctx)
    await logStatic(prev.attempt, notes)
    // 검토 결과({pass, issues})를 generation_log.issues 에 남기기 위해, 성공한 호출의 로그 행은 검토 결과가 나온 뒤에 기록한다
    let pending: LogRow | null = null
    const p = buildReviewPrompt(stage, ctx, output)
    const r = await callStructured({ stage, role: 'review', schema: Review, system: p.system, user: p.user, fixtureKey: p.fixtureKey,
      log: async e => {
        const row: LogRow = { itemSetId, stage, role: 'review', attempt: prev.attempt, ...e }
        if (e.ok) pending = row; else await repo.log(row)
      } })
    const review = r.data
    if (pending) await repo.log({ ...(pending as LogRow), issues: { pass: review.pass, issues: review.issues } })
    // 이미 확인한 단계에서 의견만 다시 본 경우에는 확인 상태를 그대로 둔다(하위 단계의 근거가 풀리지 않게)
    const state = prev.state === 'accepted' ? 'accepted' : 'reviewed'
    const status: StageStatus = { state, attempt: prev.attempt, output, review, notes, updated_at: now(),
      ...(prev.model ? { model: prev.model } : {}) }
    await repo.saveStatus(itemSetId, stage, status); return { status }
  }

  // accept([확인]): 지금 화면에 보이는 출력(생성됨·검토 의견 받음)이 있으면 언제나 확인할 수 있다 — 검토 통과는 필요 없다.
  // 실패(failed)·준비 전(idle) 상태는 확인할 출력이 화면에 없으므로 받지 않는다.
  if (prev.state === 'failed' || prev.state === 'idle') throw new StageError(STAGE_ERRORS.NOTHING_TO_REVIEW, 'nothing to confirm: generate first')
  const status: StageStatus = { ...prev, output: prev.output ?? output, state: 'accepted', updated_at: now() }
  // 옛 행에 남은 한도 표지(EXHAUSTED_ERROR)는 확인하면서 지운다
  delete status.error
  await repo.saveStatus(itemSetId, stage, status); return { status }
}
