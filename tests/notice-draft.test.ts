import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { draftNoticePlan, objectParticle } from '@/lib/studio/notice-draft'
import { upgradeLessonV1, upgradeAssessmentV1 } from '@/lib/studio/compat'
import { NoticePlan, NOTICE_DISCLAIMER } from '@/lib/studio/schemas'
import { staticIssues } from '@/lib/studio/checks'

const json = (p: string) => JSON.parse(readFileSync(p, 'utf8'))

describe('draftNoticePlan', () => {
  it('produces a valid plan with criteria phrases only on essay lessons', () => {
    const s3 = json('data/studio-fixtures/stage3-generate.json'); const s5 = json('data/studio-fixtures/stage5-generate.json')
    const plan = draftNoticePlan(s3.lessons, s5)
    expect(NoticePlan.safeParse(plan).error?.issues ?? []).toEqual([])
    expect(plan.per_lesson.filter((p) => p.criteria_phrases).map((p) => p.lesson_no)).toEqual(s5.items.map((i: { lesson_no: number }) => i.lesson_no))
    expect(staticIssues(7, plan, { standards: [], prior: {} })).toEqual([])
    expect(plan.per_lesson.at(-1)?.preview).toMatch(/마무리/)
  })
  it('follows lesson order, quiz count, rubric criterion names and the fixed disclaimer (upgraded v1 input)', () => {
    const lessons = json('tests/fixtures/v1/stage3-generate-과학.json').lessons.map((l: Parameters<typeof upgradeLessonV1>[0]) => upgradeLessonV1(l, []))
    const a = upgradeAssessmentV1(json('tests/fixtures/v1/stage5-generate-과학.json'))
    const plan = draftNoticePlan([...lessons].reverse(), a)
    expect(NoticePlan.safeParse(plan).error?.issues ?? []).toEqual([])
    expect(plan.per_lesson.map((p) => p.lesson_no)).toEqual([1, 2, 3, 4, 5])
    for (const p of plan.per_lesson) expect(p.quiz_notes.length).toBe(lessons.find((l: { no: number }) => l.no === p.lesson_no).formative_check.quiz.length)
    const essay = plan.per_lesson.find((p) => p.lesson_no === 5)!
    expect(essay.criteria_phrases?.map((c) => c.criterion_name)).toEqual(a.items[2].rubric.criteria.map((c) => c.name))
    expect(plan.per_lesson[0].preview).toContain(lessons[1].topic.slice(0, 5))
    expect(plan.footer_disclaimer).toBe(NOTICE_DISCLAIMER)
    expect(staticIssues(7, plan, { standards: [], prior: {} })).toEqual([])
  })
  it('works without an assessment (no criteria phrases anywhere)', () => {
    const lessons = json('tests/fixtures/v1/stage3-generate.json').lessons.map((l: Parameters<typeof upgradeLessonV1>[0]) => upgradeLessonV1(l, []))
    const plan = draftNoticePlan(lessons, null)
    expect(plan.per_lesson.every((p) => p.criteria_phrases === null)).toBe(true)
    expect(NoticePlan.safeParse(plan).success).toBe(true)
  })
  it('objectParticle: 받침이 없으면 를, 있으면 을, 한글이 아니면 을(를)', () => {
    expect(objectParticle('표')).toBe('를'); expect(objectParticle('그림')).toBe('을'); expect(objectParticle('컵')).toBe('을')
    expect(objectParticle('도수분포표')).toBe('를'); expect(objectParticle('PET')).toBe('을(를)'); expect(objectParticle('')).toBe('을(를)')
  })
  for (const sfx of ['', '-과학']) it(`stage7${sfx} fixture: 조사가 맞고, 보완 문구는 "써 봅시다"로 끝나며 따옴표가 짝이 맞다`, () => {
    const plan = json(`data/studio-fixtures/stage7-generate${sfx}.json`) as { per_lesson: { preview: string; criteria_phrases: { good: string[]; improve: string[] }[] | null }[] }
    for (const p of plan.per_lesson) {
      expect(p.preview).not.toContain('을(를)')
      for (const c of p.criteria_phrases ?? []) {
        for (const t of c.improve) expect(t).toMatch(/써 봅시다$/)
        for (const t of [...c.good, ...c.improve]) { expect((t.match(/"/g) ?? []).length % 2, t).toBe(0); expect(t).not.toMatch(/[“”‘’]/) }
      }
    }
  })
})
