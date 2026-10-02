// 체크하지 않은 공동 자료의 글자(2026-10-02 수학 세트 실제 사례): 대주제 공동 자료 A~D 가운데 A·B·C만 체크했는데 3단계가 새 세트 자료를 D로 적었다 —
// 세트 자료는 대주제 공동 자료 전체의 마지막 글자 다음(E)부터다. [TS] 참고 메모(kind other, 막지 않음)와 3·4단계 생성 프롬프트의 번호 문장을 시험한다.
import { describe, it, expect } from 'vitest'
import { staticIssues, untickedSharedNote } from '@/lib/studio/checks'
import { stageNotes } from '@/lib/studio/stages'
import { buildPrompt } from '@/lib/studio/prompts/stages'
import { lessonV2, assessmentV2 } from './studio-schemas.test'
import { tickedShared, THEME_LETTERS, mathLessons, mathDesign, lessonWith, recountTask } from './fixtures/math-recount'

const standards = [{ code: '[9수04-02]', text: '자료를 줄기와 잎 그림, 도수분포표, 히스토그램, 도수분포다각형으로 나타내고 해석할 수 있다.' }, { code: '[9수04-03]', text: '상대도수를 구하고, 상대도수의 분포를 표나 그래프로 나타내고 해석할 수 있다.' }]
const HINT = '세트 자료는 E부터 번호를 붙인다'
const ctx = { standards, prior: { shared_materials: tickedShared } as Record<string, unknown>, sharedMaterialIds: ['A', 'B', 'C'], themeMaterialIds: THEME_LETTERS }
const unticked = (stage: 3 | 4 | 5, output: unknown, c: Parameters<typeof staticIssues>[2] = ctx) => staticIssues(stage, output, c).filter((i) => i.detail.includes('체크하지 않은 공동 자료')).map((i) => `${i.kind}: ${i.detail}`)

describe('3단계: 차시가 체크하지 않은 공동 자료의 글자를 가리킴', () => {
  it('실제 사례 — 1차시 materials_used ["A", "D"] + 활동지 "자료 A와 자료 D 가운데 …": 차시마다 글자 하나에 한 번', () => {
    expect(unticked(3, mathDesign())).toEqual(['other: 1차시: 체크하지 않은 공동 자료 D를 가리킴 — 세트 자료는 E부터 번호를 붙인다(공동 자료를 쓰려면 세트 화면에서 체크)'])
    expect(untickedSharedNote('D', HINT)).toBe('체크하지 않은 공동 자료 D를 가리킴 — 세트 자료는 E부터 번호를 붙인다(공동 자료를 쓰려면 세트 화면에서 체크)')
  })
  it('문장에서만 가리켜도(활동지·발문·퀴즈·전개) 짚는다; 체크한 글자와 세트 자료 글자(E~)는 짚지 않는다', () => {
    const inText = lessonWith({ materials_used: ['A', 'E'], worksheet: { ...lessonV2.worksheet, tasks: [recountTask(1, '자료 D의 설명글에서 낱말을 찾아 적어 보자.', '고분자'), recountTask(2, '자료 E의 표를 완성하시오', '6행'), recountTask(3, '자료 A와 B를 견주자', '다르다')] } })
    const inFlow = { ...lessonWith({ flow: { ...lessonV2.flow, main: [{ step_label: '읽기', minutes: 20, activities: ['자료 D를 함께 읽기'] }, { step_label: '쓰기', minutes: 20, activities: ['문장 쓰기'] }] } }), no: 2 }
    expect(unticked(3, mathDesign([inText, inFlow, mathLessons[2], mathLessons[3]]))).toEqual([`other: 1차시: ${untickedSharedNote('D', HINT)}`, `other: 2차시: ${untickedSharedNote('D', HINT)}`])
    expect(unticked(3, mathDesign([lessonWith({ materials_used: ['A', 'B', 'C', 'E', 'F'] }), ...mathLessons.slice(1)]))).toEqual([])
  })
  it('단원 평가 차시의 materials_used 도 본다', () => {
    expect(unticked(3, mathDesign([lessonWith({}), mathLessons[1], mathLessons[2], { ...mathLessons[3], materials_used: ['A', 'D'] }]))).toEqual([`other: 4차시: ${untickedSharedNote('D', HINT)}`])
  })
  it('아무것도 체크하지 않은 세트: 대주제 공동 자료 글자는 모두 체크하지 않은 글자다', () => {
    const none = { standards, prior: {}, themeMaterialIds: THEME_LETTERS }
    expect(unticked(3, mathDesign([lessonWith({ materials_used: ['A', 'E'] }), ...mathLessons.slice(1)]), none)).toEqual([
      `other: 1차시: ${untickedSharedNote('A', HINT)}`, `other: 2차시: ${untickedSharedNote('B', HINT)}`, `other: 3차시: ${untickedSharedNote('B', HINT)}`,
      `other: 4차시: ${untickedSharedNote('A', HINT)}`, `other: 4차시: ${untickedSharedNote('B', HINT)}`,
    ])
  })
  it('대주제 공동 자료 전체를 모르면(themeMaterialIds 없음 — 옛 호출) 건너뛴다; 대주제에 공동 자료가 없어도 메모가 없다', () => {
    expect(unticked(3, mathDesign(), { standards, prior: ctx.prior, sharedMaterialIds: ['A', 'B', 'C'] })).toEqual([])
    expect(unticked(3, mathDesign(), { standards, prior: {}, themeMaterialIds: [] })).toEqual([])
  })
  it('체크한 것은 prior.shared_materials 에서도 읽는다(sharedMaterialIds 없이)', () => {
    expect(unticked(3, mathDesign(), { standards, prior: ctx.prior, themeMaterialIds: THEME_LETTERS })).toEqual([`other: 1차시: ${untickedSharedNote('D', HINT)}`])
  })
  it('stageNotes(저장소 문맥)가 themeMaterialIds 를 자동 검사까지 넘긴다', () => {
    const repoCtx = { theme: { title: '학교 축제, 일회용품을 줄이자', level: '중', grade: 1, subjects: ['수학'] }, subject: '수학', standards, prior: { shared_materials: tickedShared }, themeMaterialIds: THEME_LETTERS, outputs: {}, statuses: {} }
    const notes = stageNotes(repoCtx, 3, mathDesign()).map((i) => i.detail)
    expect(notes).toContain(`1차시: ${untickedSharedNote('D', HINT)}`)
    expect(notes).toContain('1차시 활동지 2 기대 답: 자료 A에서 20 이상 30 미만은 3개인데 2로 적힘(다시 세어 보세요)')
  })
})

