// 도수 다시 세기(lib/studio/recount.ts) — 2026-10-02 수학 세트 실제 사례: 3단계 기대 답이 공동 자료 A를 잘못 셌다.
// 전부 참고 메모(kind other)다 — 아무것도 막지 않는다.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { loadFixture } from '@/lib/ai/mock'
import { countTableOf, parseCountClaims, pairClaim, recount, recountNotes, rangeLabel, RECOUNT_MIN_ROWS } from '@/lib/studio/recount'
import { staticIssues } from '@/lib/studio/checks'
import { sharedA, sharedB, sharedC, tickedShared, THEME_LETTERS, BOOTH_COUNTS, mathLessons, mathDesign, lessonWith, recountTask, recountQuiz } from './fixtures/math-recount'

const standards = [{ code: '[9수04-02]', text: '자료를 줄기와 잎 그림, 도수분포표, 히스토그램, 도수분포다각형으로 나타내고 해석할 수 있다.' }]
const tableA = countTableOf(sharedA)!
const claims = (text: string) => parseCountClaims(text).claims.map((c) => `${rangeLabel(c)} → ${c.n}`)

describe('countTableOf: 값 열 하나짜리 표만 다시 센다', () => {
  it('자료 A(부스 번호 열 + 개수 열, 20행) → 번호 열은 빼고 개수 20개', () => {
    expect(tableA.values).toEqual(BOOTH_COUNTS)
    expect(tableA.id).toBe('A')
  })
  it('값 열이 둘인 품목 표(B·C), 행이 적은 표, 값이 여러 열에 펼쳐진 표, 표가 없는 자료는 대상이 아니다', () => {
    expect(countTableOf(sharedB)).toBeNull(); expect(countTableOf(sharedC)).toBeNull()
    expect(countTableOf({ id: 'E', table: { columns: ['부스', '개수'], rows: BOOTH_COUNTS.slice(0, RECOUNT_MIN_ROWS - 1).map((n, i) => [i + 1, n]) } })).toBeNull()
    expect(countTableOf({ id: 'E', table: { columns: ['1', '2', '3', '4', '5'], rows: [[18, 23, 27, 29, 31], [33, 35, 36, 38, 39]] } })).toBeNull()
    expect(countTableOf({ id: 'E', table: null })).toBeNull()
  })
  it('이름 열 + 값 열, 글자로 적은 수("18개"), 합계 행도 읽는다(합계 행은 뺀다)', () => {
    const t = countTableOf({ id: 'E', table: { columns: ['학생', '기록(회)'], rows: [...['가', '나', '다', '라', '마', '바', '사', '아'].map((name, i) => [name, `${i + 3}회`]), ['합계', 52]] } })
    expect(t?.values).toEqual([3, 4, 5, 6, 7, 8, 9, 10])
  })
})

