import type { z } from 'zod'
import { checkReconstructionFidelity, tokensFoundIn } from './fidelity'
import { levelRefFor } from './level-map'
import { structureIssues, kindFamily, sessionPlacementIssues, isAssessmentSession, lessonAssessments, ESSAY_MIN_MINUTES } from './assessment-structure'
import type { Stage, ReviewKind, Reconstruction, LessonDesign, Materials, Assessment, TeacherGuide, NoticePlan } from './schemas'
import { QUIZ_SHORT_ONLY, isShortQuiz, quizLevelSpreadOk } from './schemas'
import { titleHasSourceMarker, usedMaterialIds, mentionedMaterialIds, MAX_SET_MATERIALS } from './materials'
import { sortScale, zeroStep } from './scale'
import { COMPETENCIES } from './competency'

export type Issue = { kind: ReviewKind; detail: string }
export type CheckCtx = {
  standards: { code: string; text: string }[]
  prior: Record<string, unknown>
  /** 대주제(선택) — 2단계 재구성 문장에 대주제 상황 낱말이 섞였을 때 반려 사유를 알아보기 쉽게 적는 데만 쓴다(판정은 바꾸지 않는다). */
  theme?: { title: string }
  /**
   * 대주제 공유 자료 ID(A~Z, 오름차순 불필요). 3·5단계 [TS] 자문(공유 자료를 가리키지만 문항·활동지 어디도 안 쓴다)이 참조한다 — loadContext의
   * prior.shared_materials에서 온다(stages.ts staticCheck). 대표 결정 2026-09-28부터는 이 세트가 체크한 공동 자료만(item_sets.shared_material_ids).
   */
  sharedMaterialIds?: string[]
  /** 세트 과목(선택) — 영어 세트의 공동 자료 영어판 메모(S-영-09, englishLessonCitationIssues·englishItemCitationIssues)가 쓴다. 없으면 그 메모는 건너뛴다. */
  subject?: string
}
type ReconstructionT = z.infer<typeof Reconstruction>; type LessonDesignT = z.infer<typeof LessonDesign>; type MaterialsT = z.infer<typeof Materials>
type AssessmentT = z.infer<typeof Assessment>; type GuideT = z.infer<typeof TeacherGuide>; type NoticePlanT = z.infer<typeof NoticePlan>

const norm = (s: string) => s.replace(/[\s·,.]/g, '')
/** 부사만 다른 인접 척도 휴리스틱: 정도부사를 지운 뒤 같은 문장이면 참(스펙 §2.5 [TS]-9). */
const ADVERBS = /(매우|아주|다소|대체로|비교적|약간|조금|충분히|정확하게|정확히|적절하게|적절히|효과적으로|부분적으로|거의|상당히|명확하게|구체적으로)\s*/g
export const adverbOnlyDiff = (a: string, b: string) => norm(a.replace(ADVERBS, '')) === norm(b.replace(ADVERBS, '')) && norm(a) !== norm(b)

/**
 * 0점 서술이 무응답과 '썼지만 관련 없음(시도)'을 둘 다 말하는지. 낱말 그대로("무응답·시도")만 보면 풀어 쓴 서술
 * ("답을 쓰지 않았거나, 문장을 썼지만 …" — 2026-09-25 영어 세트 7건)을 놓치므로 풀어 쓴 꼴도 받는다.
 */
const NO_RESPONSE = /무응답|미응답|미작성|미제출|백지|빈\s?칸|아무것도|(쓰|적|작성하|답하|제출하)지\s*(않|못)|답(안)?이\s*없/
const ATTEMPT = /시도|일부|관련|무관|엉뚱|(썼|적었|작성했|답했|했|하였)(으나|지만|어도|는데)/
// 무응답 뒤에 '거나/또는'으로 다른 경우를 붙인 꼴("답을 쓰지 않았거나, 수치 정보 없이 품목 이름만 나열했다" — 2026-09-26 영어 세트 5건)도 시도를 구분한 것으로 본다.
const ALTERNATIVE = /(않았거나|않거나|없거나|못했거나|않은\s*경우(이거나|와)|또는)\s*,?\s*\S+/
export const zeroDistinguishesAttempt = (descriptor: string) => NO_RESPONSE.test(descriptor) && (ATTEMPT.test(descriptor) || ALTERNATIVE.test(descriptor))

/** 안내장 문장 규칙(부록 A N-01·02·05·12)의 기계 검사 부분. lib/classroom/notice-lint.ts(T8)가 학생별 안내장에도 같은 목록을 쓴다. */
export const NOTICE_FORBIDDEN: [RegExp, string][] = [
  [/못한다|못했다|못함|실패|모른다|모릅니다/, '부정 서술어(못한다/실패/모른다) 대신 "~하는 데 어려움이 있다"'],
  [/등수|석차|상위\s*\d+%|백분위|평균보다/, '등수·백분위·비교 표현 금지'],
  [/(매우 우수|보통|미흡)\s*[.!]?$/, '단독 평어로 문장을 끝내지 않음'],
]
/** 청유형 종결(N-12). lib/classroom/notice-lint.ts 도 같은 규칙을 쓴다. */
export const SUGGEST_ENDINGS = /(봅시다|하세요|해요|하기 바랍니다|보세요)[.!]?$/

/**
 * 원문에 없는 표현 가운데 대주제 제목의 낱말이 있으면(L-02: 특정 과제 상황 금지) 사유 앞에 무엇을 어디로 옮길지 적는다 —
 * 재생성하는 AI와 화면을 보는 관리자가 둘 다 "대주제 상황을 재구성 문장에서 빼야 한다"를 바로 알게 한다.
 */
function themeHint(unknownTokens: string[], ctx: CheckCtx): string {
  const title = ctx.theme?.title?.trim()
  if (!title) return ''
  const hits = tokensFoundIn(unknownTokens, title)
  return hits.length ? `대주제 상황(${hits.join(', ')})을 재구성 문장에 넣었음 — 학습 목표·차시에만 쓴다: ` : ''
}

function reconstructionIssues(o: ReconstructionT, ctx: CheckCtx): Issue[] {
  const issues: Issue[] = []
  const byCode = new Map(ctx.standards.map((s) => [s.code, s.text]))
  for (const s of o.standards) {
    const original = byCode.get(s.code)
    if (!original) { issues.push({ kind: 'fidelity', detail: `${s.code}: 세트에 없는 성취기준` }); continue }
    if (norm(original) !== norm(s.original_text)) issues.push({ kind: 'fidelity', detail: `${s.code}: 원문 불일치` })
    const sources = [original, ...s.merged_with.map((c) => byCode.get(c) ?? '')]
    const f = checkReconstructionFidelity(s.reconstructed_text, sources)
    if (!f.ok) issues.push({ kind: 'fidelity', detail: `${themeHint(f.unknownTokens, ctx)}${s.code}: 원문에 없는 표현 ${f.unknownTokens.join(', ')}` })
  }
  const all = checkReconstructionFidelity(o.reconstruction, ctx.standards.map((s) => s.text))
  if (!all.ok) issues.push({ kind: 'fidelity', detail: `${themeHint(all.unknownTokens, ctx)}통합 문장: 원문에 없는 표현 ${all.unknownTokens.join(', ')}` })
  return issues
}

/** 차시 자체의 활동지·퀴즈·발문 문장(공백 없이 잇지 않고 공백 하나로 이은 글) — mentionedMaterialIds로 "자료 X" 언급을 찾는 데 쓴다. */
function lessonOwnTexts(l: LessonCorpusLike): string {
  const texts: string[] = []
  for (const t of l.worksheet?.tasks ?? []) { if (t.prompt) texts.push(t.prompt); if (t.expected) texts.push(t.expected) }
  for (const q of l.formative_check?.quiz ?? []) { if (q.q) texts.push(q.q); if (q.answer) texts.push(q.answer); if (q.explanation) texts.push(q.explanation) }
  for (const q of l.teacher_script?.questions ?? []) { if (q.prompt) texts.push(q.prompt); if (q.expected_answer) texts.push(q.expected_answer); if (q.if_stuck) texts.push(q.if_stuck) }
  return texts.join(' ')
}
type LessonCorpusLike = {
  no: number; kind?: string; materials_used?: string[] | null
  worksheet?: { tasks?: { prompt?: string; expected?: string }[] | null } | null
  formative_check?: { quiz?: { q?: string; answer?: string; explanation?: string }[] | null } | null
  teacher_script?: { questions?: { prompt?: string; expected_answer?: string; if_stuck?: string }[] | null } | null
}

/**
 * [TS] 자문(kind other, 3·5단계 공용): 교수 차시가 대주제 공유 자료를 materials_used에 적었지만 문항도 이 차시의
 * 활동지·퀴즈·발문 문장도 실제로 쓰지 않는 경우 — 대주제가 공유한다는 이유만으로 무관한 자료를 끌어다 쓴 흔적이다
 * (2026-09-26 관찰: 영어 세트가 이 과목과 무관한 수학 표 A~D를 차시 materials_used에 그대로 옮겨 적음). 문항(items)을
 * 모르면(3단계 검토 시점에 아직 5단계가 없는 보통의 경우) 판단할 수 없으므로 건너뛴다 — 참고용 자문이라 확신 없이는 짚지 않는다.
 */
function sharedMaterialCitationIssues(lessons: LessonCorpusLike[], items: { materials_used?: string[] | null }[] | null | undefined, sharedIds: string[] | undefined): Issue[] {
  if (!sharedIds?.length || !Array.isArray(items) || items.length === 0) return []
  const usedByItems = new Set(items.flatMap((it) => it.materials_used ?? []))
  const issues: Issue[] = []
  for (const l of lessons) {
    if (isAssessmentSession(l)) continue
    for (const id of l.materials_used ?? []) {
      if (!sharedIds.includes(id) || usedByItems.has(id)) continue
      if (mentionedMaterialIds(lessonOwnTexts(l)).includes(id)) continue
      issues.push({ kind: 'other', detail: `${l.no}차시가 문항·활동지가 쓰지 않는 공유 자료 ${id}를 가리킴` })
    }
  }
  return issues
}

