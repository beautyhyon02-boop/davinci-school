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
import { draftNoticePlan } from '../lib/studio/notice-draft'
import { enrichOutput } from '../lib/studio/enrich'
import { STAGE_SCHEMAS, type Lesson, type Material, type Assessment } from '../lib/studio/schemas'
import { staticIssues } from '../lib/studio/checks'

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
/** 논술형 차시: 안내 소단계 분을 v1 원래 배분에 맞추고, 작성 35분 소단계 문장을 정리한다(스펙 §2.3 "논술형 작성(35분 이상)"). */
function essayTiming(l: LessonT, t: { intro: number; guide: number; wrapup: number }) {
  l.time_budget = { intro_min: t.intro, main_min: t.guide + 35, wrapup_min: t.wrapup }
  l.flow.main = [{ ...l.flow.main[0], minutes: t.guide }, { step_label: '논술형 작성', minutes: 35, activities: ['논술형 문항에 답안을 작성한다(35분, 퀴즈 없음 — 평가로 대체).'] }]
}
const setTopics = (lessons: LessonT[], topics: string[]) => lessons.forEach((l, i) => { l.topic = topics[i] })
/** v1 문장 안의 한 구절을 바꾼다. 구절이 없으면(입력이 바뀌었으면) 조용히 넘어가지 않고 멈춘다. */
function swap(text: string, from: string, to: string): string {
  if (!text.includes(from)) throw new Error(`PATCHES: "${from.slice(0, 30)}…" not found`)
  return text.replace(from, to)
}
const lessonV1 = (s3: V1Input['s3'], no: number) => s3.lessons.find((l) => l.no === no)!

type TaskT = LessonT['worksheet']['tasks'][number]; type QuestionT = LessonT['teacher_script']['questions'][number]
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
/** 논술형 차시의 활동지·발문을 통째로 바꾼다 — v1 논술형 차시에는 퀴즈가 없어 compat 이 핵심질문으로 만든 자리표시 과제·발문뿐이다. */
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

/** 공유 자료 B 본문(두 과목 공통, M5): 상대도수(0.24·0.30 …)는 수학 서술형 2가 구하게 하는 답이라 원자료 설명만 둔다(C-03). docs/samples 공유 자료와 같은 문장. */
const RAW_B_BODY = '품목별 일회용품 개수를 작년(부스 16곳)과 올해(부스 20곳)로 나누어 센 자료. 두 해는 부스 수와 전체 개수가 다르다.'

