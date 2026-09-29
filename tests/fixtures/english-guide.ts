// 영어 세트 합성 예(S-영-08, 대표 2026-09-29 — 영문 자료·영어 예시답안의 한국어 번역을 교사용 지침서에).
// 시연 fixture(data/studio-fixtures, 수학·과학)는 한국어 자료라 번역이 없다 — 번역 [TS] 메모·화면·문장 고치기는 이 작은 예로 시험한다.
import { readFileSync } from 'node:fs'

const src = { kind: '자작', attribution: null, ai_assisted: false }

/** 4단계 자료: E(영문 안내문), F(영문 표), G(한국어 — 번역 대상 아님). */
export const englishMaterials = [
  { id: 'E', title: 'Eco Booth Notice', kind: 'text', body: 'Welcome to the Green Festival! Bring your own cup to Booth 3 and get a 500 won discount. Last year we used 1,350 paper cups in two days.', table: null, source: src, role: 'raw', images: [] },
  { id: 'F', title: 'Cup Survey', kind: 'table', body: null, table: { columns: ['Item', 'Number'], rows: [['Paper cups', 1350], ['Plastic straws', 420]] }, source: src, role: 'raw', images: [] },
  { id: 'G', title: '축제 쓰레기 조사', kind: 'text', body: '학교 축제에서 나온 쓰레기를 종류별로 조사한 결과를 정리한 안내문이다.', table: null, source: src, role: 'context', images: [] },
]

/** 5단계에서 번역 검사가 보는 부분(문항별 예시답안)만. */
export const englishItems = [
  { exemplar_answers: [{ level: null, points: 6, text: 'The festival used 1,350 paper cups, so students should bring their own cups to Booth 3.' }] },
  { exemplar_answers: [
    { level: '상', points: 15, text: 'I think our school should stop using paper cups. Last year we used 1,350 cups in two days, and a 500 won discount can change what students do.' },
    { level: '중', points: 10, text: 'We should use our own cups because paper cups make a lot of trash at the festival.' },
  ] },
]

export const englishTranslations = {
  materials: [
    { material_id: 'E', title_ko: '친환경 부스 안내', body_ko: '그린 축제에 오신 것을 환영합니다! 3번 부스에 자기 컵을 가져오면 500원을 할인해 줍니다. 작년에는 이틀 동안 종이컵 1,350개를 썼습니다.', table_ko: null },
    { material_id: 'F', title_ko: '컵 사용 조사', body_ko: null, table_ko: { columns: ['품목', '개수'], rows: [['종이컵', 1350], ['플라스틱 빨대', 420]] } },
  ],
  exemplar_answers: [
    { item_no: 1, label: '6점', text_ko: '축제에서 종이컵 1,350개를 썼으므로 학생들은 3번 부스에 자기 컵을 가져와야 한다.' },
    { item_no: 2, label: '상', text_ko: '나는 우리 학교가 종이컵 사용을 멈춰야 한다고 생각한다. 작년에 이틀 동안 컵 1,350개를 썼고, 500원 할인은 학생들의 행동을 바꿀 수 있다.' },
    { item_no: 2, label: '중', text_ko: '종이컵은 축제에서 쓰레기를 많이 만들기 때문에 우리는 자기 컵을 써야 한다.' },
  ],
}

/** 수학 fixture 지침서에 번역만 붙인 영어 세트 지침서(TeacherGuide 스키마를 통과한다). */
export function englishGuide() {
  const base = JSON.parse(readFileSync('data/studio-fixtures/stage6-generate.json', 'utf8'))
  return { ...base, translations: structuredClone(englishTranslations) }
}
