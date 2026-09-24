/**
 * v1 fixture(tests/fixtures/v1/*.json) → v2 fixture(data/studio-fixtures/stage{2..7}-{generate,review}[-과학].json).
 *
 *   npx tsx scripts/upgrade-fixtures-v2.ts
 *
 * 결정적이다 — 같은 입력이면 바이트까지 같은 파일을 쓴다(시각·난수 없음). 기계 변환(lib/studio/compat.ts)으로 메울 수 없는
 * 부분(부분점수 예시답안, 논술형 과제 상황, 병합 표시 등)은 아래 PATCHES 에 손으로 적어 두고 스크립트가 매번 같은 자리에 입힌다.
 * 그래서 생성된 JSON 을 손으로 고치지 않는다 — 고칠 것이 있으면 PATCHES 를 고치고 다시 돌린다.
 * 쓰기 전에 v2 zod 와 [TS] 검사(staticIssues)를 돌려 하나라도 걸리면 아무 파일도 쓰지 않고 멈춘다.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import type { z } from 'zod'
import { buildReconstructionV2, upgradeLessonV1, upgradeMaterialV1, upgradeAssessmentV1, upgradeTeacherGuideV1, unitPlanFrom } from '../lib/studio/compat'
import { cleanMaterialTitle } from '../lib/studio/materials'
import { draftNoticePlan } from '../lib/studio/notice-draft'
import { enrichOutput } from '../lib/studio/enrich'
import { STAGE_SCHEMAS, type Lesson, type Material, type Assessment } from '../lib/studio/schemas'
import { staticIssues } from '../lib/studio/checks'
import { levelMapFor } from '../lib/studio/level-map'
import { ASSESSMENT_SESSION, SET_ORDER, SHORT_POINTS } from '../lib/studio/assessment-structure'

type LessonT = z.infer<typeof Lesson>; type MaterialT = z.infer<typeof Material>; type AssessmentT = z.infer<typeof Assessment>
type V1Lesson = Parameters<typeof upgradeLessonV1>[0]; type V1Material = Parameters<typeof upgradeMaterialV1>[0]; type V1Assessment = Parameters<typeof upgradeAssessmentV1>[0]
type V1Stage2 = { reconstruction: string; learning_goals: string[]; key_question_candidates: string[] }
type V1Guide = Parameters<typeof upgradeTeacherGuideV1>[0]
type V1Input = { s2: V1Stage2; s3: { lessons: V1Lesson[] }; s4: { materials: V1Material[] }; s6: V1Guide }

const ROOT = process.cwd()
const V1_DIR = join(ROOT, 'tests', 'fixtures', 'v1')
const OUT_DIR = join(ROOT, 'data', 'studio-fixtures')
const readJson = (path: string) => JSON.parse(readFileSync(path, 'utf8'))

type SetDef = {
  suffix: '' | '-과학'
  standardsFile: string
  title: string
  /** v1 입력에 먼저 입히는 수정(학습 목표 문장·병합 표시·자료 등). */
  patchV1?: (v1: V1Input) => void
  /** v2 차시에 입히는 수정(주제명·시간 배분). unit_plan 은 이 뒤에 만든다. */
  patchLessons?: (lessons: LessonT[]) => void
  /** v2 자료(4단계) 목록을 돌려준다. */
  patchMaterials?: (materials: MaterialT[]) => MaterialT[]
  /** v2 평가(5단계, enrich 전)에 입히는 수정. */
  patchAssessment?: (a: AssessmentT) => void
  /** 단원 평가 차시(대표 2026-09-26 보완) 문장. 5단계 수정 뒤에 차시 목록 끝에 붙이고 두 문항을 그 차시로 옮긴다. */
  session?: SessionDef
}

// ── PATCHES ────────────────────────────────────────────────────────────
// 기계 변환 뒤에도 v2 [TS] 검사·설계 규칙에 걸리거나 v2 에서 뜻이 달라지는 자리. 고칠 때마다 이유를 한 줄 남긴다.

/** v1 흐름 문장 앞의 "전개 40분 —" 같은 머리말(v2 는 분을 time_budget·소단계로 따로 적는다). */
const stripHead = (s: string) => s.replace(/^(도입|전개|활동|정리|평가)\s*\d+분\s*—\s*/u, '')
function tidyFlow(lessons: LessonT[]) {
  for (const l of lessons) {
    l.flow.intro = l.flow.intro.map(stripHead); l.flow.wrapup = l.flow.wrapup.map(stripHead)
    for (const m of l.flow.main) m.activities = m.activities.map(stripHead)
  }
}
const setTopics = (lessons: LessonT[], topics: string[]) => lessons.forEach((l, i) => { l.topic = topics[i] })
/** v1 문장 안의 한 구절을 바꾼다. 구절이 없으면(입력이 바뀌었으면) 조용히 넘어가지 않고 멈춘다. */
function swap(text: string, from: string, to: string): string {
  if (!text.includes(from)) throw new Error(`PATCHES: "${from.slice(0, 30)}…" not found`)
  return text.replace(from, to)
}
const lessonV1 = (s3: V1Input['s3'], no: number) => s3.lessons.find((l) => l.no === no)!

/** 단답형 퀴즈 한 문항: [발문, 정답, 해설 1~2문장]. 정답의 " / "는 같은 뜻의 다른 표기(lib/classroom/quiz.ts judgeQuiz 가 하나라도 맞으면 정답). */
type QuizDef = [q: string, answer: string, explanation: string]
const shortQuiz = ([q, answer, explanation]: QuizDef) => ({ q, type: 'short' as const, choices: null, answer, explanation })
/**
 * 대표 2026-09-26: 서논술 과정이라 객관식은 없다 — 마무리 퀴즈는 낱말·수치·짧은 구를 직접 쓰는 단답형만(L-09·L-10, type 'short'·choices null).
 * v1 퀴즈(선택형, 또는 답이 문장인 단답형)를 그 차시 수업 내용을 묻는 단답형으로 바꾼다. 발문과 활동지 기본·표준 과제는 compat 이
 * v1 퀴즈에서 만들므로(upgradeLessonV1) v1 입력에서 바꾸어 함께 따라오게 한다. 원래 문항(모양·발문 앞부분)이 다르면 — 입력이 바뀌었으면 — 멈춘다.
 */
function setShortQuiz(s3: V1Input['s3'], no: number, idx: number, from: [type: 'choice' | 'short', qStart: string], def: QuizDef) {
  const quiz = lessonV1(s3, no).quiz
  const old = quiz[idx]
  if (!old || old.type !== from[0] || !old.q.startsWith(from[1])) throw new Error(`PATCHES: ${no}차시 퀴즈 ${idx + 1}이 "${from[1]}…"(${from[0]})가 아님`)
  quiz[idx] = shortQuiz(def)
}

type TaskT = LessonT['worksheet']['tasks'][number]; type QuestionT = LessonT['teacher_script']['questions'][number]
/**
 * 퀴즈에서 만든 발문의 막힐 때 힌트(if_stuck)를 손으로 적는다(L-06: 정답을 그대로 말하지 않는다). compat 은 해설이 정답을 말하면
 * 중립 힌트로 바꾸지만, 그 차시에 맞는 구체적인 도움말은 여기서 준다. 발문 앞부분이 다르면(입력이 바뀌었으면) 멈춘다.
 */
function setHint(lessons: LessonT[], no: number, idx: number, promptStart: string, hint: string) {
  const q = lessons.find((l) => l.no === no)?.teacher_script.questions[idx]
  if (!q || !q.prompt.startsWith(promptStart)) throw new Error(`PATCHES: ${no}차시 발문 ${idx + 1}이 "${promptStart}…"가 아님`)
  q.if_stuck = hint
}
/**
 * 도전 과제의 기대 수행(expected)을 손으로 적는다. v1 에는 도전 과제가 없어 compat 은 핵심질문으로 만든 일반 '교사 확인' 문장을 넣는다
 * (I3 — 예전에는 차시 목표 문장을 그대로 옮겨 정답처럼 읽혔다). 중1 교사가 보고 맞다고 할 기준이되, 서·논술형 답은 적지 않는다(C-03).
 */
function setChallenges(lessons: LessonT[], expected: Record<number, string>) {
  for (const [no, text] of Object.entries(expected)) {
    const t = lessons.find((l) => l.no === Number(no))?.worksheet.tasks.find((x) => x.tier === '도전')
    if (!t) throw new Error(`PATCHES: ${no}차시 도전 과제 없음`)
    t.expected = text
  }
}
/**
 * 옛 논술형 차시(지금은 논술형을 준비하는 마지막 교수 차시, teachFormerEssayLesson)의 활동지·발문을 통째로 바꾼다 —
 * v1 논술형 차시에는 퀴즈가 없어 compat 이 핵심질문으로 만든 자리표시 과제·발문뿐이다.
 */
function setEssayLesson(l: LessonT, tasks: [string, string][], questions: QuestionT[]) {
  const tiers: Pick<TaskT, 'tier' | 'level_ref' | 'answer_space'>[] = [{ tier: '기본', level_ref: 'D~E', answer_space: 'short' }, { tier: '표준', level_ref: 'C', answer_space: 'lines' }, { tier: '도전', level_ref: 'A~B', answer_space: 'lines' }]
  l.worksheet.tasks = tasks.map(([prompt, expected], i) => ({ no: i + 1, prompt, expected, ...tiers[i] }))
  l.teacher_script.questions = questions
}
type ItemT = AssessmentT['items'][number]; type ConditionT = ItemT['conditions']['items'][number]
/**
 * C-32(대표 2026-09-26): 조건은 지침이지 풀이 힌트가 아니고, 논술형에만 둔다. v1 서술형 조건은 풀이 순서·계산식·자료 수치
 * ("290 ÷ 1200 을 소수 둘째 자리까지", "계급의 크기 10으로 나눈다 … 합계(20)")를 담고 있었다 → 서술형은 조건을 비우고(분량·형식만)
 * 채점 요소의 condition_nos 도 비운다. 채점표 descriptor·예시답안의 계산값은 답이라 그대로 둔다.
 */