describe('parseCountClaims: 글에서 "구간 + 개수" 찾기', () => {
  it('쉼표 목록의 맨수: "10이상20미만 1, 20~30 2, …, 합 20."', () => {
    const r = parseCountClaims('10이상20미만 1, 20~30 2, 30~40 6, 40~50 5, 50~60 4, 60~70 2, 합 20.')
    expect(r.claims.map((c) => `${rangeLabel(c)} → ${c.n}`)).toEqual(['10 이상 20 미만 → 1', '20 이상 30 미만 → 2', '30 이상 40 미만 → 6', '40 이상 50 미만 → 5', '50 이상 60 미만 → 4', '60 이상 70 미만 → 2'])
    expect(r.sum?.n).toBe(20)
  })
  it('단위가 붙은 개수와 도수: "30~40이고 6곳", "… 6개/6명", "(도수 6)", 값을 늘어놓은 뒤의 개수', () => {
    expect(claims('가장 많은 계급은 30~40이고 6곳이다.')).toEqual(['30 이상 40 미만 → 6'])
    expect(claims('10 이상 20 미만 1곳, 20개 이상 30개 미만은 3개, 30 이상 40 미만 학생은 6명')).toEqual(['10 이상 20 미만 → 1', '20 이상 30 미만 → 3', '30 이상 40 미만 → 6'])
    expect(claims('가장 큰 계급 30개 이상 40개 미만(도수 6), 가장 작은 계급 60개 이상 70개 미만(도수 1)')).toEqual(['30 이상 40 미만 → 6', '60 이상 70 미만 → 1'])
    expect(claims('50 이상 60 미만은 51, 52, 55, 58로 4곳이다.')).toEqual(['50 이상 60 미만 → 4'])
  })
  it('한쪽이 열린 구간: "50 이상 부스는 6곳", "20 미만 부스 1곳", "30개 미만 부스 4곳"', () => {
    expect(claims('50 이상 부스는 6곳')).toEqual(['50 이상 → 6'])
    expect(claims('20 미만 부스 1곳')).toEqual(['20 미만 → 1'])
    expect(claims('30개 미만 부스 4곳')).toEqual(['30 미만 → 4'])
  })
  it('개수가 아닌 것은 읽지 않는다: 차시 범위, 비교, 계급을 센 것, 고쳐 말한 것, 상대도수, 혼자 있는 맨수, 틀린 답 설명', () => {
    expect(claims('2~4차시에 만든 표 3개')).toEqual([])
    expect(claims('30 이상 40 미만이 20 이상 30 미만보다 3곳 많다')).toEqual([])
    expect(claims('50 이상인 계급은 2개이다')).toEqual([])
    expect(claims('50 이상 부스는 6곳이 아니라 5곳이다')).toEqual([])
    expect(claims('50 이상을 6곳이라고 썼다')).toEqual([])
    expect(claims('30 이상 40 미만의 상대도수는 0.30이다')).toEqual([])
    expect(claims('30 이상 40 미만이 6으로 가장 크다')).toEqual([])
    expect(claims('계급은 20~30 2')).toEqual([])
    expect(claims('흔한 오답: 20 이상 30 미만을 2곳으로 답한다')).toEqual([])
    expect(parseCountClaims('도수의 총합이 36이다.').sum).toBeNull()
  })
})

describe('pairClaim: 물음 + 답', () => {
  it('"30 이상 40 미만인 부스는 몇 곳인가?" → "6", "계급 50개 이상 60개 미만의 도수는?" → "4 / 4곳"', () => {
    expect(pairClaim('30 이상 40 미만인 부스는 몇 곳인가?', '6')).toMatchObject({ lo: 30, hi: 40, n: 6 })
    expect(pairClaim('계급 50개 이상 60개 미만의 도수는?', '4 / 4곳')).toMatchObject({ lo: 50, hi: 60, n: 4 })
  })
  it('답이 수 하나가 아니거나, 개수를 묻지 않거나, 계급 수를 물으면 쌍이 아니다', () => {
    expect(pairClaim('30 이상 40 미만인 부스는 몇 곳인가?', '6곳쯤')).toBeNull()
    expect(pairClaim('30 이상 40 미만인 계급의 상대도수는?', '0.3')).toBeNull()
    expect(pairClaim('10개 이상 70개 미만을 계급의 크기 10으로 나누면 계급이 6개이다. 크기 5로 나누면 계급은 몇 개가 되는가?', '12')).toBeNull()
    expect(pairClaim('30 이상 40 미만이 아닌 부스는 몇 곳인가?', '14')).toBeNull()
  })
})