// ── S-영-09 공동 자료 영어판(대표 2026-09-29: "영어 세트의 표는 영어로") ─────────────────────────────────────
/** 영어 세트이고 체크한 공동 자료가 있는가 — 이때만 S-영-09 메모를 낸다(다른 과목은 공동 자료를 그대로 가리킨다). */
const englishSharedIds = (ctx: CheckCtx): string[] => (ctx.subject === '영어' ? (ctx.sharedMaterialIds ?? []) : [])
/** [TS] 메모 문구(S-영-09). */
export const KOREAN_SHARED_CITED = '영어 세트는 영어판(세트 자료)을 쓴다(S-영-09)'
/**
 * [TS] 참고 메모(kind other, 막지 않음) — S-영-09. 영어 세트의 차시가 한국어 공동 자료 ID를 직접 가리키면 차시와 ID를 적는다:
 * materials_used, 그리고 활동지·발문·퀴즈 문장 속 "자료 X" 언급("자료 X의 영어판"은 언급으로 세지 않는다 — materials.ts).
 */
function englishLessonCitationIssues(lessons: LessonCorpusLike[], ctx: CheckCtx): Issue[] {
  const shared = englishSharedIds(ctx)
  if (shared.length === 0) return []
  const issues: Issue[] = []
  for (const l of lessons) {
    const direct = [...new Set((l.materials_used ?? []).filter((id) => shared.includes(id)))]
    for (const id of direct) issues.push({ kind: 'other', detail: `${l.no}차시: 한국어 공동 자료 ${id}를 직접 가리킴(materials_used) — ${KOREAN_SHARED_CITED}` })
    const quizzes = l.formative_check?.quiz ?? []
    for (const [i, q] of quizzes.entries()) {
      const ids = [...new Set(mentionedMaterialIds([q.q, q.answer, q.explanation].filter(Boolean).join(' ')).filter((id) => shared.includes(id)))]
      for (const id of ids) issues.push({ kind: 'other', detail: `${l.no}차시 퀴즈 ${i + 1}: 한국어 공동 자료 ${id}를 직접 가리킴 — ${KOREAN_SHARED_CITED}` })
    }
    const taskTexts: string[] = []
    for (const t of l.worksheet?.tasks ?? []) taskTexts.push(t.prompt ?? '', t.expected ?? '')
    for (const q of l.teacher_script?.questions ?? []) taskTexts.push(q.prompt ?? '', q.expected_answer ?? '', q.if_stuck ?? '')
    const mentioned = [...new Set(mentionedMaterialIds(taskTexts.join(' ')).filter((id) => shared.includes(id) && !direct.includes(id)))]
    for (const id of mentioned) issues.push({ kind: 'other', detail: `${l.no}차시 활동지·발문: 한국어 공동 자료 ${id}를 직접 가리킴 — ${KOREAN_SHARED_CITED}` })
  }
  return issues
}
/** [TS] 참고 메모 — S-영-09. 영어 세트의 문항이 한국어 공동 자료 ID를 materials_used에 넣었으면 문항과 ID를 적는다. */
function englishItemCitationIssues(items: { materials_used?: string[] | null }[], ctx: CheckCtx): Issue[] {
  const shared = englishSharedIds(ctx)
  const issues: Issue[] = []
  for (const [i, it] of items.entries()) {
    for (const id of [...new Set((it.materials_used ?? []).filter((x) => shared.includes(x)))]) {
      issues.push({ kind: 'other', detail: `문항 ${i + 1}: 한국어 공동 자료 ${id}를 직접 가리킴(materials_used) — ${KOREAN_SHARED_CITED}` })
    }
  }
  return issues
}

const squashWs = (s: string) => s.replace(/\s+/g, '')
/** 수 하나(단위가 붙어도 된다: "6", "12개", "0.18")인 정답 표기면 그 수. */
const numberKey = (k: string) => /^(\d+(?:\.\d+)?)[^\d.]*$/.exec(squashWs(k))?.[1] ?? null
/**
 * 글(해설·힌트·수업 문장)이 정답 표기를 그대로 말하는가. 수는 한 글자라도 다른 수의 일부가 아닌 낱개로 나오면 말한 것으로 본다
 * ("그 총합은 항상 1이다" → 1, "…: 6으로 주어져 있다" → 6; "41·42"의 1은 아니다). 글자 표기는 두 글자 이상이 공백을 빼고 들어 있으면.
 * L-06 발문 힌트(compat.ts hintFor, fixture 검사)와 L-10 퀴즈 베끼기 [TS](quizCopySource)가 같은 판정을 쓴다.
 */
export function statesAnswer(text: string, key: string): boolean {
  const n = numberKey(key)
  if (n !== null) return new RegExp(`(?<![\\d.])${n.replace('.', '\\.')}(?![\\d.])`).test(text)
  const k = squashWs(key)
  return k.length >= 2 && squashWs(text).includes(k)
}

// ── L-10 퀴즈 베끼기(대표 2026-09-26: "퀴즈가 너무 쉬운 수준이 아닌지") ─────────────────────────────
/** [TS] 퀴즈 베끼기 사유(L-10). */
export const QUIZ_COPIED = '정답이 본문에 그대로 있음'
/** [TS] 퀴즈 수준 메모(L-10). 대표 결정: 수준이 없거나 고르지 않아도 막지 않는다 — zod 는 보지 않고 이 참고 메모만 남긴다. */
export const QUIZ_LEVEL_NOTE = '퀴즈 수준 표시(level_ref)가 없거나 D~E/C/B가 고르지 않음 — 3단계를 다시 생성하면 채워집니다'
// 조사·어미 한 겹과 묻는 말(무엇·몇·얼마·하는가 …), 어느 발문에나 나오는 말(자료·따르면)을 떼고 남은 두 글자 이상 낱말을 발문의 내용어로 본다.
const TAIL = /(으로|에서|에게|까지|부터|처럼|보다|이라|이며|해서|하여|하고|하는가|되는가|있는가|는가|인가|시오|은|는|이|가|을|를|의|에|로|와|과|도|만)$/
const ASKING = /^(무엇|어느|어떤|어디|누구|얼마|몇|다음|빈칸|들어갈|낱말|단답|알맞은|구하|쓰|자료|따르면)/
/** 퀴즈 발문의 내용어(중복 없이). */
export function questionStems(q: string): string[] {
  const out = new Set<string>()
  for (const raw of q.split(/[^가-힣A-Za-z0-9.]+/)) {
    const t = raw.replace(/\.+$/, '').replace(TAIL, '')
    if (t.length >= 2 && !ASKING.test(t)) out.add(t)
  }
  return [...out]
}
/**
 * 이 차시의 본문 문장 — [어디, 문장]. 수업 흐름(도입·전개·정리), 발문 대본(발문 + 예상 답, 막힐 때), 활동지(과제 + 기대 답), 사용 자료 본문(문장 단위).
 * 예상 답·기대 답이 짧으면(답 하나) 발문·과제와 한 문장으로 본다 — 퀴즈가 수업에서 물은 문항을 되풀이했는지 보려고. 길면(교사가 보는 인정 기준)
 * 발문과 떼고 절 단위로 나눈다 — 긴 기준 문장의 앞뒤 절에 흩어진 낱말이 우연히 겹치는 것을 베끼기로 보지 않으려고.
 */
type SourceUnit = [where: string, text: string]
/** 이보다 길면 예상 답·기대 답을 교사용 인정 기준으로 보고 절 단위로 나눈다. */
const SHORT_EXPECTED = 25
const CLAUSE = /(?<=[.!?])\s+|,\s+|\s—\s/
type LessonTextLike = {
  flow?: { intro?: string[] | null; main?: { activities?: string[] | null }[] | null; wrapup?: string[] | null } | null
  teacher_script?: { questions?: { prompt?: string; expected_answer?: string; if_stuck?: string }[] | null } | null
  worksheet?: { tasks?: { prompt?: string; expected?: string }[] | null } | null
  materials_used?: string[] | null
}
export function lessonSourceUnits(l: LessonTextLike, materials: { id: string; body?: string | null }[] = []): SourceUnit[] {
  const units: SourceUnit[] = []
  for (const t of [...(l.flow?.intro ?? []), ...(l.flow?.main ?? []).flatMap((m) => m.activities ?? []), ...(l.flow?.wrapup ?? [])]) units.push(['수업 흐름', t])
  const pair = (where: string, prompt = '', answer = '') => {
    if (answer.length <= SHORT_EXPECTED) { units.push([where, `${prompt} ${answer}`]); return }
    units.push([where, prompt])
    for (const c of answer.split(CLAUSE)) units.push([where, c])
  }
  for (const q of l.teacher_script?.questions ?? []) { pair('발문 대본', q.prompt, q.expected_answer); if (q.if_stuck) units.push(['발문 대본', q.if_stuck]) }
  for (const t of l.worksheet?.tasks ?? []) pair('활동지', t.prompt, t.expected)
  const used = new Set(l.materials_used ?? [])
  for (const m of materials) if (used.has(m.id) && m.body) for (const s of m.body.split(/(?<=[.!?])\s+|\n+/)) units.push([`자료 ${m.id}`, s])
  return units
}
/**
 * 퀴즈의 정답이 본문에 그대로 있는가(L-10: 자료·대본 문장을 옮겨 적으면 답이 되는 문항 금지). 정답 표기 하나가 통째로(statesAnswer)
 * 한 문장에 들어 있고 그 문장이 발문 내용어의 60% 이상(2개 이상)을 함께 담으면 — 발문을 그 문장에서 떼어 냈거나 수업에서 물은 문항을
 * 되풀이한 것이다 — 그 문장의 자리(수업 흐름·발문 대본·활동지·자료 X)를, 아니면 null. 용어만 같은 회상 문항(정답 낱말이 수업 흐름에
 * 나오는 것은 자연스럽다)은 발문이 그 문장을 옮기지 않았으면 걸지 않는다.
 */
