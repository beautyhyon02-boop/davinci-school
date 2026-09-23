import type { z } from 'zod'
import { checkReconstructionFidelity } from './fidelity'
import { levelRefFor } from './level-map'
import type { Stage, ReviewKind, Reconstruction, LessonDesign, Materials, Assessment, TeacherGuide, NoticePlan } from './schemas'

export type Issue = { kind: ReviewKind; detail: string }
export type CheckCtx = { standards: { code: string; text: string }[]; prior: Record<string, unknown> }
type ReconstructionT = z.infer<typeof Reconstruction>; type LessonDesignT = z.infer<typeof LessonDesign>; type MaterialsT = z.infer<typeof Materials>
type AssessmentT = z.infer<typeof Assessment>; type GuideT = z.infer<typeof TeacherGuide>; type NoticePlanT = z.infer<typeof NoticePlan>

const norm = (s: string) => s.replace(/[\s·,.]/g, '')
/** 부사만 다른 인접 척도 휴리스틱: 정도부사를 지운 뒤 같은 문장이면 참(스펙 §2.5 [TS]-9). */
const ADVERBS = /(매우|아주|다소|대체로|비교적|약간|조금|충분히|정확하게|정확히|적절하게|적절히|효과적으로|부분적으로|거의|상당히|명확하게|구체적으로)\s*/g
export const adverbOnlyDiff = (a: string, b: string) => norm(a.replace(ADVERBS, '')) === norm(b.replace(ADVERBS, '')) && norm(a) !== norm(b)

/** 안내장 문장 규칙(부록 A N-01·02·05·12)의 기계 검사 부분. lib/classroom/notice-lint.ts(T8)가 학생별 안내장에도 같은 목록을 쓴다. */
export const NOTICE_FORBIDDEN: [RegExp, string][] = [
  [/못한다|못했다|못함|실패|모른다|모릅니다/, '부정 서술어(못한다/실패/모른다) 대신 "~하는 데 어려움이 있다"'],
  [/등수|석차|상위\s*\d+%|백분위|평균보다/, '등수·백분위·비교 표현 금지'],
  [/(매우 우수|보통|미흡)\s*[.!]?$/, '단독 평어로 문장을 끝내지 않음'],
]
const SUGGEST_ENDINGS = /(봅시다|하세요|해요|하기 바랍니다|보세요)[.!]?$/

function reconstructionIssues(o: ReconstructionT, ctx: CheckCtx): Issue[] {
  const issues: Issue[] = []
  const byCode = new Map(ctx.standards.map((s) => [s.code, s.text]))
  for (const s of o.standards) {
    const original = byCode.get(s.code)
    if (!original) { issues.push({ kind: 'fidelity', detail: `${s.code}: 세트에 없는 성취기준` }); continue }
    if (norm(original) !== norm(s.original_text)) issues.push({ kind: 'fidelity', detail: `${s.code}: 원문 불일치` })
    const sources = [original, ...s.merged_with.map((c) => byCode.get(c) ?? '')]
    const f = checkReconstructionFidelity(s.reconstructed_text, sources)
    if (!f.ok) issues.push({ kind: 'fidelity', detail: `${s.code}: 원문에 없는 표현 ${f.unknownTokens.join(', ')}` })
  }
  const all = checkReconstructionFidelity(o.reconstruction, ctx.standards.map((s) => s.text))
  if (!all.ok) issues.push({ kind: 'fidelity', detail: `통합 문장: 원문에 없는 표현 ${all.unknownTokens.join(', ')}` })
  return issues
}

function lessonIssues(o: LessonDesignT, ctx: CheckCtx): Issue[] {
  const issues: Issue[] = []
  const covered = new Set(o.lessons.flatMap((l) => l.standards))
  for (const s of ctx.standards) if (!covered.has(s.code)) issues.push({ kind: 'coverage', detail: `${s.code}가 어느 차시에도 배정되지 않음` })
  const placed = o.lessons.filter((l) => l.assessment)
  const order = placed.map((l) => l.assessment)
  if (order.join(',') !== '서술형1,서술형2,논술형') issues.push({ kind: 'coverage', detail: `평가 배치 순서가 서술형1→서술형2→논술형이 아님(${order.join(',')})` })
  if (placed.length && placed[placed.length - 1].no !== o.lessons[o.lessons.length - 1].no) issues.push({ kind: 'coverage', detail: '논술형이 마지막 차시가 아님' })
  for (const l of o.lessons) {
    if (l.mergeable_with !== null) {
      const other = o.lessons.find((x) => x.no === l.mergeable_with)
      if (!other || Math.abs(other.no - l.no) !== 1) issues.push({ kind: 'other', detail: `${l.no}차시 병합 대상이 인접 차시가 아님` })
      else if (l.assessment && other.assessment) issues.push({ kind: 'other', detail: `${l.no}·${other.no}차시 병합: 둘 다 서·논술형 차시` })
    }
    if (l.flow.main.length < 2) issues.push({ kind: 'other', detail: `${l.no}차시 전개 소단계가 2개 미만` })
    // 스펙 §2.3: 논술형 차시는 전개에 "논술형 작성(35분 이상)" 소단계가 있어야 한다(zod 가 아니라 [TS] — 올린 v1 판도 검토로 돌린다)
    if (l.assessment === '논술형' && !l.flow.main.some((m) => m.step_label.includes('논술형') && m.minutes >= 35)) issues.push({ kind: 'other', detail: `${l.no}차시: 논술형 차시에는 35분 이상 작성 단계가 필요` })
    for (const [i, q] of l.formative_check.quiz.entries()) {
      if (q.type === 'choice' && (!q.choices || !q.choices.includes(q.answer))) issues.push({ kind: 'quiz', detail: `${l.no}차시 퀴즈 ${i + 1}: 정답이 보기에 없음` })
    }
    for (const q of l.teacher_script.questions) if (norm(q.if_stuck) === norm(q.expected_answer)) issues.push({ kind: 'other', detail: `${l.no}차시 발문 힌트가 정답과 같음` })
  }
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
  }
  return issues
}

