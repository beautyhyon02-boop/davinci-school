// 도덕·윤리 성취기준(2026-09-30): 사회 세트가 윤리 성취기준을 고를 수 있게 data/standards/도덕.json 과 과목 분류 '도덕'을 더했다.
// 문장은 교육과정 총괄 별책(2·3·4)의 글자 층을 그대로 옮긴 것이다 — 여기서는 모양·건수와 성취수준 문서 대조를 고정한다.
import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { standardsSchema } from '@/lib/standards/parse'
import { crosscheckStandards } from '@/lib/standards/crosscheck'
import { getAllLevelRecords, getLevels } from '@/lib/reference/levels'
import { SUBJECTS, STUDIO_SUBJECTS, standardSubjectsFor, setSubjectsFor, studioSubjectOf, isMergedSubject, isLegacySubject } from '@/lib/studio/schemas'
import { standardFamilyKey, groupStandardFamilies, isMoralCode, isHistoryCode } from '@/lib/studio/subjects'
import { parseTheme, addThemeSubjects, canCreateSet, validateStandardSelection, THEME_FIELDS } from '@/lib/studio/themes'
import { selectExemplars, type ExemplarRecord } from '@/lib/reference/exemplars'
import { rulesFor } from '@/lib/studio/prompts/rules'
import { withOptionalSubjects, missingEnumValue } from '@/lib/supabase/optional-subjects'
import { fetchAll } from '@/lib/supabase/fetch-all'
import { app } from '@/content/site'