export function quizCopySource(quiz: { q?: string; answer?: string }, units: SourceUnit[]): string | null {
  const stems = questionStems(quiz.q ?? '')
  const need = Math.max(2, Math.ceil(stems.length * 0.6))
  const keys = (quiz.answer ?? '').split('/').map((k) => k.trim()).filter(Boolean)
  for (const [where, text] of units) {
    if (!keys.some((k) => statesAnswer(text, k))) continue
    const flat = squashWs(text)
    if (stems.filter((s) => flat.includes(s)).length >= need) return where
  }
  return null
}
// ── L-13 정답 노출·활동지 되풀이(2026-10-01 영어 세트 실제 검토: 정답 "Bring your own cup"이 전개 문장에, "the survey"가 전개의
// "According to the survey"에, "plastic cups"가 발문 예상 답 "Forty percent of students chose plastic cups."와 활동지 기대 답에 그대로;
// 활동지 도전 과제와 퀴즈 3이 같은 문항. 종전 quizCopySource 는 발문 내용어가 그 문장에 60% 이상 겹칠 때만 짚어 "활동지" 하나만 잡았다) ──
/** 글자 비교용: 소문자, 공백·문장부호·기호 제거. */
const flatKey = (s: string) => s.toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '')
/** 이 글자 수(공백·부호 제외) 이하의 정답 표기("405"·"Ask"·"석유")는 어디에나 나오므로 그대로 들어 있는지 보지 않는다 — 빈칸 채운 문장(blankFilled)으로만 본다. */
export const EXPOSED_ANSWER_MIN = 4
/** 발문·과제의 빈칸 표시: ___, ＿, (   ), [  ], （ ）, □. */
const BLANK = /_{2,}|＿+|\(\s*\)|\[\s*\]|（\s*）|□+/
/** 퀴즈 발문에서 빈칸이 든 문장에 정답을 채운 글(비교용 flatKey). 빈칸이 없으면 null. */
export function blankFilled(stem: string, key: string): string | null {
  const sentences = stem.split(/(?<=[.!?。])\s+|\n+/).filter((s) => BLANK.test(s))
  if (sentences.length === 0) return null
  const filled = flatKey(sentences.map((s) => s.replace(new RegExp(BLANK.source, 'g'), () => ` ${key} `)).join(' '))
  return filled.length >= EXPOSED_ANSWER_MIN * 2 ? filled : null
}
/** 노출 검사 단위 — [어디, 글, 답 자리인가]. 답 자리 = 짧은 예상 답·기대 답(SHORT_EXPECTED 이하 — 교사용 인정 기준이 아니라 답 그 자체). */
type ExposureUnit = [where: string, text: string, answerSlot: boolean]
type LessonExposureLike = LessonTextLike & { formative_check?: { quiz?: { q?: string; answer?: string; explanation?: string }[] | null } | null }
export function lessonExposureUnits(l: LessonExposureLike, quizIndex: number): ExposureUnit[] {
  const units: ExposureUnit[] = []
  for (const t of l.flow?.intro ?? []) units.push(['도입', t, false])
  for (const [k, m] of (l.flow?.main ?? []).entries()) for (const t of m.activities ?? []) units.push([`전개 ${k + 1}단계`, t, false])
  for (const t of l.flow?.wrapup ?? []) units.push(['정리', t, false])
  for (const q of l.teacher_script?.questions ?? []) {
    if (q.prompt) units.push(['교사 발문', q.prompt, false])
    if (q.expected_answer) units.push(['교사 발문 예상 답', q.expected_answer, q.expected_answer.length <= SHORT_EXPECTED])
    if (q.if_stuck) units.push(['교사 발문 힌트', q.if_stuck, false])
  }
  for (const [k, t] of (l.worksheet?.tasks ?? []).entries()) {
    const no = (t as { no?: number }).no ?? k + 1
    if (t.prompt) units.push([`활동지 과제 ${no}`, t.prompt, false])
    if (t.expected) units.push([`활동지 기대 답 ${no}`, t.expected, t.expected.length <= SHORT_EXPECTED])
  }
  for (const [k, q] of (l.formative_check?.quiz ?? []).entries()) if (k !== quizIndex && q.explanation) units.push([`퀴즈 ${k + 1} 해설`, q.explanation, false])
  return units
}
/**
 * 가르친 개념·용어의 이름을 묻는 발문(무엇이라 하는가·부르는가, 어느/무슨 단계·차원·성질, "…단계는?"·"…성질은?", 용어, What is … called,
 * which stage/step, the term/name for). 종류·방법·type·kind 는 추론 발문("어떤 방법이 가장 효과적인가")에도 흔해 넣지 않는다. L-10 은 회상 문항이 가르친 낱말을 묻는 것을 허용하므로 그 용어가 수업 글에 있는 것은 노출로 보지 않는다 —
 * 이런 발문은 빈칸 채우기(blankFilled)와 종전 판정(quizCopySource)으로만 본다.
 */
const NAMING_STEM = /무엇이라(고)?\s*(하|부르)|(무슨|어느|어떤)\s*\S*\s*(단계|차원|성질|용어)|(단계|성질|차원|용어|이름)(은|는|인가|입니까)\s*\?|용어|\bcalled\b|\bwhich\s+(stage|step)\b|\bthe\s+(term|name)\s+for\b/i
export const isNamingStem = (q: string) => NAMING_STEM.test(q)
/**
 * 퀴즈 정답이 이 차시의 글에 그대로 적혀 있는가(L-13). 정답 표기(" / "로 나눈 것) 하나하나를 공백·대소문자·부호를 무시하고 찾는다:
 * 구(두 낱말 이상)는 도입·전개·정리·교사 발문(발문·예상 답·힌트)·활동지(과제·기대 답)·다른 퀴즈 해설 어디에 있어도, 낱말 하나(네 글자 이상)는
 * 답 자리(짧은 예상 답·기대 답)에 있을 때만 — 용어 하나가 수업 문장·해설에 나오는 것은 자연스럽다(L-10 회상 문항). 세 글자 이하("405"·"Ask")는
 * 발문의 빈칸을 채운 문장이 그대로 있을 때만(이 판정은 모든 정답에 적용). 발문 자체가 그 표기를 담은 것(갈래를 늘어놓고 고르게 하는 발문)과
 * 개념의 이름을 묻는 발문(isNamingStem)은 글자 노출을 보지 않는다. 찾은 자리와 그 표기를 돌려준다(없으면 null).
 */
export function quizAnswerExposure(quiz: { q?: string; answer?: string }, units: ExposureUnit[]): { where: string[]; key: string } | null {
  const keys = (quiz.answer ?? '').split('/').map((k) => k.trim()).filter(Boolean)
  const q = quiz.q ?? ''
  const stem = flatKey(q)
  const textual = !isNamingStem(q) && !keys.some((k) => flatKey(k).length >= EXPOSED_ANSWER_MIN && stem.includes(flatKey(k)))
  for (const key of keys) {
    const flat = flatKey(key)
    const phrase = key.split(/\s+/).length >= 2
    const filled = blankFilled(q, key)
    const where: string[] = []
    for (const [place, text, answerSlot] of units) {
      const ft = flatKey(text)
      const exposed = (textual && flat.length >= EXPOSED_ANSWER_MIN && (phrase || answerSlot) && ft.includes(flat)) || (filled !== null && ft.includes(filled))
      if (exposed && !where.includes(place)) where.push(place)
    }
    if (where.length) return { where, key }
  }
  return null
}
/** 퀴즈가 활동지 과제를 되풀이했을 때의 메모 문구(L-13). */
export const quizRepeatsWorksheetNote = (taskNo: number) => `활동지 과제 ${taskNo}번과 사실상 같음`
/** 비교용 낱말: 소문자, 조사 한 겹을 뗀 두 글자 이상 낱말(questionStems 와 같은 자르기, 묻는 말은 남긴다). */
function overlapTokens(text: string): Set<string> {
  const out = new Set<string>()
  for (const raw of text.toLowerCase().split(/[^가-힣a-z0-9.]+/)) {
    const t = raw.replace(/\.+$/, '').replace(TAIL, '')
    if (t.length >= 2) out.add(t)
  }
  return out
}
/** 이 비율 이상 낱말이 겹치면 사실상 같은 문항으로 본다. */
export const SAME_TASK_OVERLAP = 0.8
/**
 * 두 문장(퀴즈 발문·활동지 과제)이 사실상 같은가(L-13): 공백·대소문자·부호를 무시하고 같거나 한쪽(열 글자 이상)이 다른 쪽을 통째로 담거나,
 * 낱말(세 개 이상)이 긴 쪽 기준 80% 이상 겹치거나, 짧은 쪽(다섯 낱말 이상)이 거의 통째로 긴 쪽에 들어 있으면(긴 바꿔 쓰기).
 */
export function nearlySameTask(a: string, b: string): boolean {
  const fa = flatKey(a); const fb = flatKey(b)
  if (!fa || !fb) return false
  if (fa === fb) return true
  if (Math.min(fa.length, fb.length) >= 10 && (fa.includes(fb) || fb.includes(fa))) return true
  const ta = overlapTokens(a); const tb = overlapTokens(b)
  if (ta.size < 3 || tb.size < 3) return false
  let common = 0
  for (const t of ta) if (tb.has(t)) common++
  if (common / Math.max(ta.size, tb.size) >= SAME_TASK_OVERLAP) return true
  // 한쪽이 다른 쪽의 긴 바꿔 쓰기일 때 — 짧은 쪽(다섯 낱말 이상)이 거의 통째로 긴 쪽에 들어 있고, 긴 쪽의 절반 이상이 겹친다
  const shorter = Math.min(ta.size, tb.size)
  return shorter >= 5 && common >= 5 && common / shorter >= 0.95 && common / Math.max(ta.size, tb.size) >= 0.5
}

