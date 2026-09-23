import type { z } from 'zod'
import { Lesson, Material, Assessment, TeacherGuide, AssessmentItem, type ReconstructedStandard, type LearningGoal, type UnitPlan, type NoticePlan, type Reconstruction, type AXES } from './schemas'
import { levelMapFor, levelRefFor } from './level-map'

type LessonT = z.infer<typeof Lesson>
type MaterialT = z.infer<typeof Material>
type AssessmentT = z.infer<typeof Assessment>
type ItemT = z.infer<typeof AssessmentItem>
type GuideT = z.infer<typeof TeacherGuide>
export type ReconstructedStandardT = z.infer<typeof ReconstructedStandard>
export type LearningGoalT = z.infer<typeof LearningGoal>
export type UnitPlanT = z.infer<typeof UnitPlan>
export type NoticePlanT = z.infer<typeof NoticePlan>
export type ReconstructionT = z.infer<typeof Reconstruction>
type Axis = (typeof AXES)[number]
type MainStepT = LessonT['flow']['main'][number]

/** v2 스냅샷(publish.ts 의 Snapshot 과 동일 — 순환 import 를 피하려 여기서 구조적으로 정의). */
export type SnapshotV2 = {
  schema_version: 2
  cover: { title: string; subject: string; level: string; grade: number; unit?: string; version: number; published_at: string }
  standards: { code: string; text: string }[]
  intro: string
  reconstruction: string
  reconstruction_detail: ReconstructedStandardT[]
  learning_goals: LearningGoalT[]
  key_question: string
  unit_plan: UnitPlanT | null
  lessons: LessonT[]
  materials: MaterialT[]
  assessment: AssessmentT | null
  teacher_guide: GuideT | null
  notice_plan: NoticePlanT | null
  references: { id: string; source: string }[]
  generated_with: { models: string[] }
}

// ── v1 모양(2주차 스키마) ──────────────────────────────────────────────
type QuizV1 = { q: string; type: 'choice' | 'short'; choices: string[] | null; answer: string; explanation: string }
type LessonV1 = { no: number; standards: string[]; key_question: string; goal: string; flow: { intro: string; main: string; wrapup: string }; materials: string[]; quiz: QuizV1[]; assessment: '서술형1' | '서술형2' | '논술형' | null; mergeable_with: number | null; images?: string[] }
type MaterialV1 = { id: string; title: string; kind: 'table' | 'text' | 'chart'; body: string | null; table: MaterialT['table']; source: '자작'; images?: string[] }
type ShortRubricV1 = { levels: { points: number; expectation: string; example: string | null }[] }
type ExtendedRubricV1 = { criteria: { name: string; bands: Record<'4' | '3' | '2' | '1' | '0', string> }[] }
type ItemV1 = { kind: '서술형' | '논술형'; lesson_no: number; stem: string; conditions: { length: string; required: string[]; format: string }; points: number; rubric: ShortRubricV1 | ExtendedRubricV1 }
type AssessmentV1 = { items: ItemV1[]; grade_boundaries: { grade: number; min: number; max: number; band: '상' | '중' | '하' }[]; exemplars: { level: '상' | '중' | '하'; text: string; scores: number[]; total: number; grade: number }[]; feedback_templates: { 상: string; 중: string; 하: string } }
type GuideV1 = { general: GuideT['general']; glossary: GuideT['glossary']; per_lesson: { no: number; notes: string[] }[] }

export function isV1Snapshot(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false
  const s = raw as { schema_version?: number; lessons?: { flow?: { intro?: unknown } }[]; assessment?: { exemplars?: unknown } | null }
  if (s?.schema_version === 2) return false
  if (Array.isArray(s?.lessons) && s.lessons[0] && typeof s.lessons[0].flow?.intro === 'string') return true
  if (s?.assessment && 'exemplars' in s.assessment) return true
  return s?.schema_version === undefined
}

const PAPER_PREFIX = /^\[종이 답안\]\s*/
const MATERIAL_ID = /(?:^|[^A-Z])([A-Z])(?![A-Z])/

export function splitMaterialsV1(items: string[]): { used: string[]; needed: string[] } {
  const used = new Set<string>(); const needed: string[] = []
  for (const s of items) {
    const m = s.match(MATERIAL_ID)
    if (m && /자료/.test(s)) used.add(m[1]); else needed.push(s)
  }
  return { used: [...used].sort(), needed }
}