describe('recount: 표의 값으로 다시 세기([이상, 미만))', () => {
  const one = (text: string) => recount(tableA, parseCountClaims(text).claims[0])
  it('실제 개수: 10~20 1, 20~30 3, 30~40 6, 40~50 5, 50~60 4, 60~70 1 / 50 이상 5 / 20 미만 1', () => {
    expect(one('20 이상 30 미만 2곳')).toEqual({ truth: 3, ok: false })
    expect(one('30 이상 40 미만 6곳')).toEqual({ truth: 6, ok: true })
    expect(one('60 이상 70 미만 2곳')).toEqual({ truth: 1, ok: false })
    expect(one('50 이상 부스는 6곳')).toEqual({ truth: 5, ok: false })
    expect(one('20 미만 부스 1곳')).toEqual({ truth: 1, ok: true })
  })
  it('자료 범위 밖의 구간, 행 수보다 큰 수, 표에 없는 값을 늘어놓은 문장은 견주지 않는다(null)', () => {
    expect(one('70 이상 80 미만 2곳')).toBeNull()
    expect(one('30개 이상 쓴 부스의 컵은 모두 600개')).toBeNull()
    expect(one('10 이상 20 미만은 12, 13, 15로 3명')).toBeNull()
  })
  it('물결표 구간은 끝값을 넣어 센 것과 같아도 맞은 것으로 본다', () => {
    const t = { id: 'E', values: [10, 12, 20, 20, 25, 30, 31, 40], columns: ['값'] }
    expect(recount(t, parseCountClaims('20~30 4곳').claims[0])).toEqual({ truth: 3, ok: true })   // [20, 30] = 4
    expect(recount(t, parseCountClaims('20 이상 30 미만 4곳').claims[0])).toEqual({ truth: 3, ok: false })
  })
})

