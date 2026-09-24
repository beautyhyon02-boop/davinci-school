'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getSessionProfile } from '@/lib/auth/session'
import { STAGE_SCHEMAS, Materials, LessonDesign, type Stage } from '@/lib/studio/schemas'
import { isMaterialsPublicUrl } from '@/lib/studio/upload-rules'
import { canPublish, buildSnapshot, type DraftLessonQuizzes } from '@/lib/studio/publish'
import { canEditStage, downstreamResets, keyQuestionAfterStage2, normalizeKeyQuestion, KEY_QUESTION_LIMITS } from '@/lib/studio/edit-rules'
import { STAGE_ERRORS, stageNotes, type StageErrorCode, type StageStatus } from '@/lib/studio/stages'
import { createSupabaseRepo } from '@/lib/studio/repo'
import type { Issue } from '@/lib/studio/checks'
import { app } from '@/content/site'

const errors = app.studio.wizard.errors
const attachmentErrors = app.studio.attachments.errors

// 편집 게이트가 돌려준 STAGE_ERRORS 코드를 화면 문구로 옮긴다 — 문구는 content/site.ts 에서만 고친다.
const EDIT_ERROR_COPY: Record<StageErrorCode, string> = {
  [STAGE_ERRORS.PREV_NOT_ACCEPTED]: errors.prevNotAccepted,
  [STAGE_ERRORS.TOO_FEW_STANDARDS]: errors.tooFewStandards,
  [STAGE_ERRORS.NOTHING_TO_REVIEW]: errors.generic,
  [STAGE_ERRORS.ACCEPT_REQUIRES_REVIEW]: errors.generic,
  // 대주제 소개 저장(runThemeIntro 'save') 전용 — 세트 편집에서는 나오지 않는다
  [STAGE_ERRORS.INVALID_EDIT]: errors.generic,
  // 대주제 소개 전용(runThemeIntro 방어) — 세트 편집에서는 나오지 않는다
  [STAGE_ERRORS.INTRO_ACTION_NOT_SUPPORTED]: errors.generic,
}

async function assertAdmin() {
  const s = await getSessionProfile()
  if (s.role !== 'admin') throw new Error('forbidden')
  return s
}

type ActionResult = { ok: true } | { ok: false; error: string }
/** JSON 편집 저장 결과 — 성공하면 저장된 상태(자동 검사 메모 포함)를 돌려주어 화면이 그대로 반영한다. */
type SaveEditResult = { ok: true; status: StageStatus } | { ok: false; error: string }

// stage별 item_sets 컬럼 매핑 — lib/studio/repo.ts saveOutput과 동일해야 한다
// (2단계는 reconstruction_detail+reconstruction+learning_goals, 3단계는 unit_plan+lessons, 나머지는 단일 컬럼).
function stageColumns(stage: Stage, output: unknown): Record<string, unknown> {
  switch (stage) {
    case 2: {
      const o = output as { standards: unknown; reconstruction: string; learning_goals: unknown }
      return { reconstruction: o.reconstruction, reconstruction_detail: o.standards, learning_goals: o.learning_goals }
    }
    case 3: {
      const o = output as { unit_plan: unknown; lessons: unknown }
      return { unit_plan: o.unit_plan, lessons: o.lessons }
    }
    case 4:
      return { materials: (output as { materials: unknown }).materials }
    case 5:
      return { assessment: output }
    case 6:
      return { teacher_guide: output }
    case 7:
      return { notice_plan: output }
    default:
      return {}
  }
}

/**
 * 고친 출력의 자동 검사 메모([TS], 참고용). 문맥을 읽지 못하면 메모 없이 저장한다 — 메모는 아무것도 막지 않으므로
 * 저장을 실패시키지 않는다(대표 결정 2026-09-26: 검토는 참고).
 */
async function editNotes(supabase: Awaited<ReturnType<typeof createClient>>, setId: string, stage: Stage, output: unknown): Promise<Issue[] | undefined> {
  try {
    const ctx = await createSupabaseRepo(supabase).loadContext(setId)
    return stageNotes(ctx, stage, output)
  } catch (e) {
    console.error('[studio] edit notes failed', { setId, stage, err: e })
    return undefined
  }
}

/**
 * 2~7단계 출력을 관리자가 JSON으로 직접 수정해 저장한다. zod로 검증 후 저장하고 상태를 generated(model:'edited')로 되돌린다
 * (고친 출력의 자동 검사 메모를 함께 남긴다 — [확인]은 막지 않는다).
 * 생성과 같은 확정 게이트를 먼저 적용하고(canEditStage), 저장에 성공하면 이 단계를 근거로 삼은 하위 단계(n+1..7)를
 * idle 로 되돌린다 — 그러지 않으면 낡은 근거 위의 출력이 accepted 로 남아 그대로 게시된다.
 */
