import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { draftNoticePlan, objectParticle } from '@/lib/studio/notice-draft'
import { upgradeLessonV1, upgradeAssessmentV1 } from '@/lib/studio/compat'
import { NoticePlan, NOTICE_DISCLAIMER } from '@/lib/studio/schemas'
import { staticIssues, SUGGEST_ENDINGS } from '@/lib/studio/checks'

const json = (p: string) => JSON.parse(readFileSync(p, 'utf8'))

describe('draftNoticePlan', () => {
  it('produces a valid plan with criteria phrases only on the 단원 평가 차시 (both items), previewing it from the last teaching lesson', () => {
    const s3 = json('data/studio-fixtures/stage3-generate.json'); const s5 = json('data/studio-fixtures/stage5-generate.json')
    const plan = draftNoticePlan(s3.lessons, s5)
    expect(NoticePlan.safeParse(plan).error?.issues ?? []).toEqual([])
    expect(plan.per_lesson.filter((p) => p.criteria_phrases).map((p) => p.lesson_no)).toEqual([6])
    expect(plan.per_lesson.find((p) => p.lesson_no === 6)!.criteria_phrases!.map((c) => c.criterion_name)).toEqual(s5.items.flatMap((i: { rubric: { criteria: { name: string }[] } }) => i.rubric.criteria.map((c) => c.name)))
    expect(plan.per_lesson.find((p) => p.lesson_no === 5)!.preview).toBe('다음 시간에는 단원 평가에서 서술형·논술형 문항에 답해요.')
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
    // 옛 판(v1) 구조: 논술형 차시(5)는 논술형 요소만, 서술형 차시(3·4)는 그 문항 요소만
    const essay = plan.per_lesson.find((p) => p.lesson_no === 5)!
    expect(essay.criteria_phrases?.map((c) => c.criterion_name)).toEqual(a.items[2].rubric.criteria.map((c) => c.name))
    expect(plan.per_lesson[0].preview).toContain(lessons[1].topic.slice(0, 5))
    expect(plan.per_lesson.find((p) => p.lesson_no === 4)!.preview).toMatch(/논술형 문항에 답해요/)
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
  for (const sfx of ['', '-과학']) it(`stage7${sfx} fixture: 조사가 맞고, 보완 문구는 청유형으로 끝나며 따옴표가 짝이 맞다`, () => {
    const plan = json(`data/studio-fixtures/stage7-generate${sfx}.json`) as { per_lesson: { preview: string; criteria_phrases: { good: string[]; improve: string[] }[] | null }[] }
    for (const p of plan.per_lesson) {
      expect(p.preview).not.toContain('을(를)')
      for (const c of p.criteria_phrases ?? []) {
        for (const t of c.improve) expect(t).toMatch(SUGGEST_ENDINGS)
        for (const t of [...c.good, ...c.improve]) { expect((t.match(/"/g) ?? []).length % 2, t).toBe(0); expect(t).not.toMatch(/[“”‘’]/) }
      }
    }
  })
})

// fix wave I4: 잘한 점은 최고 단계 서술(+ 총체적 상·A 특성)에서만, 보완은 (max−1) 단계에서 만든 다음 행동 한 문장(1점 서술은 쓰지 않음)
describe('draftNoticePlan phrases (I4)', () => {
  type Scale = { points: number; descriptor: string }
  const inputs = [
    ['수학 fixture', json('data/studio-fixtures/stage3-generate.json').lessons, json('data/studio-fixtures/stage5-generate.json')],
    ['과학 fixture', json('data/studio-fixtures/stage3-generate-과학.json').lessons, json('data/studio-fixtures/stage5-generate-과학.json')],
    ['수학 v1 업그레이드', json('tests/fixtures/v1/stage3-generate.json').lessons.map((l: Parameters<typeof upgradeLessonV1>[0]) => upgradeLessonV1(l, [])), upgradeAssessmentV1(json('tests/fixtures/v1/stage5-generate.json'))],
    ['과학 v1 업그레이드', json('tests/fixtures/v1/stage3-generate-과학.json').lessons.map((l: Parameters<typeof upgradeLessonV1>[0]) => upgradeLessonV1(l, [])), upgradeAssessmentV1(json('tests/fixtures/v1/stage5-generate-과학.json'))],
  ] as const
  for (const [label, lessons, a] of inputs) {
    const plan = draftNoticePlan(lessons, a)
    it(`${label}: 잘한 점 문구에 오류·누락·위반·부정확·무관이 없다`, () => {
      for (const p of plan.per_lesson) for (const c of p.criteria_phrases ?? []) for (const g of c.good) expect(g, `${p.lesson_no}차시 ${c.criterion_name}`).not.toMatch(/오류|누락|위반|부정확|무관/)
    })
    it(`${label}: 보완 문구는 한 문장, 말줄임 없음, 청유형 끝, 1점 서술을 쓰지 않는다`, () => {
      for (const p of plan.per_lesson) {
        // 단원 평가 차시는 문항이 둘 — 두 문항의 요소에서 이름으로 찾는다
        const crits = a.items.filter((i: { lesson_no: number }) => i.lesson_no === p.lesson_no).flatMap((i: { rubric: { criteria: unknown[] } }) => i.rubric.criteria)
        for (const c of p.criteria_phrases ?? []) {
          const crit = crits.find((x: { name: string }) => x.name === c.criterion_name) as { max: number; scale: Scale[] }
          const one = crit.scale.find((s: Scale) => s.points === 1)?.descriptor ?? ''
          const head = one.replace(/\s*\([^()]*\)/g, '').slice(0, 12)
          for (const t of c.improve) {
            expect(t, t).toMatch(SUGGEST_ENDINGS); expect(t).not.toContain('…')
            expect(t.replace(/[.!]$/, ''), `한 문장: ${t}`).not.toMatch(/[.!?](\s|$)/)
            expect(t.length).toBeLessThanOrEqual(60)
            // (max−1) 단계가 1점 단계와 다를 때만(max 3·4) 1점 서술을 쓰지 않았는지 본다 — max 2 요소(6점 서술형)는 (max−1) = 1점 단계다
            if (crit.max > 2 && head.length >= 8) expect(t, `1점 서술 사용: ${t}`).not.toContain(head)
          }
          expect(new Set(c.improve).size, `${c.criterion_name} 보완 문구가 겹침`).toBe(c.improve.length)
        }
      }
    })
    it(`${label}: 차시 요약은 차시 목표, 퀴즈 코멘트는 말줄임 없이 끊는다`, () => {
      for (const p of plan.per_lesson) {
        const l = lessons.find((x: { no: number }) => x.no === p.lesson_no)
        expect(p.topic_summary.slice(0, 10)).toBe(l.goal.replace(/["“”'‘’]/g, '').trim().slice(0, 10))
        for (const q of p.quiz_notes) { expect(q.wrong_note).not.toContain('…'); expect(q.wrong_note.length).toBeLessThanOrEqual(40) }
      }
      expect(staticIssues(7, plan, { standards: [], prior: {} })).toEqual([])
    })
  }
  it('가정 학습 제안은 문항 모양을 따른다 — 종이에 표를 만드는 문항은 표, 단원 평가 차시는 두 답 가운데 하나, 옛 판 논술형 차시는 글', () => {
    const lessons = json('data/studio-fixtures/stage3-generate.json').lessons; const a = json('data/studio-fixtures/stage5-generate.json')
    const at = (plan: ReturnType<typeof draftNoticePlan>, no: number) => plan.per_lesson.find((p) => p.lesson_no === no)!.home_study_suggestion
    const plan = draftNoticePlan(lessons, a)
    expect(at(plan, 6)).toMatch(/서술형·논술형/); expect(at(plan, 1)).toMatch(/퀴즈/); expect(at(plan, 5)).toMatch(/퀴즈/)
    for (const p of plan.per_lesson) expect(p.home_study_suggestion).toMatch(SUGGEST_ENDINGS)
    // 종이 답안 문항(시연 세트에는 없다 — 합성): 서술형을 표 작성 종이 답안으로 바꾸면 그 모양이 먼저
    const paper = structuredClone(a); paper.items[0].conditions = { ...paper.items[0].conditions, answer_mode: 'paper', format: '표(계급·도수) + 문장 1개' }
    expect(at(draftNoticePlan(lessons, paper), 6)).toMatch(/표/)
    // 옛 판(v1): 논술형 차시는 글, 서술형 차시는 한 문장
    const v1Lessons = json('tests/fixtures/v1/stage3-generate.json').lessons.map((l: Parameters<typeof upgradeLessonV1>[0]) => upgradeLessonV1(l, []))
    const old = draftNoticePlan(v1Lessons, upgradeAssessmentV1(json('tests/fixtures/v1/stage5-generate.json')))
    expect(at(old, 5)).toMatch(/글|문단/); expect(at(old, 4)).not.toMatch(/글/); expect(at(old, 2)).toMatch(/표/)
  })
  it('잘한 점 두 번째 문구는 성취수준 A 특성(또는 총체적 상)에서 온다 — 최고 단계 서술과 겹치지 않는다', () => {
    const a = json('data/studio-fixtures/stage5-generate.json')
    const plan = draftNoticePlan(json('data/studio-fixtures/stage3-generate.json').lessons, a)
    for (const p of plan.per_lesson) for (const c of p.criteria_phrases ?? []) expect(c.good[0]).not.toBe(c.good[1])
    const session = plan.per_lesson.find((p) => p.lesson_no === 6)!
    const phrase = (name: string) => session.criteria_phrases!.find((c) => c.criterion_name === name)!
    for (const item of a.items) expect(phrase(item.rubric.criteria[0].name).good[1]).toBe(item.level_map.find((l: { level: string }) => l.level === 'A').trait)
  })
})
