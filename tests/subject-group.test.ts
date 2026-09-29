// 대표 결정 2026-09-30: 사회·한국사·세계사를 따로 나누지 않고 「사회」 한 과목으로 묶는다(과목 묶음 — 자료 값은 그대로).
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { SUBJECTS, STUDIO_SUBJECTS, standardSubjectsFor, studioSubjectOf, ThemeIntro } from '@/lib/studio/schemas'
import { standardFamilyKey, groupStandardFamilies, isHistoryCode } from '@/lib/studio/subjects'
import { selectExemplars, scoreExemplar, type ExemplarRecord } from '@/lib/reference/exemplars'
import { getLevels, levelsBlock } from '@/lib/reference/levels'
import { loadFixture } from '@/lib/ai/mock'
import { buildPrompt, buildReviewPrompt } from '@/lib/studio/prompts/stages'
import { app } from '@/content/site'

type Std = { level: string; subject: string; grade_band: string; domain: string; code: string; text: string }
const standards = (f: string) => JSON.parse(readFileSync(`data/standards/${f}.json`, 'utf8')) as Std[]

describe('과목 목록', () => {
  it('제작소 과목은 다섯, 안쪽 목록은 옛 값까지 그대로(순서: 국어·영어·수학·과학·사회 다음에 한국사·세계사)', () => {
    expect([...STUDIO_SUBJECTS]).toEqual(['국어', '영어', '수학', '과학', '사회'])
    expect([...SUBJECTS]).toEqual(['국어', '영어', '수학', '과학', '사회', '한국사', '세계사'])
  })
  it('standardSubjectsFor: 사회 → 사회·한국사·세계사, 그 밖에는 자기 자신', () => {
    expect(standardSubjectsFor('사회')).toEqual(['사회', '한국사', '세계사'])
    for (const s of ['국어', '영어', '수학', '과학', '한국사', '세계사']) expect(standardSubjectsFor(s)).toEqual([s])
  })
  it('studioSubjectOf folds legacy names into 사회', () => {
    expect(studioSubjectOf('한국사')).toBe('사회'); expect(studioSubjectOf('세계사')).toBe('사회'); expect(studioSubjectOf('수학')).toBe('수학')
  })
  it('옛 대주제 소개(0단계)의 한국사·세계사 아이디어는 그대로 읽힌다', () => {
    const r = ThemeIntro.safeParse({ intro: '가'.repeat(30), subject_ideas: [{ subject: '세계사', idea: '산업 혁명과 쓰레기' }, { subject: '사회', idea: '분리배출 제도' }] })
    expect(r.success).toBe(true)
  })
  it('가짜 응답은 옛 과목 이름 꼬리도 떼고 기본 fixture로 떨어진다', () => {
    for (const s of ['사회', '한국사', '세계사']) expect(loadFixture(`stage2-generate-${s}`)).toEqual(loadFixture('stage2-generate'))
  })
})