// ── 교육청 재구성 예시 자료집 지침 L-17·L-19·L-20·L-21(대표 2026-10-01) — 전부 참고 메모(kind other, 막지 않음) ─────────────
/** [TS] 메모 문구(원장·관리자가 읽는다). */
export const FEEDBACK_PLAN_MISSING = '확인·피드백 계획(feedback_plan)이 없음 — 3단계를 다시 생성하면 채워집니다(L-20)'
export const SELF_CHECK_MISSING = '마지막 수업 차시의 자기 점검표(self_check)가 없음 — 3단계를 다시 생성하면 채워집니다(L-21)'
export const TASK_COPIES_QUESTION = (lessonNo: number, taskNo: number, questionNo: number) => `${lessonNo}차시 활동지 과제 ${taskNo}번이 발문 ${questionNo}번과 같은 문장 — 활동지는 발문과 다른 과제로(L-19)`
export const FLAW_NOT_IN_EXPECTED = (taskNo: number) => `활동지 과제 ${taskNo}: 결함 찾기(flaw_check)인데 기대 답에 무엇이 결함인지 적혀 있지 않음(L-19)`
export const FLAW_IN_SESSION = '평가 차시에 결함 찾기(flaw_check) 과제 — 결함 찾기는 수업 차시 활동지에서만(L-19)'
/** 기대 답이 결함(틀린 곳·고칠 곳)을 말하는가 — 낱말로만 본다(뜻은 [AI] 검토). */
const FLAW_WORDS = /틀|오류|잘못|결함|어긋|빠(진|뜨|졌)|고쳐|고치|바로잡|모순|맞지 않/
export const expectedNamesFlaw = (expected: string) => FLAW_WORDS.test(expected)
type GuidelineLessonLike = {
  no: number; kind?: string
  teacher_script?: { questions?: { prompt?: string }[] | null } | null
  worksheet?: { tasks?: { no?: number; prompt?: string; expected?: string; flaw_check?: boolean }[] | null } | null
  feedback_plan?: unknown; self_check?: unknown
}
/**
 * L-19 활동지 ≠ 발문(과제 문장이 발문 문장과 공백·대소문자·부호를 무시하고 같으면), 결함 찾기 과제의 기대 답에 결함이 없음, 단원 평가 차시의 결함 찾기;
 * L-20 교수 차시에 feedback_plan 없음; L-21 마지막 교수 차시에 self_check(차시 수준, 1개 이상) 없음. 옛 초안(2026-10-01 이전)에는 모두 뜨고,
 * 3단계를 다시 생성하면 채워진다 — 참고 메모일 뿐 확인·게시를 막지 않는다.
 */
export function guidelineLessonIssues(lessons: GuidelineLessonLike[]): Issue[] {
  const issues: Issue[] = []
  const teaching = lessons.filter((l) => !isAssessmentSession(l))
  const last = teaching.length ? teaching[teaching.length - 1] : null
  for (const l of lessons) {
    const tasks = l.worksheet?.tasks ?? []
    if (isAssessmentSession(l)) {
      if (tasks.some((t) => t.flaw_check)) issues.push({ kind: 'other', detail: `${l.no}차시: ${FLAW_IN_SESSION}` })
      continue
    }
    const questions = l.teacher_script?.questions ?? []
    for (const [k, t] of tasks.entries()) {
      const no = t.no ?? k + 1
      const same = questions.findIndex((q) => !!q.prompt && !!t.prompt && flatKey(q.prompt) === flatKey(t.prompt))
      if (same >= 0) issues.push({ kind: 'other', detail: TASK_COPIES_QUESTION(l.no, no, same + 1) })
      if (t.flaw_check && !expectedNamesFlaw(t.expected ?? '')) issues.push({ kind: 'other', detail: `${l.no}차시 ${FLAW_NOT_IN_EXPECTED(no)}` })
    }
    if (!l.feedback_plan) issues.push({ kind: 'other', detail: `${l.no}차시: ${FEEDBACK_PLAN_MISSING}` })
    if (l === last && !(Array.isArray(l.self_check) && l.self_check.length > 0)) issues.push({ kind: 'other', detail: `${l.no}차시: ${SELF_CHECK_MISSING}` })
  }
  return issues
}
/** [TS] 메모 문구(L-17). */
export const CRITERIA_FOCUS_UNMATCHED = (lessonNo: number, name: string) => `lesson_map ${lessonNo}차시 criteria_focus "${name}": 5단계 채점 요소에 같은 이름이 없음 — 요소 이름을 맞추거나 references에 바꾼 까닭을 적는다(L-17)`
type ReferenceLike = { id?: string; source?: string } | string
/**
 * L-17: 3단계 확정본(prior.stage3)의 lesson_map.criteria_focus 이름 가운데 두 문항의 채점 요소 이름(name)과 하나도 같지 않은 것을 적는다(이름마다 한 번).
 * 마지막 교수 차시의 자기 점검표가 그 이름으로 학생에게 보였으므로 5단계가 이름을 바꾸면 어긋난다 — 다만 문항의 references(id·source)에 그 옛 이름이 적혀 있으면
 * 바꾼 까닭을 밝힌 것으로 보고 짚지 않는다(메모가 "references에 적는다"고 안내하므로 적은 뒤에는 다시 뜨지 않는다). 채점 요소를 더 두는 것은 보지 않는다.
 * 3단계가 prior 에 없거나 criteria_focus 가 없으면 건너뛴다.
 */
export function criteriaFocusIssues(items: { rubric: { criteria: { name: string }[] } }[], ctx: CheckCtx, references: ReferenceLike[] = []): Issue[] {
  // references 는 문항마다 있다(items[].references) — 호출자가 두 문항의 것을 합쳐 넘긴다
  const map = (ctx.prior.stage3 as { unit_plan?: { lesson_map?: { lesson_no: number; criteria_focus?: string[] }[] | null } | null } | undefined)?.unit_plan?.lesson_map
  if (!Array.isArray(map)) return []
  const names = new Set(items.flatMap((it) => it.rubric.criteria.map((c) => norm(c.name))))
  const refText = norm(references.map((r) => (typeof r === 'string' ? r : `${r.id ?? ''} ${r.source ?? ''}`)).join(' '))
  const issues: Issue[] = []
  const seen = new Set<string>()
  for (const row of map) {
    for (const f of row.criteria_focus ?? []) {
      if (names.has(norm(f)) || seen.has(f) || (norm(f) && refText.includes(norm(f)))) continue
      seen.add(f)
      issues.push({ kind: 'other', detail: CRITERIA_FOCUS_UNMATCHED(row.lesson_no, f) })
    }
  }
  return issues
}

/** 3단계 검사가 볼 수 있는 자료 본문: 4단계 확정본(다시 검토할 때)과 대주제 공유 자료. 보통 3단계 시점에는 공유 자료만 있다. */
function knownMaterials(ctx: CheckCtx): { id: string; body?: string | null }[] {
  const own = (ctx.prior.stage4 as { materials?: { id: string; body?: string | null }[] } | undefined)?.materials
  const shared = ctx.prior.shared_materials as { id: string; body?: string | null }[] | undefined
  return [...(Array.isArray(own) ? own : []), ...(Array.isArray(shared) ? shared : [])]
}