describe('3단계 [TS] 참고 메모 — 실제 사례(수학 세트 2026-10-02)', () => {
  const ctx = { standards, prior: { shared_materials: tickedShared }, sharedMaterialIds: ['A', 'B', 'C'], themeMaterialIds: THEME_LETTERS }
  const recounts = (lessons: unknown[], prior: Record<string, unknown> = ctx.prior) => staticIssues(3, mathDesign(lessons), { ...ctx, prior }).filter((i) => i.detail.includes('다시 세어')).map((i) => `${i.kind}: ${i.detail}`)

  it('잘못 센 세 곳만 짚는다 — 맞게 센 계급·합 20·"20 미만 1곳"·퀴즈 "30 이상 40 미만 → 6"은 짚지 않는다', () => {
    expect(recounts(mathLessons)).toEqual([
      'other: 1차시 발문 1 예상 답: 자료 A에서 50 이상은 5개인데 6으로 적힘(다시 세어 보세요)',
      'other: 1차시 활동지 2 기대 답: 자료 A에서 20 이상 30 미만은 3개인데 2로 적힘(다시 세어 보세요)',
      'other: 1차시 활동지 2 기대 답: 자료 A에서 60 이상 70 미만은 1개인데 2로 적힘(다시 세어 보세요)',
    ])
  })
  it('recountNotes 는 순수 함수 — 자료가 없거나 다시 셀 표가 없으면 빈 배열', () => {
    expect(recountNotes(mathLessons, [])).toEqual([])
    expect(recountNotes(mathLessons, [sharedB, sharedC])).toEqual([])
    expect(recountNotes(mathLessons, tickedShared)).toHaveLength(3)
  })
  it('퀴즈 정답·해설과 전개 문장도 본다; 합이 행 수와 다르면 짚는다', () => {
    const l = lessonWith({
      flow: { intro: ['자료 A 훑어보기'], main: [{ step_label: '읽기', minutes: 20, activities: ['"30~40개 부스가 7곳으로 가장 많다"처럼 표에서 문장 만들기'] }, { step_label: '쓰기', minutes: 20, activities: ['문장 고쳐 쓰기'] }], wrapup: ['퀴즈'] },
      worksheet: { tasks: [recountTask(1, '자료 A를 도수분포표로 정리해 보자.', '10 이상 20 미만 1곳, 20 이상 30 미만 3곳, 30 이상 40 미만 6곳, 40 이상 50 미만 5곳, 50 이상 60 미만 4곳, 60 이상 70 미만 1곳, 합 19곳'), recountTask(2, '표를 완성하시오', '6행'), recountTask(3, '가장 큰 계급은?', '30 이상 40 미만')], self_check: ['표를 혼자 완성했다'] },
      formative_check: { quiz: [recountQuiz(0, '자료 A에서 40 이상 50 미만인 부스는 몇 곳인가?', '4 / 4곳', '41, 42, 44, 45로 4곳이다.'), recountQuiz(1, '구간의 이름은?', '계급', '50 이상 60 미만은 51, 52, 55, 58로 4곳이다.'), recountQuiz(2, '컵을 가장 많이 쓴 쪽의 부스는 얼마나 되는가?', '1곳', '60 이상 부스는 2곳이다.')] },
    })
    expect(recounts([l, ...mathLessons.slice(1)])).toEqual([
      'other: 1차시 전개 1단계: 자료 A에서 30 이상 40 미만은 6개인데 7로 적힘(다시 세어 보세요)',
      'other: 1차시 활동지 1 기대 답: 자료 A의 자료는 모두 20개인데 합이 19로 적힘(다시 세어 보세요)',
      'other: 1차시 퀴즈 1 정답: 자료 A에서 40 이상 50 미만은 5개인데 4로 적힘(다시 세어 보세요)',
      'other: 1차시 퀴즈 3 해설: 자료 A에서 60 이상은 1개인데 2로 적힘(다시 세어 보세요)',
    ])
  })

  describe('짚지 않는 것', () => {
    it('다른 자료의 구간: "자료 E에서 …"(아직 만들지 않은 세트 자료)는 자료 A로 세지 않는다', () => {
      const l = lessonWith({ materials_used: ['A', 'E'], worksheet: { tasks: [recountTask(1, '자료 A와 견주어 자료 E의 분포를 적어 보자.', '자료 E에서 20 이상 30 미만은 9곳, 30 이상 40 미만은 2곳'), recountTask(2, '두 자료를 견주자', '자료 A는 30 이상 40 미만이 6곳, 자료 E는 30 이상 40 미만이 2곳'), recountTask(3, '표를 완성하시오', '6행')], self_check: ['했다'] } })
      expect(recounts([l, ...mathLessons.slice(1)])).toEqual([])
    })
    it('4단계 세트 자료 E가 표이면(다시 검토) "자료 E에서 …"는 E로 세고, 이름 없는 문장은 표가 둘이라 건너뛴다', () => {
      const setE = { ...sharedA, id: 'E', table: { columns: ['부스', '개수'], rows: [12, 15, 21, 22, 24, 25, 26, 27, 28, 29, 29, 31, 38].map((n, i) => [i + 1, n]) } }
      const l = lessonWith({ materials_used: ['A', 'E'], worksheet: { tasks: [recountTask(1, '자료 E의 분포를 적어 보자.', '자료 E에서 20 이상 30 미만은 9곳, 30 이상 40 미만은 3곳'), recountTask(2, '표를 완성하시오', '30 이상 40 미만 부스는 2곳'), recountTask(3, '가장 큰 계급은?', '6행')], self_check: ['했다'] } })
      expect(recounts([l, ...mathLessons.slice(1)], { shared_materials: tickedShared, stage4: { materials: [setE] } })).toEqual(['other: 1차시 활동지 1 기대 답: 자료 E에서 30 이상 40 미만은 2개인데 3으로 적힘(다시 세어 보세요)'])
    })
    it('결함 찾기(flaw_check) 과제 문장은 일부러 틀린 글 — 읽지 않는다; 그 기대 답은 읽는다', () => {
      const prompt = '어떤 학생이 자료 A를 보고 "50 이상 60 미만은 6곳, 60 이상 70 미만은 2곳이다"라고 썼다. 틀린 곳을 찾아 고쳐 보자.'
      const flaw = (expected: string) => lessonWith({ worksheet: { tasks: [recountTask(1, prompt, expected, { flaw_check: true }), recountTask(2, '표를 완성하시오', '6행'), recountTask(3, '가장 큰 계급은?', '30 이상 40 미만')], self_check: ['했다'] } })
      expect(recounts([flaw('결함: 50 이상 60 미만은 51, 52, 55, 58로 4곳, 60 이상 70 미만은 63 하나로 1곳이다.'), ...mathLessons.slice(1)])).toEqual([])
      expect(recounts([flaw('결함: 50 이상 60 미만은 5곳, 60 이상 70 미만은 1곳이다.'), ...mathLessons.slice(1)])).toEqual(['other: 1차시 활동지 1 기대 답: 자료 A에서 50 이상 60 미만은 4개인데 5로 적힘(다시 세어 보세요)'])
    })
    it('지어낸 사례를 묻는 퀴즈("도수의 총합이 36", "어느 반 30명")는 자료 A로 세지 않는다', () => {
      const l = lessonWith({ formative_check: { quiz: [
        recountQuiz(0, '도수의 총합이 36인 도수분포표에서 30 이상 40 미만인 계급의 도수가 9일 때, 이 계급의 상대도수는?', '0.25', '30 이상 40 미만의 도수 9를 도수의 총합 36으로 나누면 0.25이다.'),
        recountQuiz(1, '어느 반 학생 30명의 기록에서 10 이상 20 미만인 학생은 몇 명인가? (기록: 12, 13, 15, 18, 22, …)', '4 / 4명', '10 이상 20 미만은 12, 13, 15, 18로 4명이다.'),
        recountQuiz(2, '도수의 총합이 36이고 20 이상 30 미만이 12명이면 나머지는 몇 명인가?', '24', '36에서 12를 뺀다.'),
      ] } })
      expect(recounts([l, ...mathLessons.slice(1)])).toEqual([])
    })
    it('값 열이 둘인 표(자료 B)만 쓰는 차시, 단원 평가 차시는 보지 않는다', () => {
      const l = lessonWith({ materials_used: ['B'], teacher_script: { questions: [{ prompt: '300 이상인 품목은 몇 곳인가?', expected_answer: '300 이상 품목은 9곳', if_stuck: '표를 보자' }] } })
      const session = { ...mathLessons[3], worksheet: { tasks: [recountTask(1, '자료 A', '20 이상 30 미만 9곳')], self_check: [] } }
      expect(recounts([l, mathLessons[1], mathLessons[2], session])).toEqual([])
    })
    it('공동 자료를 체크하지 않아 자료 A를 모르면(prior.shared_materials 없음) 다시 세지 않는다', () => {
      expect(staticIssues(3, mathDesign(), { standards, prior: {} }).filter((i) => i.detail.includes('다시 세어'))).toEqual([])
    })
  })
})

