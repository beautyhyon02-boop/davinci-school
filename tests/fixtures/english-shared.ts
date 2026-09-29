// 영어 세트 합성 예(S-영-09, 대표 2026-09-29 — 영어 세트는 한국어 공동 자료를 학생에게 주지 않고 같은 수치의 영어판을 세트 자료로 만든다).
// 시연 fixture(data/studio-fixtures, 수학·과학)는 공동 자료를 그대로 쓰는 한국어 세트다 — 영어판 [TS] 메모·프롬프트·게시·화면은 이 작은 예로 시험한다.
import { lessonV2, assessmentSession, assessmentV2 } from '../studio-schemas.test'

const src = { kind: '자작', attribution: null, ai_assisted: false }

/** 대주제 공동 자료(한국어 원본) — 이 세트가 체크한 B·C. 수학·과학 세트는 이 표를 그대로 쓴다. */
export const sharedB = {
  id: 'B', title: '작년 vs 올해 품목별 일회용품 개수', kind: 'table', body: '품목별 일회용품 개수를 작년(부스 16개)과 올해(부스 20개)로 나누어 센 자료.',
  table: { columns: ['품목', '작년 (부스 16개)', '올해 (부스 20개)'], rows: [['종이컵', 380, 420], ['플라스틱컵', 290, 405], ['일회용 접시', 210, 240], ['합계', 880, '1,065']] },
  source: src, role: 'raw', images: [],
}
export const sharedC = {
  id: 'C', title: '학생 120명 설문', kind: 'table', body: '합계 120명, 100%.',
  table: { columns: ['품목', '응답 수(명)', '비율(%)'], rows: [['플라스틱컵', 72, 60], ['종이컵', 48, 40], ['합계', 120, 100]] },
  source: src, role: 'raw', images: [],
}
export const sharedMaterials = [sharedB, sharedC]

/** 4단계 세트 자료: E = 공동 자료 B의 영어판(수치·행과 열의 순서·합계가 원본과 같다), F = 영어 안내문(영어판 아님). */
export const englishVersionE = {
  id: 'E', title: 'Disposable Items by Type: Last Year vs. This Year', kind: 'table',
  body: 'This table shows the number of disposable* items by type last year (16 booths) and this year (20 booths).\n* disposable 일회용의',
  table: { columns: ['Item', 'Last year (16 booths)', 'This year (20 booths)'], rows: [['Paper cups', 380, 420], ['Plastic cups', 290, 405], ['Disposable plates', 210, 240], ['Total', 880, 1065]] },
  source: src, role: 'raw', images: [], english_version_of: 'B',
}
export const noticeF = {
  id: 'F', title: 'Eco Booth Notice', kind: 'text', body: 'Welcome to the Green Festival! Bring your own cup to Booth 3 and get a discount on every drink you buy.', table: null,
  source: src, role: 'context', images: [],
}
export const englishSetMaterials = [englishVersionE, noticeF]

/** 3단계: 교수 차시 3개(세트 자료 E·F만) + 단원 평가 차시. lessonV2 의 "자료 A" 문장은 세트 자료로 바꿔 둔다. */
const teaching = (no: number, materials_used: string[]) => ({
  ...lessonV2, no, materials_used,
  flow: { ...lessonV2.flow, intro: ['표 훑어보기'] },
  materials_needed: no === 1 ? ['자료 E(공동 자료 B의 영어판)'] : ['활동지'],
})
export const englishLessons = [teaching(1, ['E']), teaching(2, ['E', 'F']), teaching(3, ['F']), { ...assessmentSession(4), materials_used: ['E', 'F'] }]
export const englishUnitPlan = {
  set_title: 'Less Waste at the Festival', set_key_question: '표의 수치는 무엇을 말하며, 그것을 어떻게 영어로 설명할 수 있는가?', lesson_map: [],
  assessment_plan: { formative: '차시 퀴즈', summative_placement: [{ kind: '서술형', lesson_no: 4 }, { kind: '논술형', lesson_no: 4 }], rubric_note: { 상: 'a', 중: 'b', 하: 'c' } },
}

/** 5단계: 두 문항 모두 세트 자료만(E·F). 문두는 <자료 n>으로만 가리킨다. */
export const englishAssessment = {
  ...assessmentV2,
  items: assessmentV2.items.map((it) => ({
    ...it, lesson_no: 4, materials_used: ['E', 'F'],
    stem: `<자료 1>은 품목별 개수를 센 표이고, <자료 2>는 부스 안내문이다. 두 자료를 읽고 영어로 쓰시오. [${it.points}점]`,
  })),
}
