import type { z } from 'zod'
import { checkReconstructionFidelity, tokensFoundIn } from './fidelity'
import { levelRefFor } from './level-map'
import { structureIssues, kindFamily, sessionPlacementIssues, isAssessmentSession, lessonAssessments, ESSAY_MIN_MINUTES } from './assessment-structure'
import type { Stage, ReviewKind, Reconstruction, LessonDesign, Materials, Assessment, TeacherGuide, NoticePlan } from './schemas'
import { QUIZ_SHORT_ONLY, isShortQuiz } from './schemas'
import { titleHasSourceMarker, usedMaterialIds, mentionedMaterialIds, MAX_SET_MATERIALS } from './materials'
import { sortScale, zeroStep } from './scale'

export type Issue = { kind: ReviewKind; detail: string }
export type CheckCtx = {
  standards: { code: string; text: string }[]
  prior: Record<string, unknown>
  /** 대주제(선택) — 2단계 재구성 문장에 대주제 상황 낱말이 섞였을 때 반려 사유를 알아보기 쉽게 적는 데만 쓴다(판정은 바꾸지 않는다). */
  theme?: { title: string }
  /** 대주제 공유 자료 ID(A~Z, 오름차순 불필요). 3·5단계 [TS] 자문(공유 자료를 가리키지만 문항·활동지 어디도 안 쓴다)이 참조한다 — loadContext의 prior.shared_materials에서 온다(stages.ts staticCheck). */
  sharedMaterialIds?: string[]
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
export const zeroDistinguishesAttempt = (descriptor: string) => NO_RESPONSE.test(descriptor) && ATTEMPT.test(descriptor)

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

function lessonIssues(o: LessonDesignT, ctx: CheckCtx): Issue[] {
  const issues: Issue[] = []
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
    for (const q of l.teacher_script.questions) if (norm(q.if_stuck) === norm(q.expected_answer)) issues.push({ kind: 'other', detail: `${l.no}차시 발문 힌트가 정답과 같음` })
  }
  // 5단계가 이미 확정돼 있으면(예: 3단계를 나중에 다시 검토·편집) 그 문항들 기준으로도 무관한 공유 자료 인용을 짚는다 —
  // 보통은 3단계 시점에 5단계가 없어 건너뛴다(sharedMaterialCitationIssues 가 items 없으면 스스로 건너뛴다).
  const items5 = (ctx.prior.stage5 as { items?: { materials_used?: string[] | null }[] } | undefined)?.items
  issues.push(...sharedMaterialCitationIssues(o.lessons, items5, ctx.sharedMaterialIds))
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
const ALLOWED_COUNTS = /\d+\s*(점|자|글자|단어|문장|문단|줄|가지)|(근거|이유|자료|수치|방안|예|사례|문장|단어)\S{0,3}\s*\d+\s*개/g
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
  if (ARITHMETIC.test(text)) reasons.push('계산식')
  const word = text.match(SOLVING_WORDS)?.[0]
  if (word) reasons.push(`풀이 동사·지시 "${word}"`)
  if (STEP_ORDER.test(text)) reasons.push('풀이 순서')
  const rest = text.replace(ALLOWED_COUNTS, ' ')
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

function assessmentIssues(o: AssessmentT, ctx: CheckCtx): Issue[] {
  const issues: Issue[] = []
  // 세트 구조(대표 2026-09-26): zod 가 생성 때 거르지만, 검토는 저장된 출력(옛 판·손으로 고친 판)에도 돌므로 다시 본다
  for (const m of structureIssues(o.items)) issues.push({ kind: 'rubric', detail: `문항 구조: ${m}` })
  for (const [i, it] of o.items.entries()) if (!it.rubric.holistic) issues.push({ kind: 'rubric', detail: `문항 ${i + 1}(${it.kind}): 총체적 상/중/하가 없음 — 두 문항 모두 분석적 + 총체적 채점표(C-15)` })
  // 단원 평가 차시 안내장·채점은 두 문항의 요소를 이름으로 가른다(notice_plan.criteria_phrases, 안내장 AI 초안) — 문항 사이에 같은 이름이 있으면 섞인다
  const names = o.items.flatMap((it) => it.rubric.criteria.map((c) => c.name))
  const dup = [...new Set(names.filter((n, k) => names.indexOf(n) !== k))]
  if (dup.length) issues.push({ kind: 'rubric', detail: `채점 요소 이름이 문항 사이에 겹침(${dup.join(', ')}) — 문항마다 다른 이름을 쓴다` })
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
  const setMaterials = (ctx.prior.stage4 as MaterialsT | undefined)?.materials
  if (Array.isArray(setMaterials)) issues.push(...materialUseIssues(setMaterials, ctx, o.items))
  const lessons3 = (ctx.prior.stage3 as Partial<LessonDesignT> | undefined)?.lessons
  if (Array.isArray(lessons3)) issues.push(...sharedMaterialCitationIssues(lessons3, o.items, ctx.sharedMaterialIds))
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
    case 4: return [...materialIssues(output as MaterialsT), ...materialUseIssues((output as MaterialsT).materials, ctx, null)]
    case 5: return assessmentIssues(output as AssessmentT, ctx)
    case 6: return guideIssues(output as GuideT, ctx)
    case 7: return noticePlanIssues(output as NoticePlanT)
    default: return []
  }
}