// 시연 fixture(수학)는 자료 A를 맞게 셌다 — 메모 0. 건너뛰어서 0인 것이 아님을 보이려고 기대 답의 수 하나를 틀리게 바꾸면 그 자리가 짚이는지 본다.
describe('시연 fixture(수학 3단계)는 다시 세기 메모가 없다 — 그리고 실제로 세고 있다', () => {
  const theme = (JSON.parse(readFileSync('docs/samples/2026-09-20-중1-일회용품-공유자료.json', 'utf8')) as { materials: { id: string }[] }).materials
  const shared = theme.filter((m) => ['A', 'B'].includes(m.id))
  const design = loadFixture('stage3-generate') as { lessons: { no: number; worksheet: { tasks: { no: number; expected: string }[] } }[] }
  it('그대로면 메모 0', () => {
    expect(recountNotes(design.lessons, shared)).toEqual([])
  })
  it('2차시 활동지 기대 답의 "20개 이상 30개 미만 3곳"을 2곳으로 바꾸면 그 자리를 짚는다', () => {
    const broken = structuredClone(design)
    const task = broken.lessons.flatMap((l) => l.worksheet.tasks.map((t) => ({ l, t }))).find(({ t }) => t.expected.includes('20개 이상 30개 미만 3곳'))!
    task.t.expected = task.t.expected.replace('20개 이상 30개 미만 3곳', '20개 이상 30개 미만 2곳')
    expect(recountNotes(broken.lessons, shared)).toEqual([`${task.l.no}차시 활동지 ${task.t.no} 기대 답: 자료 A에서 20 이상 30 미만은 3개인데 2로 적힘(다시 세어 보세요)`])
  })
})
