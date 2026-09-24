import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { loadFixture } from '@/lib/ai/mock'
import { STAGE_SCHEMAS, Review } from '@/lib/studio/schemas'
import { staticIssues, conditionHints, materialNumbers } from '@/lib/studio/checks'
import { checkReconstructionFidelity } from '@/lib/studio/fidelity'
import { runStage, type Repo, type StageStatus } from '@/lib/studio/stages'
import { buildPrompt, buildReviewPrompt } from '@/lib/studio/prompts/stages'
import { buildFixturesV2, serialize } from '@/scripts/upgrade-fixtures-v2'

const STAGES = [2, 3, 4, 5, 6, 7] as const
const SETS = [{ suffix: '', subject: '수학', standards: 'standards-math.json' }, { suffix: '-과학', subject: '과학', standards: 'standards-science.json' }] as const
const std = (f: string) => JSON.parse(readFileSync(`data/studio-fixtures/${f}`, 'utf8')) as { code: string; text: string }[]

describe('fixture keys', () => {
  const ctx = { theme: { title: 't', level: '중', grade: 1, subjects: ['수학', '과학'] }, subject: '과학', standards: [], prior: {} }
  it('append the subject; stage 0 keeps the plain key', () => {
    expect(buildPrompt(7, ctx).fixtureKey).toBe('stage7-generate-과학'); expect(buildReviewPrompt(7, ctx, {}).fixtureKey).toBe('stage7-review-과학')
    expect(buildPrompt(3, ctx).fixtureKey).toBe('stage3-generate-과학'); expect(buildPrompt(2, { ...ctx, subject: '수학' }).fixtureKey).toBe('stage2-generate-수학')
    expect(buildPrompt(0, { ...ctx, subject: '' }).fixtureKey).toBe('stage0-generate'); expect(buildReviewPrompt(0, { ...ctx, subject: '' }, {}).fixtureKey).toBe('stage0-review')
  })
  it('falls back to the base file when the subject file is missing', () => {
    expect(loadFixture('stage2-generate-국어')).toEqual(JSON.parse(readFileSync('data/studio-fixtures/stage2-generate.json', 'utf8')))
    expect((loadFixture('stage2-generate-과학') as { reconstruction: string }).reconstruction).toContain('과학적 탐구 방법')
    expect(() => loadFixture('stage9-generate-과학')).toThrow(/fixture not found/)
    expect(() => loadFixture('nope')).toThrow(/fixture not found/)
  })
})

describe('fixture v2 conversion script', () => {
  it('is deterministic and the files on disk are exactly its output (re-running leaves git clean)', () => {
    const a = buildFixturesV2(); const b = buildFixturesV2()
    expect(a.problems).toEqual([])
    expect(Object.keys(a.files).sort()).toEqual(Object.keys(b.files).sort())
    for (const [name, data] of Object.entries(a.files)) {
      expect(serialize(data), name).toBe(serialize(b.files[name]))
      expect(readFileSync(`data/studio-fixtures/${name}`, 'utf8'), name).toBe(serialize(data))
    }
    expect(Object.keys(a.files)).toHaveLength(15)   // stage2~7 × 2과목 + stage7-review × 2 + stage1 기본(수학)
    expect(JSON.stringify(a.files['stage1-generate.json'])).not.toMatch(/5차시 논술형/)
  })
})