function lessonIssues(o: LessonDesignT, ctx: CheckCtx): Issue[] {
  const issues: Issue[] = []
  const materials = knownMaterials(ctx)
  const covered = new Set(o.lessons.flatMap((l) => l.standards))
  for (const s of ctx.standards) if (!covered.has(s.code)) issues.push({ kind: 'coverage', detail: `${s.code}가 어느 차시에도 배정되지 않음` })
  // L-09(대표 2026-09-26 보완): 교수 차시 3~5개 + 마지막 교수 차시 뒤 단원 평가 차시 1개(서술형 → 논술형 함께). zod 도 보지만
  // 검토는 저장된 출력(옛 판·손으로 고친 판)에도 돌므로 다시 본다(assessment-structure.ts sessionPlacementIssues).
  for (const m of sessionPlacementIssues(o.lessons)) issues.push({ kind: 'coverage', detail: m })
  for (const l of o.lessons) {
    const kinds = lessonAssessments(l)
    if (l.mergeable_with !== null) {
      const other = o.lessons.find((x) => x.no === l.mergeable_with)
      if (!other || Math.abs(other.no - l.no) !== 1) issues.push({ kind: 'other', detail: `${l.no}차시 병합 대상이 인접 차시가 아님` })
      else if (isAssessmentSession(l) || isAssessmentSession(other)) issues.push({ kind: 'other', detail: `${l.no}·${other.no}차시 병합: 단원 평가 차시는 병합하지 않는다` })
    }
    if (l.flow.main.length < 2) issues.push({ kind: 'other', detail: `${l.no}차시 전개 소단계가 2개 미만` })
    // 스펙 §2.3: 논술형을 보는 차시는 전개에 "논술형 작성(35분 이상)" 소단계가 있어야 한다(zod 가 아니라 [TS] — 올린 v1 판도 검토로 돌린다).
    // 단원 평가 차시는 서술형 작성 소단계도 따로 둔다(ASSESSMENT_SESSION: 서술형 15 + 논술형 35).
    if (kinds.includes('논술형') && !l.flow.main.some((m) => m.step_label.includes('논술형') && m.minutes >= ESSAY_MIN_MINUTES)) issues.push({ kind: 'other', detail: `${l.no}차시: 논술형을 보는 차시에는 ${ESSAY_MIN_MINUTES}분 이상 논술형 작성 단계가 필요` })
    if (isAssessmentSession(l) && kinds.includes('서술형') && !l.flow.main.some((m) => m.step_label.includes('서술형'))) issues.push({ kind: 'other', detail: `${l.no}차시: 단원 평가 차시에 서술형 작성 단계가 없음` })
    // L-09(대표 2026-09-26): 서논술 과정이라 객관식이 없다 — 퀴즈는 낱말·수치·짧은 구를 직접 쓰는 단답형만(type 'short', choices null).
    // zod(LessonDesign)도 보지만 검토는 저장된 출력(2026-09-26 이전 초안·손으로 고친 판)에도 돌므로 다시 본다.
    for (const [i, q] of l.formative_check.quiz.entries()) {
      if (!isShortQuiz(q)) issues.push({ kind: 'quiz', detail: `${l.no}차시 퀴즈 ${i + 1}: ${QUIZ_SHORT_ONLY}` })
    }
    // L-10(대표 2026-09-26): 교수 차시 퀴즈는 수준 D~E·C·B 하나씩, 정답이 본문(수업 흐름·발문 대본·활동지·자료)에 그대로 있는 문항 금지.
    // 참고 메모(kind other)일 뿐 막지 않는다 — zod 는 수준을 보지 않는다(옛 초안의 이미지 첨부·문장 고치기가 그대로 되게).
    if (!isAssessmentSession(l)) {
      if (!quizLevelSpreadOk(l.formative_check.quiz)) issues.push({ kind: 'other', detail: `${l.no}차시 ${QUIZ_LEVEL_NOTE}` })
      // C-40(단원 리포트 6축): 퀴즈 문항마다 역량 하나 — 없으면 참고 메모(막지 않음, 리포트는 competencyOf 로 지식·이해에 넣는다)
      for (const [i, q] of l.formative_check.quiz.entries()) if (!hasCompetency(q)) issues.push({ kind: 'other', detail: `${l.no}차시 퀴즈 ${i + 1}: ${COMPETENCY_MISSING}` })
      const units = lessonSourceUnits(l, materials)
      for (const [i, q] of l.formative_check.quiz.entries()) {
        // L-13(2026-10-01 영어 세트 검토): 정답 표기가 도입·전개·정리·발문(예상 답)·활동지(기대 답)·다른 퀴즈 해설에 그대로 있으면 자리와 표기를 적는다 —
        // 그것이 없을 때만 종전 판정(발문 내용어가 겹치는 문장·자료 본문)으로 본다. 둘 다 참고 메모(막지 않음).
        const exposed = quizAnswerExposure(q, lessonExposureUnits(l, i))
        if (exposed) { issues.push({ kind: 'other', detail: `${l.no}차시 퀴즈 ${i + 1}: ${QUIZ_COPIED}(${exposed.where.join('·')} — "${exposed.key}")` }); continue }
        const where = quizCopySource(q, units)
        if (where) issues.push({ kind: 'other', detail: `${l.no}차시 퀴즈 ${i + 1}: ${QUIZ_COPIED}(${where})` })
      }
      // L-13: 활동지 과제를 그대로 되풀이한 퀴즈 — 활동지와 퀴즈는 서로 다른 것을 확인한다(참고 메모)
      for (const [i, q] of l.formative_check.quiz.entries()) {
        const same = l.worksheet.tasks.find((t) => nearlySameTask(q.q, t.prompt))
        if (same) issues.push({ kind: 'other', detail: `${l.no}차시 퀴즈 ${i + 1}: ${quizRepeatsWorksheetNote(same.no)}` })
      }
    }
    for (const q of l.teacher_script.questions) if (norm(q.if_stuck) === norm(q.expected_answer)) issues.push({ kind: 'other', detail: `${l.no}차시 발문 힌트가 정답과 같음` })
  }
  // 5단계가 이미 확정돼 있으면(예: 3단계를 나중에 다시 검토·편집) 그 문항들 기준으로도 무관한 공유 자료 인용을 짚는다 —
  // 보통은 3단계 시점에 5단계가 없어 건너뛴다(sharedMaterialCitationIssues 가 items 없으면 스스로 건너뛴다).
  const items5 = (ctx.prior.stage5 as { items?: { materials_used?: string[] | null }[] } | undefined)?.items
  issues.push(...sharedMaterialCitationIssues(o.lessons, items5, ctx.sharedMaterialIds))
  issues.push(...englishLessonCitationIssues(o.lessons, ctx))
  issues.push(...guidelineLessonIssues(o.lessons))
  return issues
}

function materialIssues(o: MaterialsT): Issue[] {
  const issues: Issue[] = []
  for (const m of o.materials) {
    if (m.table) {
      if (m.table.rows.length > 25) issues.push({ kind: 'other', detail: `자료 ${m.id}: 표가 25행을 넘음(${m.table.rows.length}행)` })
      if (m.table.columns.length > 6) issues.push({ kind: 'other', detail: `자료 ${m.id}: 열이 6개를 넘음` })
      for (const r of m.table.rows) if (r.length !== m.table.columns.length) { issues.push({ kind: 'other', detail: `자료 ${m.id}: 행 길이가 열 수와 다름` }); break }
    }
    if (m.source.kind === '공개') issues.push({ kind: 'source', detail: `자료 ${m.id}: 공개 자료(${m.source.attribution}) — 확정 전 출처 확인 필요` })
    if (m.source.ai_assisted) issues.push({ kind: 'source', detail: `자료 ${m.id}: AI 보조 자료 — 원장 확인 필요` })
    if (m.body && /(따라서|그러므로|결론적으로|가장 먼저 줄여야)/.test(m.body)) issues.push({ kind: 'other', detail: `자료 ${m.id}: 본문에 결론 문장이 있음` })
    // 오너 지시(2026-09-26): 자료 제목에 자작·가상 같은 출처 표기를 쓰지 않는다(출처는 source 필드에만) — 참고용 자문일 뿐 반려하지 않는다.
    if (titleHasSourceMarker(m.title)) issues.push({ kind: 'other', detail: `자료 ${m.id}: 제목에 출처 표기("${m.title}")가 남아 있음 — 출처는 source 필드에만` })
  }
  return issues
}

/**
 * 세트 자료 수(대표 2026-09-26: 실제 서논술 문항은 자료 2~4개 — 게시 판에는 문항·차시가 참조하는 자료만 실린다, publish.ts selectUsedMaterials).
 * 참고용 자문만 남긴다(막지 않음). 4단계: 차시(3단계 확정본)가 쓰는 자료 기준 — 문항은 아직 없으므로 "어느 차시도 쓰지 않음"은
 * 5단계 문항이 쓰면 괜찮다고 적는다. 5단계: 문항 + 차시 기준 — 어디서도 참조하지 않는 세트 자료는 게시 판에서 빠진다.
 * 공유 자료(prior.shared_materials)는 참조될 때만 센다(이 과목이 쓰지 않는 공유 자료는 원래 빠진다).
 */
function materialUseIssues(setMaterials: { id: string }[], ctx: CheckCtx, items: AssessmentT['items'] | null): Issue[] {
  const lessons = (ctx.prior.stage3 as Partial<LessonDesignT> | undefined)?.lessons
  if (!Array.isArray(lessons) || lessons.length === 0) return []
  const shared = ((ctx.prior.shared_materials as { id: string }[] | undefined) ?? []).map((m) => m.id)
  const setIds = setMaterials.map((m) => m.id)
  const used = usedMaterialIds({ lessons, items: items ?? [] })
  const issues: Issue[] = []
  const counted = new Set([...(items ? setIds.filter((id) => used.has(id)) : setIds), ...shared.filter((id) => used.has(id))])
  if (counted.size > MAX_SET_MATERIALS) issues.push({ kind: 'other', detail: `세트 자료 ${counted.size}개(${[...counted].sort().join(', ')}) — 문항·차시가 실제로 쓰는 2~4개(많아도 ${MAX_SET_MATERIALS}개)만 둔다` })
  for (const id of setIds.filter((x) => !used.has(x) && !shared.includes(x))) {
    issues.push({ kind: 'other', detail: items ? `자료 ${id}: 어느 문항·차시도 쓰지 않음 — 게시 판에서 빠진다` : `자료 ${id}: 어느 차시도 쓰지 않음 — 5단계 문항도 쓰지 않으면 게시 판에서 빠진다` })
  }
  return issues
}

/**
 * C-32(대표 2026-09-26): 조건은 지침이지 풀이 힌트가 아니다. 조건 문장에서 풀이 절차의 흔적을 찾는다 —
 * 숫자 사이 연산 기호, 계산 동사·공식·소수 자리 지시, 단계 순서어(먼저/다음에/그다음/마지막으로 + 동사; "가장 먼저"는 주제라 뺀다),
 * 소수, 참조 자료에 있는 두 자리 이상 수치. 근거·문장·단어·글자 수와 배점("2개 이상", "200자", "(2점)")은 허용한다.
 */
const ARITHMETIC = /\d\s*[÷×*/=+\-−]\s*\d/
const SOLVING_WORDS = /계산해|계산하여|구해|구하여|나누어|나눠|곱해|곱하여|더해|더하여|빼서|공식|소수.{0,6}자리/
const STEP_ORDER = /(?<!가장\s?)(먼저|다음에|그다음|마지막으로)\s*\S[\s\S]*?(고|다|것)(?=[\s,.)]|$)/
/**
 * 분량·형식·시간을 세는 수는 자료 수치가 아니다 — 단위가 붙은 수("200자", "3문장", "35분", "60 words")와 그 범위("40~60단어", "2-3 sentences"),
 * 세는 명사 뒤의 개수("근거 2개"), 번호 매김("(1)", "①"). 2026-10-01 영어 세트 조건 "제목을 포함해 40~60단어의 영어로 쓸 것"이 "자료 수치 40"으로
 * 잘못 짚힌 뒤 범위·영어 단위·번호를 더했다(범위의 앞 수가 단위 없이 남아 자료의 40과 겹쳤다).
 */
const COUNT_UNITS = '점|자|글자|단어|문장|문단|줄|가지|분|words?|sentences?|lines?|paragraphs?|minutes?'
const ALLOWED_COUNTS = new RegExp(`\\d+\\s*[~\\-–−]\\s*\\d+\\s*(?:${COUNT_UNITS})|\\d+\\s*(?:${COUNT_UNITS})(?![a-z])|(근거|이유|자료|수치|방안|예|사례|문장|단어)\\S{0,3}\\s*\\d+\\s*개|\\(\\d+\\)|[①-⑳]`, 'g')
const NUMBER = /\d+(?:[.,]\d+)*/g
const normNum = (s: string) => s.replace(/,/g, '')