function assessmentIssues(o: AssessmentT, ctx: CheckCtx): Issue[] {
  const issues: Issue[] = []
  for (const b of o.grade_boundaries) {
    const want = levelRefFor(b.grade)
    if (b.level_ref !== want) issues.push({ kind: 'rubric', detail: `등급 ${b.grade}의 level_ref(${b.level_ref})가 7등급↔수준 대응표(${want})와 다름` })
  }
  const materials = ((ctx.prior.stage4 as MaterialsT | undefined)?.materials ?? []).concat(((ctx.prior.shared_materials as MaterialsT['materials'] | undefined) ?? []))
  const byId = new Map(materials.map((m) => [m.id, m]))
  for (const [i, it] of o.items.entries()) {
    for (const id of it.materials_used) if (materials.length && !byId.has(id)) issues.push({ kind: 'other', detail: `문항 ${i + 1}: 없는 자료 ${id}` })
    if (materials.length && !it.materials_used.some((id) => byId.get(id)?.role === 'raw')) issues.push({ kind: 'other', detail: `문항 ${i + 1}: 원자료(raw)를 하나도 참조하지 않음` })
    for (const c of it.rubric.criteria) {
      const sorted = [...c.scale].sort((a, b) => a.points - b.points)
      for (let k = 1; k < sorted.length; k++) if (adverbOnlyDiff(sorted[k - 1].descriptor, sorted[k].descriptor)) issues.push({ kind: 'level', detail: `문항 ${i + 1} ${c.name}: ${sorted[k - 1].points}→${sorted[k].points}점이 부사만 다름` })
      if (!/무응답|미응답|미작성/.test(sorted[0].descriptor) || !/시도|일부|관련/.test(sorted[0].descriptor)) issues.push({ kind: 'rubric', detail: `문항 ${i + 1} ${c.name}: 0점 서술에 무응답·시도 구분이 없음` })
    }
    if (it.kind === '서술형') {
      // 스펙 §2.5: 서술형은 총점 단계마다(1..배점, 0점 제외) 예시답안 1개. zod 는 만점 1개만 강제한다.
      const covered = new Set(it.exemplar_answers.map((e) => e.points))
      const missing = Array.from({ length: it.points }, (_, k) => k + 1).filter((p) => !covered.has(p))
      if (missing.length) issues.push({ kind: 'rubric', detail: `문항 ${i + 1}: 부분점수 예시답안이 없음(${missing.join('·')}점 단계) — 1~${it.points}점 단계마다 하나씩 필요` })
    }
    if (it.kind === '논술형' && !it.situation) issues.push({ kind: 'other', detail: '논술형에 과제 상황(역할·청중·목적·결과물)이 없음' })
    if (it.kind === '논술형' && !it.rubric.criteria.some((c) => c.axis === '가치·태도')) issues.push({ kind: 'level', detail: '논술형 4요소 중 가치·태도 축이 없음(정당화 가능성 기준으로 서술)' })
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
  return issues
}

export function noticeTextIssues(text: string, where: string): Issue[] {
  const issues: Issue[] = []
  for (const [re, why] of NOTICE_FORBIDDEN) if (re.test(text)) issues.push({ kind: 'notice', detail: `${where}: "${text.match(re)?.[0]}" — ${why}` })
  return issues
}
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
    case 4: return materialIssues(output as MaterialsT)
    case 5: return assessmentIssues(output as AssessmentT, ctx)
    case 6: return guideIssues(output as GuideT, ctx)
    case 7: return noticePlanIssues(output as NoticePlanT)
    default: return []
  }
}