const STEP_MARK = /[①②③④⑤⑥⑦⑧]/u
/**
 * v1 전개 한 문장 → v2 소단계. ①②③… 표식으로 나눠 앞 절반/뒤 절반을 20/20분 두 단계로, 표식이 2개 미만이면 40분 한 단계.
 * 첫 표식 앞의 머리말("전개 40분 —")은 소단계 이름표가 대신하므로 버린다.
 */
export function splitMainV1(main: string): MainStepT[] {
  const parts = main.split(/(?=[①②③④⑤⑥⑦⑧])/u).map((s) => s.trim()).filter(Boolean)
  const marked = parts.length && !STEP_MARK.test(parts[0][0]) ? parts.slice(1) : parts
  if (marked.length < 2) return [{ step_label: '전개', minutes: 40, activities: [main] }]
  const half = Math.ceil(marked.length / 2)
  return [{ step_label: '개념·활동', minutes: 20, activities: marked.slice(0, half) }, { step_label: '적용·정리', minutes: 20, activities: marked.slice(half) }]
}

/** 채점 요소 이름 → 세 축(스펙 §2.5). 낱말로만 고르는 결정적 규칙이며 맞지 않으면 과정·기능. */
export function axisOf(name: string): Axis {
  if (/제안|판단|태도|입장|실천|가치|의견/.test(name)) return '가치·태도'
  if (/정확|정리|용어|개념|지식|계산/.test(name)) return '지식·이해'
  return '과정·기능'
}

/** 0점 서술의 꼬리: 무응답과 '시도했으나 관련 내용 없음'을 모두 0점으로 적는다(스펙 §2.5 [TS]-2). */
const ZERO_TAIL = ' (무응답과 시도했으나 관련 내용이 없는 경우 모두 0점)'

/** v1 차시 → v2. cautionNotes 는 v1 지침서 per_lesson.notes(있으면). 발문·활동지는 퀴즈·핵심질문에서 결정적으로 만든다. */
export function upgradeLessonV1(l: LessonV1, cautionNotes: string[]): LessonT {
  const { used, needed } = splitMaterialsV1(l.materials)
  const isEssay = l.assessment === '논술형'
  const fromQuiz = l.quiz.map((q) => ({ prompt: q.q, expected_answer: q.answer, if_stuck: q.explanation }))
  const questions = fromQuiz.length >= 2 ? fromQuiz.slice(0, 4) : [
    { prompt: l.key_question, expected_answer: l.goal, if_stuck: l.flow.intro },
    { prompt: `${l.key_question} — 자료에서 근거가 되는 수치 하나를 찾아보자.`, expected_answer: l.goal, if_stuck: l.flow.main },
  ]
  const q = l.quiz
  const tasks = q.length >= 2
    ? [
        { no: 1, prompt: q[0].q, tier: '기본' as const, level_ref: 'D~E' as const, answer_space: 'short' as const, expected: q[0].answer },
        { no: 2, prompt: q[1].q, tier: '표준' as const, level_ref: 'C' as const, answer_space: 'short' as const, expected: q[1].answer },
        { no: 3, prompt: l.key_question, tier: '도전' as const, level_ref: 'A~B' as const, answer_space: 'lines' as const, expected: l.goal },
      ]
    : [
        { no: 1, prompt: l.key_question, tier: '기본' as const, level_ref: 'D~E' as const, answer_space: 'short' as const, expected: l.goal },
        { no: 2, prompt: `${l.key_question} 근거가 되는 자료의 수치를 두 개 적어 보자.`, tier: '표준' as const, level_ref: 'C' as const, answer_space: 'lines' as const, expected: l.goal },
        { no: 3, prompt: `${l.key_question} 자신의 판단과 이유를 문단으로 써 보자.`, tier: '도전' as const, level_ref: 'A~B' as const, answer_space: 'lines' as const, expected: l.goal },
      ]
  return {
    no: l.no, standards: l.standards, topic: l.goal.slice(0, 40), key_question: l.key_question, goal: l.goal,
    time_budget: { intro_min: 10, main_min: 40, wrapup_min: 10 },
    // 논술형 차시: v1 은 전개(안내) + 정리 자리의 '평가 35분'이었다 → 안내 5분 + 논술형 작성 35분 두 소단계(스펙 §2.3 [TS])
    flow: isEssay
      ? { intro: [l.flow.intro], main: [{ step_label: '논술형 안내', minutes: 5, activities: [l.flow.main] }, { step_label: '논술형 작성', minutes: 35, activities: [l.flow.wrapup] }], wrapup: ['제출한 답안을 작성 조건과 하나씩 대조해 스스로 점검한다.'] }
      : { intro: [l.flow.intro], main: splitMainV1(l.flow.main), wrapup: [l.flow.wrapup] },
    teacher_script: { questions },
    materials_used: used, materials_needed: needed,
    caution_notes: cautionNotes.length ? cautionNotes.slice(0, 4) : [l.goal],
    worksheet: { tasks, self_check: ['오늘 핵심질문에 내 말로 답할 수 있다.'] },
    formative_check: { quiz: l.quiz },
    assessment: l.assessment, mergeable_with: l.mergeable_with, merge_note: null, images: l.images ?? [],
  }
}