/** 자료(표 칸·열 이름·본문)에 있는 두 자리 이상 정수와 소수. 조건에 이 수치가 나오면 답이 되는 자료 값을 흘린 것이다. */
export function materialNumbers(materials: { body: string | null; table: { columns: string[]; rows: (string | number)[][] } | null }[]): Set<string> {
  const out = new Set<string>()
  for (const m of materials) {
    const texts = [m.body ?? '', ...(m.table?.columns ?? []), ...(m.table?.rows ?? []).flat().map(String)]
    for (const t of texts) for (const n of t.match(NUMBER) ?? []) { const v = normNum(n); if (v.includes('.') || v.length >= 2) out.add(v) }
  }
  return out
}

/** 조건 문장 하나의 풀이 힌트 사유(빈 배열이면 지침만 담은 조건). */
export function conditionHints(text: string, materialNums: Set<string>): string[] {
  const reasons: string[] = []
  // 분량 범위("40-60 words")의 붙임표를 뺄셈으로 읽지 않게, 세는 수를 먼저 지운 글에서 계산식을 찾는다
  const rest = text.replace(ALLOWED_COUNTS, ' ')
  if (ARITHMETIC.test(rest)) reasons.push('계산식')
  const word = text.match(SOLVING_WORDS)?.[0]
  if (word) reasons.push(`풀이 동사·지시 "${word}"`)
  if (STEP_ORDER.test(text)) reasons.push('풀이 순서')
  const nums = (rest.match(NUMBER) ?? []).map(normNum)
  const decimals = nums.filter((n) => n.includes('.'))
  if (decimals.length) reasons.push(`소수 값 ${decimals.join('·')}`)
  const leaked = nums.filter((n) => !n.includes('.') && n.length >= 2 && materialNums.has(n))
  if (leaked.length) reasons.push(`자료 수치 ${leaked.join('·')}`)
  return reasons
}

function conditionIssues(it: AssessmentT['items'][number], i: number, materials: MaterialsT['materials']): Issue[] {
  const issues: Issue[] = []
  const n = it.conditions.items.length
  if (it.kind === '서술형' && n > 0) issues.push({ kind: 'other', detail: `문항 ${i + 1}(서술형): 조건 ${n}개 — 서술형에는 조건을 두지 않는다(분량·형식만, C-32)` })
  if (it.kind === '논술형' && (n < 2 || n > 4)) issues.push({ kind: 'other', detail: `문항 ${i + 1}(논술형): 조건 ${n}개 — 논술형 조건은 2~4개(C-32)` })
  else if (n > 4) issues.push({ kind: 'other', detail: `문항 ${i + 1}: 조건 ${n}개 — 0~4개(C-32)` })
  const nums = materialNumbers(materials.filter((m) => it.materials_used.includes(m.id)))
  for (const c of it.conditions.items) {
    const reasons = conditionHints(c.text, nums)
    if (reasons.length) issues.push({ kind: 'other', detail: `문항 ${i + 1} 조건 ${c.no}: 풀이 힌트(${reasons.join(', ')}) — 조건은 지침만(C-32)` })
  }
  return issues
}

/**
 * 과제 상황(situation)의 인물 검사(대표 2026-09-25: 영어 세트 audience "…우리 학교 학생과 교환학생" — 대주제·자료에 없는 인물).
 * role·audience 에서 사람 낱말(끝이 사람 꼬리말인 낱말)을 찾아, 대주제 제목·소개·과목 아이디어·자료(제목·본문·표)에 없으면 적는다.
 * 학교 안 사람(학생·교사·선생님·학부모·학생회·동아리·부원 …)은 어느 학교 상황에나 있으므로 늘 허용한다 — 단 '학생'은 앞말이 붙으면
 * (교환학생·유학생) 따로 본다. 참고용 자문(other)일 뿐이다. 대주제도 자료도 없으면(문맥 없음) 건너뛴다.
 */
const SCHOOL_ACTOR_TAILS = ['학생회', '동아리', '부원', '부장', '위원회', '위원', '임원', '회원', '회장', '반장', '교사', '선생님', '교장', '교감', '담임', '학부모', '부모님', '부모', '친구', '가족', '사람', '후배', '선배', '학생']
const OUTSIDE_ACTOR_TAILS = ['강사', '관광객', '방문객', '관람객', '손님', '주민', '시민', '기자', '독자', '전문가', '상인', '봉사자', '참가자', '소비자', '의원', '사장님', '사장', '운영자', '관계자', '어르신', '주최자', '판매자', '구매자', '장관', '구청장', '시장님', '공무원', '직원', '담당자', '어린이', '청소년', '외국인', '이웃', '원어민', '업체', '기업']
const ACTOR_TAILS = [...SCHOOL_ACTOR_TAILS, ...OUTSIDE_ACTOR_TAILS].sort((a, b) => b.length - a.length)
const STUDENT_PREFIXES = new Set(['', '중', '중학', '고', '고등', '초등', '재학', '전교'])
const ACTOR_PARTICLES = ['에게서', '에게', '께서', '께', '한테', '으로', '로', '과', '와', '을', '를', '은', '는', '이', '가', '의', '도', '만', '들']

/** 낱말 하나가 사람 낱말이면 조사를 뗀 꼴과 꼬리말, 아니면 null. 꼬리말을 먼저 보고(어린이의 '이'를 조사로 떼지 않게) 없을 때만 조사를 뗀다. */
function actorOf(word: string): { word: string; tail: string } | null {
  let w = word
  for (let k = 0; k < 4; k++) {
    const tail = ACTOR_TAILS.find((t) => w.endsWith(t))
    if (tail) return { word: w, tail }
    const p = ACTOR_PARTICLES.find((x) => w.length - x.length >= 2 && w.endsWith(x))
    if (!p) return null
    w = w.slice(0, -p.length)
  }
  return null
}

/** role·audience 문장에서 대주제·자료(corpus, 띄어쓰기 없앤 글)에 없는 인물 낱말. corpus 가 비면 검사하지 않는다. */
export function inventedActors(texts: string[], corpus: string): string[] {
  if (!corpus) return []
  const out: string[] = []
  for (const raw of texts.join(' ').split(/[\s,·、/()]+/)) {
    const a = raw && actorOf(raw)
    if (!a) continue
    const prefix = a.word.slice(0, -a.tail.length)
    const schoolOk = a.tail === '학생' ? STUDENT_PREFIXES.has(prefix) : SCHOOL_ACTOR_TAILS.includes(a.tail)
    if (!schoolOk && !corpus.includes(a.word) && !out.includes(a.word)) out.push(a.word)
  }
  return out
}

/** 대주제 제목·소개(0단계)·과목 아이디어·자료(제목·본문·표 머리글·칸)를 띄어쓰기 없이 이은 글. */
function scenarioCorpus(ctx: CheckCtx, materials: MaterialsT['materials']): string {
  const intro = ctx.prior.stage0 as { intro?: unknown; subject_ideas?: { idea?: unknown }[] } | undefined
  const parts: unknown[] = [ctx.theme?.title, intro?.intro, ...(Array.isArray(intro?.subject_ideas) ? intro.subject_ideas.map((s) => s?.idea) : [])]
  for (const m of materials) parts.push(m.title, m.body, ...(m.table?.columns ?? []), ...(m.table?.rows ?? []).flat())
  return parts.filter((p) => typeof p === 'string' || typeof p === 'number').map(String).join('').replace(/\s+/g, '')
}

/** [TS] 채점 요소 배운 차시 메모(C-39). 대표 결정(마법사는 아무것도 막지 않는다): zod 는 taught_in 을 요구하지 않고 이 참고 메모만 남긴다. */
export const TAUGHT_IN_MISSING = '배운 차시가 적혀 있지 않음(taught_in)'
/**
 * C-39(대표 2026-09-29 — 영어 서술형 "비교급·최상급 표현을 쓰면 2점"은 그 표현을 이 단원이나 그 이전에 배웠어야 넣을 수 있다):
 * 채점 요소마다 taught_in 이 비었거나 없으면, 또는 3단계 확정본(prior.stage3)의 교수 차시가 아닌 번호(단원 평가 차시·없는 차시)를
 * 하나라도 담으면 참고 메모(kind other). 3단계가 prior 에 없으면 번호 대조는 건너뛰고 빈 칸만 본다. 그 차시 활동에 요소의 표현·기능이
 * 실제로 있는지는 뜻을 봐야 하므로 [AI] 검토(REVIEW_FOCUS[5], coverage)가 본다.
 */
function taughtInIssues(items: AssessmentT['items'], ctx: CheckCtx): Issue[] {
  const lessons = (ctx.prior.stage3 as Partial<LessonDesignT> | undefined)?.lessons
  const teaching = Array.isArray(lessons) && lessons.length ? new Set(lessons.filter((l) => !isAssessmentSession(l)).map((l) => l.no)) : null
  const issues: Issue[] = []
  for (const [i, it] of items.entries()) {
    for (const c of it.rubric.criteria) {
      const taught = c.taught_in ?? []
      const where = `문항 ${i + 1} 요소 ${c.name}: ${TAUGHT_IN_MISSING}`
      if (taught.length === 0) { issues.push({ kind: 'other', detail: where }); continue }
      const bad = teaching ? [...new Set(taught.filter((n) => !teaching.has(n)))] : []
      if (bad.length) issues.push({ kind: 'other', detail: `${where} — ${bad.join('·')}차시는 교수 차시가 아님(C-39)` })
    }
  }
  return issues
}

/** [TS] 역량 꼬리표 메모(C-40). 대표 결정(마법사는 아무것도 막지 않는다): zod 는 competency 를 요구하지 않고 이 참고 메모만 남긴다. */
export const COMPETENCY_MISSING = '역량이 적혀 있지 않음(competency)'
/** 역량이 이 수 이하의 축에만 놓이면 몰림 메모를 남긴다. */
export const COMPETENCY_NARROW_MAX = 2
export const competencyNarrowNote = (n: number) => `역량이 ${n}개 축에만 몰려 있음 — 리포트 육각형이 비게 된다`
const hasCompetency = (t: { competency?: unknown }) => typeof t.competency === 'string' && (COMPETENCIES as readonly string[]).includes(t.competency)
/**
 * C-40(대표 2026-09-29, 단원 리포트 R-1 — 육각형 6축): 채점 요소마다 역량이 없으면 참고 메모(kind other). 그리고 두 문항의 요소 전부와
 * 3단계 확정본(prior.stage3)이 있으면 그 퀴즈 전부의 역량을 모아, 적힌 역량이 2개 축 이하에만 놓이면 몰림 메모를 남긴다 — 꼬리표가
 * 하나도 없으면(옛 초안) 빠짐 메모만 남기고 몰림은 말하지 않는다. 역량이 문항이 실제로 보는 것과 맞는지는 [AI] 검토(REVIEW_FOCUS[3]·[5])가 본다.
 */