export async function saveStageEdit(setId: string, stage: Stage, json: string): Promise<SaveEditResult> {
  await assertAdmin()

  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    return { ok: false, error: errors.invalidJson }
  }

  const schema = STAGE_SCHEMAS[stage]
  const r = schema.safeParse(parsed)
  if (!r.success) return { ok: false, error: errors.invalidShape(r.error.issues[0]?.message ?? r.error.message) }

  const supabase = await createClient()
  const { data: itemSet, error: fetchErr } = await supabase
    .from('item_sets')
    .select('theme_id, key_question, stage_status')
    .eq('id', setId)
    .single()
  if (fetchErr || !itemSet) return { ok: false, error: errors.saveFailed }

  const stageStatus = (itemSet.stage_status ?? {}) as Record<string, StageStatus>
  const prev = stageStatus[`stage${stage}`] ?? { state: 'idle', attempt: 0, updated_at: '' }

  const { count: standardCount } = await supabase
    .from('item_set_standards')
    .select('standard_id', { count: 'exact', head: true })
    .eq('item_set_id', setId)

  const gate = canEditStage({ stage, statuses: stageStatus, standardCount: standardCount ?? 0 })
  if (!gate.ok) return { ok: false, error: EDIT_ERROR_COPY[gate.code] }

  const columns = stageColumns(stage, r.data)
  // 2단계를 고치면 핵심질문 후보가 바뀐다 — 이미 고른 핵심질문이 새 후보에 없으면 함께 비운다
  // (관리자가 고쳐 쓴 핵심질문 — 옛 후보에도 없던 문장 — 은 그대로 둔다).
  if (stage === 2) {
    const candidates = (r.data as { key_question_candidates?: string[] }).key_question_candidates ?? []
    const previous = (prev.output as { key_question_candidates?: string[] } | undefined)?.key_question_candidates ?? []
    columns.key_question = keyQuestionAfterStage2(itemSet.key_question as string | null, candidates, previous)
  }
  const { error: updateErr } = await supabase.from('item_sets').update(columns).eq('id', setId)
  if (updateErr) return { ok: false, error: errors.saveFailed }

  const now = new Date().toISOString()
  const notes = await editNotes(supabase, setId, stage, r.data)
  const status: StageStatus = {
    state: 'generated',
    attempt: prev.attempt,
    output: r.data,
    updated_at: now,
    model: 'edited',
    ...(notes ? { notes } : {}),
  }
  const { error: rpcErr } = await supabase.rpc('set_stage_status', {
    p_item_set_id: setId,
    p_key: `stage${stage}`,
    p_value: status,
  })
  if (rpcErr) return { ok: false, error: errors.saveFailed }

  for (const reset of downstreamResets(stage, stageStatus, now)) {
    const { error: resetErr } = await supabase.rpc('set_stage_status', {
      p_item_set_id: setId,
      p_key: `stage${reset.stage}`,
      p_value: reset.status,
    })
    if (resetErr) return { ok: false, error: errors.saveFailed }
  }

  revalidatePath(`/admin/items/${itemSet.theme_id}/sets/${setId}`)
  return { ok: true, status }
}

/**
 * 2단계를 확인(accepted)한 뒤 세트의 key_question을 정한다. 화면은 후보를 고르면 그 문장을 수정 칸에 채우고, 관리자가 고친
 * 문장을 그대로 보낸다(대표 2026-09-26: 핵심질문 수정 칸) — 후보와 같을 필요는 없고 길이만 본다(normalizeKeyQuestion).
 */
