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
  // 대주제 소개(0단계) 전용 — 2026-09-24 오너 결정으로 검토·확정 관문이 없어졌다. 'review'/'accept'가 오면 이 코드로 막는다.
  INTRO_ACTION_NOT_SUPPORTED: 'theme-intro-action-not-supported',
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

export type ThemeIntroAction = 'generate' | 'save'
export type ThemeIntroOutput = { intro: string; subject_ideas: { subject: string; idea: string }[] }

/**
 * 저장할 소개(action 'save': AI 초안을 고친 것이든 손으로 처음부터 쓴 것이든)를 다듬고 검증한다. 앞뒤 공백을 걷어 낸 뒤
 * STAGE_SCHEMAS[0]으로 검사하고, 대주제에 없는 과목의 아이디어는 받지 않는다. 실패하면 INVALID_EDIT(화면이
 * content/site.ts 문구로 바꿔 보여 준다) — 아무것도 저장하지 않는다.
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

/**
 * 대주제 소개(0단계)는 검토 관문이 없다(2026-09-24 오너 결정) — 배경 정보일 뿐 세트 품질을 좌우하는 관문이 아니기 때문이다.
 * 두 동작만 있다: 'generate'(AI 초안 한 번, 저장하지 않고 화면에만 채운다), 'save'(관리자가 고친/직접 쓴 내용을 검증해
 * 바로 확정 상태로 저장 — themes.intro_ideas 와 themes.intro 모두). 'review'/'accept'는 더는 없고, 혹시 들어오면
 * INTRO_ACTION_NOT_SUPPORTED 로 막는다(타입은 이미 두 동작만 허용하지만, API 라우트를 거치지 않고 부르는 코드를 대비한 방어).
 */