function competencyIssues(items: AssessmentT['items'], ctx: CheckCtx): Issue[] {
  const issues: Issue[] = []
  const tagged: { competency?: unknown }[] = []
  for (const [i, it] of items.entries()) {
    for (const c of it.rubric.criteria) {
      tagged.push(c)
      if (!hasCompetency(c)) issues.push({ kind: 'other', detail: `문항 ${i + 1} 요소 ${c.name}: ${COMPETENCY_MISSING}` })
    }
  }
  const lessons = (ctx.prior.stage3 as Partial<LessonDesignT> | undefined)?.lessons
  if (Array.isArray(lessons)) for (const l of lessons) tagged.push(...(l.formative_check?.quiz ?? []))
  const axes = new Set(tagged.filter(hasCompetency).map((t) => t.competency))
  if (axes.size > 0 && axes.size <= COMPETENCY_NARROW_MAX) issues.push({ kind: 'other', detail: competencyNarrowNote(axes.size) })
  return issues
}

function assessmentIssues(o: AssessmentT, ctx: CheckCtx): Issue[] {
  const issues: Issue[] = []
  // 세트 구조(대표 2026-09-26): zod 가 생성 때 거르지만, 검토는 저장된 출력(옛 판·손으로 고친 판)에도 돌므로 다시 본다
  for (const m of structureIssues(o.items)) issues.push({ kind: 'rubric', detail: `문항 구조: ${m}` })
  for (const [i, it] of o.items.entries()) if (!it.rubric.holistic) issues.push({ kind: 'rubric', detail: `문항 ${i + 1}(${it.kind}): 총체적 상/중/하가 없음 — 두 문항 모두 분석적 + 총체적 채점표(C-15)` })
  // 두 문항이 같은 요소 이름을 쓰는 것은 L-17(criteria_focus 이름 그대로) 이후 자연스럽다 — 안내장·리포트의 문구 은행이 이름으로 묶이므로
  // 같은 이름은 같은 것을 재는 요소여야 한다. 그래서 이름은 같은데 역량 꼬리표(C-40)가 다를 때만 짚는다(2026-10-02, 영어 세트).
  const byName = new Map<string, Set<string>>()
  for (const it of o.items) for (const c of it.rubric.criteria) {
    if (!c.competency) continue
    const set = byName.get(c.name) ?? new Set<string>(); set.add(c.competency); byName.set(c.name, set)
  }
  for (const [name, comps] of byName) if (comps.size > 1) issues.push({ kind: 'other', detail: `채점 요소 "${name}"이(가) 두 문항에 있는데 역량 꼬리표가 다름(${[...comps].join(' / ')}) — 같은 요소면 같은 역량으로(C-40)` })
  for (const b of o.grade_boundaries) {
    const want = levelRefFor(b.grade)
    if (b.level_ref !== want) issues.push({ kind: 'rubric', detail: `등급 ${b.grade}의 level_ref(${b.level_ref})가 7등급↔수준 대응표(${want})와 다름` })
  }
  const materials = ((ctx.prior.stage4 as MaterialsT | undefined)?.materials ?? []).concat(((ctx.prior.shared_materials as MaterialsT['materials'] | undefined) ?? []))
  const byId = new Map(materials.map((m) => [m.id, m]))
  for (const [i, it] of o.items.entries()) {
    for (const id of it.materials_used) if (materials.length && !byId.has(id)) issues.push({ kind: 'other', detail: `문항 ${i + 1}: 없는 자료 ${id}` })
    if (materials.length && !it.materials_used.some((id) => byId.get(id)?.role === 'raw')) issues.push({ kind: 'other', detail: `문항 ${i + 1}: 원자료(raw)를 하나도 참조하지 않음` })
    issues.push(...conditionIssues(it, i, materials))
    for (const c of it.rubric.criteria) {
      // 척도는 점수로 읽는다(배열 순서 아님 — 생성 AI가 만점부터 내림차순으로 적기도 한다, lib/studio/scale.ts)
      const sorted = sortScale(c.scale)
      for (let k = 1; k < sorted.length; k++) if (adverbOnlyDiff(sorted[k - 1].descriptor, sorted[k].descriptor)) issues.push({ kind: 'level', detail: `문항 ${i + 1} ${c.name}: ${sorted[k - 1].points}→${sorted[k].points}점이 부사만 다름` })
      if (!zeroDistinguishesAttempt(zeroStep(c.scale)?.descriptor ?? '')) issues.push({ kind: 'rubric', detail: `문항 ${i + 1} ${c.name}: 0점 서술에 무응답·시도 구분이 없음` })
    }
    if (it.kind === '서술형') {
      // 스펙 §2.5: 서술형은 총점 단계마다(1..배점, 0점 제외) 예시답안 1개. zod 는 만점 1개만 강제한다.
      const covered = new Set(it.exemplar_answers.map((e) => e.points))
      const missing = Array.from({ length: it.points }, (_, k) => k + 1).filter((p) => !covered.has(p))
      if (missing.length) issues.push({ kind: 'rubric', detail: `문항 ${i + 1}: 부분점수 예시답안이 없음(${missing.join('·')}점 단계) — 1~${it.points}점 단계마다 하나씩 필요` })
    }
    if (it.kind === '논술형' && !it.situation) issues.push({ kind: 'other', detail: '논술형에 과제 상황(역할·청중·목적·결과물)이 없음' })
    if (it.situation) {
      const missing = inventedActors([it.situation.role, it.situation.audience], scenarioCorpus(ctx, materials))
      if (missing.length) issues.push({ kind: 'other', detail: `문항 ${i + 1}(${it.kind}): 상황의 인물이 자료·대주제에 없음(${missing.join(', ')}) — role·audience는 대주제·자료에 나오는 사람만 쓴다` })
    }
    if (it.kind === '논술형' && !it.rubric.criteria.some((c) => c.axis === '가치·태도')) issues.push({ kind: 'level', detail: '논술형 4요소 중 가치·태도 축이 없음(정당화 가능성 기준으로 서술)' })
  }
  issues.push(...placementIssues(o, ctx))
  issues.push(...taughtInIssues(o.items, ctx))
  issues.push(...competencyIssues(o.items, ctx))
  issues.push(...criteriaFocusIssues(o.items, ctx, o.items.flatMap((it) => it.references ?? [])))
  const setMaterials = (ctx.prior.stage4 as MaterialsT | undefined)?.materials
  if (Array.isArray(setMaterials)) issues.push(...materialUseIssues(setMaterials, ctx, o.items))
  const lessons3 = (ctx.prior.stage3 as Partial<LessonDesignT> | undefined)?.lessons
  if (Array.isArray(lessons3)) issues.push(...sharedMaterialCitationIssues(lessons3, o.items, ctx.sharedMaterialIds))
  issues.push(...englishItemCitationIssues(o.items, ctx))
  return issues
}

/**
 * 문항 lesson_no ↔ 3단계 평가 계획(summative_placement) 대조. 종류+차시로 짝짓는다 — 옛 라벨(서술형1·서술형2)도 '서술형'으로 본다
 * (kindFamily). 3단계 확정본이 prior에 없으면 건너뛴다.
 */
function placementIssues(o: AssessmentT, ctx: CheckCtx): Issue[] {
  const plan = (ctx.prior.stage3 as Partial<LessonDesignT> | undefined)?.unit_plan?.assessment_plan?.summative_placement
  if (!Array.isArray(plan) || plan.length === 0) return []
  const family = kindFamily
  const issues: Issue[] = []
  for (const [i, it] of o.items.entries()) {
    if (!plan.some((p) => family(p.kind) === it.kind && p.lesson_no === it.lesson_no)) {
      const want = plan.filter((p) => family(p.kind) === it.kind).map((p) => `${p.kind} ${p.lesson_no}차시`).join('·')
      issues.push({ kind: 'coverage', detail: `문항 ${i + 1}(${it.kind}): lesson_no ${it.lesson_no}가 3단계 평가 배치(${want})와 다름` })
    }
  }
  for (const p of plan) {
    if (!o.items.some((it) => it.kind === family(p.kind) && it.lesson_no === p.lesson_no)) issues.push({ kind: 'coverage', detail: `평가 계획 ${p.kind}(${p.lesson_no}차시)에 해당하는 문항이 없음` })
  }
  return issues
}

function guideIssues(o: GuideT, ctx: CheckCtx): Issue[] {
  const lessons = ((ctx.prior.stage3 as LessonDesignT | undefined)?.lessons ?? [])
  const issues: Issue[] = []
  for (const m of o.merge_guide) {
    const [a, b] = m.lessons
    const la = lessons.find((l) => l.no === a)
    if (lessons.length && la?.mergeable_with !== b && lessons.find((l) => l.no === b)?.mergeable_with !== a) issues.push({ kind: 'other', detail: `병합 안내 ${a}·${b}가 3단계 병합 표시와 다름` })
  }
  if (lessons.length && o.per_lesson.length !== lessons.length) issues.push({ kind: 'other', detail: '차시별 메모 수가 차시 수와 다름' })
  // 흔한 오답의 문항 번호는 5단계 문항 번호 안(지금 구조 2개) — 5단계 확정본이 prior에 없으면 건너뛴다
  const itemCount = (ctx.prior.stage5 as Partial<AssessmentT> | undefined)?.items?.length ?? 0
  for (const e of o.grading_guide.common_errors) if (itemCount && e.item_no > itemCount) issues.push({ kind: 'other', detail: `흔한 오답의 문항 ${e.item_no} — 5단계 문항은 ${itemCount}개` })
  issues.push(...translationIssues(o, ctx))
  return issues
}