for (const set of SETS) describe(`${set.subject} fixtures (v2)`, () => {
  const standards = std(set.standards)
  const prior: Record<string, unknown> = {}
  for (const n of STAGES) it(`stage${n} validates against v2 zod and passes static checks`, () => {
    const gen = loadFixture(`stage${n}-generate${set.suffix}`)
    const parsed = STAGE_SCHEMAS[n].safeParse(gen)
    expect(parsed.error?.issues.map((i) => `${i.path.join('.')}: ${i.message}`) ?? []).toEqual([])
    expect(staticIssues(n, gen, { standards, prior }).map((i) => `${i.kind}: ${i.detail}`)).toEqual([])
    expect(Review.safeParse(loadFixture(`stage${n}-review${set.suffix}`)).success).toBe(true)
    prior[`stage${n}`] = gen
  })
  it('stage2 standards carry the verbatim originals and the reconstruction is faithful', () => {
    const gen = loadFixture(`stage2-generate${set.suffix}`) as { standards: { code: string; original_text: string }[]; level_anchor: unknown[]; reconstruction: string; learning_goals: { axis: string }[] }
    for (const s of gen.standards) expect(standards.find((x) => x.code === s.code)?.text).toBe(s.original_text)
    expect(gen.level_anchor.length).toBe(standards.length)
    expect(checkReconstructionFidelity(gen.reconstruction, standards.map((s) => s.text)).unknownTokens).toEqual([])
    expect(new Set(gen.learning_goals.map((g) => g.axis)).size).toBe(3)
  })
  it('stage3 (대표 2026-09-26): 교수 차시 5개마다 퀴즈 3문항, 마지막 교수 차시 뒤 단원 평가 차시 6에 서술형 → 논술형, 논술형 35분', () => {
    type L = { no: number; kind: string; standards: string[]; assessment: string[]; formative_check: { quiz: unknown[] }; flow: { main: { step_label: string; minutes: number }[] }; worksheet: { tasks: unknown[] } }
    const { lessons, unit_plan } = loadFixture(`stage3-generate${set.suffix}`) as { lessons: L[]; unit_plan: { assessment_plan: { summative_placement: { lesson_no: number; kind: string }[] } } }
    expect([...new Set(lessons.flatMap((l) => l.standards))].sort()).toEqual(standards.map((s) => s.code).sort())
    const teaching = lessons.filter((l) => l.kind === 'teaching')
    expect(teaching.map((l) => l.no)).toEqual([1, 2, 3, 4, 5])
    for (const l of teaching) { expect(l.formative_check.quiz, `${l.no}차시 퀴즈`).toHaveLength(3); expect(l.assessment, `${l.no}차시`).toEqual([]); expect(l.worksheet.tasks.length).toBeGreaterThanOrEqual(2) }
    const session = lessons[lessons.length - 1]
    expect([session.no, session.kind, session.assessment]).toEqual([6, 'assessment', ['서술형', '논술형']])
    expect(session.formative_check.quiz).toEqual([])
    expect(session.flow.main.map((m) => [m.step_label, m.minutes])).toEqual([['서술형 작성', 15], ['논술형 작성', 35]])
    expect(unit_plan.assessment_plan.summative_placement).toEqual([{ lesson_no: 6, kind: '서술형' }, { lesson_no: 6, kind: '논술형' }])
    const items = (loadFixture(`stage5-generate${set.suffix}`) as { items: { kind: string; lesson_no: number }[] }).items
    expect(items.map((i) => [i.kind, i.lesson_no])).toEqual([['서술형', 6], ['논술형', 6]])
  })
  it('lesson topics are hand-written short noun phrases (≤20자) and unit_plan.lesson_map carries the same topic per lesson (헤딩 절단 재발 방지)', () => {
    const { lessons, unit_plan } = loadFixture(`stage3-generate${set.suffix}`) as { lessons: { no: number; topic: string }[]; unit_plan: { lesson_map: { lesson_no: number; topic: string }[] } }
    for (const l of lessons) expect(l.topic.length, `${set.subject} ${l.no}차시 주제 "${l.topic}"`).toBeLessThanOrEqual(20)
    expect(unit_plan.lesson_map.map((m) => ({ no: m.lesson_no, topic: m.topic }))).toEqual(lessons.map((l) => ({ no: l.no, topic: l.topic })))
  })
  it('stage4 materials do not carry the answers the items ask for (C-03)', () => {
    const { materials } = loadFixture(`stage4-generate${set.suffix}`) as { materials: { id: string; body: string | null; role: string }[] }
    const body = (id: string) => materials.find((m) => m.id === id)?.body ?? ''
    // 수학 서술형(상대도수 0.24·0.30)과 뺀 서술형 1(도수분포표)의 답이 자료 본문에 없어야 한다 — 공유 자료 B는 두 과목 모두 개수만 싣는다(M5)
    expect(body('A')).not.toMatch(/1·3·6|30~40|도수/)
    expect(body('B')).not.toMatch(/0\.24|0\.30|상대도수/)
    // fix wave 2(리드 판정): 수학 서술형 '상대도수로 비교하는 이유' 요소(2점)의 답을 알려 주던 문장
    expect(body('B')).not.toMatch(/두 해는 부스 수와 전체 개수가 다르다/)
    // 과학 4차시 퀴즈가 끌어낼 결론("여러 번 써야 이득", 뺀 서술형 2의 답이자 논술형의 판단 근거)이 자료 E에 없어야 한다
    expect(body('E')).not.toMatch(/이득/)
    expect(materials.some((m) => m.role === 'raw')).toBe(true)
  })
  it('no lesson hands out the 서술형 answer (C-03 at lesson level: flows, notes, quizzes·worksheets·scripts of every teaching lesson)', () => {
    // 남긴 서술형이 학생에게 구하게 하는 값·결론. 교수 차시의 전개 활동·유의점·발문·활동지·퀴즈가 이것을 미리 말하면 안 된다.
    // 과학 서술형(재활용이 어려운 이유)은 자료 D·E의 근거를 인용하게 하는 문항이라(대표님 판단, T6) 요인 문장 대조는 하지 않고,
    // 새 사례(PET·PS) 예측의 답(둘 다 가라앉아 물로는 나눌 수 없음)만 본다. 수학은 값과 자료 B에서 뺀 이유 문장.
    const ANSWERS: Record<string, RegExp> = { 수학: /0\.24|0\.30|두 해는 부스 수와 전체 개수가 다르다/, 과학: /PS.{0,15}가라앉|둘 다 (물에 )?가라앉|물로(는)? 나눌 수 없/ }
    const { lessons } = loadFixture(`stage3-generate${set.suffix}`) as { lessons: { no: number; kind: string; flow: { main: { activities: string[] }[] }; teacher_script: unknown; worksheet: unknown; formative_check: unknown; caution_notes: string[] }[] }
    for (const l of lessons.filter((x) => x.kind === 'teaching')) {
      for (const t of [...l.flow.main.flatMap((m) => m.activities), ...l.caution_notes]) expect(t, `${l.no}차시`).not.toMatch(ANSWERS[set.subject])
      for (const t of [JSON.stringify(l.teacher_script), JSON.stringify(l.worksheet), JSON.stringify(l.formative_check)]) expect(t, `${l.no}차시 퀴즈·활동지·발문`).not.toMatch(ANSWERS[set.subject])
    }
  })
  it('the 논술형 key reason is not handed out by a later lesson (과학: 자료 D의 "미생물이 거의 분해하지 못" — taught in 2차시 only)', () => {
    // 논술형이 인용하게 하는 과학적 근거. 자료 D를 읽는 2차시(가르치는 차시)는 다루지만, 그 뒤 차시(특히 논술형 준비 5차시)의
    // 퀴즈·활동지·발문이 그 문장을 정답으로 건네면 안 된다(fix wave 2: 5차시 퀴즈 1).
    const REASON: Record<string, { re: RegExp; taughtIn: number[] }> = { 수학: { re: /0\.24|0\.30/, taughtIn: [] }, 과학: { re: /미생물이 거의 분해하지 못/, taughtIn: [2] } }
    const { lessons } = loadFixture(`stage3-generate${set.suffix}`) as { lessons: { no: number; kind: string; teacher_script: unknown; worksheet: unknown; formative_check: unknown }[] }
    const r = REASON[set.subject]
    for (const l of lessons.filter((x) => x.kind === 'teaching' && !r.taughtIn.includes(x.no))) {
      for (const t of [JSON.stringify(l.teacher_script), JSON.stringify(l.worksheet), JSON.stringify(l.formative_check)]) expect(t, `${l.no}차시`).not.toMatch(r.re)
    }
  })
  it('the kept 서술형 is a 6-point item with analytic (3 × 0~2) + holistic rubrics and 1~6 exemplars; no paper item in the demo sets', () => {
    type C = { name: string; max: number }
    const a = loadFixture(`stage5-generate${set.suffix}`) as { items: { kind: string; points: number; stem: string; rubric: { criteria: C[]; holistic: Record<string, string> | null }; exemplar_answers: { points: number }[]; conditions: { answer_mode: string } }[] }
    const short = a.items[0]
    // 수학은 서술형 2(상대도수)를, 과학은 서술형 1(재활용이 어려운 이유)을 남겼다(scripts/upgrade-fixtures-v2.ts 가 이유를 적는다)
    expect(short.stem).toMatch(set.subject === '수학' ? /상대도수/ : /재활용하기 어려운 이유/)
    expect(short.points).toBe(6); expect(short.stem.endsWith('[6점]')).toBe(true)
    expect(short.rubric.criteria.map((c) => c.max)).toEqual([2, 2, 2])
    expect(Object.keys(short.rubric.holistic ?? {})).toEqual(['상', '중', '하'])
    expect(short.exemplar_answers.map((e) => e.points)).toEqual([6, 5, 4, 3, 2, 1])
    // 두 문항의 채점 요소 이름은 겹치지 않는다(단원 평가 차시 안내장·채점 대조)
    const names = a.items.flatMap((i) => i.rubric.criteria.map((c) => c.name))
    expect(new Set(names).size).toBe(names.length)
    // 수학 서술형 1(종이 답안 도수분포표)을 뺐으므로 시연 세트에는 종이 답안 문항이 없다 — 종이 경로는 합성 문항 테스트가 지킨다
    expect(a.items.map((i) => i.conditions.answer_mode)).toEqual(['screen', 'screen'])
  })
  it('lessons carry no v1 upgrade artifacts (I3: goal sentence reused as expected, "N분 —" headers in hints)', () => {
    const { lessons } = loadFixture(`stage3-generate${set.suffix}`) as { lessons: { no: number; goal: string; teacher_script: { questions: { expected_answer: string; if_stuck: string }[] }; worksheet: { tasks: { no: number; expected: string }[] } }[] }
    const goals = lessons.map((l) => l.goal.trim())
    for (const l of lessons) {
      for (const t of l.worksheet.tasks) expect(goals, `${l.no}차시 활동지 ${t.no}`).not.toContain(t.expected.trim())
      for (const q of l.teacher_script.questions) {
        expect(goals, `${l.no}차시 발문`).not.toContain(q.expected_answer.trim())
        expect(q.if_stuck, `${l.no}차시 발문 힌트`).not.toMatch(/\d+\s*분\s*—/)
        if (q.expected_answer.length >= 4) expect(q.if_stuck, `${l.no}차시 힌트가 예상 답을 그대로 말함`).not.toContain(q.expected_answer)
      }
    }
  })
  it('conditions are guidelines only (C-32): 서술형 none, 논술형 2~4, no solving hint, no material value', () => {
    type Mat = { id: string; body: string | null; table: { columns: string[]; rows: (string | number)[][] } | null }
    const { materials } = loadFixture(`stage4-generate${set.suffix}`) as { materials: Mat[] }
    const a = loadFixture(`stage5-generate${set.suffix}`) as { items: { kind: string; materials_used: string[]; conditions: { items: { no: number; text: string }[] }; rubric: { criteria: { condition_nos: number[] }[] } }[] }
    for (const [i, it] of a.items.entries()) {
      const where = `${set.subject} 문항 ${i + 1}`
      if (it.kind === '서술형') {
        expect(it.conditions.items, where).toEqual([])
        for (const c of it.rubric.criteria) expect(c.condition_nos, where).toEqual([])
        continue
      }
      expect(it.conditions.items.length, where).toBeGreaterThanOrEqual(2); expect(it.conditions.items.length, where).toBeLessThanOrEqual(4)
      const used = materials.filter((m) => it.materials_used.includes(m.id))
      const numbers = materialNumbers(used)
      // 표의 숫자 칸(부스 번호 1~20 같은 한 자리 수 포함) — 조건에는 이 수치가 한 번도 나오지 않는다
      const cells = new Set(used.flatMap((m) => (m.table?.rows ?? []).flat()).map((v) => String(v).replace(/,/g, '')).filter((v) => /^\d+(\.\d+)?$/.test(v)))
      for (const c of it.conditions.items) {
        expect(conditionHints(c.text, numbers), `${where} 조건 ${c.no}: ${c.text}`).toEqual([])
        for (const d of c.text.match(/\d+(?:[.,]\d+)*/g) ?? []) expect(cells.has(d.replace(/,/g, '')), `${where} 조건 ${c.no}의 "${d}"가 자료 표에 있음`).toBe(false)
      }
    }
  })
  it('예시답안 text is the student answer only (no rubric descriptor glued with " — ")', () => {
    const a = loadFixture(`stage5-generate${set.suffix}`) as { items: { exemplar_answers: { points: number; text: string }[] }[] }
    for (const [i, it] of a.items.entries()) for (const e of it.exemplar_answers) expect(e.text, `문항 ${i + 1} ${e.points}점`).not.toContain(' — ')
  })
  it('evaluation elements are "~하기" noun forms (C-18)', () => {
    const a = loadFixture(`stage5-generate${set.suffix}`) as { items: { evaluation_elements: string[] }[] }
    for (const e of a.items.flatMap((i) => i.evaluation_elements)) { expect(e).toMatch(/(하|쓰|구하|르|내|정하|들)기$/); expect(e).not.toMatch(/[을를로] 기$|\s기$/) }
  })
  it('stage5 items reference raw materials, total 22, exemplar bands match', () => {
    const a = loadFixture(`stage5-generate${set.suffix}`) as { items: { kind: string; points: number; min_competency: string | null; conditions: { answer_mode: string }; exemplar_answers: { points: number; level: string | null; assumed_short_points: number | null }[] }[]; grade_boundaries: { min: number; max: number; band: string }[] }
    expect(a.items.reduce((s, i) => s + i.points, 0)).toBe(22)
    expect(a.items.every((i) => i.min_competency)).toBe(true)
    expect(a.items.filter((i) => i.conditions.answer_mode === 'paper').length).toBeLessThanOrEqual(1)
    expect(a.items.map((i) => [i.kind, i.points])).toEqual([['서술형', 6], ['논술형', 16]])
    for (const it of a.items.filter((i) => i.kind === '서술형')) expect(it.exemplar_answers.map((e) => e.points).sort()).toEqual([1, 2, 3, 4, 5, 6])
    const essay = a.items.find((i) => i.kind === '논술형')!
    for (const ex of essay.exemplar_answers) {
      expect(ex.assumed_short_points).not.toBeNull()
      const total = ex.points + ex.assumed_short_points!
      expect(a.grade_boundaries.find((b) => total >= b.min && total <= b.max)?.band).toBe(ex.level)
    }
  })
  it('stage6 and stage7 have one entry per lesson; criteria phrases only on the 단원 평가 차시 (both items, named after the rubrics)', () => {
    const { lessons } = loadFixture(`stage3-generate${set.suffix}`) as { lessons: { no: number }[] }
    const { per_lesson } = loadFixture(`stage6-generate${set.suffix}`) as { per_lesson: { no: number }[] }
    expect(per_lesson.map((p) => p.no)).toEqual(lessons.map((l) => l.no))
    const plan = loadFixture(`stage7-generate${set.suffix}`) as { per_lesson: { lesson_no: number; criteria_phrases: { criterion_name: string }[] | null }[] }
    expect(plan.per_lesson.map((p) => p.lesson_no)).toEqual(lessons.map((l) => l.no))
    const items = (loadFixture(`stage5-generate${set.suffix}`) as { items: { lesson_no: number; rubric: { criteria: { name: string }[] } }[] }).items
    for (const p of plan.per_lesson) {
      const here = items.filter((i) => i.lesson_no === p.lesson_no)
      expect(p.criteria_phrases?.map((c) => c.criterion_name) ?? null).toEqual(here.length ? here.flatMap((i) => i.rubric.criteria.map((c) => c.name)) : null)
    }
    expect(plan.per_lesson.filter((p) => p.criteria_phrases).map((p) => p.lesson_no)).toEqual([6])
  })
})

