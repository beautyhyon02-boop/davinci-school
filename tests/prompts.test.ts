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
    expect(u).toContain('merged_with'); expect(u).toMatch(/original_text와 merged_with 성취기준 원문에 있는 어휘만/)
  })
  it('stage 3 asks for unit_plan + lessons with 60-minute budgets, scripts, worksheet tiers, and includes exemplars', () => {
    const u = buildPrompt(3, ctx).user
    expect(u).toMatch(/도입 10·전개 40·정리 10/); expect(u).toMatch(/발문 2~4개/); expect(u).toMatch(/기본·표준·도전/)
    expect(u).toMatch(/논술형을 배치한 차시는 0문항/); expect(u).toMatch(/\[예시 /)
  })
  it('stage 5 asks for the item card fields, injects A~E and exemplars, and forbids copying', () => {
    const u = buildPrompt(5, ctx).user
    for (const f of ['evaluation_elements', 'situation', 'condition_nos', 'answer_mode', 'exemplar_answers', 'level_map', 'holistic', 'notes', 'references', 'assumed_short_points', 'lesson_no']) expect(u).toContain(f)
    expect(u).toMatch(/summative_placement/)
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

describe('review focus v2', () => {
  it('stage 5 review asks to actually grade the exemplars per item and to check level wording', () => {
    const u = buildReviewPrompt(5, ctx, { items: [] }).user
    expect(u).toMatch(/예시답안을 채점표로 실제로 채점/); expect(u).toMatch(/부사만/); expect(u).toMatch(/8문항/)
  })
  it('stage 3 review checks scripts, worksheet tiers and quiz answers; stage 7 checks notice rules', () => {
    expect(buildReviewPrompt(3, ctx, {}).user).toMatch(/if_stuck/); expect(buildReviewPrompt(3, ctx, {}).user).toMatch(/기본·표준·도전/)
    expect(buildReviewPrompt(7, ctx, {}).user).toMatch(/학부모/); expect(buildReviewPrompt(2, ctx, {}).user).toMatch(/C 문장/)
  })
  it('stage 2/5 review checks the Task 3 fields (merged_with, assumed_short_points, lesson_no)', () => {
    expect(buildReviewPrompt(2, ctx, {}).user).toContain('merged_with')
    const u5 = buildReviewPrompt(5, ctx, { items: [] }).user
    expect(u5).toContain('assumed_short_points'); expect(u5).toContain('lesson_no'); expect(u5).toContain('summative_placement')
  })
  it('stage 7 focus is the real notice focus, not the Task 3 placeholder', () => {
    const u = buildReviewPrompt(7, ctx, {}).user
    expect(u).toMatch(/활동명으로 시작/); expect(u).toMatch(/home_study_suggestion/); expect(u).toMatch(/criteria_phrases/)
  })
  it('review prompt carries the accepted prior stages so cross-stage focus items can be checked', () => {
    const u = buildReviewPrompt(6, { ...ctx, prior: { stage3: { lessons: [{ no: 1, mergeable_with: 2 }] } } }, {}).user
    expect(u).toContain('지금까지 확정된 내용'); expect(u).toContain('mergeable_with')
    expect(buildReviewPrompt(6, ctx, {}).user).not.toContain('지금까지 확정된 내용')
  })
  it('review prior is scoped per stage (5 → 3·4, 7 → 3·5; nothing for 0/1)', () => {
    const prior = {
      stage0: { intro: 'INTRO_MARK' }, stage1: { recommended: [{ code: '[9수04-02]', reason: 'STAGE1_MARK' }] },
      stage2: { standards: [{ code: '[9수04-02]', reconstructed_text: 'RECON_MARK' }], level_anchor: [{ code: '[9수04-02]', level: 'C', statement: 'ANCHOR_MARK' }] },
      stage3: { unit_plan: { assessment_plan: { summative_placement: [{ lesson_no: 5, kind: '논술형' }] } }, lessons: [{ no: 1, topic: 'LESSON_MARK' }] },
      stage4: { materials: [{ id: 'A', body: 'MATERIAL_BODY_MARK' }] },
      stage5: { items: [{ rubric: { criteria: [{ name: 'RUBRIC_MARK' }] } }] },
      stage6: { glossary: [{ term: 'GUIDE_MARK' }] },
      shared_materials: [{ id: 'A', body: 'SHARED_MARK' }],
    }
    const u5 = buildReviewPrompt(5, { ...ctx, prior }, { items: [] }).user
    expect(u5).toContain('"stage3"'); expect(u5).toContain('"stage4"'); expect(u5).toContain('LESSON_MARK'); expect(u5).toContain('MATERIAL_BODY_MARK')
    expect(u5).toContain('SHARED_MARK')
    for (const m of ['RECON_MARK', 'ANCHOR_MARK', 'STAGE1_MARK', 'INTRO_MARK', '"stage2"']) expect(u5).not.toContain(m)
    const u7 = buildReviewPrompt(7, { ...ctx, prior }, {}).user
    expect(u7).toContain('RUBRIC_MARK'); expect(u7).toContain('LESSON_MARK')
    for (const m of ['MATERIAL_BODY_MARK', 'SHARED_MARK', 'GUIDE_MARK', 'RECON_MARK']) expect(u7).not.toContain(m)
    expect(buildReviewPrompt(2, { ...ctx, prior }, {}).user).toContain('STAGE1_MARK')
    expect(buildReviewPrompt(1, { ...ctx, prior }, {}).user).not.toContain('지금까지 확정된 내용')
    // 생성 프롬프트는 여전히 전부 받는다
    expect(buildPrompt(5, { ...ctx, prior }).user).toContain('RECON_MARK')
  })
  it('review prompt includes the level block (C 문장) for level stages and keeps the fixture key format', () => {
    const r = buildReviewPrompt(2, ctx, {})
    expect(r.user).toMatch(/\[9수04-02\] 성취수준\(도달점 = C/); expect(r.fixtureKey).toBe('stage2-review-수학')
    expect(r.system).toEqual([rulesFor('수학'), expect.stringMatching(/kind는 fidelity·grade_level·coverage·quiz·rubric·level·source·notice·other/)])
  })
})
