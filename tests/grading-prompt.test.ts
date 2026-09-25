import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { buildGradingPrompt, GRADING_RULES } from '@/lib/classroom/grading-prompt'
import { GRADING_PROMPT_RULES } from '@/lib/studio/prompts/rules/grading'
import { upgradeSnapshot, type Snapshot } from '@/lib/studio/publish'

// 수학 fixture(5단계 = v2)로 스냅샷을 조립한다. 채점 경로(grade.ts)와 같이 upgradeSnapshot 을 거친다(schema_version 2 라 그대로 통과).
const assessment = JSON.parse(readFileSync('data/studio-fixtures/stage5-generate.json', 'utf8'))
const snapshot: Snapshot = upgradeSnapshot({ schema_version: 2, cover: { title: 'T', subject: '수학', level: '중', grade: 1, version: 1, published_at: '' }, standards: [], intro: '', reconstruction: '', reconstruction_detail: [],
  learning_goals: [], key_question: '', unit_plan: null, lessons: [], materials: [], assessment, teacher_guide: null, notice_plan: null, references: [], generated_with: { models: [] } })

describe('buildGradingPrompt v2', () => {
  it('rules block first; item, per-criterion scale with max, notes, conditions, and the item\'s own exemplars in user', () => {
    const p = buildGradingPrompt({ snapshot, itemNo: 1, studentGrade: 1, answer: '올해 플라스틱컵이 405개로 가장 많이 늘었다.' })
    expect(p.system[0]).toBe(GRADING_RULES); expect(GRADING_RULES).toBe(GRADING_PROMPT_RULES)
    expect(p.user).toContain(assessment.items[0].stem)
    expect(p.user).toContain(assessment.items[0].rubric.notes[0])
    expect(p.user).toContain(assessment.items[0].exemplar_answers[0].text.slice(0, 20))
    expect(p.user).not.toContain(assessment.items[1].exemplar_answers[0].text.slice(0, 20))
    expect(p.user).toMatch(/max=\d/); expect(p.user).toMatch(/A~E 예상 구간/); expect(p.fixtureKey).toBe('grading-서술형-수학')
    // C-32: 서술형은 조건이 없다 — 빈 condition_nos 가 "조건 )"처럼 빈 꼬리를 남기지 않는다
    expect(assessment.items[0].conditions.items).toEqual([])
    expect(p.user).not.toMatch(/조건 \)/); expect(p.user).toMatch(/조건:\n없음/)
  })
  it('논술형 lists 4 criteria names with max=4 and the holistic bands', () => {
    const p = buildGradingPrompt({ snapshot, itemNo: 2, studentGrade: 1, answer: 'x'.repeat(60) })
    expect(p.fixtureKey).toBe('grading-논술형-수학')
    for (const c of assessment.items[1].rubric.criteria) expect(p.user).toContain(`${c.name}(max=4`)
    expect(p.user).toContain(assessment.items[1].rubric.holistic.상)
  })
  it('numbers every condition and states the axis, condition numbers and exemplar rationale', () => {
    const item = assessment.items[1]
    const p = buildGradingPrompt({ snapshot, itemNo: 2, studentGrade: 1, answer: 'x'.repeat(60) })
    for (const c of item.conditions.items) expect(p.user).toContain(`${c.no}. ${c.text}`)
    expect(p.user).toContain(`${item.rubric.criteria[2].name}(max=4, ${item.rubric.criteria[2].axis}, 조건 ${item.rubric.criteria[2].condition_nos.join('·')})`)
    expect(p.user).toContain(item.exemplar_answers[0].rationale)
    expect(p.user).toContain(`분량 ${item.conditions.length}`)
    expect(p.user).toContain('1학년')
    expect(p.user).toContain('x'.repeat(60))
  })
  it('G-03: every A~E range, and the order rubric < notes < A~E < exemplars < answer', () => {
    const item = assessment.items[0]
    const p = buildGradingPrompt({ snapshot, itemNo: 1, studentGrade: 1, answer: 'ANSWER_MARK' })
    for (const lv of item.level_map) expect(p.user).toContain(`${lv.level}: ${lv.min}~${lv.max}점`)
    const at = (s: string) => p.user.indexOf(s)
    expect(at('채점표(')).toBeGreaterThan(-1)
    expect(at('채점표(')).toBeLessThan(at('채점 시 유의점'))
    expect(at('채점 시 유의점')).toBeLessThan(at('A~E 예상 구간'))
    expect(at('A~E 예상 구간')).toBeLessThan(at('예시 답안(이 문항)'))
    expect(at('예시 답안(이 문항)')).toBeLessThan(at('ANSWER_MARK'))
  })
  it('서술형 now carries the holistic 상/중/하 too (대표 2026-09-26, C-15) and its 2~3 criteria with max 2', () => {
    const p = buildGradingPrompt({ snapshot, itemNo: 1, studentGrade: 1, answer: 'x'.repeat(60) })
    const h = assessment.items[0].rubric.holistic
    expect(p.user).toContain(`총체적 기준: 상=${h.상} / 중=${h.중} / 하=${h.하}`)
    for (const c of assessment.items[0].rubric.criteria) expect(p.user).toContain(`${c.name}(max=2`)
    expect(p.user).toContain('문항(서술형, 6점)')
  })
  it('an old 판 서술형 without holistic (legacy 3점) still builds a prompt with no holistic line', () => {
    const legacy = structuredClone(snapshot); legacy.assessment!.items[0].rubric.holistic = null
    expect(buildGradingPrompt({ snapshot: legacy, itemNo: 1, studentGrade: 1, answer: 'x'.repeat(60) }).user).not.toContain('총체적 기준')
  })
  it('척도는 0점부터 오름차순으로 옮긴다 — 만점부터 저장된(내림차순) 채점표도 같은 줄을 만든다(lib/studio/scale.ts)', () => {
    const c = assessment.items[0].rubric.criteria[0]
    const line = `${c.name}(max=${c.max}, ${c.axis}): ${[0, 1, 2].map((p) => `${p}=${c.scale.find((s: { points: number }) => s.points === p).descriptor}`).join(' / ')}`
    expect(buildGradingPrompt({ snapshot, itemNo: 1, studentGrade: 1, answer: 'x' }).user).toContain(line)
    const desc = structuredClone(snapshot)
    for (const cr of desc.assessment!.items[0].rubric.criteria) cr.scale.reverse()
    expect(desc.assessment!.items[0].rubric.criteria[0].scale[0].points).toBe(c.max)
    expect(buildGradingPrompt({ snapshot: desc, itemNo: 1, studentGrade: 1, answer: 'x' }).user).toContain(line)
  })
})