describe('runStage end-to-end in mock mode (2~7단계)', () => {
  beforeAll(() => { process.env.AI_MOCK = '1'; delete process.env.ANTHROPIC_API_KEY })
  for (const set of SETS) it(`${set.subject}: generate → review → accept for every stage`, async () => {
    const standards = std(set.standards); const outputs: Record<number, unknown> = {}; const statuses: Record<number, StageStatus> = {}
    for (let s = 0; s < 2; s++) { outputs[s] = { placeholder: `stage${s}` }; statuses[s] = { state: 'accepted', attempt: 1, output: outputs[s], review: { pass: true, issues: [] }, updated_at: '' } }
    const repo: Repo = {
      async loadContext() { return { theme: { title: '학교 축제, 일회용품을 줄이자', level: '중', grade: 1, subjects: ['수학', '과학'] }, subject: set.subject, standards, prior: {}, outputs, statuses } },
      async saveOutput(_id, stage, out) { outputs[stage] = out }, async saveStatus(_id, stage, st) { statuses[stage] = st }, async log() {},
    }
    for (const stage of STAGES) {
      const g = await runStage({ itemSetId: 'x', stage, action: 'generate', repo })
      expect(g.status.error, `stage${stage} generate`).toBeUndefined(); expect(g.status.state).toBe('generated'); expect(g.status.model).toBe('mock')
      const r = await runStage({ itemSetId: 'x', stage, action: 'review', repo }); expect(r.status.review?.issues ?? [], `stage${stage} review`).toEqual([])
      expect(r.status.review?.pass).toBe(true)
      expect((await runStage({ itemSetId: 'x', stage, action: 'accept', repo })).status.state).toBe('accepted')
    }
    expect((outputs[7] as { per_lesson: unknown[] }).per_lesson.length).toBe((outputs[3] as { lessons: unknown[] }).lessons.length)
  })
})