function clearShortConditions(it: ItemT) {
  if (it.kind !== '서술형') throw new Error('PATCHES: clearShortConditions 는 서술형만')
  it.conditions.items = []
  for (const c of it.rubric.criteria) c.condition_nos = []
}
/** 논술형 조건을 지침(입장·근거 수·인용 자료·형식)으로 통째로 바꾸고, 채점 요소 이름마다 가리키는 조건 번호를 다시 적는다. */
function setEssayConditions(it: ItemT, items: [text: string, verb: string, category: ConditionT['category']][], byCriterion: Record<string, number[]>, overflow: string | null) {
  if (it.kind !== '논술형') throw new Error('PATCHES: setEssayConditions 는 논술형만')
  it.conditions.items = items.map(([text, verb, category], i) => ({ no: i + 1, text, verb, points: null, category }))
  it.conditions.overflow_rule = overflow
  for (const c of it.rubric.criteria) {
    const nos = byCriterion[c.name]
    if (!nos) throw new Error(`PATCHES: 채점 요소 "${c.name}"의 조건 대응이 없음`)
    c.condition_nos = nos
  }
}

// ── 세트 구조(대표 2026-09-26): 세트 끝 = 서술형 1 + 논술형 1, 마지막 교수 차시 뒤 단원 평가 차시 ──────────────
/**
 * v1 에는 서술형이 둘(각 3점)이었다 — 하나만 남기고(무엇을 왜 남기는지는 SETS 에) 순서를 서술형 → 논술형으로 둔다.
 * 문항을 합치지 않는다(합치면 없던 문항을 지어내는 셈이다).
 */
function keepOneShort(a: AssessmentT, keep: number) {
  const short = a.items[keep]; const essay = a.items.find((i) => i.kind === '논술형')
  if (short?.kind !== '서술형' || !essay) throw new Error('PATCHES: keepOneShort — 남길 서술형이나 논술형이 없음')
  a.items = [short, essay]
}
type CriterionT = ItemT['rubric']['criteria'][number]
type ShortDef = {
  /** 전제문 + 발문(배점 꼬리는 스크립트가 붙인다). */
  stem: string
  element: string
  length: string
  format: string
  /** 요소마다 이름·축·척도 서술(scale[p] = p점 서술). 0점 서술은 무응답과 "시도했으나"를 모두 말한다(C-13). */
  criteria: { name: string; axis: CriterionT['axis']; scale: string[] }[]
  holistic: { 상: string; 중: string; 하: string }
  notes: string[]
  /** 1~6점 예시답안: [요소별 점수, 학생 답안, 채점자 의견]. */
  exemplars: [number[], string, string][]
  traits: Record<'A' | 'B' | 'C' | 'D' | 'E', string>
}
/**
 * 남긴 서술형을 6점 문항으로 다시 쓴다(대표 2026-09-26: 두 문항 모두 분석적 + 총체적): 요소 2~3개 × 0~2(max 합 6)의 분석적 채점표,
 * 총체적 상/중/하, 0점을 뺀 총점 단계마다 예시답안(C-14, 6·5·4·3·2·1), A~E 구간(levelMapFor + 문항 특성 문장). 조건은 없다(C-32).
 */
function rebuildShortItem(it: ItemT, d: ShortDef) {
  if (it.kind !== '서술형') throw new Error('PATCHES: rebuildShortItem 은 서술형만')
  const criteria: CriterionT[] = d.criteria.map((c) => ({ name: c.name, axis: c.axis, condition_nos: [], max: c.scale.length - 1, scale: c.scale.map((descriptor, points) => ({ points, descriptor, example: null })) }))
  const points = criteria.reduce((s, c) => s + c.max, 0)
  if (points !== SHORT_POINTS) throw new Error(`PATCHES: 서술형 요소 최댓값 합 ${points} ≠ ${SHORT_POINTS}`)
  it.points = points
  it.stem = `${d.stem} [${points}점]`
  it.evaluation_elements = [d.element]
  it.conditions = { ...it.conditions, items: [], length: d.length, format: d.format }
  it.rubric = { criteria, holistic: d.holistic, notes: d.notes }
  it.exemplar_answers = d.exemplars.map(([scores, text, rationale]) => ({ level: null, points: scores.reduce((s, v) => s + v, 0), scores, assumed_short_points: null, text, rationale }))
  it.level_map = levelMapFor(points).map((l) => ({ ...l, trait: d.traits[l.level] }))
}
type SessionDef = { key_question: string; goal: string; intro: string; short: string; essay: string; wrapup: string; caution: string[] }
/**
 * 단원 평가 차시를 마지막 교수 차시 뒤에 붙인다(ASSESSMENT_SESSION: 평가 안내 5 · 서술형 작성 15 · 논술형 작성 35 · 정리 5, 퀴즈 0).
 * 성취기준은 두 문항이 원래 걸려 있던 차시의 것(서술형 → 논술형 순, 최대 2개), 자료는 두 문항이 쓰는 자료. 교수 차시의 서·논술형 표시는 지운다.
 */
function appendAssessmentSession(lessons: LessonT[], a: AssessmentT, d: SessionDef) {
  if (a.items.map((i) => i.kind).join(',') !== SET_ORDER.join(',')) throw new Error('PATCHES: 단원 평가 차시는 서술형 → 논술형 두 문항으로만 만든다')
  const no = lessons.length + 1
  const standards = [...new Set(a.items.flatMap((it) => lessons.find((l) => l.no === it.lesson_no)?.standards ?? []))].slice(0, 2)
  for (const l of lessons) { if (l.kind !== 'teaching' || l.assessment.length) throw new Error(`PATCHES: ${l.no}차시가 아직 교수 차시가 아님`) }
  const [shortStep, essayStep] = ASSESSMENT_SESSION.steps
  lessons.push({
    no, kind: 'assessment', standards, topic: ASSESSMENT_SESSION.topic, key_question: d.key_question, goal: d.goal,
    time_budget: { ...ASSESSMENT_SESSION.time_budget },
    flow: { intro: [d.intro], main: [{ step_label: shortStep.step_label, minutes: shortStep.minutes, activities: [d.short] }, { step_label: essayStep.step_label, minutes: essayStep.minutes, activities: [d.essay] }], wrapup: [d.wrapup] },
    teacher_script: { questions: [] }, materials_used: [...new Set(a.items.flatMap((i) => i.materials_used))].sort(), materials_needed: [],
    caution_notes: d.caution, worksheet: { tasks: [], self_check: [] }, formative_check: { quiz: [] },
    assessment: [...SET_ORDER], mergeable_with: null, merge_note: null, images: [],
  })
  for (const it of a.items) it.lesson_no = no
}
type QuizT = LessonT['formative_check']['quiz'][number]
/**
 * v1 의 논술형 차시(안내 + 작성 35분, 퀴즈 없음)를 교수 차시로 바꾼다 — 논술형은 단원 평가 차시로 옮겨 가고, 이 차시는
 * 논술형을 준비하는 수업과 마무리 퀴즈 3문항(마지막 교수 차시 포함, L-09)을 갖는다. 서·논술형의 답은 말하지 않는다(C-03).
 */
function teachFormerEssayLesson(l: LessonT, d: { time: LessonT['time_budget']; intro: string; main: LessonT['flow']['main']; wrapup: string[]; quiz: QuizT[]; needed: string[] }) {
  if (l.kind !== 'assessment') throw new Error(`PATCHES: ${l.no}차시는 옛 논술형 차시가 아님`)
  Object.assign(l, { kind: 'teaching', assessment: [], time_budget: d.time, flow: { intro: [d.intro], main: d.main, wrapup: d.wrapup }, formative_check: { quiz: d.quiz }, materials_needed: d.needed })
}
/** 교수 차시의 서·논술형 표시를 지운다(문항은 단원 평가 차시로 간다). */
const clearLessonAssessments = (lessons: LessonT[]) => lessons.forEach((l) => { if (l.kind === 'teaching') l.assessment = [] })
/** v1 지침서 차시 메모 한 줄을 바꾼다. 문장이 없으면(입력이 바뀌었으면) 멈춘다. */
function swapNote(s6: V1Guide, no: number, from: string, to: string) {
  const notes = s6.per_lesson.find((p) => p.no === no)?.notes
  const i = notes?.indexOf(from) ?? -1
  if (!notes || i < 0) throw new Error(`PATCHES: ${no}차시 메모 "${from.slice(0, 20)}…" 없음`)
  notes[i] = to
}
/** 서술형이 빠진 차시의 정리 시간은 새 활동 없이 피드백·정리에 쓴다(L-11). */
const L11_NOTE = '퀴즈 뒤 남는 시간은 새 활동 없이 퀴즈 오답과 오늘 만든 결과물을 되짚는 데 쓴다(L-11).'

/** 공유 자료 B 본문(두 과목 공통, M5): 상대도수(0.24·0.30 …)는 수학 서술형 2가 구하게 하는 답이라 원자료 설명만 둔다(C-03). docs/samples 공유 자료와 같은 문장. */
// fix wave 2(리드 판정): "두 해는 부스 수와 전체 개수가 다르다."는 수학 서술형의 '상대도수로 비교하는 이유' 요소(2점)를 알려 주므로 뺀다
const RAW_B_BODY = '품목별 일회용품 개수를 작년(부스 16곳)과 올해(부스 20곳)로 나누어 센 자료.'