export async function runThemeIntro({ themeId, action, repo, edit }: { themeId: string; action: ThemeIntroAction; repo: ThemeRepo; edit?: unknown }) {
  if (action !== 'generate' && action !== 'save') {
    throw new StageError(STAGE_ERRORS.INTRO_ACTION_NOT_SUPPORTED, `대주제 소개는 생성·저장만 있습니다(검토·확정 관문 없음): ${action}`)
  }
  const theme = await repo.loadTheme(themeId)
  const prev = theme.intro_ideas ?? { state: 'idle', attempt: 0, updated_at: '' }
  const now = () => new Date().toISOString()

  // 저장: AI 초안을 고쳤든 처음부터 손으로 썼든 검증만 통과하면 바로 확정한다. 화면에 있는 초안과(대주제 과목 범위에서)
  // 글자 그대로 같고 그 초안이 AI가 만든 것이면(model이 'manual'이 아니면) 그 모델명을 남기고, 아니면 'manual'로 남긴다.
  // 초안에 대주제에 없는 과목의 아이디어가 섞여 있어도(예시 fixture) 화면은 대주제 과목만 저장하므로, 비교도 그 범위로 좁힌다.
  if (action === 'save') {
    const output = parseIntroEdit(edit, theme.subjects)
    const prevDraft = prev.output as ThemeIntroOutput | undefined
    const prevInScope = prevDraft && { intro: prevDraft.intro, subject_ideas: prevDraft.subject_ideas.filter((i) => theme.subjects.includes(i.subject)) }
    const unedited = prev.model !== undefined && prev.model !== 'manual' && prevInScope !== undefined
      && JSON.stringify(prevInScope) === JSON.stringify(output)
    const status: StageStatus = {
      state: 'accepted', attempt: prev.attempt, output,
      model: unedited ? prev.model : 'manual',
      review: { pass: true, issues: [] }, updated_at: now(),
    }
    await repo.saveThemeIntro(themeId, status, output)
    return { status }
  }

  // 생성(AI 초안): 몇 번을 다시 받아도 잠기지 않는다. 화면에 채워 보여 줄 뿐, 관리자가 [저장]을 눌러야 확정된다.
  const attempt = prev.attempt + 1
  const ctx: Ctx = { theme: { title: theme.title, level: theme.level, grade: theme.grade, subjects: theme.subjects }, subject: '', standards: [], prior: {} }
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

/**
 * staticIssues 를 부른다. 검사는 zod 를 통과한 v2 출력을 전제하므로, 형식이 다른 출력(v2 이전에 저장된 판, 손으로 고친 판)에서
 * 던지면 500 대신 '다시 생성' 이슈 하나로 돌려 검토 AI 호출 없이 반려한다.
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

export async function runStage({ itemSetId, stage, action, repo }: { itemSetId: string; stage: Stage; action: 'generate' | 'review' | 'accept'; repo: Repo }) {
  const ctx = await repo.loadContext(itemSetId)
  const prev = ctx.statuses?.[stage] ?? { state: 'idle', attempt: 0, updated_at: '' }
  // 세트는 소단원 하나 = 성취기준 2~6개(스펙 §1). 2단계부터는 성취기준이 없으면 프롬프트가 비고 원문 이탈 검사가 전부 걸리므로 먼저 막는다.
  if (stage >= 2 && ctx.standards.length < 2) throw new StageError(STAGE_ERRORS.TOO_FEW_STANDARDS, '세트에 성취기준이 2개 이상 연결되어야 합니다')
  // 이전 단계의 '확정(accepted)' 출력만 prior로 넘긴다 — 검토 실패·미검토 출력은 다음 단계의 근거가 되지 않는다
  for (let s = 0; s < stage; s++) {
    if (ctx.statuses?.[s]?.state === 'accepted' && ctx.outputs[s] !== undefined) ctx.prior[`stage${s}`] = ctx.outputs[s]
  }
  const now = () => new Date().toISOString()

  if (action === 'generate') {
    // [다음]을 눌러야 확정(스펙 §2): n단계 생성은 n-1단계가 accepted 여야 한다(0단계는 예외)
    if (stage >= 1 && ctx.statuses?.[stage - 1]?.state !== 'accepted') throw new StageError(STAGE_ERRORS.PREV_NOT_ACCEPTED, `stage ${stage - 1} must be accepted first`)
    const attempt = prev.attempt + 1
    const p = buildPrompt(stage, ctx)
    try {
      const r = await callStructured({ stage, role: 'generate', schema: STAGE_SCHEMAS[stage] as ZodType<unknown>, system: p.system, user: p.user,
        effort: stage === 5 ? 'xhigh' : 'high', fixtureKey: p.fixtureKey,
        log: e => repo.log({ itemSetId, stage, role: 'generate', attempt, ...e }) })
      // 서버가 채우는 값(2단계 level_anchor, 5단계 min_competency)을 넣은 뒤 저장한다 — 모델 원출력이 아니라 이것이 검토·확정·게시의 대상
      const data = enrichOutput(stage, r.data, { standards: ctx.standards, prior: ctx.prior })
      await repo.saveOutput(itemSetId, stage, data)
      const status: StageStatus = { state: 'generated', attempt, output: data, model: r.model, updated_at: now() }
      await repo.saveStatus(itemSetId, stage, status); return { status }
    } catch (e) {
      const status: StageStatus = { state: 'failed', attempt, error: (e as Error).message, updated_at: now() }
      await repo.saveStatus(itemSetId, stage, status); return { status }
    }
  }

  const output = ctx.outputs[stage]
  if (output === undefined) throw new StageError(STAGE_ERRORS.NOTHING_TO_REVIEW, 'nothing to review: generate first')

  if (action === 'review') {
    // [TS] 순수 검사가 먼저(스펙 §2): 걸리면 검토 AI를 부르지 않고 그 결과를 검토 결과로 저장한다(model 'static', ok false)
    const issues = staticCheck(stage, output, ctx)
    if (issues.length > 0) {
      const review: ReviewT = { pass: false, issues }
      await repo.log({ itemSetId, stage, role: 'review', attempt: prev.attempt, model: 'static', input: 0, output: 0, cacheRead: 0, ok: false, issues: review })
      const exhausted = prev.attempt >= (MAX_ATTEMPTS[stage] ?? 1)
      const status: StageStatus = { state: 'reviewed', attempt: prev.attempt, output, review, updated_at: now(),
        ...(prev.model ? { model: prev.model } : {}),
        ...(exhausted ? { error: EXHAUSTED_ERROR } : {}) }
      await repo.saveStatus(itemSetId, stage, status); return { status }
    }
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
    const exhausted = !review.pass && prev.attempt >= (MAX_ATTEMPTS[stage] ?? 1)
    const status: StageStatus = { state: 'reviewed', attempt: prev.attempt, output, review, updated_at: now(),
      ...(prev.model ? { model: prev.model } : {}),
      ...(exhausted ? { error: EXHAUSTED_ERROR } : {}) }
    await repo.saveStatus(itemSetId, stage, status); return { status }
  }

  // accept
  if (prev.state !== 'reviewed' || !prev.review?.pass) throw new StageError(STAGE_ERRORS.ACCEPT_REQUIRES_REVIEW, 'accept requires a passing review')
  const status: StageStatus = { ...prev, state: 'accepted', updated_at: now() }
  await repo.saveStatus(itemSetId, stage, status); return { status }
}
