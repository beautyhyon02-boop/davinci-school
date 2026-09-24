import type { z } from 'zod'
import { Lesson, Material, Assessment, TeacherGuide, AssessmentItem, type ReconstructedStandard, type LearningGoal, type UnitPlan, type NoticePlan, type Reconstruction, type AXES } from './schemas'
import { levelMapFor, levelRefFor } from './level-map'
import { lessonAssessments, kindFamily, isUnitAssessmentSession, type ItemKind } from './assessment-structure'
import { conditionHints, materialNumbers } from './checks'

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
const MATERIAL_ID = /(?:^|[^A-Z])([A-Z])(?![A-Z])/g

/** v1 준비물/조건 문장에서 '자료 X' ID(대문자 한 글자, 여러 개면 모두)를 뽑고 나머지는 준비물로 남긴다. */
export function splitMaterialsV1(items: string[]): { used: string[]; needed: string[] } {
  const used = new Set<string>(); const needed: string[] = []
  for (const s of items) {
    const ids = /자료/.test(s) ? [...s.matchAll(MATERIAL_ID)].map((m) => m[1]) : []
    if (ids.length) ids.forEach((id) => used.add(id)); else needed.push(s)
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

/** 핵심질문 끝의 물음표를 뗀 몸통(교사 확인 문장에 넣는다). */
const kqCore = (kq: string) => kq.trim().replace(/[?？]+$/u, '')

const TOPIC_LIMIT = 48
// 이 조사로 끝나면 목 잘린 문장처럼 읽힌다("…방법을" 처럼) — 뒤 경계까지 통째로 물러난다. "에서"가 "에"보다 먼저 와야
// endsWith 로 검사할 때 더 긴 쪽부터 걸린다(예: "…학교에서" 는 "에서" 로 먼저 잡혀야지 "에" 로 잘못 잡히지 않는다).
const TRAILING_PARTICLES = ['에서', '을', '를', '이', '가', '은', '는', '와', '과', '의', '에']
// ㄹ 탈락 어간의 "-ㄴ다" 현재형은 규칙(어간 + 는다/한다)으로 되돌릴 수 없다 — 필요해지면 여기에 보탠다.
const L_STEM_PRESENT: [string, string][] = [['만든다', '만들기']]
/**
 * v1 차시 목표 문장 → 짧은 차시 주제(제목처럼 쓰인다, PackageView 헤딩·안내장 lesson_map). 문장 끝의 마침표만 떼고,
 * "~한다"(하다 동사)는 "~하기"로, "~는다"(받침 있는 동사 현재형)는 "~기"로 바꿔 명사형 제목처럼 읽히게 한다
 * (정한다→정하기, 읽는다→읽기). ㄹ 탈락 어간은 L_STEM_PRESENT 의 예외로만 되돌린다(만든다→만들기). 그 밖의 "~다"
 * 로 끝나는 문장(세운다, 그린다 …)은 어간을 안전하게 되돌릴 규칙이 없으므로 손대지 않고 문장을 그대로 둔다 —
 * 관형사형("정한")처럼 읽히는 어중간한 말을 만드느니 온전한 문장을 쓰는 편이 낫다.
 * 48자 이하면 그대로 쓴다. 넘으면 공백·"·"·"," 경계에서 잘라 "…" 를 붙이되, 단어 중간을 자르지 않고 잘린 끝이
 * 조사 하나만 남는 조각(TRAILING_PARTICLES)이면 그 앞 경계까지 통째로 물러난다(원래 버그가 바로 이 모양이었다).
 */
export function topicFromGoal(goal: string): string {
  let s = goal.trim().replace(/\.$/u, '').trim()
  const lStem = L_STEM_PRESENT.find(([from]) => s.endsWith(from))
  if (lStem) s = s.slice(0, -lStem[0].length) + lStem[1]
  else if (s.endsWith('한다')) s = s.slice(0, -2) + '하기'
  else if (s.endsWith('는다')) s = s.slice(0, -2) + '기'
  if (s.length <= TOPIC_LIMIT) return s
  const prefix = s.slice(0, TOPIC_LIMIT)
  let cut = -1
  for (let i = prefix.length - 1; i > 0; i--) if (/[\s·,]/u.test(prefix[i])) { cut = i; break }
  let head = (cut > 0 ? prefix.slice(0, cut) : prefix).replace(/[\s·,]+$/u, '')
  for (;;) {
    const particle = TRAILING_PARTICLES.find((p) => head.endsWith(p))
    if (!particle) break
    const lastBoundary = Math.max(head.lastIndexOf(' '), head.lastIndexOf('·'), head.lastIndexOf(','))
    if (lastBoundary < 0) break // 경계가 더 없으면(한 낱말뿐이면) 그대로 둔다 — 빈 문자열보다는 낫다
    head = head.slice(0, lastBoundary).replace(/[\s·,]+$/u, '')
  }
  return `${head}…`
}

const squash = (s: string) => s.replace(/\s+/g, '')
/**
 * 막혔을 때 힌트(L-06): v1 퀴즈 해설이 정답을 그대로 담고 있으면 정답을 말하지 않는 중립 힌트로 바꾼다.
 * 정답 키가 "A / B"(같은 뜻의 다른 표기, judgeQuiz 와 같은 약속)면 표기 하나라도 해설에 있으면 바꾼다.
 */
function hintFor(q: QuizV1): string {
  const said = squash(q.explanation)
  if (!q.answer.split('/').map(squash).some((k) => k.length >= 2 && said.includes(k))) return q.explanation
  return q.type === 'choice'
    ? '보기를 하나씩 자료나 배운 뜻과 대조해, 맞지 않는 것부터 지워 보게 한다.'
    : '질문의 핵심 낱말에 밑줄을 긋고, 자료나 배운 뜻에서 같은 낱말이 나오는 곳을 찾아보게 한다.'
}

/** 옛 차시 라벨('서술형1'·'서술형2'·'논술형' 문자열 하나, null) → 배열(대표 2026-09-26 구조의 라벨: '서술형'·'논술형'). */
export function assessmentKindsV1(a: unknown): ItemKind[] {
  return lessonAssessments({ assessment: a }).map(kindFamily)
}

/**
 * v2 초기 판·초안(2026-09-26 이전)의 차시 모양을 맞춘다: assessment 문자열·null → 배열, kind 가 없으면 논술형을 보고 퀴즈가 없는
 * 차시는 'assessment'(옛 논술형 차시), 나머지는 'teaching'. 문항·배점·차시 번호는 건드리지 않는다(옛 구조 그대로 — 스펙 §4.3).
 * 고칠 것이 없으면 같은 객체를 돌려준다.
 */
export function normalizeLessonV2(l: LessonT): LessonT {
  const raw = l as unknown as { assessment?: unknown; kind?: unknown }
  const kindsOk = Array.isArray(raw.assessment) && raw.assessment.every((k) => k === '서술형' || k === '논술형')
  const kindOk = raw.kind === 'teaching' || raw.kind === 'assessment'
  if (kindsOk && kindOk) return l
  const assessment = kindsOk ? l.assessment : assessmentKindsV1(raw.assessment)
  const kind = kindOk ? l.kind : assessment.includes('논술형') && (l.formative_check?.quiz ?? []).length === 0 ? 'assessment' as const : 'teaching' as const
  return { ...l, assessment, kind }
}

/** 차시 목록에 normalizeLessonV2 를 입힌다. 하나도 바뀌지 않으면 같은 배열. */
export function normalizeLessonsV2(lessons: LessonT[]): LessonT[] {
  const out = lessons.map(normalizeLessonV2)
  return out.every((l, i) => l === lessons[i]) ? lessons : out
}

/**
 * v2 판을 읽을 때의 모양 맞추기(차시 라벨·kind, 평가 계획 라벨, 조건의 풀이 힌트 — C-32). 고칠 것이 없으면 같은 객체(스펙 §4.3).
 * 조건 정리(cleanAssessmentConditions)는 2026-09-26 이전에 v2 로 이미 저장된 판(문항 schema_version 은 2지만 조건은 옛 규칙 이전)까지 다시 본다.
 */
export function normalizeSnapshotV2(s: SnapshotV2): SnapshotV2 {
  const lessons = normalizeLessonsV2(s.lessons ?? [])
  const plan = s.unit_plan?.assessment_plan?.summative_placement
  const planFix = Array.isArray(plan) && plan.some((p) => p.kind !== '서술형' && p.kind !== '논술형')
  const assessment = cleanAssessmentConditions(s.assessment, s.materials ?? [])
  if (lessons === s.lessons && !planFix && assessment === s.assessment) return s
  const unit_plan = planFix && s.unit_plan
    ? { ...s.unit_plan, assessment_plan: { ...s.unit_plan.assessment_plan, summative_placement: plan!.map((p) => ({ ...p, kind: kindFamily(p.kind) })) } }
    : s.unit_plan
  return { ...s, lessons, unit_plan, assessment }
}

/**
 * v1 차시 → v2. cautionNotes 는 v1 지침서 per_lesson.notes(있으면). 발문·활동지는 퀴즈·핵심질문에서 결정적으로 만든다.
 * v1 에는 도전 과제·논술형 차시 발문의 예상 답이 없다 — 차시 목표 문장이나 흐름 문장("도입 10분 — …")을 옮기면 정답처럼 읽히므로
 * 핵심질문에서 만든 '교사 확인' 기준과 정답을 말하지 않는 힌트를 넣는다(L-06·L-08). 좋은 기준은 AI 생성본·PATCHES 가 채운다.
 */
export function upgradeLessonV1(l: LessonV1, cautionNotes: string[]): LessonT {
  const { used, needed } = splitMaterialsV1(l.materials)
  const isEssay = l.assessment === '논술형'
  const kq = kqCore(l.key_question)
  const fromQuiz = l.quiz.map((q) => ({ prompt: q.q, expected_answer: q.answer, if_stuck: hintFor(q) }))
  const questions = fromQuiz.length >= 2 ? fromQuiz.slice(0, 4) : [
    { prompt: l.key_question, expected_answer: `학생마다 다를 수 있음 — 자료의 수치나 내용을 근거로 들어 "${kq}"에 답하면 인정`, if_stuck: '핵심질문을 다시 읽고, 자료에서 질문과 관련된 부분에 밑줄을 그어 보게 한다.' },
    { prompt: `${l.key_question} — 자료에서 근거가 되는 수치 하나를 찾아보자.`, expected_answer: '자료에 실제로 있는 수치 하나(단위 포함)와 그 수치가 있는 자료 이름', if_stuck: '자료의 제목과 표의 열 이름을 먼저 읽고, 질문과 관련된 칸을 손가락으로 짚어 보게 한다.' },
  ]
  const q = l.quiz
  const challenge = { no: 3, tier: '도전' as const, level_ref: 'A~B' as const, answer_space: 'lines' as const, expected: `교사 확인: 자료의 수치나 내용을 근거로 "${kq}"에 대한 자신의 판단과 이유를 썼는지 본다(정답 문장은 하나가 아님)` }
  const tasks = q.length >= 2
    ? [
        { no: 1, prompt: q[0].q, tier: '기본' as const, level_ref: 'D~E' as const, answer_space: 'short' as const, expected: q[0].answer },
        { no: 2, prompt: q[1].q, tier: '표준' as const, level_ref: 'C' as const, answer_space: 'short' as const, expected: q[1].answer },
        { ...challenge, prompt: l.key_question },
      ]
    : [
        { no: 1, prompt: l.key_question, tier: '기본' as const, level_ref: 'D~E' as const, answer_space: 'short' as const, expected: `교사 확인: "${kq}"에 자기 말로 한 문장 답을 썼는지 본다` },
        { no: 2, prompt: `${l.key_question} 근거가 되는 자료의 수치를 두 개 적어 보자.`, tier: '표준' as const, level_ref: 'C' as const, answer_space: 'lines' as const, expected: '교사 확인: 자료에 실제로 있는 수치 두 개를 단위와 함께 옮겨 적었는지 본다' },
        { ...challenge, prompt: `${l.key_question} 자신의 판단과 이유를 문단으로 써 보자.` },
      ]
  return {
    no: l.no, standards: l.standards, topic: topicFromGoal(l.goal), key_question: l.key_question, goal: l.goal,
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
    // 옛 판은 구조를 그대로 둔다(스펙 §4.3): 교수 차시 안의 서술형은 그 차시에, 논술형 차시(퀴즈 0·작성 35분)는 kind 'assessment'
    kind: isEssay ? 'assessment' : 'teaching',
    assessment: assessmentKindsV1(l.assessment), mergeable_with: l.mergeable_with, merge_note: null, images: l.images ?? [],
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
// ㄹ 탈락 동사는 "~시오" 앞에서 ㄹ이 빠진다(만들다 → 만드시오) — 명사형으로 돌릴 때 되살린다
const L_DROP: [RegExp, string][] = [[/만드시오$/u, '만들기'], [/여시오$/u, '열기']]
/** 문두 → 평가 요소 "~하기" 명사형(C-18). 배점 꼬리·마침표를 떼고 "~시오"만 "~기"로 바꾼다(동사 어간은 그대로: 쓰시오 → 쓰기). */
export function evaluationElement(stem: string): string {
  const core = stem.replace(/\s*[\(\[]\s*\d+\s*점\s*[\)\]]\s*$/u, '').trim().replace(/\.$/, '')
  const irregular = L_DROP.find(([re]) => re.test(core))
  return irregular ? core.replace(irregular[0], irregular[1]) : core.replace(/시오$/u, '기')
}
const SHORT_EXEMPLAR = '(짧은 답안 예시, 학생이 쓴 전부) '
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

type ConditionT = ItemT['conditions']['items'][number]

const LEADING_MARK = /^[①②③④⑤⑥⑦⑧]\s*/u
const PARAGRAPH_PREFIX = /^(첫|둘째|셋째|넷째|다섯째)\s*문단(?:\([^)]*\))?\s*[:：]\s*/u
/** 옛 조건 문장 앞의 목록 표식(①②③…)과 "첫 문단:" 같은 문단 이름표를 뗀다(정리할 때만 — 지금 만드는 조건은 애초에 붙이지 않는다). */
export function stripConditionMarkers(text: string): string {
  return text.replace(LEADING_MARK, '').replace(PARAGRAPH_PREFIX, '').trim()
}

/**
 * 조건 문장을 표식 없이 다듬고, 풀이 힌트(conditionHints, checks.ts — C-32)가 남은 것을 지운 뒤 1..n 으로 다시 번호 매긴다.
 * 카테고리·배점은 (남은 조건에 한해) 손대지 않는다 — 위치로 새로 정하지 않고 원래 값을 그대로 옮긴다.
 */
function filterEssayConditions(items: ConditionT[], materialNums: Set<string>): ConditionT[] {
  return items
    .map((c) => ({ ...c, text: stripConditionMarkers(c.text) }))
    .filter((c) => conditionHints(c.text, materialNums).length === 0)
    .map((c, i) => ({ ...c, no: i + 1, verb: verbOf(c.text) }))
}

/**
 * v1 논술형 조건(required[]) → v2 조건 배열. 옛 카테고리 규칙(마지막 하나가 4개 이상일 때만 '형식')을 원래 개수·자리에
 * 대고 먼저 매긴 뒤 풀이 힌트를 지운다 — 지운 다음 자리로 다시 매기지 않는다(정리 전 규칙 그대로).
 */
function buildLegacyConditionItems(required: string[], materials: MaterialT[]): ConditionT[] {
  const raw: ConditionT[] = required.map((text, i) => ({ no: i + 1, text, verb: verbOf(text), points: null, category: i === required.length - 1 && required.length >= 4 ? '형식' as const : '내용' as const }))
  return filterEssayConditions(raw, materialNumbers(materials))
}

export function upgradeItemV1(it: ItemV1, exemplars: AssessmentV1['exemplars'], materials: MaterialT[] = []): ItemT {
  const paper = PAPER_PREFIX.test(it.conditions.format)
  const { used } = splitMaterialsV1(it.conditions.required.concat(it.stem))
  const usedMaterials = materials.filter((m) => used.includes(m.id))
  const conditions = {
    // C-32(2026-09-26 이후 옛 판 읽기 정리): 서술형은 조건 없음, 논술형은 풀이 힌트를 지운 지침만 남긴다
    items: it.kind === '서술형' ? [] : buildLegacyConditionItems(it.conditions.required, usedMaterials),
    length: it.conditions.length, format: it.conditions.format.replace(PAPER_PREFIX, ''), answer_mode: paper ? 'paper' as const : 'screen' as const, overflow_rule: null,
  }
  const allNos = conditions.items.map((c) => c.no)
  let rubric: ItemT['rubric']; let exemplar_answers: ItemT['exemplar_answers']
  if ('levels' in it.rubric) {
    const scale = fillScale(it.rubric.levels, it.points)
    rubric = { criteria: [{ name: `${it.kind} 채점표`, axis: axisOf(`${it.kind} 채점표`), condition_nos: allNos, max: it.points, scale }], holistic: null, notes: ['예시답안과 표현이 달라도 의미가 같으면 인정한다.'] }
    // 예시답안 text 는 학생 답안 그대로 둔다(채점표 서술을 덧붙이지 않음) — 서술은 rationale 로. zod 가 text 20자 이상을 요구하므로
    // 짧은 v1 예시는 앞에 '짧은 답안' 표시만 붙인다(표시는 답안 내용이 아니다).
    exemplar_answers = it.rubric.levels.filter((l) => l.points > 0 && l.example).map((l) => ({
      level: null, points: l.points, scores: [l.points], assumed_short_points: null,
      text: l.example!.length >= 20 ? l.example! : `${SHORT_EXEMPLAR}${l.example}`,
      rationale: `채점표 ${l.points}점 단계에 해당함: ${l.expectation}`,
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
  return {
    kind: it.kind, lesson_no: it.lesson_no, points: it.points, evaluation_elements: [evaluationElement(it.stem)], situation: null,
    materials_used: used.length ? used : ['A'], stem: stemV2(it.stem, it.points), conditions, rubric, exemplar_answers,
    level_map: levelMapFor(it.points), min_competency: null, references: [],
  }
}

export function upgradeAssessmentV1(a: AssessmentV1, materials: MaterialT[] = []): AssessmentT {
  return {
    items: a.items.map((it) => upgradeItemV1(it, a.exemplars, materials)),
    grade_boundaries: a.grade_boundaries.map((b) => ({ ...b, level_ref: levelRefFor(b.grade) })),
    feedback_templates: a.feedback_templates,
  }
}

/** 문항 하나에 남은 조건 중 서술형인데 조건이 있거나, 논술형인데 풀이 힌트가 남은 것이 있는지(둘 다 정리 대상). */
function itemNeedsConditionCleanup(it: ItemT, materialNums: Set<string>): boolean {
  const items = it.conditions?.items ?? []
  return it.kind === '서술형' ? items.length > 0 : items.some((c) => conditionHints(c.text, materialNums).length > 0)
}

/**
 * 2026-09-26 이전에 v2 로 이미 게시·저장된 판(또는 초안)에 남아 있는 풀이 힌트 조건을 정리한다(C-32) — DB 는 고치지 않고
 * 읽을 때마다 다시 정리하므로 멱등이어야 한다: 고칠 것이 없으면 같은 배열(→ 같은 객체)을 그대로 돌려준다.
 * 문항 조각이 스키마 전체를 갖추지 않았어도(테스트용 부분 fixture 등) materials_used·conditions 없이 조용히 넘어간다.
 */
export function cleanAssessmentConditions(a: AssessmentT | null, materials: MaterialT[]): AssessmentT | null {
  if (!a) return a
  const byId = new Map(materials.map((m) => [m.id, m]))
  const numsFor = (usedIds: string[] | undefined) => materialNumbers((usedIds ?? []).map((id) => byId.get(id)).filter((m): m is MaterialT => !!m))
  if (!a.items.some((it) => itemNeedsConditionCleanup(it, numsFor(it.materials_used)))) return a
  return {
    ...a,
    items: a.items.map((it) => {
      const materialNums = numsFor(it.materials_used)
      if (!itemNeedsConditionCleanup(it, materialNums)) return it
      const items = it.kind === '서술형' ? [] : filterEssayConditions(it.conditions.items, materialNums)
      const allNos = items.map((c) => c.no)
      return { ...it, conditions: { ...it.conditions, items }, rubric: { ...it.rubric, criteria: it.rubric.criteria.map((c) => ({ ...c, condition_nos: allNos })) } }
    }),
  }
}

export function upgradeTeacherGuideV1(g: GuideV1, lessons: LessonT[], assessment: AssessmentT | null): GuideT {
  // 병합은 양쪽 차시에 서로 적혀 있다(1→2, 2→1) — 앞 번호 쪽에서 한 번만 만든다. 한쪽만 적힌 쌍도 빠뜨리지 않는다.
  const pairs = lessons.filter((l) => l.mergeable_with !== null && (l.no < l.mergeable_with || !lessons.some((x) => x.no === l.mergeable_with && x.mergeable_with === l.no)))
  const merge_guide = pairs.map((l) => {
    const other = lessons.find((x) => x.no === l.mergeable_with)
    return { lessons: [l.no, l.mergeable_with!] as [number, number], skip_activities: other ? other.flow.intro : l.flow.wrapup, time_budget_120: { intro_min: 10, main_min: 90, wrapup_min: 20 } }
  })
  // 문항마다 첫 요소의 1점·만점 서술 → 3개가 안 되면(문항 2개인 지금 구조) 문항들의 둘째·셋째 요소에서 차례로 더 뽑는다(채점표 문장만 쓴다)
  const items = assessment?.items ?? []
  const errorOf = (it: AssessmentT['items'][number], i: number, k: number) => {
    const c = it.rubric.criteria[k]
    return { item_no: i + 1, error: c.scale.find((x) => x.points === 1)?.descriptor ?? c.scale[0].descriptor, how_to_read: c.scale.find((x) => x.points === c.max)?.descriptor ?? c.scale[c.scale.length - 1].descriptor }
  }
  const common_errors = items.map((it, i) => errorOf(it, i, 0))
  for (let k = 1; common_errors.length < 3 && items.some((it) => it.rubric.criteria.length > k); k++) {
    for (const [i, it] of items.entries()) if (common_errors.length < 3 && it.rubric.criteria[k]) common_errors.push(errorOf(it, i, k))
  }
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
      formative: lessons.some(isUnitAssessmentSession)
        ? '교수 차시마다 마무리 퀴즈 3문항(단원 평가 차시는 0문항)'
        : '차시별 마무리 퀴즈 3문항(논술형 차시는 0문항)',
      summative_placement: lessons.flatMap((l) => lessonAssessments(l).map((kind) => ({ lesson_no: l.no, kind: kindFamily(kind) }))),
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
  if (!isV1Snapshot(raw)) return normalizeSnapshotV2(raw as SnapshotV2)
  const s = raw as { cover: SnapshotV2['cover']; standards: SnapshotV2['standards']; intro: string; reconstruction: string; learning_goals: (string | LearningGoalT)[]; key_question: string; lessons: LessonV1[]; materials: MaterialV1[]; assessment: AssessmentV1 | null; teacher_guide: GuideV1 | null; generated_with: { models: string[] } }
  const notesFor = (no: number) => s.teacher_guide?.per_lesson.find((p) => p.no === no)?.notes ?? []
  const lessons = (s.lessons ?? []).map((l) => upgradeLessonV1(l, notesFor(l.no)))
  const materials = (s.materials ?? []).map(upgradeMaterialV1)
  const assessment = s.assessment ? upgradeAssessmentV1(s.assessment, materials) : null
  return {
    schema_version: 2, cover: s.cover, standards: s.standards, intro: s.intro,
    reconstruction: s.reconstruction, reconstruction_detail: upgradeReconstructionV1(s.standards),
    learning_goals: (s.learning_goals ?? []).map((g) => (typeof g === 'string' ? { text: g, axis: '과정·기능' as const } : g)),
    key_question: s.key_question,
    unit_plan: unitPlanFrom(s.cover.title, s.key_question, lessons, assessment),
    lessons, materials, assessment,
    teacher_guide: s.teacher_guide ? upgradeTeacherGuideV1(s.teacher_guide, lessons, assessment) : null,
    notice_plan: null, references: [], generated_with: s.generated_with,
  }
}