describe('4·5단계: 세트 자료·문항이 체크하지 않은 공동 자료의 글자를 씀', () => {
  const src = { kind: '자작', attribution: null, ai_assisted: false }
  const setMaterial = (id: string) => ({ id, title: `세트 자료 ${id}`, kind: 'text', body: '부스 운영 안내문이다.', table: null, source: src, role: 'context', images: [] })
  it('4단계: 세트 자료 ID가 체크하지 않은 공동 자료의 글자면 짚는다(E부터는 짚지 않는다)', () => {
    expect(unticked(4, { materials: [setMaterial('D'), setMaterial('E')] })).toEqual(['other: 자료 D: 체크하지 않은 공동 자료 D의 번호를 세트 자료에 씀 — 세트 자료는 E부터 번호를 붙인다(그 공동 자료를 체크하면 이 세트 자료가 게시 판에서 빠진다)'])
    expect(unticked(4, { materials: [setMaterial('E'), setMaterial('F')] })).toEqual([])
  })
  it('5단계: 문항 materials_used 가 그 글자를 가리키면 짚고, 같은 글자에 "없는 자료" 메모를 겹쳐 내지 않는다', () => {
    const a = structuredClone(assessmentV2); a.items[0].materials_used = ['A', 'D']; a.items[1].materials_used = ['A', 'B']
    const details = staticIssues(5, a, ctx).map((i) => i.detail)
    expect(details).toContain(`문항 1: ${untickedSharedNote('D', HINT)}`)
    expect(details.filter((d) => d.includes('없는 자료'))).toEqual([])
    expect(unticked(5, a).length).toBe(1)
    // 대주제 글자 전체를 모르면 종전대로 "없는 자료"만
    expect(staticIssues(5, a, { standards, prior: ctx.prior, sharedMaterialIds: ['A', 'B', 'C'] }).map((i) => i.detail).filter((d) => /없는 자료|체크하지 않은/.test(d))).toEqual(['문항 1: 없는 자료 D'])
  })
})

