import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { loadFixture } from '@/lib/ai/mock'
import { STAGE_SCHEMAS, Review } from '@/lib/studio/schemas'
import { staticIssues } from '@/lib/studio/checks'
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
    expect(Object.keys(a.files)).toHaveLength(14)
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
  it('stage3 covers every standard, places 서술형1→서술형2→논술형 and gives the essay lesson a 35-minute writing step', () => {
    const { lessons, unit_plan } = loadFixture(`stage3-generate${set.suffix}`) as { lessons: { no: number; standards: string[]; assessment: string | null; flow: { main: { step_label: string; minutes: number }[] } }[]; unit_plan: { assessment_plan: { summative_placement: { lesson_no: number }[] } } }
    expect([...new Set(lessons.flatMap((l) => l.standards))].sort()).toEqual(standards.map((s) => s.code).sort())
    expect(lessons.filter((l) => l.assessment).map((l) => l.assessment)).toEqual(['서술형1', '서술형2', '논술형'])
    const essay = lessons.find((l) => l.assessment === '논술형')!
    expect(essay.flow.main.some((m) => m.step_label.includes('논술형') && m.minutes >= 35)).toBe(true)
    const items = (loadFixture(`stage5-generate${set.suffix}`) as { items: { lesson_no: number }[] }).items
    expect(items.map((i) => i.lesson_no)).toEqual(unit_plan.assessment_plan.summative_placement.map((p) => p.lesson_no))
  })
  it('stage4 materials do not carry the answers the items ask for (C-03)', () => {
    const { materials } = loadFixture(`stage4-generate${set.suffix}`) as { materials: { id: string; body: string | null; role: string }[] }
    const body = (id: string) => materials.find((m) => m.id === id)?.body ?? ''
    // 수학 문항 1(도수분포표)·문항 2(상대도수 0.24·0.30)의 답이 자료 본문에 없어야 한다 — 공유 자료 B는 두 과목 모두 개수만 싣는다(M5)
    expect(body('A')).not.toMatch(/1·3·6|30~40|도수/)
    expect(body('B')).not.toMatch(/0\.24|0\.30|상대도수/)
    // 과학 4차시 퀴즈·서술형 2가 끌어낼 결론("여러 번 써야 이득")이 자료 E에 없어야 한다
    expect(body('E')).not.toMatch(/이득/)
    expect(materials.some((m) => m.role === 'raw')).toBe(true)
  })
  it('no lesson hands out a 서술형 answer (C-03 at lesson level: flow of the carrying lesson; quizzes·worksheets·scripts of every lesson)', () => {
    // 문항이 학생에게 구하게 하는 값·결론. 같은 차시의 전개 활동·발문·활동지·퀴즈·유의점이 이것을 미리 말하면 안 된다.
    const ANSWERS: Record<string, RegExp[]> = {
      수학: [/30개 이상 40개 미만|30~40|1·3·6·5·4·1/, /0\.24|0\.30/],
      // 과학 서술형 1은 자료 D·E의 근거를 인용하게 하는 문항(재활용이 어려운 이유는 자료 D 본문 그대로)이라 차시 대조에서 뺀다 — (?!)는 아무것도 맞추지 않음
      과학: [/(?!)/,/여러 번 (써야|사용해야|반복해 사용해야) 이득|여러 번 반복해 사용할 것/],
    }
    const { lessons } = loadFixture(`stage3-generate${set.suffix}`) as { lessons: { no: number; flow: { main: { activities: string[] }[] }; teacher_script: unknown; worksheet: unknown; formative_check: unknown; caution_notes: string[] }[] }
    const items = (loadFixture(`stage5-generate${set.suffix}`) as { items: { kind: string; lesson_no: number }[] }).items.filter((i) => i.kind === '서술형')
    items.forEach((it, k) => {
      const l = lessons.find((x) => x.no === it.lesson_no)!
      const texts = [...l.flow.main.flatMap((m) => m.activities), ...l.caution_notes]
      for (const t of texts) expect(t, `${it.lesson_no}차시`).not.toMatch(ANSWERS[set.subject][k])
      // 재도전 때 다른 차시의 퀴즈·활동지·발문이 답을 주면 안 된다(M6: 수학 3차시 "가장 높은 직사각형의 계급")
      for (const o of lessons) for (const t of [JSON.stringify(o.teacher_script), JSON.stringify(o.worksheet), JSON.stringify(o.formative_check)]) {
        expect(t, `서술형 ${k + 1}의 답이 ${o.no}차시 퀴즈·활동지·발문에`).not.toMatch(ANSWERS[set.subject][k])
      }
    })
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
    for (const it of a.items.filter((i) => i.kind === '서술형')) expect(it.exemplar_answers.map((e) => e.points).sort()).toEqual([1, 2, 3])
    const essay = a.items.find((i) => i.kind === '논술형')!
    for (const ex of essay.exemplar_answers) {
      expect(ex.assumed_short_points).not.toBeNull()
      const total = ex.points + ex.assumed_short_points!
      expect(a.grade_boundaries.find((b) => total >= b.min && total <= b.max)?.band).toBe(ex.level)
    }
  })
  it('stage6 and stage7 have one entry per lesson; criteria phrases only on assessed lessons, named after the rubric', () => {
    const { lessons } = loadFixture(`stage3-generate${set.suffix}`) as { lessons: { no: number }[] }
    const { per_lesson } = loadFixture(`stage6-generate${set.suffix}`) as { per_lesson: { no: number }[] }
    expect(per_lesson.map((p) => p.no)).toEqual(lessons.map((l) => l.no))
    const plan = loadFixture(`stage7-generate${set.suffix}`) as { per_lesson: { lesson_no: number; criteria_phrases: { criterion_name: string }[] | null }[] }
    expect(plan.per_lesson.map((p) => p.lesson_no)).toEqual(lessons.map((l) => l.no))
    const items = (loadFixture(`stage5-generate${set.suffix}`) as { items: { lesson_no: number; rubric: { criteria: { name: string }[] } }[] }).items
    for (const p of plan.per_lesson) {
      const item = items.find((i) => i.lesson_no === p.lesson_no)
      expect(p.criteria_phrases?.map((c) => c.criterion_name) ?? null).toEqual(item ? item.rubric.criteria.map((c) => c.name) : null)
    }
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
