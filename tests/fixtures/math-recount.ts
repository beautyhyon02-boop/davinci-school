// 수학 세트 실제 사례(2026-10-02) — 대주제 공동 자료 A~D 가운데 이 세트는 A·B·C만 체크했다. 3단계 출력이
// (a) 1차시에서 새 세트 자료를 D로 적었고(D는 체크하지 않은 공동 자료의 글자 — 세트 자료는 E부터여야 한다)
// (b) 공동 자료 A(부스 20곳의 컵 개수)를 잘못 세어 기대 답에 "20~30 2"(실제 3), "60~70 2"(실제 1), "50 이상 부스는 6곳"(실제 5)이라고 적었다.
// 맞게 적은 것("10이상20미만 1", "30~40 6", "40~50 5", "50~60 4", "합 20", "20 미만 부스 1곳", 퀴즈 "30 이상 40 미만 → 6")은 짚이면 안 된다.
// tests/recount.test.ts · tests/unticked-shared.test.ts 가 쓴다(시연 fixture 가 아니라 합성 예).
import { lessonV2, assessmentSession } from '../studio-schemas.test'

const src = { kind: '자작', attribution: null, ai_assisted: false }

/** 공동 자료 A: 열 ["부스", "개수"], 20행 — 10~20: 1, 20~30: 3, 30~40: 6, 40~50: 5, 50~60: 4, 60~70: 1. */
export const BOOTH_COUNTS = [18, 23, 27, 29, 31, 33, 35, 36, 38, 39, 41, 42, 44, 45, 47, 51, 52, 55, 58, 63]
export const sharedA = {
  id: 'A', title: '올해 축제 부스 20곳의 일회용컵 사용 개수', kind: 'table', body: '올해 축제 부스 20곳에서 하루 동안 쓰인 일회용컵 개수를 부스별로 센 자료.',
  table: { columns: ['부스', '개수'], rows: BOOTH_COUNTS.map((n, i) => [i + 1, n]) }, source: src, role: 'raw', images: [],
}
/** 공동 자료 B·C: 값 열이 둘인 품목 표(다시 세기 대상이 아니다). */
export const sharedB = {
  id: 'B', title: '작년 vs 올해 품목별 일회용품 개수', kind: 'table', body: null,
  table: { columns: ['품목', '작년 (부스 16곳)', '올해 (부스 20곳)'], rows: [['종이컵', 380, 420], ['플라스틱컵', 290, 405], ['일회용 접시', 210, 240], ['비닐봉지', 150, 120], ['나무젓가락', 170, 165], ['합계', 1200, 1350]] },
  source: src, role: 'raw', images: [],
}
export const sharedC = {
  id: 'C', title: '학생 120명 설문', kind: 'table', body: null,
  table: { columns: ['품목', '응답 수(명)', '비율(%)'], rows: [['플라스틱컵', 48, 40], ['종이컵', 30, 25], ['일회용 접시', 24, 20], ['비닐봉지', 12, 10], ['나무젓가락', 6, 5], ['합계', 120, 100]] },
  source: src, role: 'raw', images: [],
}
/** 이 세트가 체크한 공동 자료(A·B·C)와 대주제 공동 자료 전체의 글자(A~D). */
export const tickedShared = [sharedA, sharedB, sharedC]
export const THEME_LETTERS = ['A', 'B', 'C', 'D']

const task = (no: number, prompt: string, expected: string, extra: Record<string, unknown> = {}) => ({ ...lessonV2.worksheet.tasks[Math.min(no, 3) - 1], no, prompt, expected, ...extra })
const quiz = (i: number, q: string, answer: string, explanation: string) => ({ ...lessonV2.formative_check.quiz[i], q, answer, explanation })