const SETS: SetDef[] = [
  {
    suffix: '', standardsFile: 'standards-math.json', title: '자료의 정리와 해석',
    patchV1: ({ s2, s3, s4, s6 }) => {
      // 대표 2026-09-26: 서술형은 하나만 — 수학은 서술형 2(상대도수, 화면 답안)를 남기고 서술형 1(20곳 도수분포표, 종이 답안)을 뺀다.
      // 남긴 이유: 상대도수 문항은 계산 + 해석 + 이유로 6점 분석적 채점표를 세울 수 있고, 논술형(상대도수로 감축 목표)의 바탕이 된다.
      // 결과: 시연 세트에 종이 답안 문항이 없다(종이 답안 코드 경로는 합성 문항 테스트로 지킨다).
      // 예전 2·3차시 C-03 패치(표 만들기를 부스 11~20번으로 연습, 3차시 퀴즈 2 교체)는 서술형 1의 답을 지키려던 것이라 v1 원문으로 되돌리고,
      // 2차시 정리의 "서술형 1 (10분)"은 피드백 시간으로 바꾼다(L-11).
      const l2 = lessonV1(s3, 2)
      l2.flow.wrapup = swap(l2.flow.wrapup, '퀴즈 → 서술형 1 (10분)', '퀴즈 → 짝과 도수분포표를 바꾸어 도수의 합(20)을 서로 확인하고 틀린 칸을 고친다')
      swapNote(s6, 2, '서술형 1은 정리·퀴즈 후 마지막 10분에 실시하고 걷는다.', L11_NOTE)
      // 4차시(남긴 서술형 = 플라스틱컵 상대도수 0.24·0.30, 단원 평가 차시에서 본다): 상대도수 구하기·해석은 다른 품목으로, 플라스틱컵은 문항에 남긴다
      const l4 = lessonV1(s3, 4)
      l4.flow.main = swap(swap(l4.flow.main,
        '② 작년·올해 품목별 상대도수 표 완성(소수 둘째 자리)', '② 작년·올해 종이컵·일회용 접시·비닐봉지·나무젓가락의 상대도수 구하기(소수 둘째 자리, 플라스틱컵은 단원 평가 서술형에서 직접 구한다)'),
        '④ "개수는 종이컵이 가장 많지만, 비율이 가장 크게 오른 것은 플라스틱컵(0.24 → 0.30)" 해석', '④ "개수는 종이컵이 가장 많지만 상대도수는 0.32 → 0.31로 거의 그대로"처럼 개수와 상대도수가 다르게 말하는 경우를 해석하기')
      l4.flow.wrapup = swap(l4.flow.wrapup, '퀴즈 → 서술형 2 (10분)', '퀴즈 → 개수와 상대도수가 다르게 말한 품목을 한 문장씩 발표하고 서로 고쳐 준다')
      swapNote(s6, 4, '서술형 2는 마지막 10분.', L11_NOTE)
      // 5차시: 논술형은 단원 평가 차시(6)로 옮긴다 — 5차시는 감축 목표를 세우는 교수 차시(teachFormerEssayLesson)가 되고 메모도 바꾼다
      const n5 = s6.per_lesson.find((p) => p.no === 5)!
      n5.notes = ['목표 수치 연습은 종이컵으로만 하고, 학생이 논술형에서 쓸 품목과 목표 수치는 미리 정해 주지 않는다.', '스프레드시트 기기가 없으면 계산기로 같은 계산을 한다.']
      s6.per_lesson.push({ no: 6, notes: ['서술형 15분이 지나면 논술형으로 넘어가도록 안내하고, 논술형 35분은 시험처럼 조용히 진행한다.', '자료 A·B와 자신이 만든 표·그래프를 보면서 쓰게 한다(오픈 자료).'] })
      s6.general.schedule_note = swap(s6.general.schedule_note, '5차시+보충', '5차시 + 단원 평가(6차시: 서술형 15분 + 논술형 35분)')
      // 학습 목표 축: v1 문장은 모두 과정·기능으로 읽혀 첫·끝 목표에 축을 억지로 붙이게 된다 → 축이 드러나게 문장을 다듬는다
      s2.learning_goals[0] = '계급·도수·도수분포표의 뜻을 이해하고, 자료를 계급으로 나누어 도수분포표로 나타낼 수 있다.'
      s2.learning_goals[3] = '통계적 탐구 결과를 근거로 축제 일회용품을 줄이는 목표를 정하고, 자료에 근거해 판단하는 태도를 기른다.'
      // C-03: 자료 B 본문의 상대도수(0.24·0.30 …)는 남긴 서술형이 구하게 하는 답이다 → 원자료 설명만 남긴다
      s4.materials.find((m) => m.id === 'B')!.body = RAW_B_BODY
      // 대표 2026-09-26(객관식 폐지): 선택형 퀴즈 5문항을 그 차시 수업을 묻는 단답형으로(5차시 두 문항은 patchLessons 의 teachFormerEssayLesson).
      // 1차시 1: 보기에서 탐구 문제 고르기 → 전개 ①(막연한 질문 vs 통계적 탐구 문제)의 용어를 쓰게 한다
      setShortQuiz(s3, 1, 0, ['choice', '다음 중 통계적 탐구 문제로'], ['"쓰레기가 너무 많다"처럼 느낌을 말한 질문을, 자료를 모아 정리·해석해서 답할 수 있게 바꾼 질문을 무엇이라 하는가?', '통계적 탐구 문제 / 탐구 문제', '자료를 모아 정리·해석해 답하는 질문이 통계적 탐구 문제이다.'])
      // 1차시 3: 보기에서 함께 기록할 것 고르기 → 무엇을 함께 세는지 직접 쓰게 한다(까닭은 4차시·서술형 몫이라 해설은 "뒤에서 필요"까지만)
      setShortQuiz(s3, 1, 2, ['choice', '자료 B처럼 품목별 개수를'], ['자료 B처럼 작년과 올해의 품목별 개수를 비교하려면, 품목별 개수와 함께 무엇을 세어 기록해 두어야 하는가?', '부스 수 / 부스의 수 / 부스 개수', '집단의 크기(부스 수)를 알아야 뒤에서 상대도수로 비교할 수 있다.'])
      // 2차시 3: 늘어난다/줄어든다/같다 → 계급의 크기와 계급의 개수 관계를 수치로 묻는다(자료 A 18~63개, 10개 이상 70개 미만을 크기 10으로 나눈 6계급)
      setShortQuiz(s3, 2, 2, ['choice', '계급의 크기를 5로 바꾸면'], ['2차시 도수분포표는 10개 이상 70개 미만을 계급의 크기 10으로 나누어 계급이 6개이다. 같은 범위를 계급의 크기 5로 나누면 계급은 몇 개가 되는가?', '12 / 12개', '계급의 크기를 줄이면 계급의 개수는 늘어난다. 70 − 10 = 60을 5씩 나누면 60 ÷ 5 = 12개이다.'])
      // 3차시 3: 잘못 그린 히스토그램 고르기 → 전개 ②(도수분포다각형 겹쳐 그리기)의 용어를 쓰게 한다
      setShortQuiz(s3, 3, 2, ['choice', '다음 중 히스토그램을 잘못'], ['히스토그램에서 각 직사각형 윗변의 가운데 점을 차례로 선분으로 이은 그래프를 무엇이라 하는가?', '도수분포다각형', '직사각형 윗변의 중앙을 이으면 도수분포다각형이 된다. 양 끝에는 도수가 0인 계급을 하나씩 더 두고 잇는다.'])
      // 4차시 2: 보기에서 이유 고르기(정답 "도수의 총합이 다르기 때문") → 무엇으로 비교하는지 쓰게 한다(서술형 '이유' 요소의 답 문장을 퀴즈가 건네지 않게)
      setShortQuiz(s3, 4, 1, ['choice', '작년과 올해를 상대도수로'], ['작년과 올해처럼 도수의 총합이 다른 두 자료의 분포는 개수 대신 무엇으로 비교해야 하는가?', '상대도수', '도수의 총합이 다르면 상대도수로 비교한다. 상대도수는 각 도수를 도수의 총합으로 나눈 값이다.'])
    },
    patchLessons: (lessons) => {
      // v1 에는 차시 주제가 없어 compat 이 목표 앞 40자를 잘라 쓴다 → 안내장·평가 계획표에 보일 짧은 주제명
      setTopics(lessons, ['통계적 탐구 문제 세우기', '줄기와 잎 그림과 도수분포표', '히스토그램과 도수분포다각형', '상대도수로 두 집단 비교하기', '자료로 감축 목표 제안하기'])
      tidyFlow(lessons)
      // L-06: v1 퀴즈 해설을 옮긴 힌트가 값을 그대로 말하던 발문(2차시 1: 41·42·44·45·47 = 잎 1·2·4·5·7, 2차시 2: "…6으로 주어져 있다",
      // 4차시 3: "그 총합은 항상 1이다") — 값을 말하지 않고 찾아가는 길만 준다
      setHint(lessons, 2, 0, '자료 A를 줄기와 잎 그림으로', '자료 A에서 40개 이상 50개 미만인 값을 모두 찾아 작은 수부터 적고, 각 값에서 일의 자리만 떼어 보게 한다.')
      setHint(lessons, 2, 1, '계급 30개 이상 40개 미만의 도수는', '도수분포표에서 30개 이상 40개 미만 칸을 짚고, 자료 A에서 그 범위에 드는 부스를 하나씩 세어 보게 한다.')
      setHint(lessons, 4, 2, '상대도수의 총합은', '상대도수표의 값을 모두 더해 보게 하고, 도수 몇 개를 같은 총합으로 나눠 다 더하면 무엇이 되는지 떠올려 보게 한다.')
      // I3: 도전 과제 기대 수행 — 남긴 서술형(플라스틱컵 상대도수)의 값은 적지 않는다
      setChallenges(lessons, {
        1: '조사 항목(품목별 일회용품 개수)·대상(축제 부스)·방법(누가 언제 어떻게 셀지)을 모두 정하고, 부스 수도 함께 세어야 하는 까닭(해마다 부스 수가 달라 개수만으로는 비교하기 어려움)을 쓰면 인정',
        2: '원자료로는 잘 보이지 않던 분포(부스가 어느 구간에 몰려 있고 어느 구간에 드문지)가 계급으로 나누면 한눈에 보인다는 점을, 도수분포표에서 도수가 가장 큰 계급을 예로 들어 설명하면 인정',
        3: '히스토그램에서 가장 높은 직사각형이 있는 곳과 양 끝의 낮은 직사각형을 함께 근거로 들어, 부스들이 가운데 구간에 몰려 있고 아주 적거나 아주 많이 쓴 부스는 드물다는 뜻의 문장을 쓰면 인정',
        4: '부스 수(16곳 → 20곳)와 전체 개수(1,200개 → 1,350개)가 달라 개수가 늘어도 차지하는 비율은 그대로일 수 있음을, 종이컵처럼 개수와 상대도수가 다르게 말하는 품목을 예로 들어 설명하면 인정',
      })
      // 5차시: 논술형이 단원 평가 차시로 옮겨 가 감축 목표를 세우는 교수 차시가 된다(대표 2026-09-26 보완) — 목표 수치 정하는 법은
      // 종이컵으로 연습하고, 논술형 답(줄일 품목·목표 수치)은 말하지 않는다(C-03). 마무리 퀴즈 3문항(L-09).
      teachFormerEssayLesson(lessons[4], {
        time: { intro_min: 10, main_min: 40, wrapup_min: 10 },
        intro: '2~4차시 산출물(표·히스토그램·상대도수표)을 한 장에 모으고 "자료는 무엇을 먼저 줄이라고 말하는가?"를 다시 묻는다.',
        main: [
          { step_label: '목표 수치 정하는 법', minutes: 20, activities: ['① (공학 도구) 스프레드시트로 자료 B의 품목별 상대도수를 계산해 그래프로 확인한다(기기가 없으면 계산기).', '② 종이컵으로 "올해 상대도수를 작년 수준으로 되돌리려면 올해 몇 개여야 하는가"를 함께 구한다.'] },
          { step_label: '근거 문장 만들기', minutes: 20, activities: ['③ 자료의 수치를 단위·출처와 함께 인용해 "주장 + 근거" 두 문장을 짝과 써 보고 서로 고친다(품목은 각자 고른다).', '④ 다음 시간 단원 평가(서술형 15분 + 논술형 35분) 진행 방식을 안내한다.'] },
        ],
        wrapup: ['퀴즈 → 오늘 쓴 "주장 + 근거" 두 문장을 짝과 바꾸어 읽고 근거의 단위·출처를 확인한다'],
        quiz: [
          { q: '작년 종이컵의 상대도수를 반올림해 소수 둘째 자리까지 구하면?', type: 'short', choices: null, answer: '0.32', explanation: '종이컵 380개를 작년 전체 1,200개로 나누면 0.316…이므로 반올림해 0.32이다.' },
          // 대표 2026-09-26(객관식 폐지): 보기(약 380/420/432개)를 떼고 수치를 직접 쓰게 한다
          shortQuiz(['올해 종이컵을 작년 상대도수(0.32) 수준으로 맞추려면 올해 전체 1,350개 가운데 약 몇 개여야 하는가? (자연수로)', '432 / 약 432개', '0.32 × 1,350 = 432이므로 약 432개이다. 올해 종이컵 420개는 이미 이보다 적다.']),
          // 대표 2026-09-26(객관식 폐지): 근거 고르기 → 전개 ③(수치를 단위·출처와 함께 인용)의 용어를 쓰게 한다
          shortQuiz(['근거로 쓸 수치가 어느 자료에서 왔는지(예: 자료 B)를 나타내는 것으로, 수치와 단위 옆에 함께 적어야 하는 것은?', '출처', '근거가 되는 수치에는 단위와 출처를 함께 적는다. 예를 들어 "자료 B에서 올해 일회용 접시는 240개이다"처럼 쓴다.']),
        ],
        needed: ['스프레드시트 가능한 기기 1대 이상(없으면 계산기)'],
      })
      setEssayLesson(lessons[4], [
        ['2~4차시에 만든 표·그래프·상대도수표 가운데 논술형에서 근거로 쓸 자료 두 가지를 골라 이름을 적어 보자.', '자료 A의 도수분포표·히스토그램, 자료 B의 품목별 개수 또는 상대도수 가운데 두 가지를 골라 무엇을 보여 주는 자료인지와 함께 쓰면 인정'],
        ['고른 자료에서 근거로 쓸 수치 두 개를 단위와 출처(자료 A/B)를 붙여 옮겨 적어 보자.', '자료에 실제로 있는 수치 두 개(예: 부스 수 16곳·20곳, 어떤 품목의 작년·올해 개수)를 단위와 출처까지 정확히 적으면 인정'],
        ['감축 목표 수치를 정하는 방법(무엇을 기준으로 몇 개를 줄일지)을 한 문장으로 써 보자.', '교사 확인: 기준(예: 작년 상대도수로 되돌리기, 올해 개수의 몇 % 줄이기)과 그 기준으로 목표 개수를 계산하는 순서가 함께 있으면 인정 — 품목과 수치는 학생마다 다르다'],
      ], [
        { prompt: '논술형에서 가장 먼저 줄일 품목을 고를 때, 개수와 상대도수 중 무엇을 기준으로 삼아야 할까?', expected_answer: '상대도수(작년과 올해 사이 상대도수의 변화). 두 해의 부스 수와 전체 개수가 달라 개수만으로는 공정하게 비교할 수 없다.', if_stuck: '4차시에 종이컵의 개수와 상대도수가 서로 다르게 말했던 예를 떠올려 보게 한다.' },
        { prompt: '어떤 품목의 상대도수를 작년 수준으로 되돌리려면 올해 개수를 몇 개로 줄여야 할까? 계산 순서를 말해 보자.', expected_answer: '작년 상대도수(작년 개수 ÷ 1,200)에 올해 전체 개수 1,350을 곱해 목표 개수를 구하고, 올해 개수에서 목표 개수를 빼면 줄일 개수가 된다.', if_stuck: '종이컵으로 먼저 해 보게 한다: 380 ÷ 1,200을 구한 뒤 그 값에 1,350을 곱해 올해 종이컵 개수 420과 견주어 본다.' },
      ])
    },
    patchAssessment: (a) => {
      const [, i2, essay] = a.items
      // 대표 2026-09-26: 서술형 하나만 — 서술형 2(상대도수)를 남기고 서술형 1(종이 표)을 뺀다(이유는 patchV1 첫 줄).
      // 남긴 문항은 6점: 상대도수 계산 · 비율 변화 해석 · 상대도수로 비교하는 이유 세 요소 × 0~2, 총체적 상/중/하, 1~6점 예시답안.
      // 값(0.24·0.30)과 총합(1,200·1,350)은 서술 괄호 안에 둔다 — 안내장 문구(notice-draft plain)가 괄호를 떼므로 답이 문구로 새지 않는다.
      rebuildShortItem(i2, {
        stem: '자료 B는 축제에서 쓰인 일회용품을 품목별로 작년과 올해로 나누어 센 자료이다. 작년과 올해 플라스틱컵의 상대도수를 각각 구하고(소수 둘째 자리까지), 플라스틱컵이 전체에서 차지하는 비율이 어떻게 달라졌는지와 개수가 아니라 상대도수로 비교해야 하는 이유를 쓰시오.',
        element: '자료 B에서 플라스틱컵의 상대도수를 구하고, 비율의 변화와 상대도수로 비교해야 하는 이유를 쓰기',
        length: '값 2개와 문장 2개(변화 1문장, 이유 1문장)',
        format: '상대도수 두 값 + "~다"로 끝나는 문장 2개',
        criteria: [
          { name: '상대도수 계산', axis: '지식·이해', scale: [
            '무응답이거나, 시도했으나 두 값을 모두 틀리거나 개수를 그대로 씀',
            '두 값을 구했으나 한 값이 틀리거나 소수 둘째 자리로 쓰지 않음(예: 0.3) / 한 값만 맞게 씀',
            '작년과 올해 플라스틱컵의 상대도수를 소수 둘째 자리까지 모두 맞게 구함(0.24, 0.30)'] },
          { name: '비율 변화 해석', axis: '과정·기능', scale: [
            '무응답이거나, 시도했으나 변화를 쓰지 않거나 줄었다고 씀',
            '늘었다고 썼으나 개수가 늘어난 것인지 전체에서 차지하는 비율이 늘어난 것인지 구분하지 않음',
            '두 상대도수를 비교해 플라스틱컵이 전체에서 차지하는 비율이 늘었다고 씀'] },
          { name: '상대도수로 비교하는 이유', axis: '과정·기능', scale: [
            '무응답이거나, 시도했으나 이유가 상대도수와 관련 없음',
            '이유를 썼으나 "비교가 쉬워서"처럼 도수의 총합 차이와 연결하지 않음',
            '두 해의 도수의 총합이 달라 개수로는 공정하게 비교할 수 없다는 점을 씀(전체 개수 1,200개·1,350개 또는 부스 수 16곳·20곳)'] },
        ],
        holistic: {
          상: '두 상대도수를 소수 둘째 자리까지 맞게 구하고, 비율이 늘었다는 해석과 도수의 총합이 다르다는 이유를 모두 씀(5~6점)',
          중: '상대도수를 구하고 변화나 이유를 썼으나 값 하나가 틀리거나 이유가 도수의 총합 차이와 이어지지 않음(3~4점)',
          하: '상대도수 값·변화·이유 가운데 한 가지만 쓰거나 개수로만 비교함(0~2점)',
        },
        notes: [
          '예시답안과 표현이 달라도 의미가 같으면 인정한다.',
          '계산식(290÷1200 등)을 함께 쓴 경우 반올림 과정의 차이(0.241 등)는 인정하되, 답으로 쓴 값은 소수 둘째 자리여야 한다.',
          '이유에 "전체 개수가 다르다"와 "부스 수가 다르다" 가운데 하나만 있어도 도수의 총합 차이로 인정한다.',
          '예시답안은 유일한 정답이 아니다.',
        ],
        exemplars: [
          [[2, 2, 2], '작년 플라스틱컵의 상대도수는 290÷1200=0.24, 올해는 405÷1350=0.30이다. 플라스틱컵이 전체에서 차지하는 비율이 0.24에서 0.30으로 늘었다. 두 해는 전체 개수가 1,200개와 1,350개로 달라서 개수만 비교하면 공정하지 않기 때문이다.', '두 값을 소수 둘째 자리까지 맞게 구했고(2), 차지하는 비율이 늘었다고 해석했으며(2), 도수의 총합 차이를 이유로 들어(2) 6점에 해당함'],
          [[2, 2, 1], '작년 0.24, 올해 0.30이다. 전체에서 플라스틱컵이 차지하는 비율이 늘었다. 상대도수로 비교하면 더 쉽기 때문이다.', '값과 해석은 맞으나(2·2) 이유가 도수의 총합 차이와 이어지지 않아(1) 5점에 해당함'],
          [[1, 2, 1], '작년 290÷1200=0.24, 올해 405÷1350=0.3이다. 플라스틱컵의 비율이 늘었다. 비율로 보면 편해서이다.', '올해 값을 소수 둘째 자리로 쓰지 않았고(1), 비율이 늘었다는 해석은 맞으나(2), 이유가 막연해(1) 4점에 해당함'],
          [[1, 1, 1], '작년 0.24, 올해 0.35이다. 플라스틱컵이 늘었다. 상대도수가 더 정확해서이다.', '올해 값이 틀렸고(1), 개수와 비율 가운데 무엇이 늘었는지 구분하지 않았으며(1), 이유가 도수의 총합과 이어지지 않아(1) 3점에 해당함'],
          [[0, 0, 2], '상대도수는 구하지 못했다. 작년과 올해는 부스 수가 16곳과 20곳으로 달라서 개수로만 비교하면 안 된다.', '값과 변화는 쓰지 않았으나(0·0) 도수의 총합 차이를 이유로 들어(2) 2점에 해당함'],
          [[1, 0, 0], '작년 290÷1200=0.24, 올해 405÷1350=0.35이다.', '작년 값만 맞고(1) 변화와 이유를 쓰지 않아(0·0) 1점에 해당함'],
        ],
        traits: {
          A: '두 상대도수·비율의 변화·도수의 총합이 다르다는 이유를 모두 정확히 씀',
          B: '값과 해석은 맞으나 이유가 도수의 총합 차이와 약하게 이어짐',
          C: '상대도수를 구해 비교하나 값의 자릿수나 이유 가운데 하나가 부족함',
          D: '값·해석·이유 가운데 일부만 맞고 개수와 비율을 구분하지 않음',
          E: '상대도수를 구하려는 시도는 있으나 값·해석·이유가 대부분 빠짐(미응답 포함)',
        },
      })
      keepOneShort(a, 1)
      // 스펙 §2.5 [TS]-7: 논술형에는 과제 상황(GRASPS 축약)이 필수
      essay.situation = { role: '학생회 환경부원', audience: '학생회 임원과 축제 담당 선생님', purpose: '내년 축제에서 가장 먼저 줄일 일회용품과 감축 목표를 자료로 설득하기', product: '감축 제안문(300자 내외, 문단 2~3개)' }
      // C-32: 서술형은 조건 없음(rebuildShortItem 이 비운다). 서술형 형식에는 계산 과정(=으로 이어 쓰기) 같은 풀이 방법을 쓰지 않는다
      clearShortConditions(i2)
      // C-32: 논술형 조건 — v1 은 문단별 순서("첫 문단: … 둘째 문단: …")와 답이 되는 수치("405개 → 200개, 0.30 → 0.15"), 답의 핵심 용어(상대도수)를 담았다 → 입장·근거 수·인용 자료·형식만
      setEssayConditions(essay, [
        ['가장 먼저 줄일 일회용품 한 가지와 감축 목표 수치를 정해 밝힐 것', '밝히다', '내용'],
        ['근거는 두 가지 이상 들고, 자료 A와 자료 B를 모두 인용할 것', '인용하다', '내용'],
        ['인용한 수치에는 단위와 출처(자료 A·자료 B)를 함께 적을 것', '적다', '형식'],
        ['"~다"로 끝나는 문장으로 쓸 것', '쓰다', '형식'],
      ], { '자료 정리의 정확성': [2, 3], '해석의 타당성': [2], '제안과 근거의 연결': [1], '수학적 표현과 서술': [3, 4] },
      '줄일 일회용품을 두 가지 이상 쓰면 처음 쓴 한 가지만 채점한다.')
    },
    session: {
      key_question: '자료는 내년 축제에서 무엇을 먼저 줄여야 한다고 말하는가?',
      goal: '상대도수로 두 해를 비교하는 서술형과 자료를 근거로 감축 목표를 제안하는 논술형에 답해 단원에서 배운 것을 스스로 정리한다.',
      intro: '평가 안내: 서술형 15분, 논술형 35분으로 나누어 쓰고, 자료 A·B와 그동안 만든 표·그래프를 보면서 쓸 수 있음을 알린다.',
      short: '서술형 문항(상대도수)에 답안을 작성한다(15분).',
      essay: '논술형 문항(감축 제안문)에 답안을 작성한다(35분, 퀴즈 없음 — 평가로 대체).',
      wrapup: '제출 전에 답안을 문항의 분량·형식과 논술형 작성 조건에 하나씩 대조해 스스로 점검한 뒤 제출한다.',
      caution: ['작성 중에는 자료를 다시 설명하거나 답의 방향을 알려 주지 않는다.', '서술형 15분이 지나면 논술형으로 넘어가도록 안내하되, 서술형을 마저 쓰려는 학생은 논술형 시간 안에서 쓰게 한다.'],
    },
  },
  {
    suffix: '-과학', standardsFile: 'standards-science.json', title: '과학적 탐구와 지속가능한 삶',
    patchV1: ({ s3, s4, s6 }) => {
      // 대표 2026-09-26: 서술형은 하나만 — 과학은 서술형 1(재활용이 어려운 이유, 3차시 관찰과 이어짐)을 남기고 서술형 2(개인 차원 방안 + 과학적 이유)를 뺀다.
      // 남긴 이유: 서술형 2는 논술형(개인 차원·학교 차원 방안 + 자료 B 수치 + 자료 D 근거)과 요구가 겹친다 — 두 문항 세트에서 한 학생이 같은
      // 방안(텀블러)을 두 번 쓰게 된다. 서술형 1은 논술형이 기대는 과학 내용(재질·오염·섞임)을 먼저 점검하고, 6점으로 늘리며
      // "플라스틱의 성질과 연결한 설명" 요소를 더해 3차시 관찰(물에 뜨고 가라앉음)을 적용하게 한다.
      // 4·5차시 병합 표시를 뗀다(5차시 다음은 단원 평가 차시 — 병합하지 않는다, L-05)
      for (const l of s3.lessons) if (l.no === 4 || l.no === 5) l.mergeable_with = null
      const l3 = lessonV1(s3, 3)
      l3.flow.wrapup = swap(l3.flow.wrapup, '퀴즈 → 서술형 1 (10분)', '퀴즈 → 관찰 기록지를 모둠끼리 바꾸어 보고 자료 E와 다른 곳을 짚어 준다')
      swapNote(s6, 3, '서술형 1은 마지막 10분에 실시하고 걷는다.', L11_NOTE)
      // C-03(차시 수준): 4차시의 결론("여러 번 써야 이득")을 수업·퀴즈·유의점이 먼저 말하지 않게 한다(뺀 서술형 2의 답이었고, 논술형에서
      // 학생이 스스로 판단할 근거다) — 수업은 자료 E로 두 컵을 만드는 데 드는 재료의 양과 재사용 횟수를 비교하는 데까지
      const l4 = lessonV1(s3, 4)
      l4.flow.main = swap(l4.flow.main,
        '② 자료 E로 확인: 다회용컵은 만들 때 자원이 더 들므로 여러 번 써야 이득 → "몇 번부터 이득일까" 어림 토의',
        '② 자료 E로 확인: 일회용 PET컵(약 8 g)과 스테인리스 다회용컵(약 150 g)을 만드는 데 드는 재료의 양과 재사용 횟수를 표에서 읽어 비교하기')
      // 대표 2026-09-26(객관식 폐지): 예전 선택형(과학기술이 이바지하는 예 고르기)을 전개 ③(과학기술이 하는 일)의 용어를 쓰는 단답형으로
      l4.quiz[2] = shortQuiz(['섞여 들어온 플라스틱을 재질별로 자동으로 골라내 재활용을 쉽게 하는 과학기술을 무엇이라 하는가?', '분리 기술 / 선별 기술 / 자동 분리 기술', '재질별로 골라내면 재활용이 쉬워져 자원을 다시 쓸 수 있다.'])
      s6.per_lesson.find((p) => p.no === 4)!.notes[0] = '"다회용컵이 무조건 좋다"는 답이 나오면 자료 E의 무게(약 150 g vs 약 8 g)를 짚어 만드는 데 드는 재료의 양을 비교하게 한다. 어느 쪽이 언제 나은지는 학생이 스스로 판단하도록 결론을 미리 말해 주지 않는다.'
      l4.flow.wrapup = swap(l4.flow.wrapup, '퀴즈 → 서술형 2 (10분)', '퀴즈 → 개인/사회 두 칸 표에서 모둠마다 한 줄씩 발표하고 서로 고쳐 준다')
      swapNote(s6, 4, '서술형 2는 마지막 10분.', L11_NOTE)
      // 5차시: 논술형은 단원 평가 차시(6)로 옮긴다 — 5차시는 제안서 뼈대를 익히는 교수 차시(teachFormerEssayLesson)가 되고 메모도 바꾼다
      s6.per_lesson.find((p) => p.no === 5)!.notes = ['비닐봉지·나무젓가락 같은 다른 품목으로 연습하고, 일회용컵에 대한 제안 내용은 단원 평가에서 학생이 직접 쓰도록 미리 정해 주지 않는다.', '제안서 뼈대 다섯 칸은 칠판에 남겨 두어 다음 시간에도 보이게 한다.']
      s6.per_lesson.push({ no: 6, notes: ['서술형 15분이 지나면 논술형으로 넘어가도록 안내하고, 논술형 35분은 시험처럼 조용히 진행한다. 자료 B·D·E를 보면서 쓰게 한다(오픈 자료).'] })
      s6.general.schedule_note = '2시간 등원이면 1·2차시 / 3·4차시 / 5차시 + 단원 평가(6차시: 서술형 15분 + 논술형 35분) 순으로 3주가 표준. 2차시는 1차시와 병합 가능(자료 D 읽기를 1차시 정리 시간에 붙이고 "책상 위 플라스틱 찾기" 도입과 재활용 표시 확인 활동을 생략). 3차시는 관찰 활동이 핵심이고, 6차시는 단원 평가라 병합하지 않는다.'
      // C-03: 자료 E 본문의 "여러 번 써야 이득"은 4차시 퀴즈가 끌어내게 하는 결론이다 → 수치의 전제만 남긴다
      const e = s4.materials.find((m) => m.id === 'E')!
      e.body = '무게는 흔히 쓰는 200~350 mL 컵의 대략적인 값이고, 재사용 횟수는 보통의 사용을 가정한 어림값이다.'
      // 문항이 참조하는 공유 자료 B·D 를 4단계 fixture 에 함께 둔다 — 공유 자료가 없는 대주제에서도 mock 5단계 [TS](없는 자료) 검사가 통과하도록.
      // 게시 때는 대주제 공유 자료가 같은 ID 를 이긴다(publish.ts buildSnapshot). 원문은 docs/samples 공유 자료 그대로.
      const shared = (readJson(join(ROOT, 'docs', 'samples', '2026-09-20-중1-일회용품-공유자료.json')) as { materials: V1Material[] }).materials
      // M5: 공유 자료 B 는 두 과목 모두 개수만 싣는다(상대도수 0.24·0.30 = 수학 서술형의 답). docs/samples 도 같은 문장이지만 여기서 한 번 더 못박는다.
      s4.materials = [...shared.filter((m) => m.id === 'B' || m.id === 'D').map((m) => (m.id === 'B' ? { ...m, body: RAW_B_BODY } : m)), ...s4.materials]
      // 대표 2026-09-26(객관식 폐지): 선택형 퀴즈를 그 차시 수업을 묻는 단답형으로(4차시 3은 위, 5차시 셋은 patchLessons 의 teachFormerEssayLesson).
      // 3차시 3은 단답형이었으나 정답이 문장("안쪽에 얇은 플라스틱 막이 붙어 있어서")이라 낱말로 답하게 바꾼다(L-10: 답은 낱말·수치·짧은 구).
      // 새 사례 예측(PET·PS, 서술형 (2))과 논술형 근거 문장("미생물이 거의 분해하지 못", 2차시만)은 퀴즈에 넣지 않는다(C-03).
      setShortQuiz(s3, 1, 0, ['choice', '과학적 탐구 방법의 과정으로'], ['과학적 탐구 방법은 "문제 인식 → 가설 설정 → (   ) → 결론 도출" 순서로 진행된다. 빈칸에 들어갈 단계는?', '자료 수집 / 자료를 수집한다 / 자료 모으기', '문제를 인식해 가설을 세우고, 자료 수집으로 가설을 확인한 뒤 결론을 내리는 순서이다.'])
      setShortQuiz(s3, 1, 1, ['choice', '다음 중 자료를 모아 답할 수 있는'], ['과학적 탐구 문제는 느낌이 아니라 세거나 (   )할 수 있는 것을 물어야 한다. 빈칸에 들어갈 낱말은?', '측정 / 잴', '세거나 측정할 수 있어야 과학적 탐구 문제가 된다. "쓰레기가 너무 많다"는 느낌이라 탐구 문제가 아니다.'])
      setShortQuiz(s3, 2, 0, ['choice', '플라스틱의 원료가 되는 것은'], ['자료 D에 따르면 플라스틱은 무엇에서 얻은 원료로 만드는가?', '석유', '플라스틱은 석유에서 얻은 원료로 만든 고분자 물질이다.'])
      setShortQuiz(s3, 2, 1, ['choice', '컵 바닥의 PET, PP 같은 표시가'], ['컵 바닥에 찍힌 PET, PP, PS 같은 재활용 표시는 무엇의 종류를 알려 주는가?', '플라스틱 / 플라스틱의 종류 / 재질', '종류가 다르면 무게와 녹는 온도 같은 성질이 달라 종류별로 따로 모아야 한다.'])
      setShortQuiz(s3, 2, 2, ['choice', '자료 D에 따르면 땅에 묻힌'], ['자료 D에 따르면 땅에 묻힌 플라스틱이 잘게 부서져 사라지기까지 약 몇 년이 걸리는가?', '수백 년 / 약 수백 년', '자연에서는 미생물이 플라스틱을 거의 분해하지 못하기 때문이다.'])
      setShortQuiz(s3, 3, 0, ['choice', '다음 중 플라스틱컵 재활용을 어렵게'], ['컵 안에 음료가 남아 있거나 음식물이 묻어 더러워진 상태처럼, 재활용을 어렵게 하는 까닭 가운데 하나를 두 글자로 무엇이라 하는가?', '오염', '음료가 남은 컵은 헹궈서 버려야 재활용하기 쉽다.'])
      setShortQuiz(s3, 3, 1, ['choice', '물에 넣었더니 PET 조각은'], ['물에 넣었더니 PET 조각은 가라앉고 PP 조각은 떴다. 두 플라스틱은 같은 부피일 때 무엇이 다르기 때문인가?', '무게 / 밀도 / 질량', '같은 부피일 때 무게가 물보다 크면 가라앉고 작으면 뜬다. 재활용 공장도 이 차이로 플라스틱을 나눈다.'])
      setShortQuiz(s3, 3, 2, ['short', '종이컵을 일반 종이류로'], ['종이컵은 안쪽에 얇은 막이 붙어 있어 일반 종이류로 재활용하기 어렵다. 자료 E에 따르면 이 막은 무엇으로 되어 있는가?', '플라스틱 / PE / 플라스틱(PE)', '종이와 플라스틱처럼 서로 다른 재질이 붙어 있으면 종류별로 모을 수 없어 전용 수거가 필요하다.'])
      setShortQuiz(s3, 4, 0, ['choice', '"지속가능한 삶"의 뜻으로'], ['지금 세대의 필요를 채우면서 미래 세대도 살아갈 수 있게 하는 삶을 무엇이라 하는가?', '지속가능한 삶 / 지속가능성', '지속가능한 삶은 현재의 필요와 미래 세대의 삶을 함께 고려하는 것이다.'])
      setShortQuiz(s3, 4, 1, ['choice', '다음 중 사회(학교) 차원의'], ['학생회가 다회용컵 대여와 세척 운영을 규칙으로 정하는 것처럼, 여럿의 약속이나 설비가 있어야 하는 방안은 개인 차원이 아닌 무슨 차원의 방안인가?', '사회 / 학교 / 사회 차원 / 학교 차원', '개인 차원은 나 혼자 할 수 있는 일, 사회(학교) 차원은 여럿의 약속·설비가 있어야 하는 일이다.'])
    },
    patchLessons: (lessons) => {
      setTopics(lessons, ['과학적 탐구 방법과 탐구 문제', '플라스틱의 재료와 성질', '컵 재질 비교 관찰과 재활용', '지속가능한 삶과 과학기술의 역할', '과학적 해결 방안 제안서 쓰기'])
      tidyFlow(lessons)
      // v1 3차시: 도입 5 · 관찰 활동 25 · 전개 20 · 정리 10 → 소단계 두 개를 v1 이름과 분으로
      const l3 = lessons[2]
      l3.time_budget = { intro_min: 5, main_min: 45, wrapup_min: 10 }
      l3.flow.main = [
        { step_label: '컵 재질 비교 관찰', minutes: 25, activities: l3.flow.main[0].activities.map((a) => a.replace(/\s*\/\s*전개\s*\d+분\s*—\s*$/u, '')) },
        { step_label: '자료 대조와 정리', minutes: 20, activities: l3.flow.main[1].activities },
      ]
      // I3: 도전 과제 기대 수행 — 4차시는 결론(다회용컵이 언제 나은지)을 적지 않고 판단 근거만 본다
      setChallenges(lessons, {
        1: '느낌을 나타내는 말(많다·심하다)을 세거나 잴 수 있는 것(어떤 일회용품이 몇 개 나왔는지)으로 바꾸어 탐구 문제를 쓰고, 그 문제에 맞는 가설을 "~하면 ~할 것이다" 형식으로 쓰면 인정',
        2: '가볍고 잘 깨지지 않으며 값이 싸서 편리하다는 점과, 잘 변하지 않는 성질 때문에 버려진 뒤 미생물이 거의 분해하지 못해 약 수백 년 남는다는 점을 자료 D를 근거로 이어 쓰면 인정',
        3: '물에 뜨고 가라앉는 관찰 결과로 플라스틱도 종류마다 성질이 다르다는 것을 쓰고, 재활용이 잘 되는 컵과 그렇지 않은 컵의 차이를 자료 D·E의 내용으로 설명하면 인정',
        4: '교사 확인: 자료 E의 무게(약 8 g과 약 150 g)와 재사용 횟수를 둘 다 근거로 들어 판단했는지 본다. 어느 쪽이 언제 나은지는 학생이 스스로 판단하도록 결론 문장을 미리 말해 주지 않는다',
      })
      // 5차시: 논술형이 단원 평가 차시로 옮겨 가 제안서 뼈대를 익히는 교수 차시가 된다(대표 2026-09-26 보완) — 다른 품목(비닐봉지·
      // 나무젓가락·일회용 접시)으로 연습하고 일회용컵 제안 내용은 말하지 않는다(C-03). 마무리 퀴즈 3문항(L-09).
      teachFormerEssayLesson(lessons[4], {
        time: { intro_min: 10, main_min: 40, wrapup_min: 10 },
        intro: '2~4차시 산출물(자료 D 밑줄, 관찰 기록지, 개인/사회 두 칸 표)을 책상에 펼치고 "우리 학교는 무엇을 바꾸는 것이 과학적으로 가장 타당한가?"를 다시 묻는다.',
        main: [
          { step_label: '제안서 뼈대 익히기', minutes: 20, activities: ['① 제안서의 뼈대 안내: 자료의 수치로 문제 짚기 → 과학적 이유 → 제안 → 개인 방안 → 학교 방안', '② 비닐봉지를 예로 교사가 뼈대 칸마다 한 문장씩 말로 보여 준다(일회용컵 제안은 단원 평가에서 학생이 쓴다).'] },
          { step_label: '근거 연결 연습', minutes: 20, activities: ['③ 모둠별로 나무젓가락이나 일회용 접시 가운데 하나를 골라 뼈대의 첫 두 칸(수치·과학적 이유)을 써 보고 서로 고친다.', '④ 다음 시간 단원 평가(서술형 15분 + 논술형 35분) 진행 방식을 안내한다.'] },
        ],
        wrapup: ['퀴즈 → 모둠이 쓴 뼈대 두 칸을 발표하고 근거에 자료 이름과 단위가 있는지 서로 확인한다'],
        quiz: [
          // fix wave 2: 예전 Q1 의 정답("미생물이 거의 분해하지 못해 오래 남는다")은 논술형의 과학적 근거 그 자체라 바꾸었다.
          // 대표 2026-09-26(객관식 폐지): 세 문항을 이 차시(제안서 뼈대·근거 연결)를 묻는 단답형으로 — Q1 은 2차시 퀴즈와 겹치던 분리배출 표시 대신
          // 뼈대 "과학적 이유" 칸의 자료, Q2 는 뼈대 첫 칸 연습 품목(비닐봉지)의 수치 읽기, Q3 은 수치와 함께 적는 것. 논술형의 근거 문장은 넣지 않는다(C-03).
          shortQuiz(['제안서 뼈대의 "과학적 이유" 칸에서 근거로 인용할, 플라스틱의 재료·분해·재활용을 설명한 자료는 무엇인가?', '자료 D / D', '자료 D는 플라스틱의 재료·분해·재활용을 설명한 글이다.']),
          shortQuiz(['자료 B에서 비닐봉지는 작년 150개에서 올해 120개가 되었다. 몇 개 줄었는가?', '30 / 30개', '제안서에는 자료의 수치를 단위와 함께 쓴다. 150 − 120 = 30이므로 30개 줄었다.']),
          shortQuiz(['자료 B의 수치를 근거로 쓸 때 "420개"의 "개"처럼, 수치 뒤에 붙여 무엇을 셌는지 알려 주는 것을 무엇이라 하는가?', '단위', '수치는 단위와 어느 자료에서 왔는지(출처)를 함께 적어야 근거가 된다.']),
        ],
        needed: ['제안서 뼈대 활동지'],
      })
      setEssayLesson(lessons[4], [
        ['제안서에서 근거로 쓸 자료 두 가지를 골라, 각 자료가 알려 주는 것을 한 줄씩 적어 보자.', '자료 B(품목별 작년·올해 개수), 자료 D(플라스틱의 재료·분해·재활용), 자료 E(컵 재질 비교) 가운데 두 가지를 골라 알려 주는 내용을 맞게 쓰면 인정'],
        ['자료 B에서 근거로 쓸 수치 두 개를 단위와 함께 옮겨 적어 보자.', '자료 B에 실제로 있는 개수 두 개(예: 한 품목의 작년 개수와 올해 개수)를 단위(개)와 함께 정확히 적으면 인정'],
        ['개인 차원과 학교 차원의 방안을 한 가지씩, 누가 무엇을 하는지 드러나게 적어 보자.', '교사 확인: 개인 방안은 학생 혼자 할 수 있는 일, 학교 방안은 여럿의 약속이나 설비가 필요한 일로 구분되고, 각각 누가 무엇을 하는지가 있으면 인정 — 품목과 방안은 학생마다 다르다'],
      ], [
        { prompt: '제안서 뼈대의 첫 칸 "자료의 수치로 문제 짚기"에는 어떤 자료의 무엇을 쓰면 좋을까?', expected_answer: '자료 B에서 고른 품목의 작년·올해 개수(단위와 출처를 함께 써서 무엇이 얼마나 달라졌는지)', if_stuck: '자료 B 표에서 작년 열과 올해 열을 손가락으로 짚고, 한 품목이 어떻게 달라졌는지 먼저 말로 해 보게 한다.' },
        { prompt: '과학적 이유를 "플라스틱은 잘 썩지 않는다"보다 정확하게 쓰려면 자료 D에서 무엇을 찾아야 할까?', expected_answer: '왜 잘 썩지 않는지(분해하는 생물과의 관계)와 얼마나 오래 남는지(걸리는 기간)를 자료 D의 문장에서 찾아 인용한다.', if_stuck: '자료 D를 문장 단위로 끊어 읽고, "분해"라는 낱말이 들어간 문장에 밑줄을 긋게 한다.' },
      ])
    },
    patchMaterials: (materials) => materials.map((m) => (m.id === 'D' ? { ...m, role: 'context' as const } : m)),
    patchAssessment: (a) => {
      a.items[2].situation = { role: '학교 환경 동아리 부원', audience: '학생회와 교장 선생님', purpose: '축제의 일회용컵 문제를 줄일 과학적 해결 방안을 설득하기', product: '해결 방안 제안서(300자 내외)' }
      // 대표 2026-09-26: 서술형 하나만 — 서술형 1(재활용이 어려운 이유)을 남기고 서술형 2를 뺀다(이유는 patchV1 첫 줄).
      // 남긴 문항은 6점: 재활용을 어렵게 하는 요인 · 자료를 근거로 밝히기 · 새 사례에 적용한 예측 세 요소 × 0~2, 총체적 상/중/하, 1~6점 예시답안.
      // fix wave 2(리드): 셋째 요소가 자료 D 문장("종류가 다르면 … 성질이 달라 종류별로 따로 모아야")을 옮겨 쓰면 풀리던 것을 고친다 —
      // 자료 D·E에 없는 사례(PET 컵과 PS 컵이 섞인 경우, 둘 다 물에 가라앉음)에 3차시의 뜨고 가라앉음으로 나누는 생각을 적용해 예측하게 한다.
      rebuildShortItem(a.items[0], {
        stem: '자료 D는 플라스틱의 재료와 분해·재활용을, 자료 E는 컵 재질별 무게·재사용 횟수·재활용 특성을 담고 있다. 재활용 공장에서는 잘게 부순 플라스틱 조각을 물에 넣어 뜨는 것과 가라앉는 것으로 나누기도 하며, PS(폴리스타이렌) 컵 조각은 PET 조각처럼 물에 가라앉는다. (1) 자료 D와 자료 E를 근거로, 축제에서 사용한 플라스틱컵을 재활용하기 어려운 이유 두 가지를 쓰시오. (2) PET 컵과 PS 컵이 섞여 들어오면 물에 넣는 방법으로 둘을 나눌 수 있을지 예측하고, 그 까닭을 쓰시오.',
        element: '자료 D·E를 근거로 플라스틱컵을 재활용하기 어려운 이유를 쓰고, 물에 뜨고 가라앉는 성질로 새 사례를 나눌 수 있을지 예측하기',
        length: '네 문장 안팎(이유 두 문장 + 예측과 까닭 한두 문장)',
        format: '"~다"로 끝나는 문장',
        criteria: [
          { name: '재활용을 어렵게 하는 요인', axis: '지식·이해', scale: [
            '무응답이거나, 시도했으나 "환경에 나쁘다"처럼 재활용과 관련 없는 내용이나 과학적으로 틀린 내용만 씀',
            '요인을 두 가지 썼으나 한 가지만 맞거나 같은 요인을 되풀이해 서로 다른 요인으로 구분하지 않음 / 요인을 한 가지만 씀',
            '서로 다른 요인 두 가지를 맞게 씀(음료 등 이물질 오염 / 서로 다른 재질이 섞임 / 색소·첨가제 가운데 2개)'] },
          { name: '자료를 근거로 밝히기', axis: '과정·기능', scale: [
            '무응답이거나, 시도했으나 자료 D·E의 내용을 하나도 근거로 들지 않음',
            '한 요인은 자료 D·E의 내용으로 뒷받침했으나 다른 요인의 근거가 없음',
            '두 요인 모두 자료 D 또는 자료 E의 내용을 근거로 밝힘(예: 종류별로 따로 모아야 다시 쓸 수 있음, PET와 PP가 섞이면 둘 다 재활용이 어려움)'] },
          { name: '새 사례에 적용한 예측', axis: '과정·기능', scale: [
            '무응답이거나, 시도했으나 예측이 없거나 물에 뜨고 가라앉는 성질과 관련 없는 까닭만 씀',
            '나눌 수 없다고 예측했으나 까닭이 없거나, 뜨고 가라앉는 성질을 들었으나 나눌 수 있다고 잘못 예측함',
            '둘 다 물에 가라앉아 뜨고 가라앉는 차이로는 나눌 수 없다고 예측하고, 그래서 처음부터 종류별로 따로 모으거나 다른 성질로 나누어야 한다는 까닭까지 씀'] },
        ],
        holistic: {
          상: '재활용을 어렵게 하는 서로 다른 요인 두 가지를 자료로 뒷받침하고, 새 사례(PET와 PS)를 뜨고 가라앉는 성질로 나눌 수 없다고 까닭과 함께 예측함(5~6점)',
          중: '요인 두 가지를 썼으나 근거가 한쪽만 있거나, 예측은 했으나 까닭이 빠지거나 틀림(3~4점)',
          하: '요인을 한 가지만 쓰거나 "썩지 않는다"처럼 재활용과 다른 문제를 쓰고, 예측이 없거나 성질과 관련 없음(0~2점)',
        },
        notes: [
          '예시답안과 표현이 달라도 의미가 같으면 인정한다.',
          '"잘 썩지 않는다"는 분해의 문제이지 재활용을 어렵게 하는 요인이 아니므로 요인으로 인정하지 않는다.',
          '(2)에서 "밀도"라는 낱말을 쓰지 않아도 "둘 다 가라앉아서"처럼 뜨고 가라앉는 성질로 까닭을 밝히면 인정한다. 녹는 온도 등 다른 성질로 나누자는 제안은 까닭으로 인정한다.',
          '예시답안은 유일한 정답이 아니다.',
        ],
        exemplars: [
          [[2, 2, 2], '컵 안에 음료가 남아 있으면 오염되어 재활용하기 어렵다고 자료 D에 나와 있다. 또 자료 E처럼 PET 컵과 PP 뚜껑이 섞이면 둘 다 재활용이 어려워진다. PET 컵과 PS 컵은 물에 넣으면 둘 다 가라앉으므로 뜨고 가라앉는 차이로는 나눌 수 없다. 그래서 두 컵은 처음부터 따로 모아야 한다.', '서로 다른 요인 두 가지(오염·재질 섞임)를 쓰고(2), 둘 다 자료 D·E로 뒷받침했으며(2), 둘 다 가라앉아 나눌 수 없다는 예측과 따로 모아야 한다는 까닭을 써(2) 6점에 해당함'],
          [[2, 2, 1], '자료 D를 보면 음료가 남은 컵은 오염되어 재활용이 어렵다. 자료 E를 보면 PET와 PP가 섞이면 둘 다 재활용이 어려워진다. PET 컵과 PS 컵은 물로 나눌 수 없을 것이다.', '요인 두 가지와 자료 근거는 맞으나(2·2), 나눌 수 없다는 예측에 까닭이 없어(1) 5점에 해당함'],
          [[2, 1, 1], '음료가 남아 있으면 더러워서 재활용이 어렵다. 컵과 뚜껑의 재질이 달라서 섞이면 어렵다고 자료 E에 있다. PS는 가라앉고 PET는 뜨니까 물에 넣으면 나눌 수 있다.', '요인 두 가지는 맞으나(2) 자료 근거는 한 요인에만 있고(1), 뜨고 가라앉는 성질을 들었으나 PET가 뜬다고 잘못 보아 나눌 수 있다고 예측해(1) 4점에 해당함'],
          [[1, 1, 1], '자료 D에 음료가 남아 있으면 재활용이 어렵다고 나와 있다. 플라스틱은 잘 썩지 않아서 재활용이 어렵다. PET 컵과 PS 컵은 나눌 수 없다.', '"잘 썩지 않는다"는 재활용 요인이 아니어서 요인은 한 가지만 인정되고(1), 근거도 한 요인에만 있으며(1), 예측에 까닭이 없어(1) 3점에 해당함'],
          [[1, 0, 1], '음료가 남아 있으면 재활용하기 어렵다. PET 컵과 PS 컵은 물로 나눌 수 없을 것 같다.', '요인 한 가지를 쓰고(1) 자료 근거는 없으며(0), 나눌 수 없다고 예측했으나 까닭이 없어(1) 2점에 해당함'],
          [[1, 0, 0], '플라스틱컵은 잘 썩지 않고, 음료가 남아 있으면 재활용이 어렵다.', '오염 한 가지만 요인으로 인정되고(1) 자료 근거와 (2)의 예측이 없어(0·0) 1점에 해당함'],
        ],
        traits: {
          A: '서로 다른 요인 두 가지를 자료로 뒷받침하고 새 사례를 뜨고 가라앉는 성질로 나눌 수 없다고 까닭과 함께 예측함',
          B: '요인과 근거는 맞으나 새 사례 예측의 까닭이 부분적임',
          C: '요인 두 가지를 쓰나 자료 근거나 새 사례 예측 가운데 하나가 부족함',
          D: '요인을 한 가지만 맞게 쓰고 근거·예측이 대부분 빠지거나 틀림',
          E: '재활용과 관련된 요인을 찾으려는 시도는 있으나 핵심이 빠짐(미응답 포함)',
        },
      })
      keepOneShort(a, 0)
      // M5: 공유 자료 B 에 상대도수가 없으므로 상 예시답안은 자료 B의 개수를 인용한다(비율을 계산해 쓰는 것은 학생의 몫이라 괜찮지만 예시는 개수로)
      const top = a.items[1].exemplar_answers.find((e) => e.level === '상')!
      top.text = swap(top.text, '자료 B를 보면 플라스틱컵은 작년 290개에서 올해 405개로 늘었고, 전체에서 차지하는 비율도 0.24에서 0.30으로 품목 가운데 가장 크게 올랐다.',
        '자료 B를 보면 플라스틱컵은 작년 290개에서 올해 405개로 115개 늘어, 다섯 품목 가운데 가장 많이 늘었다.')
      // C-32: 서술형 조건 없음(인용할 자료는 발문이 이미 "자료 D와 자료 E를 근거로"라고 밝힌다). 논술형은 지침 4개 그대로 두되 문장을 다듬고 요소별로 대응시킨다
      clearShortConditions(a.items[0])
      setEssayConditions(a.items[1], [
        ['자료 B의 수치를 한 개 이상 근거로 인용할 것', '인용하다', '내용'],
        ['자료 D의 과학적 내용을 한 개 이상 근거로 인용할 것', '인용하다', '내용'],
        ['개인 차원과 학교(사회) 차원의 방안을 한 가지씩 쓸 것', '쓰다', '내용'],
        ['"~다"로 끝나는 문장으로 쓸 것', '쓰다', '형식'],
      ], { '과학적 근거의 정확성': [1, 2], '문제와 해결 방안의 연결': [1, 2], '실천 가능성(개인·사회 구분)': [3], '서술': [4] }, null)
    },
    session: {
      key_question: '축제의 일회용컵 문제를 줄이기 위해 우리 학교가 무엇을 바꾸는 것이 과학적으로 가장 타당한가?',
      goal: '재활용이 어려운 까닭을 설명하는 서술형과 과학적 근거로 해결 방안을 제안하는 논술형에 답해 단원에서 배운 것을 스스로 정리한다.',
      intro: '평가 안내: 서술형 15분, 논술형 35분으로 나누어 쓰고, 자료 B·D·E를 보면서 쓸 수 있음을 알린다.',
      short: '서술형 문항(재활용이 어려운 이유)에 답안을 작성한다(15분).',
      essay: '논술형 문항(해결 방안 제안서)에 답안을 작성한다(35분, 퀴즈 없음 — 평가로 대체).',
      wrapup: '제출 전에 답안을 문항의 분량·형식과 논술형 작성 조건에 하나씩 대조해 스스로 점검한 뒤 제출한다.',
      caution: ['작성 중에는 자료를 다시 설명하거나 답의 방향을 알려 주지 않는다.', '서술형 15분이 지나면 논술형으로 넘어가도록 안내하되, 서술형을 마저 쓰려는 학생은 논술형 시간 안에서 쓰게 한다.'],
    },
  },
]