describe('grading fixtures follow the v2 math items (mock mode)', () => {
  const draft = (k: string) => JSON.parse(readFileSync(`data/studio-fixtures/grading-${k}.json`, 'utf8'))
  it('서술형 fixture criteria = item 1 criteria names and max', () => {
    const d = draft('서술형')
    expect(d.criteria.map((c: { name: string; max: number }) => [c.name, c.max])).toEqual(assessment.items[0].rubric.criteria.map((c: { name: string; max: number }) => [c.name, c.max]))
  })
  it('서술형 fixture score = sum', () => {
    const d = draft('서술형')
    expect(d.score).toBe(d.criteria.reduce((s: number, c: { points: number }) => s + c.points, 0))
  })
  it('논술형 fixture criteria = item 2 criteria names and max, score = sum', () => {
    const d = draft('논술형')
    expect(d.criteria.map((c: { name: string; max: number }) => [c.name, c.max])).toEqual(assessment.items[1].rubric.criteria.map((c: { name: string; max: number }) => [c.name, c.max]))
    expect(d.score).toBe(d.criteria.reduce((s: number, c: { points: number }) => s + c.points, 0))
  })
})

describe('경기2025 G-10(오류 이월 인정)이 채점 프롬프트에 닿는다', () => {
  it('GRADING_RULES(= GRADING_PROMPT_RULES)에 G-10 문장이 있고, buildGradingPrompt의 system 첫 블록에 그대로 실린다', () => {
    expect(GRADING_PROMPT_RULES).toMatch(/^G-10 .*오류 이월 인정/m)
    const p = buildGradingPrompt({ snapshot, itemNo: 1, studentGrade: 1, answer: 'x'.repeat(60) })
    expect(p.system[0]).toBe(GRADING_RULES)
    expect(p.system[0]).toContain('오류 이월 인정')
  })
})

describe('학년 선택(대표 2026-09-26): 채점·안내장 프롬프트의 학년 줄', () => {
  it('uses the student grade when there is one, else the school band — never "null학년"', () => {
    const noGrade: Snapshot = { ...snapshot, cover: { ...snapshot.cover, grade: null } }
    expect(buildGradingPrompt({ snapshot: noGrade, itemNo: 1, studentGrade: 2, answer: 'x' }).user).toContain('학생 학년: 중 2학년')
    const u = buildGradingPrompt({ snapshot: noGrade, itemNo: 1, studentGrade: null, answer: 'x' }).user
    expect(u).toContain('학생 학년: 중학교(1~3학년군)'); expect(u).not.toMatch(/null학년/)
  })
})
