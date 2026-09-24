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
    // 유지여도 reconstructed_text는 원문을 그대로 옮기지 않고 틀 문장으로 쓴다(zod 형식 검사와의 충돌 해소, 2026-09-24)
    expect(u).toMatch(/유지를 포함해 셋 다.*틀 문장으로 쓴다/)
    expect(u).toMatch(/유지여도 original_text를 그대로 옮기지 않는다/)
  })
  it('stage 3 asks for unit_plan + lessons with 60-minute budgets, scripts, worksheet tiers, and includes exemplars', () => {
    const u = buildPrompt(3, ctx).user
    expect(u).toMatch(/도입 10·전개 40·정리 10/); expect(u).toMatch(/발문 2~4개/); expect(u).toMatch(/기본·표준·도전/)
    expect(u).toMatch(/\[예시 /)
  })
  it('stage 3 (대표 2026-09-26 보완): 교수 차시마다 퀴즈 3문항, 서·논술형은 마지막 교수 차시 뒤 단원 평가 차시에서 함께', () => {
    const task = buildPrompt(3, ctx).user.split('과제: ')[1]
    expect(task).toMatch(/교수 차시 3~5개/); expect(task).toMatch(/단원 평가 차시 1개/)
    expect(task).toMatch(/마지막 교수 차시 포함.*정확히 3문항|정확히 3문항.*마지막 교수 차시 포함/)
    expect(task).toMatch(/kind "assessment"/); expect(task).toMatch(/도입 5·전개 50·정리 5/)
    expect(task).toMatch(/서술형 작성 15분/); expect(task).toMatch(/논술형 작성 35분/)
    expect(task).toMatch(/\["서술형", "논술형"\]/); expect(task).toMatch(/summative_placement 2건/)
    expect(task).not.toMatch(/서술형1|서술형2|논술형을 배치한 차시는 0문항/)
  })
  it('stage 3 (대표 2026-09-26): 퀴즈는 단답형만 — type "short"·choices null, 선택지·객관식 금지; 검토는 객관식을 other 로 잡는다', () => {
    const task = buildPrompt(3, ctx).user.split('과제: ')[1]
    expect(task).toMatch(/모두 단답형: type "short"·choices null/); expect(task).toMatch(/낱말·수치·짧은 구/)
    expect(task).toMatch(/선택지·"다음 중 알맞은 것은" 꼴 객관식은 쓰지 않는다/)
    expect(task).not.toMatch(/선택형/)
    const review = buildReviewPrompt(3, ctx, {}).user.split('검토 초점: ')[1]
    expect(review).toMatch(/퀴즈가 모두 단답형\(type "short", choices null\)인지/); expect(review).toMatch(/객관식 문항이 있으면 other/)
    // 규칙 블록(시스템)의 L-09·L-10 도 단답형만을 말한다
    const rules = buildPrompt(3, ctx).system
    expect(rules).toMatch(/L-09 .*모두 단답형 — 낱말·수치·짧은 구를 직접 쓰는 문항, 선택지 없음/); expect(rules).toMatch(/L-10 .*답은 낱말·수치·짧은 구/)
    expect(rules).not.toMatch(/선택형\/단답형/)
  })
  it('stage 5 asks for the item card fields, injects A~E and exemplars, and forbids copying', () => {
    const u = buildPrompt(5, ctx).user
    for (const f of ['evaluation_elements', 'situation', 'condition_nos', 'answer_mode', 'exemplar_answers', 'level_map', 'holistic', 'notes', 'references', 'assumed_short_points', 'lesson_no']) expect(u).toContain(f)
    expect(u).toMatch(/summative_placement/)
    expect(u).toMatch(/\[6점\]/); expect(u).toMatch(/\[16점\]/); expect(u).toMatch(/그대로 옮기지 않는다/); expect(u).toMatch(/E: /)
    expect(u.split('과제: ')[1]).not.toMatch(/\[3점\]/)
  })
  it('stage 5 (대표 2026-09-26): 카드 2장 = 서술형 1(6점) → 논술형 1(16점), 두 문항 모두 분석적 + 총체적, 공개 예시 문항 수준', () => {
    const task = buildPrompt(5, ctx).user.split('과제: ')[1]
    expect(task).toMatch(/문항 카드 2장/); expect(task).toMatch(/서술형 1개\(6점/); expect(task).toMatch(/논술형 1개\(16점/)
    expect(task).toMatch(/holistic은 두 문항 모두 상\/중\/하/); expect(task).toMatch(/2~3요소로 max 합 6/)
    expect(task).toMatch(/1~6점 각 1개/); expect(task).toMatch(/서술형 문항 점수 0~6/); expect(task).toMatch(/단원 평가 차시/)
    expect(task).not.toMatch(/평가원|교육청/); expect(task).toMatch(/문장·수치는 옮기지 않는다/)
    expect(task).not.toMatch(/서술형 2개|두 문항 점수 합|holistic은 논술형만/)
  })
  it('stage 5 shows 2 서술형 + 3 논술형 reference cards (no duplicates)', () => {
    const u = buildPrompt(5, ctx).user
    const cards = [...u.matchAll(/^\[예시 ([^\]]+)\] \S+ \S+ (서술형|논술형|서·논술형|수행)/gm)]
    expect(cards.filter((c) => c[2] === '서술형')).toHaveLength(2)
    expect(cards.filter((c) => c[2] === '논술형')).toHaveLength(3)
    expect(new Set(cards.map((c) => c[1])).size).toBe(cards.length)
  })
  it('stage 5 conditions are guidelines only (C-32, 대표 2026-09-26): 서술형 none, 논술형 2~4, no solving hints', () => {
    const task = buildPrompt(5, ctx).user.split('과제: ')[1]
    expect(task).toMatch(/서술형은 conditions\.items를 빈 배열/); expect(task).toMatch(/논술형은 items 2~4개/)
    expect(task).toMatch(/지침만/); expect(task).toMatch(/풀이 힌트 금지/)
    for (const s of ['계산식', '반올림', '풀이 순서', '자료 수치', '결론']) expect(task, s).toContain(s)
    expect(task).toMatch(/셀 수 있는 분량/)
    expect(task).not.toMatch(/items 1~5개/); expect(task).not.toMatch(/행동 동사 원형/)
  })
  it('stage 7 asks for per-lesson notice plan for essay lessons only (owner default) and the fixed footer', () => {
    const u = buildPrompt(7, ctx).user
    expect(u).toMatch(/criteria_phrases/); expect(u).toMatch(/단원 평가 차시만/); expect(u).toContain('본 안내장은 학교생활기록부가 아니며')
    expect(u).toMatch(/두 문항의 채점표 요소/)
  })
  it('stage 6 common_errors are numbered by the stage 5 items (1~2)', () => {
    expect(buildPrompt(6, ctx).user).toMatch(/item_no는 5단계 문항 번호 1~2/)
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
  it('stage 0 task keeps ideas as one-line sketches inside the grade range, with no materials/sources/grading', () => {
    const task = buildPrompt(0, { theme: { title: 't', level: '중', grade: 1, subjects: ['수학', '과학'] }, subject: '', standards: [], prior: {} }).user.split('과제: ')[1]
    expect(task).toContain('아이디어는 한 줄 스케치이며 해당 학년 교과서 범위 안에서만 제안한다')
    expect(task).toContain('자료·출처·채점은 여기서 다루지 않는다')
  })
  it('stage 0 prompts (before standards are chosen) do not print an empty 성취기준(원문) header', () => {
    const c0 = { theme: { title: 't', level: '중', grade: 1, subjects: ['수학', '세계사'] }, subject: '', standards: [], prior: {} }
    expect(buildPrompt(0, c0).user).not.toContain('성취기준(원문')
    expect(buildReviewPrompt(0, c0, { intro: 'x', subject_ideas: [] }).user).not.toContain('성취기준(원문')
    expect(buildPrompt(2, ctx).user).toContain('성취기준(원문, 절대 변형 금지)')
  })
})

describe('stage 2: 재구성 문장에는 대주제 상황을 쓰지 않는다(L-02, 오너 사례 2026-09-24)', () => {
  const task = buildPrompt(2, ctx).user.split('과제: ')[1]
  it('task says BOTH reconstructed_text and the 통합 reconstruction use only the originals + template words', () => {
    expect(task).toContain('재구성 문장 두 가지(성취기준마다의 reconstructed_text와 통합 문장 reconstruction)는 모두 성취기준 원문의 낱말과 문장 틀 낱말')
    expect(task).toMatch(/reconstruction, 같은 틀로 세트 성취기준 원문에 있는 어휘만 쓴다/)
  })
  it('task sends the 대주제 상황 to learning_goals·핵심질문·차시, not to the reconstruction', () => {
    expect(task).toMatch(/학교 축제·일회용품/)
    expect(task).toContain('재구성 문장에 쓰지 않고, 학습 목표(learning_goals)·세트 핵심질문 후보와 3단계 차시에서만 쓴다')
  })
  it('review focus flags 대주제 상황 in either reconstruction sentence as fidelity, but not in learning_goals', () => {
    const focus = buildReviewPrompt(2, ctx, {}).user.split('검토 초점: ')[1].split('\n\n생성 결과')[0]
    expect(focus).toContain('재구성 문장 두 가지(성취기준마다의 reconstructed_text와 통합 문장 reconstruction)')
    expect(focus).toMatch(/대주제 상황\(위 대주제 제목의 낱말, 축제·일회용품 등\)이 재구성 문장에 섞였으면 fidelity/)
    expect(focus).toMatch(/학습 목표\(learning_goals\)·핵심질문 후보에 있어야 정상이므로 그것은 반려하지 않는다/)
  })
})

describe('review focus v2', () => {
  it('stage 0 review checks only grade level, subject grade range and spoilers — not standards/sources/materials/grading', () => {
    const c0 = { theme: { title: 't', level: '중', grade: 1, subjects: ['과학', '세계사'] }, subject: '', standards: [], prior: {} }
    const focus = buildReviewPrompt(0, c0, { intro: 'x', subject_ideas: [] }).user.split('검토 초점: ')[1].split('\n\n생성 결과')[0]
    expect(focus).toMatch(/3~4문장/); expect(focus).toMatch(/해당 학년 교과 내용 범위/); expect(focus).toMatch(/좁힌 예/); expect(focus).toMatch(/결론이나 정답을 미리 말하지 않는지/)
    expect(focus).toContain('성취기준 원문, 출처 표기 계획, 자료 계획, 채점 계획은 요구하지 않는다')
    expect(focus).toMatch(/반려하지 않는다/)
  })
  it('stage 5 review asks to actually grade the exemplars per item and to check level wording', () => {
    const u = buildReviewPrompt(5, ctx, { items: [] }).user
    expect(u).toMatch(/예시답안을 채점표로 실제로 채점/); expect(u).toMatch(/부사만/); expect(u).toMatch(/8문항/)
  })
  it('stage 5 review flags solving hints in conditions and 서술형 conditions, and still checks countable length', () => {
    const u = buildReviewPrompt(5, ctx, { items: [] }).user
    expect(u).toContain('조건이 풀이 과정·공식·수치·순서를 담고 있으면 other(조건은 지침만)')
    expect(u).toMatch(/서술형에 조건\(items\)이 있으면 other/)
    expect(u).toMatch(/셀 수 있는 분량/)
    expect(u).not.toMatch(/학생 혼자 답안을 쓸 만큼/); expect(u).not.toMatch(/행동 동사·부분배점/)
  })
  it('stage 3/5 review focus follows the 2026-09-26 structure (단원 평가 차시, 서술형 6 + 논술형 16)', () => {
    const u3 = buildReviewPrompt(3, ctx, {}).user.split('검토 초점: ')[1]
    expect(u3).toMatch(/단원 평가 차시/); expect(u3).toMatch(/교수 차시마다 퀴즈 3문항/); expect(u3).not.toMatch(/서술형1·2/)
    const u5 = buildReviewPrompt(5, ctx, { items: [] }).user.split('검토 초점: ')[1]
    expect(u5).toMatch(/서술형 6 \+ 논술형 16 = 22/); expect(u5).toMatch(/두 문항 모두 총체적/); expect(u5).toMatch(/서술형 문항 점수 0~6/)
    expect(u5).not.toMatch(/두 문항 점수 합/)
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
    // 5단계 생성은 2단계(level_anchor)를 받는다(생성 범위는 아래 generate prior 시험)
    expect(buildPrompt(5, { ...ctx, prior }).user).toContain('RECON_MARK')
  })
  it('review prompt includes the level block (C 문장) for level stages and keeps the fixture key format', () => {
    const r = buildReviewPrompt(2, ctx, {})
    expect(r.user).toMatch(/\[9수04-02\] 성취수준\(도달점 = C/); expect(r.fixtureKey).toBe('stage2-review-수학')
    expect(r.system).toEqual([rulesFor('수학'), expect.stringMatching(/kind는 fidelity·grade_level·coverage·quiz·rubric·level·source·notice·other/)])
  })
})

describe('generate prior is scoped per stage (I2)', () => {
  const prior = {
    stage0: { intro: 'INTRO_MARK' }, stage1: { recommended: [{ code: '[9수04-02]', reason: 'STAGE1_MARK' }] },
    stage2: { standards: [{ code: '[9수04-02]', reconstructed_text: 'RECON_MARK' }], level_anchor: [{ code: '[9수04-02]', level: 'C', statement: 'ANCHOR_MARK' }] },
    stage3: { unit_plan: { assessment_plan: { summative_placement: [{ lesson_no: 5, kind: '논술형' }] } }, lessons: [{ no: 1, topic: 'LESSON_MARK' }] },
    stage4: { materials: [{ id: 'C', body: 'MATERIAL_BODY_MARK' }] },
    stage5: { items: [{ rubric: { criteria: [{ name: 'RUBRIC_MARK' }] } }] },
    stage6: { glossary: [{ term: 'GUIDE_MARK' }] },
    shared_materials: [{ id: 'A', body: 'SHARED_MARK' }],
  }
  const ALL = ['INTRO_MARK', 'STAGE1_MARK', 'RECON_MARK', 'ANCHOR_MARK', 'LESSON_MARK', 'MATERIAL_BODY_MARK', 'RUBRIC_MARK', 'GUIDE_MARK', 'SHARED_MARK']
  const expectOnly = (stage: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7, present: string[]) => {
    const u = buildPrompt(stage, { ...ctx, prior }).user
    for (const m of present) expect(u, `stage ${stage} should include ${m}`).toContain(m)
    for (const m of ALL.filter((x) => !present.includes(x))) expect(u, `stage ${stage} should not include ${m}`).not.toContain(m)
  }
  // 0단계(확정된 대주제 소개)는 1~7단계 모두가 받는다(theme-intro.test.ts)
  it('stage 7 generate carries stage 3 and 5 only (not 2/4/6, not shared materials)', () => expectOnly(7, ['INTRO_MARK', 'LESSON_MARK', 'RUBRIC_MARK']))
  it('stage 6 generate carries stage 3 and 5 only', () => expectOnly(6, ['INTRO_MARK', 'LESSON_MARK', 'RUBRIC_MARK']))
  it('stage 5 generate carries stage 2 (level_anchor), 3, 4 and the shared materials', () => expectOnly(5, ['INTRO_MARK', 'RECON_MARK', 'ANCHOR_MARK', 'LESSON_MARK', 'MATERIAL_BODY_MARK', 'SHARED_MARK']))
  it('stage 4 generate carries stage 2, 3 and the shared materials', () => expectOnly(4, ['INTRO_MARK', 'RECON_MARK', 'ANCHOR_MARK', 'LESSON_MARK', 'SHARED_MARK']))
  it('stages 1~3 carry only the previous stage (+ intro); stage 0 carries nothing', () => {
    expectOnly(3, ['INTRO_MARK', 'RECON_MARK', 'ANCHOR_MARK']); expectOnly(2, ['INTRO_MARK', 'STAGE1_MARK']); expectOnly(1, ['INTRO_MARK']); expectOnly(0, [])
    expect(buildPrompt(0, { ...ctx, prior }).user).not.toContain('지금까지 확정된 내용')
  })
})