describe('생성 프롬프트: 체크하지 않은 공동 자료의 글자도 비워 둔다', () => {
  const base = { theme: { title: '학교 축제, 일회용품을 줄이자', level: '중', grade: 1, subjects: ['수학', '영어'] }, subject: '수학', standards }
  const EXPLICIT = 'A~D는 대주제 공동(공유) 자료의 번호다 — 체크하지 않은 것도 세트 자료 번호로 쓰지 않는다; 세트 자료는 E부터.'
  const line = (u: string) => u.split('\n\n').find((p) => p.startsWith('자료 번호: ')) ?? ''
  it('3단계: A·B·C만 체크 → "자료 번호" 줄이 D를 비워 두라고 하고 세트 자료는 E부터', () => {
    const l = line(buildPrompt(3, { ...base, prior: { shared_materials: tickedShared }, themeMaterialIds: THEME_LETTERS }).user)
    expect(l).toBe(`자료 번호: ${EXPLICIT} 이 세트가 체크한 공동 자료는 A, B, C뿐이다 — 체크하지 않은 D는 materials_used에 적지 않고 활동지·발문·퀴즈 문장에서도 가리키지 않는다. 4단계에서 이 과목 전용으로 만들 자료는 E부터 차례로 번호를 정해 materials_used에 적는다.`)
  })
  it('3단계: 아무것도 체크하지 않아도(공동 자료 블록이 없어도) 대주제에 공동 자료가 있으면 줄이 붙는다 — 없으면 붙지 않는다', () => {
    const u = buildPrompt(3, { ...base, prior: {}, themeMaterialIds: THEME_LETTERS }).user
    expect(line(u)).toBe(`자료 번호: ${EXPLICIT} 이 세트는 공동 자료를 체크하지 않았다 — A~D를 materials_used에 적지 않고 활동지·발문·퀴즈 문장에서도 가리키지 않는다. 4단계에서 이 과목 전용으로 만들 자료는 E부터 차례로 번호를 정해 materials_used에 적는다.`)
    expect(u).not.toContain('"shared_materials"')
    expect(line(buildPrompt(3, { ...base, prior: {}, themeMaterialIds: [] }).user)).toBe('')
    expect(line(buildPrompt(3, { ...base, prior: {} }).user)).toBe('')
  })
  it('3단계: 띄엄띄엄 체크([B, D]) · 영어 세트(영어판 포함)', () => {
    const picked = tickedShared.slice(1).map((m, i) => ({ ...m, id: ['B', 'D'][i] }))
    expect(line(buildPrompt(3, { ...base, prior: { shared_materials: picked }, themeMaterialIds: THEME_LETTERS }).user)).toContain('이 세트가 체크한 공동 자료는 B, D뿐이다 — 체크하지 않은 A, C는 materials_used에 적지 않고')
    const en = line(buildPrompt(3, { ...base, subject: '영어', prior: { shared_materials: tickedShared.slice(1) }, themeMaterialIds: THEME_LETTERS }).user)
    expect(en).toContain(EXPLICIT); expect(en).toContain('4단계에서 이 과목 전용으로 만들 자료(영어판 포함)는 E부터')
  })
  it('4단계: 세 갈래(체크함 · 체크 안 함 · 영어 세트) 모두 같은 문장을 글자 그대로 담는다; 5단계에는 없다', () => {
    const ticked = buildPrompt(4, { ...base, prior: { shared_materials: tickedShared }, themeMaterialIds: THEME_LETTERS }).user
    expect(ticked).toContain(`대주제 공유 자료 D는 이 세트에서 쓰지 않으므로 인용하지 말고, 그 글자도 새 자료 ID로 쓰지 않는다. ${EXPLICIT} 새 자료의 source.kind는 "자작"이다.`)
    expect(buildPrompt(4, { ...base, prior: {}, themeMaterialIds: THEME_LETTERS }).user).toContain(`(A, B, C, D는 대주제 공유 자료 글자라 비워 둔다). ${EXPLICIT} 새 자료의 source.kind는 "자작"이다.`)
    expect(buildPrompt(4, { ...base, subject: '영어', prior: { shared_materials: tickedShared.slice(1) }, themeMaterialIds: THEME_LETTERS }).user).toContain(`${EXPLICIT} 새 자료(영어판 포함)의 source.kind는 "자작"이다.`)
    expect(buildPrompt(5, { ...base, prior: { shared_materials: tickedShared }, themeMaterialIds: THEME_LETTERS }).user).not.toContain('세트 자료 번호로 쓰지 않는다')
  })
})