const SETS: SetDef[] = [
  {
    suffix: '', standardsFile: 'standards-math.json', title: '자료의 정리와 해석',
    patchV1: ({ s2, s3, s4, s6 }) => {
      // C-03(차시 수준): 서술형 차시의 수업이 그 문항의 답을 먼저 말하지 않게 한다 — 방법은 다른 값으로 연습하고, 문항의 값은 학생이 구한다.
      // 2차시(서술형 1 = 20곳 전체 도수분포표, 가장 큰 계급 30~40): 표 만들기는 부스 11~20번으로 연습(가장 큰 계급 40~50, 도수 5)
      const l2 = lessonV1(s3, 2)
      l2.flow.main = swap(swap(l2.flow.main,
        '③ 계급의 크기 10인 도수분포표 완성', '③ 부스 11~20번 값으로 계급의 크기 10인 도수분포표 만들기 연습(20곳 전체 표는 서술형 1에서 만든다)'),
        '④ "30~40개 부스가 6곳으로 가장 많다"처럼 표에서 문장 만들기', '④ "40~50개 부스가 5곳으로 가장 많다"처럼 연습 표에서 문장 만들기')
      l2.quiz[1] = { q: '부스 11~20번 자료에서 계급 40개 이상 50개 미만의 도수는?', type: 'short', choices: null, answer: '5', explanation: '부스 11~20번 값 중 41·42·44·45·47의 다섯 개가 이 계급에 든다.' }
      s6.per_lesson.find((p) => p.no === 2)!.notes[1] = '연습 표의 도수의 합이 10(부스 11~20번)이 되는지 반드시 확인시킨다.'
      const l3 = lessonV1(s3, 3)
      l3.flow.intro = '서술형 1에서 만든 20곳 전체 도수분포표를 함께 확인해 칠판에 붙이고 "한눈에 보이게 그리려면?"'
      // M6(재도전 대비 C-03): 3차시 퀴즈 2(= 활동지 표준·발문 2)의 "가장 높은 직사각형의 계급 → 30개 이상 40개 미만"은 서술형 1의 답이다 →
      // 가장 왼쪽(가장 작은 값의) 계급을 묻는다. 자료 A 최솟값 18(부스 1) → 10개 이상 20개 미만(도수 1). 부스 7(35개)은 30~40이라 답이 겹쳐 쓰지 않는다.
      l3.quiz[1] = { q: '자료 A의 히스토그램에서 가장 왼쪽에 있는 직사각형의 계급은?', type: 'short', choices: null, answer: '10개 이상 20개 미만', explanation: '가로축에는 계급이 작은 값부터 차례로 놓이므로, 자료 A에서 가장 작은 값이 드는 계급을 찾으면 된다.' }
      // 4차시(서술형 2 = 플라스틱컵 상대도수 0.24·0.30): 상대도수 구하기·해석은 다른 품목으로, 플라스틱컵은 문항에 남긴다
      const l4 = lessonV1(s3, 4)
      l4.flow.main = swap(swap(l4.flow.main,
        '② 작년·올해 품목별 상대도수 표 완성(소수 둘째 자리)', '② 작년·올해 종이컵·일회용 접시·비닐봉지·나무젓가락의 상대도수 구하기(소수 둘째 자리, 플라스틱컵은 서술형 2에서 직접 구한다)'),
        '④ "개수는 종이컵이 가장 많지만, 비율이 가장 크게 오른 것은 플라스틱컵(0.24 → 0.30)" 해석', '④ "개수는 종이컵이 가장 많지만 상대도수는 0.32 → 0.31로 거의 그대로"처럼 개수와 상대도수가 다르게 말하는 경우를 해석하기')
      // 학습 목표 축: v1 문장은 모두 과정·기능으로 읽혀 첫·끝 목표에 축을 억지로 붙이게 된다 → 축이 드러나게 문장을 다듬는다
      s2.learning_goals[0] = '계급·도수·도수분포표의 뜻을 이해하고, 자료를 계급으로 나누어 도수분포표로 나타낼 수 있다.'
      s2.learning_goals[3] = '통계적 탐구 결과를 근거로 축제 일회용품을 줄이는 목표를 정하고, 자료에 근거해 판단하는 태도를 기른다.'
      // C-03: 자료 B 본문의 상대도수(0.24·0.30 …)는 서술형 2가 구하게 하는 답이다 → 원자료 설명만 남긴다
      s4.materials.find((m) => m.id === 'B')!.body = RAW_B_BODY
    },
    patchLessons: (lessons) => {
      // v1 에는 차시 주제가 없어 compat 이 목표 앞 40자를 잘라 쓴다 → 안내장·평가 계획표에 보일 짧은 주제명
      setTopics(lessons, ['통계적 탐구 문제 세우기', '줄기와 잎 그림과 도수분포표', '히스토그램과 도수분포다각형', '상대도수로 두 집단 비교하기', '자료로 감축 목표 제안하기'])
      tidyFlow(lessons)
      // v1 5차시: 공학 도구로 목표 수치 정하기 안내 + 평가 35분 → 도입 5 · 안내 15 · 작성 35 · 정리 5
      essayTiming(lessons[4], { intro: 5, guide: 15, wrapup: 5 })
      // I3: 도전 과제 기대 수행 — 서술형 1(20곳 전체 표·가장 큰 계급)·서술형 2(플라스틱컵 상대도수)의 값은 적지 않는다
      setChallenges(lessons, {
        1: '조사 항목(품목별 일회용품 개수)·대상(축제 부스)·방법(누가 언제 어떻게 셀지)을 모두 정하고, 부스 수도 함께 세어야 하는 까닭(해마다 부스 수가 달라 개수만으로는 비교하기 어려움)을 쓰면 인정',
        2: '원자료로는 잘 보이지 않던 분포(부스가 어느 구간에 몰려 있고 어느 구간에 드문지)가 계급으로 나누면 한눈에 보인다는 점을, 연습 표(부스 11~20번)에서 도수가 가장 큰 계급을 예로 들어 설명하면 인정',
        3: '히스토그램에서 가장 높은 직사각형이 있는 곳과 양 끝의 낮은 직사각형을 함께 근거로 들어, 부스들이 가운데 구간에 몰려 있고 아주 적거나 아주 많이 쓴 부스는 드물다는 뜻의 문장을 쓰면 인정',
        4: '부스 수(16곳 → 20곳)와 전체 개수(1,200개 → 1,350개)가 달라 개수가 늘어도 차지하는 비율은 그대로일 수 있음을, 종이컵처럼 개수와 상대도수가 다르게 말하는 품목을 예로 들어 설명하면 인정',
      })
      // I3: 5차시(논술형) — v1 에 퀴즈가 없어 발문·활동지가 핵심질문 자리표시였다. 논술형 답(줄일 품목·목표 수치)은 말하지 않고 준비 과정만 다룬다.
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
      // 스펙 §2.5 [TS]-4: 서술형은 1~3점 단계마다 예시답안. v1 은 1점 예시가 없었다.
      const [i1, i2, essay] = a.items
      i1.exemplar_answers.push({ level: null, points: 1, scores: [1], assumed_short_points: null,
        text: '10 이상 20 미만: 1, 20 이상 30 미만: 4, 30 이상 40 미만: 4, 40 이상 50 미만: 7, 50 이상 60 미만: 3, 60 이상 70 미만: 1 / 가장 큰 계급: 40개 이상 50개 미만',
        rationale: '계급은 크기 10으로 나누었으나 도수의 절반 이상이 틀리고 가장 큰 계급도 틀려, 계급을 나누려는 시도만 인정되는 1점 단계에 해당함' })
      // v1 2점 예시("0.24, 0.3 / 비교가 쉬워서")는 20자 미만이라 채점표 문장이 덧붙었다 → 학생 답안 모양으로
      const two = i2.exemplar_answers.find((e) => e.points === 2)!
      two.text = '작년 290÷1200=0.24, 올해 405÷1350=0.3이다. 상대도수로 비교하면 더 쉽기 때문이다.'
      two.rationale = '올해 값을 소수 둘째 자리(0.30)까지 쓰지 않았고, 이유가 도수의 총합 차이와 이어지지 않아 2점 단계에 해당함'
      i2.exemplar_answers.push({ level: null, points: 1, scores: [1], assumed_short_points: null,
        text: '작년 290÷1200=0.29, 올해 405÷1350=0.35이다. 플라스틱컵이 늘었다.',
        rationale: '계산식은 세웠으나 두 값이 모두 틀리고, 상대도수로 비교해야 하는 이유가 없어 1점 단계에 해당함' })
      // 스펙 §2.5 [TS]-7: 논술형에는 과제 상황(GRASPS 축약)이 필수
      essay.situation = { role: '학생회 환경부원', audience: '학생회 임원과 축제 담당 선생님', purpose: '내년 축제에서 가장 먼저 줄일 일회용품과 감축 목표를 자료로 설득하기', product: '감축 제안문(300자 내외, 문단 2~3개)' }
      // C-32: 서술형 1·2 조건 삭제. 분량의 "계급 6행"은 만들어야 할 계급 수(답의 일부)라 빼고, 서술형 2 형식의 "계산 과정(=으로 이어 쓰기)"은 풀이 방법을 알려 주므로 뺀다
      clearShortConditions(i1); clearShortConditions(i2)
      i1.conditions.length = '표 1개와 문장 1개'
      i2.conditions.length = '값 2개와 문장 1개(40자 안팎)'
      i2.conditions.format = '상대도수 두 값 + "~다"로 끝나는 문장 1개'
      // C-32: 논술형 조건 — v1 은 문단별 순서("첫 문단: … 둘째 문단: …")와 답이 되는 수치("405개 → 200개, 0.30 → 0.15"), 답의 핵심 용어(상대도수)를 담았다 → 입장·근거 수·인용 자료·형식만
      setEssayConditions(essay, [
        ['가장 먼저 줄일 일회용품 한 가지와 감축 목표 수치를 정해 밝힐 것', '밝히다', '내용'],
        ['근거는 두 가지 이상 들고, 자료 A와 자료 B를 모두 인용할 것', '인용하다', '내용'],
        ['인용한 수치에는 단위와 출처(자료 A·자료 B)를 함께 적을 것', '적다', '형식'],
        ['"~다"로 끝나는 문장으로 쓸 것', '쓰다', '형식'],
      ], { '자료 정리의 정확성': [2, 3], '해석의 타당성': [2], '제안과 근거의 연결': [1], '수학적 표현과 서술': [3, 4] },
      '줄일 일회용품을 두 가지 이상 쓰면 처음 쓴 한 가지만 채점한다.')
    },
  },
  {
    suffix: '-과학', standardsFile: 'standards-science.json', title: '과학적 탐구와 지속가능한 삶',
    patchV1: ({ s3, s4, s6 }) => {
      // 스펙 §2.3 [TS]: 병합 쌍 중 하나만 서·논술형이어야 한다 — 4(서술형2)·5(논술형) 병합 표시를 뗀다
      for (const l of s3.lessons) if (l.no === 4 || l.no === 5) l.mergeable_with = null
      // C-03(차시 수준): 4차시 서술형 2의 과학적 이유("여러 번 써야 이득")를 수업·퀴즈·유의점이 먼저 말하지 않게 한다 —
      // 수업은 자료 E로 두 컵을 만드는 데 드는 재료의 양과 재사용 횟수를 비교하는 데까지, 결론은 학생이 문항에서 쓴다
      const l4 = lessonV1(s3, 4)
      l4.flow.main = swap(l4.flow.main,
        '② 자료 E로 확인: 다회용컵은 만들 때 자원이 더 들므로 여러 번 써야 이득 → "몇 번부터 이득일까" 어림 토의',
        '② 자료 E로 확인: 일회용 PET컵(약 8 g)과 스테인리스 다회용컵(약 150 g)을 만드는 데 드는 재료의 양과 재사용 횟수를 표에서 읽어 비교하기')
      l4.quiz[2] = { q: '다음 중 과학기술이 지속가능한 삶에 이바지하는 예로 알맞은 것은?', type: 'choice', choices: ['재질을 자동으로 골라내는 분리 기술', '일회용컵을 더 싸게 많이 만드는 기술', '쓰레기를 땅에 더 깊이 묻는 방법'], answer: '재질을 자동으로 골라내는 분리 기술', explanation: '재질별로 골라내면 재활용이 쉬워져 자원을 다시 쓸 수 있다.' }
      s6.per_lesson.find((p) => p.no === 4)!.notes[0] = '"다회용컵이 무조건 좋다"는 답이 나오면 자료 E의 무게(약 150 g vs 약 8 g)를 짚어 만드는 데 드는 재료의 양을 비교하게 한다. 어느 쪽이 언제 나은지는 서술형 2에서 학생이 쓰도록 결론을 미리 말해 주지 않는다.'
      s6.general.schedule_note = '2시간 등원이면 1·2차시 / 3·4차시 / 5차시+보충 순으로 3주가 표준. 2차시는 1차시와 병합 가능(자료 D 읽기를 1차시 정리 시간에 붙이고 "책상 위 플라스틱 찾기" 도입과 재활용 표시 확인 활동을 생략). 3차시는 관찰 활동이 핵심이고, 4·5차시는 서술형·논술형 평가 차시라 병합하지 않는다.'
      // C-03: 자료 E 본문의 "여러 번 써야 이득"은 4차시 퀴즈·서술형 2가 끌어내게 하는 결론이다 → 수치의 전제만 남긴다
      const e = s4.materials.find((m) => m.id === 'E')!
      e.body = '무게는 흔히 쓰는 200~350 mL 컵의 대략적인 값이고, 재사용 횟수는 보통의 사용을 가정한 어림값이다.'
      // 문항이 참조하는 공유 자료 B·D 를 4단계 fixture 에 함께 둔다 — 공유 자료가 없는 대주제에서도 mock 5단계 [TS](없는 자료) 검사가 통과하도록.
      // 게시 때는 대주제 공유 자료가 같은 ID 를 이긴다(publish.ts buildSnapshot). 원문은 docs/samples 공유 자료 그대로.
      const shared = (readJson(join(ROOT, 'docs', 'samples', '2026-09-20-중1-일회용품-공유자료.json')) as { materials: V1Material[] }).materials
      // M5: 공유 자료 B 는 두 과목 모두 개수만 싣는다(상대도수 0.24·0.30 = 수학 서술형 2의 답). docs/samples 도 같은 문장이지만 여기서 한 번 더 못박는다.
      s4.materials = [...shared.filter((m) => m.id === 'B' || m.id === 'D').map((m) => (m.id === 'B' ? { ...m, body: RAW_B_BODY } : m)), ...s4.materials]
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
      // v1 5차시: 도입 10 · 뼈대 안내 15 · 평가 35 → 도입 10 · 안내 10 · 작성 35 · 정리 5
      essayTiming(lessons[4], { intro: 10, guide: 10, wrapup: 5 })
      // I3: 도전 과제 기대 수행 — 4차시는 서술형 2의 결론(다회용컵이 언제 나은지)을 적지 않고 판단 근거만 본다
      setChallenges(lessons, {
        1: '느낌을 나타내는 말(많다·심하다)을 세거나 잴 수 있는 것(어떤 일회용품이 몇 개 나왔는지)으로 바꾸어 탐구 문제를 쓰고, 그 문제에 맞는 가설을 "~하면 ~할 것이다" 형식으로 쓰면 인정',
        2: '가볍고 잘 깨지지 않으며 값이 싸서 편리하다는 점과, 잘 변하지 않는 성질 때문에 버려진 뒤 미생물이 거의 분해하지 못해 약 수백 년 남는다는 점을 자료 D를 근거로 이어 쓰면 인정',
        3: '물에 뜨고 가라앉는 관찰 결과로 플라스틱도 종류마다 성질이 다르다는 것을 쓰고, 재활용이 잘 되는 컵과 그렇지 않은 컵의 차이를 자료 D·E의 내용으로 설명하면 인정',
        4: '교사 확인: 자료 E의 무게(약 8 g과 약 150 g)와 재사용 횟수를 둘 다 근거로 들어 판단했는지 본다. 어느 쪽이 언제 나은지는 서술형 2에서 학생이 직접 쓰므로 결론 문장을 미리 말해 주지 않는다',
      })
      // I3: 5차시(논술형) — 자리표시였던 발문(v1 흐름 문장 "도입 10분 — …"이 힌트로 들어감)·활동지를 제안서 준비 과정으로 바꾼다. 제안 내용은 말하지 않는다.
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
      // I3: v1 1점 예시("학교가 다회용컵을 빌려준다.")는 20자 미만이라 compat 이 '짧은 답안' 표시를 붙인다 → 1점 단계 모양의 학생 답안으로
      const one = a.items[1].exemplar_answers.find((e) => e.points === 1)!
      one.text = '학교가 축제 때 다회용컵을 빌려주고 다 쓴 컵은 돌려받으면 된다.'
      one.rationale = '학교(사회) 차원의 방안을 개인 방안으로 제시했고, 그 방안이 효과가 있는 과학적 이유가 없어 1점 단계에 해당함'
      // M5: 공유 자료 B 에 상대도수가 없으므로 상 예시답안은 자료 B의 개수를 인용한다(비율을 계산해 쓰는 것은 학생의 몫이라 괜찮지만 예시는 개수로)
      const top = a.items[2].exemplar_answers.find((e) => e.level === '상')!
      top.text = swap(top.text, '자료 B를 보면 플라스틱컵은 작년 290개에서 올해 405개로 늘었고, 전체에서 차지하는 비율도 0.24에서 0.30으로 품목 가운데 가장 크게 올랐다.',
        '자료 B를 보면 플라스틱컵은 작년 290개에서 올해 405개로 115개 늘어, 다섯 품목 가운데 가장 많이 늘었다.')
      // C-32: 서술형 1·2 조건 삭제(인용할 자료는 발문이 이미 "자료 D와 자료 E를 근거로"라고 밝힌다). 논술형은 지침 4개 그대로 두되 문장을 다듬고 요소별로 대응시킨다
      clearShortConditions(a.items[0]); clearShortConditions(a.items[1])
      setEssayConditions(a.items[2], [
        ['자료 B의 수치를 한 개 이상 근거로 인용할 것', '인용하다', '내용'],
        ['자료 D의 과학적 내용을 한 개 이상 근거로 인용할 것', '인용하다', '내용'],
        ['개인 차원과 학교(사회) 차원의 방안을 한 가지씩 쓸 것', '쓰다', '내용'],
        ['"~다"로 끝나는 문장으로 쓸 것', '쓰다', '형식'],
      ], { '과학적 근거의 정확성': [1, 2], '문제와 해결 방안의 연결': [1, 2], '실천 가능성(개인·사회 구분)': [3], '서술': [4] }, null)
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
  const stage3 = { unit_plan: unitPlanFrom(set.title, input.s2.key_question_candidates[0], lessons, assessment), lessons }
  const materials = input.s4.materials.map(upgradeMaterialV1)
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

/** 두 세트(수학·과학)의 v2 fixture 전부. 파일 이름 → 내용. */
export function buildFixturesV2(): { files: Record<string, unknown>; problems: Problem[] } {
  const files: Record<string, unknown> = {}; const problems: Problem[] = []
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