type Std = { level: string; subject: string; grade_band: string; domain: string; code: string; text: string }
const load = (f: string) => JSON.parse(readFileSync(`data/standards/${f}.json`, 'utf8')) as Std[]
const moral = standardsSchema.parse(load('도덕'))
const head = (code: string) => /^\[(\d+[가-힣]+)/u.exec(code)![1]

describe('data/standards/도덕.json', () => {
  it('103건 = 초 24(3~4학년군 12 · 5~6학년군 12) · 중 22 · 고 57(현윤 17 · 윤사 15 · 인윤 12 · 윤탐 13)', () => {
    expect(moral.length).toBe(103)
    const count = (f: (r: Std) => boolean) => moral.filter(f).length
    expect([count((r) => r.level === '초'), count((r) => r.level === '중'), count((r) => r.level === '고')]).toEqual([24, 22, 57])
    const byHead: Record<string, number> = {}
    for (const r of moral) byHead[head(r.code)] = (byHead[head(r.code)] ?? 0) + 1
    expect(byHead).toEqual({ '4도': 12, '6도': 12, '9도': 22, '12현윤': 17, '12윤사': 15, '12인윤': 12, '12윤탐': 13 })
  })
  it('모든 행이 subject 도덕, 코드 모양은 [N도NN-NN]·[12과목NN-NN], 학교급·학년군이 코드 머리와 맞는다', () => {
    const expected: Record<string, [string, string]> = { '4도': ['초', '3-4'], '6도': ['초', '5-6'], '9도': ['중', '1-3'], '12현윤': ['고', '2-3'], '12윤사': ['고', '2-3'], '12인윤': ['고', '2-3'], '12윤탐': ['고', '2-3'] }
    for (const r of moral) {
      expect(r.subject).toBe('도덕')
      expect(r.code, r.code).toMatch(/^\[(?:[469]도|12(?:현윤|윤사|인윤|윤탐))\d{2}-\d{2}\]$/)
      expect([r.level, r.grade_band], r.code).toEqual(expected[head(r.code)])
      expect(isMoralCode(r.code), r.code).toBe(true)
      expect(isHistoryCode(r.code), r.code).toBe(false)
    }
  })
  it('코드는 겹치지 않고(다른 과목 파일과도), 문장·영역은 비어 있지 않으며 문장에 줄바꿈·겹친 공백·코드 조각이 없다', () => {
    const codes = moral.map((r) => r.code)
    expect(new Set(codes).size).toBe(codes.length)
    const others = ['국어', '영어', '수학', '과학', '사회', '한국사', '세계사'].flatMap((f) => load(f).map((r) => r.code))
    expect(codes.filter((c) => others.includes(c))).toEqual([])
    for (const r of moral) {
      expect(r.text.trim().length, r.code).toBeGreaterThan(15)
      expect(r.text, r.code).toBe(r.text.trim())
      expect(r.text, r.code).not.toMatch(/\s{2,}|[\r\n\t]|\[|\]/)
      expect(r.text, r.code).toMatch(/다\.?$/)
      expect(r.domain.trim().length, r.code).toBeGreaterThan(0)
    }
  })
  it('영역 번호는 영역마다 01부터 빠짐없이 이어진다', () => {
    const groups = new Map<string, number[]>()
    for (const r of moral) {
      const m = /^\[(\d+[가-힣]+\d{2})-(\d{2})\]$/u.exec(r.code)!
      groups.set(m[1], [...(groups.get(m[1]) ?? []), Number(m[2])])
    }
    for (const [key, list] of groups) expect(list.sort((a, b) => a - b), key).toEqual(list.map((_, i) => i + 1))
  })
  it('성취수준 문서(도덕-초·중.json)와 대조: 초·중 46건 가운데 45건 일치, [6도04-01] 한 건만 낱말이 다르다(방안/방법), 고 57건은 대조 자료 없음', () => {
    const rows = moral.map((r) => ({ id: r.code, code: r.code, subject: r.subject, text: r.text }))
    const result = crosscheckStandards(rows, getAllLevelRecords())
    expect(result.verified.length).toBe(45)
    expect(result.mismatched.map((r) => r.code)).toEqual(['[6도04-01]'])
    expect(result.mismatched[0].dbText).toContain('다양한 방안을 찾아')
    expect(result.mismatched[0].levelText).toContain('다양한 방법을 찾아')
    expect(result.unmatched.length).toBe(57)
    expect(result.unmatched.every((r) => r.code.startsWith('[12'))).toBe(true)
  })
})

describe('과목 분류 도덕', () => {
  it('안쪽 목록 맨 끝에만 있고 제작소 과목은 아니다', () => {
    expect(SUBJECTS[SUBJECTS.length - 1]).toBe('도덕')
    expect((STUDIO_SUBJECTS as readonly string[]).includes('도덕')).toBe(false)
    expect(studioSubjectOf('도덕')).toBe('사회')
    expect(isMergedSubject('도덕')).toBe(true); expect(isMergedSubject('사회')).toBe(false); expect(isMergedSubject('수학')).toBe(false)
    expect(isLegacySubject('도덕')).toBe(false)
  })
  it('성취기준 조회는 도덕까지, 세트 과목 필터는 도덕 없이', () => {
    expect(standardSubjectsFor('사회')).toEqual(['사회', '한국사', '세계사', '도덕'])
    expect(setSubjectsFor('사회')).toEqual(['사회', '한국사', '세계사'])
    expect(setSubjectsFor('수학')).toEqual(['수학'])
  })
  it('새 대주제·과목 추가·세트 만들기에서 도덕을 고르면 "사회로 묶였습니다" 안내', () => {
    const fd = new FormData()
    fd.set(THEME_FIELDS.title, '생명 존중'); fd.set(THEME_FIELDS.level, '중'); fd.set(THEME_FIELDS.grade, ''); fd.append(THEME_FIELDS.subjects, '도덕')
    expect(parseTheme(fd)).toEqual({ ok: false, error: app.studio.errors.subjectMerged })
    expect(addThemeSubjects(['국어'], ['도덕'])).toEqual({ ok: false, error: app.studio.errors.subjectMerged })
    expect(canCreateSet({ subjects: ['국어', '도덕'] }, '도덕', [])).toEqual({ ok: false, reason: app.studio.errors.subjectMerged })
    expect(app.studio.errors.subjectMerged).toContain('도덕')
  })
  it('사회 세트는 도덕 성취기준을 고를 수 있고, 다른 과목 세트는 못 고른다', () => {
    const s = (code: string, subject: string) => ({ code, level: '중', subject, verified: true })
    expect(validateStandardSelection([s('[9도03-01]', '도덕'), s('[9사(일사)10-01]', '사회')], { level: '중', subject: '사회' }).ok).toBe(true)
    expect(validateStandardSelection([s('[9도03-01]', '도덕'), s('[9도03-02]', '도덕')], { level: '중', subject: '사회' }).ok).toBe(true)
    expect(validateStandardSelection([s('[9도03-01]', '도덕'), s('[9국01-01]', '국어')], { level: '중', subject: '국어' }).issues).toContain(app.studio.errors.standardSubjectMismatch)
  })
  it('규칙은 그대로다 — 도덕 전용 규칙은 없고 사회 세트 규칙만 쓴다', () => {
    expect(rulesFor('사회')).toContain('S-사-07')
    expect(rulesFor('사회')).not.toMatch(/S-도-/)
  })
})

describe('고르기 화면 묶음 — 도덕·윤리는 역사 묶음 뒤', () => {
  const all = [...load('사회'), ...load('한국사'), ...load('세계사'), ...moral]
  const labels = (level: string) => groupStandardFamilies(all.filter((r) => r.level === level), '사회').map((f) => app.studio.picker.familyLabel(f.key))
  it('열쇠는 코드 머리', () => {
    expect(standardFamilyKey('[4도01-01]', '도덕')).toBe('4도')
    expect(standardFamilyKey('[9도03-01]', '도덕')).toBe('9도')
    expect(standardFamilyKey('[12현윤01-01]', '도덕')).toBe('12현윤')
  })
  it('중학교: 일반사회 → 지리 → 역사(세계사) → 역사(한국사) → 도덕', () => {
    expect(labels('중')).toEqual(['일반사회', '지리', '역사 (세계사 영역)', '역사 (한국사 영역)', '도덕'])
    const last = groupStandardFamilies(all.filter((r) => r.level === '중'), '사회')[4]
    expect(last.domains.map((d) => d.domain)).toEqual(['자신과의 관계', '타인과의 관계', '사회⋅공동체와의 관계', '자연과의 관계'])
    expect(last.domains.reduce((n, d) => n + d.rows.length, 0)).toBe(22)
  })
  it('초등: 사회 두 학년군 다음에 도덕 두 학년군', () => {
    expect(labels('초')).toEqual(['사회 (초등 3~4학년군)', '사회 (초등 5~6학년군)', '도덕 (초등 3~4학년군)', '도덕 (초등 5~6학년군)'])
  })
  it('고등학교: 맨 끝 네 묶음이 별책에 실린 과목 순서 그대로, 모르는 머리 없음', () => {
    const high = labels('고')
    expect(high.slice(-4)).toEqual(['현대사회와 윤리', '윤리와 사상', '인문학과 윤리', '윤리문제 탐구'])
    expect(high.slice(0, 2)).toEqual(['통합사회', '한국사'])
    for (const l of high) expect(l).not.toMatch(/^사회 \(\d+[가-힣]/)
    expect(new Set(high).size).toBe(high.length)
    expect(high.indexOf('역사로 탐구하는 현대 세계')).toBeLessThan(high.indexOf('현대사회와 윤리'))
  })
})

describe('예시 은행·성취수준', () => {
  const rec = (id: string, subject: string): ExemplarRecord => ({
    id, subject, school_level: '중', grade: null, unit: null, standard_codes: [], kind: '서술형', points: 5, context: 'c', materials: [],
    stem: '설명하시오.', conditions: [], answer_format: null, rubric: { type: '분석적', criteria: [{ name: '설명', levels: [{ points: 5, desc: '정확' }] }] },
    exemplar_answers: [{ level: '상', text: '답' }], feedback: null, cognitive: [], source: { file: 'x.pdf', pages: [1] },
  })
  const bank = [rec('d1', '도덕'), rec('h1', '역사'), rec('s1', '사회'), rec('m1', '수학')]
  const q = (codes: string[]) => ({ subject: '사회', school_level: '중' as const, grade: null, codes, unit: null, kind: '서술형' as const })
  it('도덕 성취기준만 고른 사회 세트는 도덕 예시가 먼저, 섞이면 사회 다음에 도덕', () => {
    expect(selectExemplars(q(['[9도03-01]', '[9도03-02]']), 3, bank).map((r) => r.id)).toEqual(['d1', 's1', 'h1'])
    expect(selectExemplars(q(['[9사(일사)10-01]', '[9도03-01]']), 3, bank).map((r) => r.id)).toEqual(['s1', 'd1', 'h1'])
    expect(selectExemplars(q(['[9역08-01]', '[9도03-01]']), 3, bank).map((r) => r.id)).toEqual(['s1', 'd1', 'h1'])
  })
  it('실제 은행: 중학교 사회 세트가 [9도] 성취기준만 고르면 논술형 첫 예시는 도덕(은행의 도덕 예시는 모두 논술형)', () => {
    const first = selectExemplars({ ...q(['[9도03-01]', '[9도03-02]']), kind: '논술형' }, 2)[0]
    expect(first.subject).toBe('도덕')
    expect(first.standard_codes).toContain('[9도03-01]')
  })
  it('성취수준은 코드 글자 도 → 도덕 파일에서 읽는다(초·중), 고등학교 윤리 과목은 자료가 없어 null', () => {
    const mid = getLevels('[9도03-01]')
    expect(mid!.subject).toBe('도덕'); expect(mid!.school_level).toBe('중')
    const elem = getLevels('[4도01-01]')
    expect(elem!.subject).toBe('도덕'); expect(elem!.school_level).toBe('초')
    expect(getLevels('[12현윤01-01]')).toBeNull()
  })
})

// ── 마이그레이션 0015 전의 DB: enum 에 '도덕'이 없으면 조회가 오류가 된다 ─────────────────────────────
type Row = Record<string, unknown>
type Result = { data: Row[] | null; error: { code: string; message: string } | null }
/** 가짜 standards 표. enumValues 에 없는 값을 .in('subject', …)에 넣으면 Postgres 처럼 22P02 오류를 돌려준다. */
function fakeDb(rows: Row[], enumValues: string[]) {
  const calls: string[][] = []
  const from = () => {
    const filters: ((r: Row) => boolean)[] = []
    let bad: string | null = null
    let range: [number, number] | null = null
    const b = {
      select: () => b,
      eq: (c: string, v: unknown) => { filters.push((r) => r[c] === v); return b },
      in: (c: string, vs: string[]) => {
        calls.push([...vs])
        if (c === 'subject') bad = vs.find((v) => !enumValues.includes(v)) ?? bad
        filters.push((r) => vs.includes(r[c] as string))
        return b
      },
      order: () => b,
      range: (from: number, to: number) => { range = [from, to]; return b },
      then: (res: (v: Result) => unknown, rej?: (e: unknown) => unknown) => {
        const out: Result = bad !== null
          ? { data: null, error: { code: '22P02', message: `invalid input value for enum subject: "${bad}"` } }
          : { data: rows.filter((r) => filters.every((f) => f(r))).slice(range?.[0] ?? 0, (range?.[1] ?? Infinity) + 1), error: null }
        return Promise.resolve(out).then(res, rej)
      },
    }
    return b
  }
  return { from, calls }
}
const dbRows: Row[] = [
  { code: '[9사(일사)10-01]', subject: '사회', level: '중' }, { code: '[9역08-01]', subject: '한국사', level: '중' },
  { code: '[9역03-01]', subject: '세계사', level: '중' }, { code: '[9도03-01]', subject: '도덕', level: '중' },
  { code: '[4도01-01]', subject: '도덕', level: '초' },
]
const OLD_ENUM = ['국어', '영어', '수학', '과학', '사회', '한국사', '세계사']
const pickerQuery = (db: ReturnType<typeof fakeDb>) => (subjects: string[]) =>
  fetchAll<Row>((from, to) => db.from().select().eq('level', '중').in('subject', subjects).order().range(from, to) as unknown as PromiseLike<Result>)

describe('enum 에 도덕이 없을 때(0015 전)', () => {
  it('missingEnumValue 는 그 오류만 알아본다', () => {
    expect(missingEnumValue({ code: '22P02', message: 'invalid input value for enum subject: "도덕"' })).toBe('도덕')
    expect(missingEnumValue(Object.assign(new Error('invalid input value for enum subject: "도덕"'), { code: '22P02' }))).toBe('도덕')
    expect(missingEnumValue({ code: '42P01', message: 'relation "standards" does not exist' })).toBeNull()
    expect(missingEnumValue({ code: '22P02', message: 'invalid input syntax for type uuid: "x"' })).toBeNull()
    expect(missingEnumValue(null)).toBeNull(); expect(missingEnumValue('boom')).toBeNull()
  })
  it('고르기 화면 조회: 0015 전에는 도덕을 빼고 다시 읽어 사회·역사 성취기준이 그대로 보인다(기록 한 줄)', async () => {
    const db = fakeDb(dbRows, OLD_ENUM)
    const log = vi.fn()
    const rows = await withOptionalSubjects(standardSubjectsFor('사회'), pickerQuery(db), log)
    expect(rows.map((r) => r.code)).toEqual(['[9사(일사)10-01]', '[9역08-01]', '[9역03-01]'])
    expect(db.calls).toEqual([['사회', '한국사', '세계사', '도덕'], ['사회', '한국사', '세계사']])
    expect(log).toHaveBeenCalledTimes(1)
    expect(log.mock.calls[0][0]).toContain('0015')
  })
  it('0015 뒤에는 첫 조회가 그대로 성공하고 도덕 성취기준이 함께 온다(다시 읽지 않음)', async () => {
    const db = fakeDb(dbRows, [...OLD_ENUM, '도덕'])
    const log = vi.fn()
    const rows = await withOptionalSubjects(standardSubjectsFor('사회'), pickerQuery(db), log)
    expect(rows.map((r) => r.code)).toEqual(['[9사(일사)10-01]', '[9역08-01]', '[9역03-01]', '[9도03-01]'])
    expect(db.calls.length).toBe(1)
    expect(log).not.toHaveBeenCalled()
  })
  it('던지지 않고 { error } 를 돌려주는 조회에도 똑같이 동작한다', async () => {
    const db = fakeDb(dbRows, OLD_ENUM)
    const r = await withOptionalSubjects(standardSubjectsFor('사회'), (subjects) => db.from().select().in('subject', subjects) as unknown as PromiseLike<Result>, () => {})
    expect(r.error).toBeNull()
    expect(r.data!.length).toBe(3)
  })
  it('다른 오류는 삼키지 않는다 — 던진 것은 다시 던지고, 돌려준 것은 그대로 돌려준다(다시 읽지 않음)', async () => {
    let n = 0
    await expect(withOptionalSubjects(['사회', '도덕'], async () => { n++; throw new Error('boom') }, () => {})).rejects.toThrow('boom')
    expect(n).toBe(1)
    const other = { data: null, error: { code: '22P02', message: 'invalid input value for enum subject: "윤리"' } }
    expect(await withOptionalSubjects(['사회', '도덕'], async () => other, () => {})).toBe(other)
    // 다른 과목 조회에는 뺄 값이 없다
    const db = fakeDb(dbRows, ['국어'])
    await expect(withOptionalSubjects(['수학'], pickerQuery(db), () => {})).rejects.toThrow(/invalid input value for enum/)
  })
  it('원장 문항 찾기의 과목 필터는 도덕을 넣지 않아 0015 전에도 오류가 없다', async () => {
    const sets: Row[] = [{ id: 'a', subject: '사회' }, { id: 'b', subject: '세계사' }, { id: 'c', subject: '수학' }]
    const db = fakeDb(sets, OLD_ENUM)
    const r = await (db.from().select().in('subject', setSubjectsFor('사회')) as unknown as PromiseLike<Result>)
    expect(r.error).toBeNull()
    expect(r.data!.map((x) => x.id)).toEqual(['a', 'b'])
  })
  it('fetchAll 은 PostgREST 오류 객체의 문구와 코드를 잃지 않는다', async () => {
    const err = await fetchAll(async () => ({ data: null, error: { code: '22P02', message: 'invalid input value for enum subject: "도덕"' } })).catch((e) => e)
    expect(err).toBeInstanceOf(Error)
    expect((err as Error).message).toContain('"도덕"')
    expect((err as { code?: string }).code).toBe('22P02')
  })
})