describe('성취기준 묶음(고르기 화면)', () => {
  it('standardFamilyKey는 코드 머리에서 뽑고 중학교 역사만 영역으로 나눈다', () => {
    expect(standardFamilyKey('[9사(지리)01-01]', '사회')).toBe('9사(지리)')
    expect(standardFamilyKey('[9사(일사)10-01]', '사회')).toBe('9사(일사)')
    expect(standardFamilyKey('[9역03-01]', '세계사')).toBe('9역-세계사')
    expect(standardFamilyKey('[9역08-01]', '한국사')).toBe('9역-한국사')
    expect(standardFamilyKey('[10통사1-01-01]', '사회')).toBe('10통사')
    expect(standardFamilyKey('[10한사2-02-01]', '한국사')).toBe('10한사')
    expect(standardFamilyKey('[12동역01-01]', '세계사')).toBe('12동역')
    expect(standardFamilyKey('[4사01-01]', '사회')).toBe('4사')
    expect(standardFamilyKey('코드 아님', '사회')).toBe('')
  })
  it('중학교 사회 세트: 일반사회·지리 다음에 역사(세계사 영역) → 역사(한국사 영역), 묶음 안은 영역별', () => {
    const rows = [...standards('사회'), ...standards('한국사'), ...standards('세계사')].filter((r) => r.level === '중')
    const families = groupStandardFamilies(rows, '사회')
    expect(families.map((f) => app.studio.picker.familyLabel(f.key))).toEqual(['일반사회', '지리', '역사 (세계사 영역)', '역사 (한국사 영역)'])
    expect(families.map((f) => f.domains.reduce((n, d) => n + d.rows.length, 0))).toEqual([36, 38, 20, 20])
    const korea = families[3]
    expect(korea.domains.every((d) => d.rows.every((r) => r.subject === '한국사'))).toBe(true)
    expect(korea.domains.length).toBeGreaterThan(1)
  })
  it('data/standards 의 사회·한국사·세계사 코드는 모두 묶음 제목이 있다(모르는 머리 없음)', () => {
    for (const level of ['초', '중', '고']) {
      const rows = [...standards('사회'), ...standards('한국사'), ...standards('세계사')].filter((r) => r.level === level)
      const labels = groupStandardFamilies(rows, '사회').map((f) => app.studio.picker.familyLabel(f.key))
      expect(labels.length).toBeGreaterThan(0)
      for (const l of labels) expect(l, level).not.toMatch(/^사회 \(\d+[가-힣]/)
      expect(new Set(labels).size).toBe(labels.length)
    }
    const high = groupStandardFamilies([...standards('사회'), ...standards('한국사'), ...standards('세계사')].filter((r) => r.level === '고'), '사회').map((f) => app.studio.picker.familyLabel(f.key))
    expect(high.slice(0, 2)).toEqual(['통합사회', '한국사'])
    for (const l of ['세계사', '동아시아 역사 기행', '역사로 탐구하는 현대 세계', '경제', '정치']) expect(high).toContain(l)
  })
  it('사회가 아닌 과목은 묶음 하나(제목 없음)', () => {
    const rows = [{ code: '[9수04-02]', subject: '수학', domain: '자료와 가능성' }, { code: '[9수01-01]', subject: '수학', domain: '수와 연산' }]
    const families = groupStandardFamilies(rows, '수학')
    expect(families.map((f) => f.key)).toEqual([''])
    expect(families[0].domains.map((d) => d.domain)).toEqual(['수와 연산', '자료와 가능성'])
  })
  it('모르는 코드 머리는 "사회 (머리)"로 보인다', () => {
    expect(app.studio.picker.familyLabel('12새과')).toBe('사회 (12새과)')
  })
})

describe('예시 은행 — 사회 세트', () => {
  const rec = (id: string, subject: string, over: Partial<ExemplarRecord> = {}): ExemplarRecord => ({
    id, subject, school_level: '중', grade: null, unit: null, standard_codes: [], kind: '서술형', points: 5, context: 'c', materials: [],
    stem: '설명하시오.', conditions: [], answer_format: null, rubric: { type: '분석적', criteria: [{ name: '설명', levels: [{ points: 5, desc: '정확' }] }] },
    exemplar_answers: [{ level: '상', text: '답' }], feedback: null, cognitive: [], source: { file: 'x.pdf', pages: [1] }, ...over,
  })
  const bank = [rec('d1', '도덕'), rec('h1', '역사'), rec('s1', '사회'), rec('m1', '수학')]
  const q = (codes: string[]) => ({ subject: '사회', school_level: '중' as const, grade: null, codes, unit: null, kind: '서술형' as const })
  it('후보는 사회 + 역사 + 도덕(다른 과목은 없음)', () => {
    expect(selectExemplars(q(['[9사(지리)01-01]']), 10, bank).map((r) => r.id).sort()).toEqual(['d1', 'h1', 's1'])
  })
  it('역사 성취기준만 고른 세트는 역사 예시가 먼저, 그 밖에는 사회 예시가 먼저', () => {
    expect(selectExemplars(q(['[9역08-01]', '[9역09-02]']), 3, bank).map((r) => r.id)).toEqual(['h1', 's1', 'd1'])
    expect(selectExemplars(q(['[9사(일사)10-01]', '[9사(지리)02-01]']), 3, bank).map((r) => r.id)).toEqual(['s1', 'd1', 'h1'])
    expect(selectExemplars(q(['[9사(일사)10-01]', '[9역08-01]']), 3, bank).map((r) => r.id)).toEqual(['s1', 'h1', 'd1'])
  })
  it('다른 과목 점수는 그대로(영역 가점 없음), 옛 한국사·세계사 세트는 역사 예시만', () => {
    const mq = { subject: '수학', school_level: '중' as const, grade: null, codes: ['[9수04-02]'], unit: null, kind: '서술형' as const }
    expect(scoreExemplar(rec('m1', '수학'), mq)).toBe(3 + 1 + 1)
    for (const legacy of ['한국사', '세계사']) expect(selectExemplars({ ...q(['[9역08-01]']), subject: legacy }, 10, bank).map((r) => r.id)).toEqual(['h1'])
  })
  it('실제 은행: 중학교 사회 세트가 [9역] 성취기준만 고르면 첫 예시는 역사, 지리·일반사회면 사회', () => {
    expect(selectExemplars(q(['[9역08-01]', '[9역08-02]']), 2)[0].subject).toBe('역사')
    expect(selectExemplars(q(['[9사(일사)10-01]', '[9사(일사)10-02]']), 2)[0].subject).toBe('사회')
  })
  it('isHistoryCode', () => {
    for (const c of ['[9역08-01]', '[10한사1-01-01]', '[12세사01-01]', '[12동역01-01]', '[12역현01-01]']) expect(isHistoryCode(c), c).toBe(true)
    for (const c of ['[9사(지리)01-01]', '[9사(일사)10-01]', '[10통사1-01-01]', '[12세지01-01]', '[9수04-02]']) expect(isHistoryCode(c), c).toBe(false)
  })
})

describe('성취수준 — 사회 세트가 [9역] 코드를 고르면 역사 성취수준을 받는다', () => {
  const korea = standards('한국사').filter((r) => r.level === '중')
  it('코드 글자로 파일을 고르므로 세트 과목이 사회여도 역사-중.json 에서 읽는다', () => {
    const hit = korea.map((r) => getLevels(r.code)).find((r) => r !== null)
    expect(hit).toBeTruthy()
    expect(hit!.subject).toBe('역사'); expect(hit!.school_level).toBe('중')
    expect(levelsBlock([hit!.code])).toContain(`${hit!.code} 성취수준`)
  })
  it('사회 코드는 사회-중.json 에서 읽는다', () => {
    const hit = standards('사회').filter((r) => r.level === '중').map((r) => getLevels(r.code)).find((r) => r !== null)
    expect(hit!.subject).toBe('사회')
  })
})

describe('사회 세트 프롬프트 크기', () => {
  const j = (f: string) => JSON.parse(readFileSync(f, 'utf8'))
  const F = 'data/studio-fixtures/'
  // 사회 fixture 는 없다 — 크기만 재려고 과학 fixture 의 prior·생성 결과를 빌리고 성취기준은 실제 사회·역사 코드를 쓴다
  const prior = { stage0: j(`${F}stage0-generate.json`), stage2: j(`${F}stage2-generate-과학.json`), stage3: j(`${F}stage3-generate-과학.json`), stage4: j(`${F}stage4-generate-과학.json`), stage5: j(`${F}stage5-generate-과학.json`) }
  const std = (r: Std) => ({ code: r.code, text: r.text })
  const social = standards('사회').filter((r) => r.level === '중' && r.code.startsWith('[9사(일사)10')).slice(0, 2).map(std)
  const history = standards('한국사').filter((r) => r.level === '중').slice(0, 2).map(std)
  const ctxOf = (subject: string, list: { code: string; text: string }[]) => ({ theme: { title: '학교 축제 일회용품 줄이기', level: '중', grade: null, subjects: [subject] }, subject, standards: list, prior })
  const sets = { '일반사회만': social, '역사만': history, '섞음': [...social, ...history] }
  it('3·5·6단계 생성 입력과 3·6단계 검토 입력 < 45,000자(세 가지 성취기준 조합 모두), 규칙 블록에 S-사-07·S-역-01', () => {
    expect(social.length).toBe(2); expect(history.length).toBe(2)
    for (const [name, list] of Object.entries(sets)) {
      const c = ctxOf('사회', list)
      for (const stage of [3, 5, 6] as const) {
        const g = buildPrompt(stage, c)
        expect(g.user.length, `${name} generate ${stage}`).toBeLessThan(45_000)
        const system = JSON.stringify(g.system)
        expect(system).toContain('S-사-07'); expect(system).toContain('S-역-01')
      }
      for (const stage of [3, 6] as const) expect(buildReviewPrompt(stage, c, j(`${F}stage${stage}-generate-과학.json`)).user.length, `${name} review ${stage}`).toBeLessThan(45_000)
    }
  })
  it('5단계 검토 입력은 같은 prior 의 과학 세트보다 크지 않다(5단계 검토는 어느 과목이든 생성 결과를 통째로 실어 45k 가드 밖이다)', () => {
    const out5 = j(`${F}stage5-generate-과학.json`)
    const science = buildReviewPrompt(5, ctxOf('과학', j(`${F}standards-science.json`)), out5).user.length
    for (const [name, list] of Object.entries(sets)) expect(buildReviewPrompt(5, ctxOf('사회', list), out5).user.length, name).toBeLessThanOrEqual(science)
  })
})