export async function chooseKeyQuestion(setId: string, text: string): Promise<ActionResult> {
  await assertAdmin()
  const normalized = normalizeKeyQuestion(text)
  if (!normalized.ok) {
    return { ok: false, error: normalized.code === 'tooShort' ? errors.keyQuestionTooShort(KEY_QUESTION_LIMITS.min) : errors.keyQuestionTooLong(KEY_QUESTION_LIMITS.max) }
  }

  const supabase = await createClient()
  const { data: itemSet, error: fetchErr } = await supabase
    .from('item_sets')
    .select('theme_id, stage_status')
    .eq('id', setId)
    .single()
  if (fetchErr || !itemSet) return { ok: false, error: errors.saveFailed }

  const stageStatus = (itemSet.stage_status ?? {}) as Record<string, StageStatus>
  const stage2 = stageStatus.stage2
  const candidates = (stage2?.output as { key_question_candidates?: string[] } | undefined)?.key_question_candidates ?? []
  if (stage2?.state !== 'accepted' || candidates.length === 0) {
    return { ok: false, error: errors.keyQuestionInvalid }
  }

  const { error: updateErr } = await supabase.from('item_sets').update({ key_question: normalized.value }).eq('id', setId)
  if (updateErr) return { ok: false, error: errors.saveFailed }

  revalidatePath(`/admin/items/${itemSet.theme_id}/sets/${setId}`)
  return { ok: true }
}

type TargetKind = 'material' | 'lesson'

// target 형식은 lib/studio/upload-rules.ts validateUpload의 TARGET_RE와 맞춰야 한다.
function parseTarget(target: string): { kind: TargetKind; key: string } | null {
  const material = /^material:([A-Z])$/.exec(target)
  if (material) return { kind: 'material', key: material[1] }
  const lesson = /^lesson:([1-9][0-9]?)$/.exec(target)
  if (lesson) return { kind: 'lesson', key: lesson[1] }
  return null
}

/** materials/lessons jsonb 배열에서 target이 가리키는 항목을 찾아 images를 mutate한 뒤 재검증·저장한다. */
async function applyImages(setId: string, target: string, mutate: (images: string[]) => string[]): Promise<ActionResult> {
  const parsed = parseTarget(target)
  if (!parsed) return { ok: false, error: attachmentErrors.invalidTarget }
  const { kind, key } = parsed
  const column = kind === 'material' ? 'materials' : 'lessons'

  const supabase = await createClient()
  const { data: itemSet, error: fetchErr } = await supabase
    .from('item_sets')
    // 차시 검증(LessonDesign)은 unit_plan 과 함께 해야 하므로(평가 계획 ↔ 차시 배치 대조) 차시일 때는 unit_plan 도 읽는다
    .select(kind === 'material' ? 'theme_id, materials' : 'theme_id, lessons, unit_plan')
    .eq('id', setId)
    .single()
  if (fetchErr || !itemSet) return { ok: false, error: attachmentErrors.saveFailed }

  const row = itemSet as unknown as Record<string, unknown>
  const items = (row[column] as Record<string, unknown>[] | null) ?? []
  const idx = kind === 'material'
    ? items.findIndex((m) => m.id === key)
    : items.findIndex((l) => String(l.no) === key)
  if (idx === -1) return { ok: false, error: attachmentErrors.itemNotFound }

  const currentImages = (items[idx].images as string[] | undefined) ?? []
  const nextItems = items.map((it, i) => (i === idx ? { ...it, images: mutate(currentImages) } : it))

  const valid = kind === 'material'
    ? Materials.safeParse({ materials: nextItems }).success
    : LessonDesign.safeParse({ unit_plan: row.unit_plan, lessons: nextItems }).success
  if (!valid) return { ok: false, error: attachmentErrors.invalidShape }

  const { error: updateErr } = await supabase.from('item_sets').update({ [column]: nextItems }).eq('id', setId)
  if (updateErr) return { ok: false, error: attachmentErrors.saveFailed }

  revalidatePath(`/admin/items/${row.theme_id}/sets/${setId}`)
  return { ok: true }
}

/** 업로드된 이미지 URL을 자료(material:<ID>) 또는 차시(lesson:<no>)에 첨부한다. */
export async function attachImage(setId: string, target: string, url: string): Promise<ActionResult> {
  await assertAdmin()
  try {
    new URL(url)
  } catch {
    return { ok: false, error: attachmentErrors.invalidUrl }
  }
  // 업로드 라우트가 반환한 materials 버킷 공개 URL만 허용한다 — 임의 외부 URL 첨부 방지.
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!supabaseUrl || !isMaterialsPublicUrl(url, supabaseUrl)) {
    return { ok: false, error: attachmentErrors.invalidUrl }
  }
  return applyImages(setId, target, (images) => (images.includes(url) ? images : [...images, url]))
}

/** 자료·차시에서 이미지 URL을 제거한다(스토리지 파일 자체는 지우지 않는다). */
export async function detachImage(setId: string, target: string, url: string): Promise<ActionResult> {
  await assertAdmin()
  return applyImages(setId, target, (images) => images.filter((u) => u !== url))
}

export type PublishResult = { ok: true; version: number } | { ok: false; blockers: string[] }