export function upgradeMaterialV1(m: MaterialV1): MaterialT {
  return { id: m.id, title: m.title, kind: m.kind, body: m.body, table: m.table, source: { kind: '자작', attribution: null, ai_assisted: false }, role: 'raw', images: m.images ?? [] }
}

const VERB_HINTS: [RegExp, string][] = [[/구해|구한다|구하/, '구하다'], [/적는다|적어|적을/, '적다'], [/쓴다|쓰시오|쓸/, '쓰다'], [/고른다|고르/, '고르다'], [/정한다|정하/, '정하다'], [/나눈다|나누/, '나누다'], [/정리/, '정리하다'], [/인용/, '인용하다'], [/비교/, '비교하다'], [/설명/, '설명하다'], [/판단/, '판단하다'], [/제안/, '제안하다']]
export function verbOf(text: string): string { return VERB_HINTS.find(([re]) => re.test(text))?.[1] ?? '서술하다' }

function stemV2(stem: string, points: number): string {
  const stripped = stem.replace(/\s*[\(\[]\s*\d+\s*점\s*[\)\]]\s*$/u, '').trim()
  return `${stripped} [${points}점]`
}
function evaluationElement(stem: string): string {
  const core = stem.replace(/\s*[\(\[]\s*\d+\s*점\s*[\)\]]\s*$/u, '').replace(/\.$/, '')
  return core.replace(/(하시오|쓰시오|서술하시오|구하시오|정하시오|고르시오)$/u, '기').replace(/시오$/u, '기')
}
function fillScale(levels: { points: number; expectation: string; example: string | null }[], max: number) {
  const byPts = new Map(levels.map((l) => [l.points, l]))
  const scale = []
  let last = levels[levels.length - 1]
  for (let p = 0; p <= max; p++) {
    const hit = byPts.get(p) ?? last
    const hit0 = byPts.get(0)
    const zero = hit0 ? `${hit0.expectation}${ZERO_TAIL}` : '무응답 또는 시도했으나 관련 내용 없음'
    scale.push({ points: p, descriptor: p === 0 ? zero : hit.expectation, example: byPts.get(p)?.example ?? null })
    if (byPts.get(p)) last = byPts.get(p)!
  }
  return scale
}