export type Problem = { file: string; kind: 'zod' | 'static'; detail: string }

/** 한 세트의 v2 출력(2~7단계)을 만든다. 파일은 쓰지 않는다. */
export function convertSet(set: SetDef): { files: Record<string, unknown>; problems: Problem[] } {
  const standards = readJson(join(OUT_DIR, set.standardsFile)) as { code: string; text: string }[]
  const v1 = (stage: number) => readJson(join(V1_DIR, `stage${stage}-generate${set.suffix}.json`))
  const input: V1Input = { s2: v1(2), s3: v1(3), s4: v1(4), s6: v1(6) }
  const s5 = v1(5) as V1Assessment
  set.patchV1?.(input)
  const s6 = input.s6

  const ctx = { standards, prior: {} as Record<string, unknown> }
  const stage2 = enrichOutput(2, buildReconstructionV2(input.s2, standards), ctx)
  const notesFor = (no: number) => s6.per_lesson.find((p) => p.no === no)?.notes ?? []
  const lessons = input.s3.lessons.map((l) => upgradeLessonV1(l, notesFor(l.no)))
  set.patchLessons?.(lessons)
  const assessment = upgradeAssessmentV1(s5)
  set.patchAssessment?.(assessment)
  if (set.session) { clearLessonAssessments(lessons); appendAssessmentSession(lessons, assessment, set.session) }
  const stage3 = { unit_plan: unitPlanFrom(set.title, input.s2.key_question_candidates[0], lessons, assessment), lessons }
  // 대표님 지시(2026-09-26): 자료 제목의 '본사 자작'·'가상' 같은 내부 표기는 지운다(lib/studio/materials.ts cleanMaterialTitle).
  const materials = input.s4.materials.map(upgradeMaterialV1).map((m) => ({ ...m, title: cleanMaterialTitle(m.title) }))
  const stage4 = { materials: set.patchMaterials ? set.patchMaterials(materials) : materials }
  ctx.prior = { stage2, stage3, stage4 }
  const stage5 = enrichOutput(5, assessment, ctx)
  const stage6 = upgradeTeacherGuideV1(s6, lessons, assessment)
  const stage7 = draftNoticePlan(lessons, assessment)

  const outputs: Record<2 | 3 | 4 | 5 | 6 | 7, unknown> = { 2: stage2, 3: stage3, 4: stage4, 5: stage5, 6: stage6, 7: stage7 }
  const files: Record<string, unknown> = {}; const problems: Problem[] = []
  for (const n of [2, 3, 4, 5, 6, 7] as const) {
    const file = `stage${n}-generate${set.suffix}.json`
    const parsed = STAGE_SCHEMAS[n].safeParse(outputs[n])
    if (!parsed.success) for (const i of parsed.error.issues) problems.push({ file, kind: 'zod', detail: `${i.path.join('.')}: ${i.message}` })
    for (const i of staticIssues(n, outputs[n], ctx)) problems.push({ file, kind: 'static', detail: `${i.kind}: ${i.detail}` })
    files[file] = outputs[n]
  }
  files[`stage7-review${set.suffix}.json`] = { pass: true, issues: [] }
  return { files, problems }
}