/** 1차시: 실제 출력 그대로 — materials_used ["A", "D"], 활동지가 "자료 A와 자료 D 가운데 …", 기대 답·예상 답에 잘못 센 도수. */
export const mathLesson1 = {
  ...lessonV2, no: 1, materials_used: ['A', 'D'],
  flow: { ...lessonV2.flow, intro: ['자료 A 훑어보기'], main: [{ step_label: '계급 나누기', minutes: 20, activities: ['계급의 크기를 10으로 정하고 변량을 계급에 나누어 적기'] }, { step_label: '표 완성', minutes: 20, activities: ['계급마다 도수를 세어 표로 옮기기'] }] },
  teacher_script: { questions: [
    { prompt: '컵을 50개 이상 쓴 부스는 몇 곳이라고 말할 수 있는가?', expected_answer: '50 이상 부스는 6곳', if_stuck: '표의 아래쪽 줄부터 거꾸로 읽어 보자' },
    { prompt: '컵을 20개 미만으로 쓴 부스는 얼마나 되는가?', expected_answer: '20 미만 부스 1곳', if_stuck: '표의 맨 윗줄을 보자' },
  ] },
  worksheet: { ...lessonV2.worksheet, tasks: [
    task(1, '자료 A와 자료 D 가운데 하나하나 센 값이 그대로 있는 자료는 어느 것인지 적어 보자.', '자료 A — 부스마다 센 개수가 그대로 있다'),
    task(2, '자료 A를 계급의 크기 10으로 나눈 도수분포표를 만들어 보자.', '10이상20미만 1, 20~30 2, 30~40 6, 40~50 5, 50~60 4, 60~70 2, 합 20.'),
    task(3, '도수가 가장 큰 계급을 문장으로 적어 보자.', '30 이상 40 미만'),
  ] },
  formative_check: { quiz: [
    quiz(0, '변량을 일정한 간격으로 나눈 구간을 무엇이라 하는가?', '계급', '구간이 계급이다.'),
    quiz(1, '30 이상 40 미만인 부스는 몇 곳인가?', '6', '표에서 센다.'),
    quiz(2, '계급의 크기를 반으로 줄이면 계급의 수는 어떻게 되는가?', '2배', '같은 범위를 더 잘게 나눈다.'),
  ] },
}
/** 2·3차시는 공동 자료 B만 쓰는 평범한 차시, 4차시는 단원 평가. */
const plain = (no: number) => ({ ...lessonV2, no, materials_used: ['B'], flow: { ...lessonV2.flow, intro: ['자료 B 훑어보기'] }, worksheet: { ...lessonV2.worksheet, tasks: [task(1, '자료 B에서 가장 많이 늘어난 품목을 찾아 적어 보자.', '플라스틱컵'), task(2, '표를 완성하시오', '5행'), task(3, '늘어난 까닭을 문장으로', '부스가 늘었다')] } })
export const mathLessons = [mathLesson1, plain(2), plain(3), { ...assessmentSession(4), materials_used: ['A', 'B'] }]
export const mathDesign = (lessons: unknown[] = mathLessons) => ({
  unit_plan: { set_title: '축제 일회용컵 자료 정리', set_key_question: 'q?', lesson_map: [], assessment_plan: { formative: 'f', summative_placement: [{ lesson_no: 4, kind: '서술형' }, { lesson_no: 4, kind: '논술형' }], rubric_note: { 상: 'a', 중: 'b', 하: 'c' } } },
  lessons,
})
/** 활동지 과제 하나만 바꾼 1차시(나머지는 맞게 센 차시) — 부정 사례를 만들 때 쓴다. */
export const lessonWith = (over: Record<string, unknown>) => ({
  ...mathLesson1, materials_used: ['A'],
  teacher_script: { questions: [{ prompt: '계급의 크기는?', expected_answer: '10', if_stuck: '표 왼쪽 칸을 보자' }] },
  worksheet: { ...lessonV2.worksheet, tasks: [task(1, '자료 A에서 가장 큰 값을 찾아 적어 보자.', '63'), task(2, '표를 완성하시오', '6행'), task(3, '도수가 가장 큰 계급을 문장으로', '30 이상 40 미만')] },
  ...over,
})
export { task as recountTask, quiz as recountQuiz }