export function upgradeItemV1(it: ItemV1, exemplars: AssessmentV1['exemplars']): ItemT {
  const paper = PAPER_PREFIX.test(it.conditions.format)
  const conditions = {
    items: it.conditions.required.map((text, i) => ({ no: i + 1, text, verb: verbOf(text), points: null, category: i === it.conditions.required.length - 1 && it.conditions.required.length >= 4 ? '형식' as const : '내용' as const })),
    length: it.conditions.length, format: it.conditions.format.replace(PAPER_PREFIX, ''), answer_mode: paper ? 'paper' as const : 'screen' as const, overflow_rule: null,
  }
  const allNos = conditions.items.map((c) => c.no)
  let rubric: ItemT['rubric']; let exemplar_answers: ItemT['exemplar_answers']
  if ('levels' in it.rubric) {
    const scale = fillScale(it.rubric.levels, it.points)
    rubric = { criteria: [{ name: `${it.kind} 채점표`, axis: axisOf(`${it.kind} 채점표`), condition_nos: allNos, max: it.points, scale }], holistic: null, notes: ['예시답안과 표현이 달라도 의미가 같으면 인정한다.'] }
    exemplar_answers = it.rubric.levels.filter((l) => l.points > 0 && l.example).map((l) => ({
      level: null, points: l.points, scores: [l.points], assumed_short_points: null, text: l.example!.length >= 20 ? l.example! : `${l.example} — ${l.expectation}`, rationale: `채점표 ${l.points}점 단계의 기대 수행에 해당함`,
    }))
  } else {
    const criteria = it.rubric.criteria.map((c) => ({ name: c.name, axis: axisOf(c.name), condition_nos: allNos, max: 4, scale: (['0', '1', '2', '3', '4'] as const).map((k) => ({ points: Number(k), descriptor: k === '0' ? `${c.bands[k]}${ZERO_TAIL}` : c.bands[k], example: null })) }))
    rubric = { criteria, holistic: { 상: criteria.map((c) => c.scale[4].descriptor).join(' / '), 중: criteria.map((c) => c.scale[2].descriptor).join(' / '), 하: criteria.map((c) => c.scale[1].descriptor).join(' / ') }, notes: ['예시답안과 표현이 달라도 의미가 같으면 인정한다.'] }
    exemplar_answers = exemplars.map((e) => {
      const sum = e.scores.reduce((s, v) => s + v, 0)
      // v1 total 은 서술형 두 문항의 가정 점수를 포함했다 → 그 차이를 assumed_short_points 로 남겨 등급 밴드 대조를 유지한다
      return { level: e.level, points: sum, scores: e.scores, assumed_short_points: Math.max(0, Math.min(6, e.total - sum)), text: e.text, rationale: `채점표로 채점한 요소별 점수 ${e.scores.join('·')} = ${sum}점(서술형 ${Math.max(0, Math.min(6, e.total - sum))}점 가정 시 ${e.total}점)` }
    })
  }
  const { used } = splitMaterialsV1(it.conditions.required.concat(it.stem))
  return {
    kind: it.kind, lesson_no: it.lesson_no, points: it.points, evaluation_elements: [evaluationElement(it.stem)], situation: null,
    materials_used: used.length ? used : ['A'], stem: stemV2(it.stem, it.points), conditions, rubric, exemplar_answers,
    level_map: levelMapFor(it.points), min_competency: null, references: [],
  }
}

export function upgradeAssessmentV1(a: AssessmentV1): AssessmentT {
  return {
    items: a.items.map((it) => upgradeItemV1(it, a.exemplars)),
    grade_boundaries: a.grade_boundaries.map((b) => ({ ...b, level_ref: levelRefFor(b.grade) })),
    feedback_templates: a.feedback_templates,
  }
}

export function upgradeTeacherGuideV1(g: GuideV1, lessons: LessonT[], assessment: AssessmentT | null): GuideT {
  const merge_guide = lessons.filter((l) => l.mergeable_with !== null).map((l) => {
    const other = lessons.find((x) => x.no === l.mergeable_with)
    return { lessons: [l.no, l.mergeable_with!] as [number, number], skip_activities: other ? other.flow.intro : l.flow.wrapup, time_budget_120: { intro_min: 10, main_min: 90, wrapup_min: 20 } }
  })
  const common_errors = (assessment?.items ?? []).map((it, i) => {
    const c = it.rubric.criteria[0]
    return { item_no: i + 1, error: c.scale[1]?.descriptor ?? c.scale[0].descriptor, how_to_read: c.scale[c.max].descriptor }
  })
  return {
    general: g.general, glossary: g.glossary, merge_guide,
    grading_guide: {
      common_errors: common_errors.length >= 3 ? common_errors : [...common_errors, ...Array.from({ length: 3 - common_errors.length }, (_, i) => ({ item_no: common_errors.length + i + 1, error: '관련 내용 없이 제출', how_to_read: '채점표 0점 서술을 적용' }))],
      review_tips: ['요소마다 인용된 근거 문장이 학생 답안에 실제로 있는지 먼저 확인한다.', '채점 시 유의점의 관용 범위(표현 차이·반올림)를 적용한 뒤 점수를 조정하고 조정 이유를 남긴다.'],
      retry_guidance: '확정 뒤 보완할 점을 읽고 스스로 고칠 수 있는 학생에게 재도전을 연다. 향상된 부분을 안내장에 적는다.',
    },
    per_lesson: g.per_lesson.map((p) => ({ no: p.no, notes: p.notes.slice(0, 3) })),
  }
}

export function upgradeReconstructionV1(standards: { code: string; text: string }[]): ReconstructedStandardT[] {
  return standards.map((s) => ({ code: s.code, original_text: s.text, reconstruction_type: '유지', merged_with: [], reconstructed_text: s.text, reason: ['4~6차시 압축'], learning_elements: [s.text] }))
}

