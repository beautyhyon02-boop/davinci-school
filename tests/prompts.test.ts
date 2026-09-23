import { describe, it, expect } from 'vitest'
import { buildPrompt, buildReviewPrompt } from '@/lib/studio/prompts/stages'
import { rulesFor } from '@/lib/studio/prompts/rules/index'

const ctx = { theme: { title: '학교 축제 일회용품 줄이기', level: '중', grade: 1, subjects: ['수학'] }, subject: '수학',
  standards: [{ code: '[9수04-02]', text: '자료를 줄기와 잎 그림, 도수분포표, 히스토그램, 도수분포다각형으로 나타내고 해석할 수 있다.' }, { code: '[9수04-03]', text: '상대도수를 구하고, 상대도수의 분포를 표나 그래프로 나타내고 해석할 수 있다.' }], prior: {} }

describe('prompts v2', () => {
  it('system is the subject rule block (cacheable) and user carries the context', () => {
    const p = buildPrompt(2, ctx)
    expect(p.system).toBe(rulesFor('수학'))
    expect(p.user).toContain('[9수04-02]'); expect(p.user).toContain('중학교 1학년'); expect(p.fixtureKey).toBe('stage2-generate-수학')
  })
  it('stage 2 injects the C (anchor) statements and asks for the reconstruction table', () => {
    const u = buildPrompt(2, ctx).user
    expect(u).toMatch(/\[9수04-02\] 성취수준\(도달점 = C/); expect(u).toContain('주어진 자료')
    expect(u).toMatch(/통합\/재조정\/유지/); expect(u).toMatch(/지식·이해\/과정·기능\/가치·태도/)
  })
  it('stage 3 asks for unit_plan + lessons with 60-minute budgets, scripts, worksheet tiers, and includes exemplars', () => {
    const u = buildPrompt(3, ctx).user
    expect(u).toMatch(/도입 10·전개 40·정리 10/); expect(u).toMatch(/발문 2~4개/); expect(u).toMatch(/기본·표준·도전/)
    expect(u).toMatch(/논술형을 배치한 차시는 0문항/); expect(u).toMatch(/\[예시 /)
  })
  it('stage 5 asks for the item card fields, injects A~E and exemplars, and forbids copying', () => {
    const u = buildPrompt(5, ctx).user
    for (const f of ['evaluation_elements', 'situation', 'condition_nos', 'answer_mode', 'exemplar_answers', 'level_map', 'holistic', 'notes', 'references']) expect(u).toContain(f)
    expect(u).toMatch(/\[3점\]/); expect(u).toMatch(/\[16점\]/); expect(u).toMatch(/그대로 옮기지 않는다/); expect(u).toMatch(/E: /)
  })
  it('stage 7 asks for per-lesson notice plan for essay lessons only (owner default) and the fixed footer', () => {
    const u = buildPrompt(7, ctx).user
    expect(u).toMatch(/criteria_phrases/); expect(u).toMatch(/서·논술형이 있는 차시/); expect(u).toContain('본 안내장은 학교생활기록부가 아니며')
  })
  it('stage 4 tells the model to continue material lettering after the shared ids and needs source objects', () => {
    const shared = ['A', 'B'].map((id) => ({ id, title: `자료 ${id}`, kind: 'text', body: 'x', table: null, source: { kind: '자작', attribution: null, ai_assisted: false } }))
    const u = buildPrompt(4, { ...ctx, prior: { shared_materials: shared } }).user
    expect(u).toContain('A, B'); expect(u).toMatch(/C부터 이어서/); expect(u).toMatch(/source\.kind는 "자작"/)
    expect(buildPrompt(3, { ...ctx, prior: { shared_materials: shared } }).user).not.toMatch(/이어서 붙여라/)
  })
  it('review prompt keeps rules as the first block', () => {
    const r = buildReviewPrompt(5, ctx, { items: [] })
    expect(r.system[0]).toBe(rulesFor('수학')); expect(r.system[1]).toMatch(/검토자/); expect(r.fixtureKey).toBe('stage5-review-수학')
  })
  it('stage 0 prompt lists participating subjects', () => {
    const u = buildPrompt(0, { theme: { title: 't', level: '중', grade: 1, subjects: ['수학', '과학'] }, subject: '', standards: [], prior: {} }).user
    expect(u).toContain('참여 과목: 수학, 과학'); expect(u).not.toContain('과목: \n')
  })
})