/**
 * 1단계(성취기준 추천) 기본 fixture — 수학만(과학 등은 이 파일로 떨어진다). v1 사본이 없어 여기서 통째로 적는다.
 * fix wave 2: [9수04-04] 이유의 "(5차시 논술형)"을 세트 구조(대표 2026-09-26: 5차시 뒤 단원 평가)에 맞춘다.
 */
const STAGE1_MATH = {
  recommended: [
    { code: '[9수04-02]', reason: '자료 A를 줄기와 잎 그림·도수분포표·히스토그램·도수분포다각형으로 정리하는 2·3차시의 근거가 되는 성취기준이다.' },
    { code: '[9수04-03]', reason: '자료 B의 작년·올해 수치를 상대도수로 바꾸어 비교하는 4차시와 단원 평가 서술형의 근거가 되는 성취기준이다.' },
    { code: '[9수04-04]', reason: '탐구 문제 설정(1차시)부터 감축 목표 제안(5차시)과 자료 분석 결과의 해석·결론(단원 평가 논술형)까지 세트 전체를 아우르는 성취기준이다.' },
  ],
}

/** 두 세트(수학·과학)의 v2 fixture 전부 + 1단계 기본 fixture. 파일 이름 → 내용. */
export function buildFixturesV2(): { files: Record<string, unknown>; problems: Problem[] } {
  const files: Record<string, unknown> = {}; const problems: Problem[] = []
  const s1 = STAGE_SCHEMAS[1].safeParse(STAGE1_MATH)
  if (!s1.success) for (const i of s1.error.issues) problems.push({ file: 'stage1-generate.json', kind: 'zod', detail: `${i.path.join('.')}: ${i.message}` })
  files['stage1-generate.json'] = STAGE1_MATH
  for (const set of SETS) { const r = convertSet(set); Object.assign(files, r.files); problems.push(...r.problems) }
  return { files, problems }
}

/** 파일에 쓰는 모양 그대로(2칸 들여쓰기 + 끝 줄바꿈). 테스트가 디스크 파일과 바이트 비교할 때도 쓴다. */
export const serialize = (data: unknown) => `${JSON.stringify(data, null, 2)}\n`

function main() {
  const { files, problems } = buildFixturesV2()
  if (problems.length) {
    for (const p of problems) console.error(`${p.file} [${p.kind}] ${p.detail}`)
    console.error(`${problems.length}개 문제 — 파일을 쓰지 않았다. scripts/upgrade-fixtures-v2.ts 의 PATCHES 를 고친 뒤 다시 돌린다.`)
    process.exit(1)
  }
  for (const [name, data] of Object.entries(files)) writeFileSync(join(OUT_DIR, name), serialize(data), 'utf8')
  console.log(`fixtures v2 written (${Object.keys(files).length} files)`)
}

if (basename(process.argv[1] ?? '') === 'upgrade-fixtures-v2.ts') main()