export function unitPlanFrom(title: string, keyQuestion: string, lessons: LessonT[], a: AssessmentT | null): UnitPlanT {
  return {
    set_title: title, set_key_question: keyQuestion || lessons[0]?.key_question || title,
    lesson_map: lessons.map((l) => ({ lesson_no: l.no, standards: l.standards, topic: l.topic })),
    assessment_plan: {
      formative: '차시별 마무리 퀴즈 3문항(논술형 차시는 0문항)',
      summative_placement: lessons.filter((l) => l.assessment).map((l) => ({ lesson_no: l.no, kind: l.assessment! })),
      rubric_note: a?.feedback_templates ?? { 상: '요구한 요소를 모두 충족', 중: '핵심 요소를 충족하나 설명이 부분적', 하: '일부 요소만 충족' },
    },
  }
}

const AXIS_HINT: [RegExp, '지식·이해' | '가치·태도'][] = [[/뜻|의미|용어|설명할 수 있다|이해/, '지식·이해'], [/인식|태도|참여|실천|가치|필요성|유용성/, '가치·태도']]
/**
 * v1 2단계 출력 → v2 2단계(Reconstruction). 학습 목표 축은 낱말로 고르고, 빠진 축은 첫·끝·둘째 목표에 채워 세 축을 모두 갖춘다
 * (zod superRefine). 재구조화 표는 원문 유지(upgradeReconstructionV1), level_anchor 는 서버(enrichOutput)가 채운다.
 */
export function buildReconstructionV2(v1: { reconstruction: string; learning_goals: string[]; key_question_candidates: string[] }, standards: { code: string; text: string }[]): ReconstructionT {
  const goals: LearningGoalT[] = v1.learning_goals.map((text) => ({ text, axis: AXIS_HINT.find(([re]) => re.test(text))?.[1] ?? '과정·기능' }))
  const has = (a: Axis) => goals.some((g) => g.axis === a)
  if (!has('지식·이해')) goals[0] = { ...goals[0], axis: '지식·이해' }
  if (!has('가치·태도')) goals[goals.length - 1] = { ...goals[goals.length - 1], axis: '가치·태도' }
  const mid = Math.min(1, goals.length - 1)
  if (!has('과정·기능')) goals[mid] = { ...goals[mid], axis: '과정·기능' }
  return { standards: upgradeReconstructionV1(standards), reconstruction: v1.reconstruction, learning_goals: goals, level_anchor: [], key_question_candidates: v1.key_question_candidates }
}

export function upgradeSnapshot(raw: unknown): SnapshotV2 {
  // 빈 값·객체 아님·cover 없음은 스냅샷이 아니다 — TypeError 대신 분명한 오류로 멈춘다
  const cover = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as { cover?: unknown }).cover : undefined
  if (!cover || typeof cover !== 'object') throw new Error('snapshot has no cover')
  if (!isV1Snapshot(raw)) return raw as SnapshotV2
  const s = raw as { cover: SnapshotV2['cover']; standards: SnapshotV2['standards']; intro: string; reconstruction: string; learning_goals: (string | LearningGoalT)[]; key_question: string; lessons: LessonV1[]; materials: MaterialV1[]; assessment: AssessmentV1 | null; teacher_guide: GuideV1 | null; generated_with: { models: string[] } }
  const notesFor = (no: number) => s.teacher_guide?.per_lesson.find((p) => p.no === no)?.notes ?? []
  const lessons = (s.lessons ?? []).map((l) => upgradeLessonV1(l, notesFor(l.no)))
  const assessment = s.assessment ? upgradeAssessmentV1(s.assessment) : null
  return {
    schema_version: 2, cover: s.cover, standards: s.standards, intro: s.intro,
    reconstruction: s.reconstruction, reconstruction_detail: upgradeReconstructionV1(s.standards),
    learning_goals: (s.learning_goals ?? []).map((g) => (typeof g === 'string' ? { text: g, axis: '과정·기능' as const } : g)),
    key_question: s.key_question,
    unit_plan: unitPlanFrom(s.cover.title, s.key_question, lessons, assessment),
    lessons, materials: (s.materials ?? []).map(upgradeMaterialV1), assessment,
    teacher_guide: s.teacher_guide ? upgradeTeacherGuideV1(s.teacher_guide, lessons, assessment) : null,
    notice_plan: null, references: [], generated_with: s.generated_with,
  }
}