// ── S-영-08 교사용 번역(대표 2026-09-29: "영어 자료의 경우 비전공 원장님을 위해 영문 자료에 한국어 번역본을 첨부해서 교사용 지침서에 넣어줘") ──
/** 영문으로 볼 글의 최소 길이와 글자(라틴 + 한글) 가운데 라틴 글자 비율. 한국어 자료에 섞인 단위(kg·cm)·기호는 이 비율에 못 미친다. */
const ENGLISH_MIN_LENGTH = 30
const ENGLISH_MIN_LATIN_RATIO = 0.4
/** 영어(외국어) 글인가: 30자 이상이고 글자 가운데 라틴 글자가 40% 이상이며 라틴 낱말(두 글자 이상)이 셋 이상(수식 기호·자리 채움 글자만 있는 글은 아니다). */
export function looksEnglish(text: string | null | undefined): boolean {
  const t = (text ?? '').trim()
  if (t.length < ENGLISH_MIN_LENGTH) return false
  if (new Set(t.match(/[A-Za-z]{2,}/g) ?? []).size < 3) return false
  const latin = (t.match(/[A-Za-z]/g) ?? []).length
  const hangul = (t.match(/[가-힣ㄱ-ㅎㅏ-ㅣ]/g) ?? []).length
  return latin + hangul > 0 && latin / (latin + hangul) >= ENGLISH_MIN_LATIN_RATIO
}
type TableLike = { columns?: string[] | null; rows?: (string | number)[][] | null } | null | undefined
const tableText = (t: TableLike) => [...(t?.columns ?? []), ...(t?.rows ?? []).flat().map(String)].join(' ')
/** 번역 메모 문구(원장·관리자가 읽는다). */
export const TRANSLATION_MISSING = '한국어 번역이 없음(교사용 지침서)'
/**
 * [TS] 참고 메모(kind other, 막지 않음) — S-영-08. 4단계 확정본(prior.stage4)의 자료 가운데 본문이나 표가 영어(looksEnglish)인데
 * translations.materials 에 그 material_id 가 없으면 "자료 X: 한국어 번역이 없음(교사용 지침서)". 번역이 있으면 원문 본문·표의 수(숫자 묶음,
 * 쉼표 무시)가 번역(제목·본문·표)에 모두 있는지 보고 빠진 수마다 "자료 X 번역: 원문 수치 1,350이 빠짐". 5단계 확정본(prior.stage5)의
 * 영어 예시답안은 문항 번호·단계(상/중/하 또는 점수)로 번역을 찾는다. 4·5단계가 prior 에 없으면 그 부분은 건너뛴다.
 * 뜻이 맞게 옮겨졌는지(오역)는 [AI] 검토(REVIEW_FOCUS[6])가 본다.
 */
function translationIssues(o: GuideT, ctx: CheckCtx): Issue[] {
  const issues: Issue[] = []
  const tr = o.translations
  const materials = (ctx.prior.stage4 as Partial<MaterialsT> | undefined)?.materials
  for (const m of Array.isArray(materials) ? materials : []) {
    if (!looksEnglish(m.body) && !looksEnglish(tableText(m.table))) continue
    const t = tr?.materials?.find((x) => x.material_id === m.id)
    if (!t) { issues.push({ kind: 'other', detail: `자료 ${m.id}: ${TRANSLATION_MISSING}` }); continue }
    const translated = new Set([t.title_ko, t.body_ko ?? '', tableText(t.table_ko)].flatMap((s) => (s.match(NUMBER) ?? []).map(normNum)))
    const seen = new Set<string>()
    for (const n of [m.body ?? '', tableText(m.table)].flatMap((s) => s.match(NUMBER) ?? [])) {
      const v = normNum(n)
      if (seen.has(v)) continue
      seen.add(v)
      if (!translated.has(v)) issues.push({ kind: 'other', detail: `자료 ${m.id} 번역: 원문 수치 ${n}이 빠짐` })
    }
  }
  const items = (ctx.prior.stage5 as Partial<AssessmentT> | undefined)?.items
  for (const [i, it] of (Array.isArray(items) ? items : []).entries()) {
    const mine = (tr?.exemplar_answers ?? []).filter((x) => x.item_no === i + 1)
    for (const ex of it.exemplar_answers ?? []) {
      if (!looksEnglish(ex.text)) continue
      const found = mine.some((x) => (ex.level ? x.label.includes(ex.level) : (x.label.match(/\d+/g)?.includes(String(ex.points)) ?? false)))
      if (!found) issues.push({ kind: 'other', detail: `문항 ${i + 1} 예시답안 ${ex.level ?? `${ex.points}점`}: ${TRANSLATION_MISSING}` })
    }
  }
  return issues
}

/**
 * [TS] 참고 메모(kind other, 막지 않음) — S-영-09 공동 자료 영어판(4단계). 세트 자료의 english_version_of 가 가리키는 공동 자료가
 * 이 세트가 체크한 공동 자료(prior.shared_materials)에 없으면 "체크한 공동 자료가 아님". 있으면 원본 본문·표의 수(번역 메모와 같은
 * 숫자 묶음·쉼표 무시 — NUMBER·normNum)가 영어판(제목·본문·표)에 모두 있는지 보고 빠진 수를 한 줄에 모아 적는다. 표의 행·열 수가
 * 원본과 다르면 그것도 적는다. 뜻이 맞게 옮겨졌는지·영어 수준은 [AI] 검토(REVIEW_FOCUS[4])가 본다. 과목을 가리지 않는다(필드가 있을 때만).
 */
function englishVersionIssues(o: MaterialsT, ctx: CheckCtx): Issue[] {
  const issues: Issue[] = []
  const sharedRaw = ctx.prior.shared_materials as Partial<MaterialsT['materials'][number]>[] | undefined
  const shared = Array.isArray(sharedRaw) ? sharedRaw : []
  for (const m of o.materials) {
    const from = m.english_version_of
    if (!from) continue
    const original = shared.find((s) => s.id === from)
    if (!original) { issues.push({ kind: 'other', detail: `자료 ${m.id}: 영어판의 원본으로 적은 공동 자료 ${from}가 이 세트에서 체크한 공동 자료가 아님(english_version_of)` }); continue }
    const label = `자료 ${m.id}(공동 자료 ${from}의 영어판)`
    const mine = new Set([m.title, m.body ?? '', tableText(m.table)].flatMap((s) => (s.match(NUMBER) ?? []).map(normNum)))
    const seen = new Set<string>()
    const missing: string[] = []
    for (const n of [original.body ?? '', tableText(original.table)].flatMap((s) => s.match(NUMBER) ?? [])) {
      const v = normNum(n)
      if (seen.has(v)) continue
      seen.add(v)
      if (!mine.has(v)) missing.push(n)
    }
    if (missing.length) issues.push({ kind: 'other', detail: `${label}: 원본 수치 ${missing.join(', ')}이 빠짐 — 영어판은 원본과 수치가 같아야 한다(S-영-09)` })
    if (original.table && m.table) {
      const [r0, c0, r1, c1] = [original.table.rows.length, original.table.columns.length, m.table.rows.length, m.table.columns.length]
      if (r0 !== r1 || c0 !== c1) issues.push({ kind: 'other', detail: `${label}: 표의 행·열 수가 원본과 다름(원본 ${r0}행 ${c0}열, 영어판 ${r1}행 ${c1}열)` })
    } else if (original.table && !m.table) issues.push({ kind: 'other', detail: `${label}: 원본은 표인데 영어판에 표가 없음` })
  }
  return issues
}

export function noticeTextIssues(text: string, where: string): Issue[] {
  const issues: Issue[] = []
  for (const [re, why] of NOTICE_FORBIDDEN) if (re.test(text)) issues.push({ kind: 'notice', detail: `${where}: "${text.match(re)?.[0]}" — ${why}` })
  return issues
}
// N-01(다른 학생 이름·점수·순위)·N-03(확정 전 AI 초안 인용)은 학생 데이터가 든 학생별 안내장에서만 판정할 수 있어 7단계 틀에는 적용하지 않는다 —
// T8에서 N-01은 lib/classroom/notice-lint.ts(원생 목록 대조), N-03은 안내장 초안 서버 액션(확정 채점만 읽음)이 맡는다.
function noticePlanIssues(o: NoticePlanT): Issue[] {
  const issues: Issue[] = []
  for (const p of o.per_lesson) {
    for (const [field, text] of [['topic_summary', p.topic_summary], ['preview', p.preview], ['home_study_suggestion', p.home_study_suggestion]] as const) issues.push(...noticeTextIssues(text, `${p.lesson_no}차시 ${field}`))
    if (!SUGGEST_ENDINGS.test(p.home_study_suggestion.trim())) issues.push({ kind: 'notice', detail: `${p.lesson_no}차시 가정 학습 제안이 청유형으로 끝나지 않음` })
    for (const q of p.quiz_notes) issues.push(...noticeTextIssues(q.wrong_note, `${p.lesson_no}차시 퀴즈 ${q.quiz_no}`))
    for (const c of p.criteria_phrases ?? []) for (const t of [...c.good, ...c.improve]) issues.push(...noticeTextIssues(t, `${p.lesson_no}차시 ${c.criterion_name}`))
  }
  return issues
}

/** 검토 AI를 부르기 전에 도는 순수 검사. 빈 배열이면 통과. zod 가 이미 거른 것은 다시 검사하지 않는다. */
export function staticIssues(stage: Stage, output: unknown, ctx: CheckCtx): Issue[] {
  switch (stage) {
    case 2: return reconstructionIssues(output as ReconstructionT, ctx)
    case 3: return lessonIssues(output as LessonDesignT, ctx)
    case 4: return [...materialIssues(output as MaterialsT), ...materialUseIssues((output as MaterialsT).materials, ctx, null), ...englishVersionIssues(output as MaterialsT, ctx)]
    case 5: return assessmentIssues(output as AssessmentT, ctx)
    case 6: return guideIssues(output as GuideT, ctx)
    case 7: return noticePlanIssues(output as NoticePlanT)
    default: return []
  }
}