/**
 * 세트를 게시한다: canPublish로 막힌 게 없는지 확인 → 버전 스냅샷(item_set_versions)을 남기고
 * item_sets를 published/새 버전으로 갱신한다. 게시 후 수정은 새 버전이며, 이미 배정된 과제는
 * 배정 당시 버전을 유지한다(스펙 §4.3) — 그래서 스냅샷을 통째로 남겨 둔다.
 */
export async function publishItemSet(setId: string): Promise<PublishResult> {
  const session = await assertAdmin()
  const supabase = await createClient()

  const { data: itemSet, error: fetchErr } = await supabase
    .from('item_sets')
    .select('id, theme_id, subject, level, grade, version, reconstruction, reconstruction_detail, learning_goals, key_question, unit_plan, lessons, materials, assessment, teacher_guide, notice_plan, stage_status')
    .eq('id', setId)
    .single()
  if (fetchErr || !itemSet) return { ok: false, blockers: ['saveFailed'] }

  const { data: theme, error: themeErr } = await supabase
    .from('themes')
    .select('title, level, grade, intro, materials')
    .eq('id', itemSet.theme_id)
    .single()
  if (themeErr || !theme) return { ok: false, blockers: ['saveFailed'] }

  const { data: standardRows } = await supabase
    .from('item_set_standards')
    .select('standards(code, text, verified_at)')
    .eq('item_set_id', setId)
  const standardsFull = (standardRows ?? [])
    .map((r) => r.standards as unknown as { code: string; text: string; verified_at: string | null } | null)
    .filter((s): s is { code: string; text: string; verified_at: string | null } => !!s)
    .sort((a, b) => a.code.localeCompare(b.code))

  const stageStatus = (itemSet.stage_status ?? {}) as Record<string, StageStatus>
  const { ok, blockers } = canPublish({
    statuses: stageStatus,
    standards: standardsFull.map((s) => ({ code: s.code, verified: !!s.verified_at })),
    keyQuestion: itemSet.key_question,
    lessons: itemSet.lessons as DraftLessonQuizzes[] | null,
  })
  if (!ok) return { ok: false, blockers }

  // 다음 버전 번호는 item_sets.version이 아니라 item_set_versions의 최댓값+1로 정한다 —
  // item_sets.version은 기본값 1이라 "다음 버전 = 현재 버전+1"로 하면 첫 게시가 버전 2가 되고,
  // 또 item_set_versions insert 성공 후 item_sets update가 실패한 "고아 행"이 남아도
  // 다음 시도에서 여기서 최댓값을 다시 읽으므로 자연히 회복된다.
  const { data: lastVersion } = await supabase
    .from('item_set_versions')
    .select('version')
    .eq('item_set_id', setId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle()
  const version = (lastVersion?.version ?? 0) + 1

  const snapshot = buildSnapshot({
    theme: { title: theme.title, level: theme.level, grade: theme.grade, intro: theme.intro, materials: theme.materials },
    itemSet: { ...itemSet, stage_status: stageStatus },
    standards: standardsFull.map((s) => ({ code: s.code, text: s.text })),
    version,
  })

  const { error: insertErr } = await supabase
    .from('item_set_versions')
    .insert({ item_set_id: setId, version, snapshot, published_by: session.userId })
  if (insertErr) return { ok: false, blockers: ['saveFailed'] }

  const { error: updateErr } = await supabase
    .from('item_sets')
    .update({ status: 'published', version, published_at: new Date().toISOString() })
    .eq('id', setId)
  if (updateErr) return { ok: false, blockers: ['saveFailed'] }

  // themes RLS(auth_read_published_themes)는 status='published'인 대주제만 원장에게 보여준다.
  // 세트만 게시되고 대주제가 여전히 draft면 /teacher/items 목록에서 theme title 조인이 비어 보이므로,
  // 첫 게시 시 대주제도 함께 published로 승격한다(이미 published면 조건절 덕분에 아무 일도 안 한다).
  // 이 승격이 실패하면 원장 목록에 안 뜨므로 성공으로 보고하지 않는다.
  const { error: themeStatusErr } = await supabase
    .from('themes')
    .update({ status: 'published' })
    .eq('id', itemSet.theme_id)
    .neq('status', 'published')
  if (themeStatusErr) return { ok: false, blockers: ['saveFailed'] }

  revalidatePath(`/admin/items/${itemSet.theme_id}/sets/${setId}`)
  revalidatePath('/teacher/items')
  return { ok: true, version }
}
