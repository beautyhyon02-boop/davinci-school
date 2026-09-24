import { describe, it, expect } from 'vitest'
import { parseTheme, parseThemeGrade, gradeOptions, GRADE_NONE, canCreateSet, validateStandardSelection, validateStandardIds, parseSharedMaterialsInput, sharedMaterialsJson, addThemeSubjects, removeThemeSubject, THEME_FIELDS } from '@/lib/studio/themes'
import { app } from '@/content/site'
import { SCHOOL_BANDS, gradeLabel } from '@/lib/studio/level-map'

function fd(o: Record<string, string | string[]>) {
  const f = new FormData()
  for (const [k, v] of Object.entries(o)) {
    if (Array.isArray(v)) for (const item of v) f.append(k, item)
    else f.set(k, v)
  }
  return f
}

describe('parseTheme', () => {
  it('accepts a valid theme (초 3학년, 국어+수학)', () => {
    const r = parseTheme(fd({
      [THEME_FIELDS.title]: '기후 위기',
      [THEME_FIELDS.level]: '초',
      [THEME_FIELDS.grade]: '3',
      [THEME_FIELDS.subjects]: ['국어', '수학'],
    }))
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.data.title).toBe('기후 위기')
      expect(r.data.level).toBe('초')
      expect(r.data.grade).toBe(3)
      expect(r.data.subjects).toEqual(['국어', '수학'])
    }
  })

  it('dedupes repeated subjects', () => {
    const r = parseTheme(fd({
      [THEME_FIELDS.title]: '기후 위기',
      [THEME_FIELDS.level]: '초',
      [THEME_FIELDS.grade]: '3',
      [THEME_FIELDS.subjects]: ['국어', '국어'],
    }))
    expect(r.ok && r.data.subjects).toEqual(['국어'])
  })

  it('rejects grade out of range for 중 (중 4학년은 없음)', () => {
    const r = parseTheme(fd({
      [THEME_FIELDS.title]: '기후 위기',
      [THEME_FIELDS.level]: '중',
      [THEME_FIELDS.grade]: '4',
      [THEME_FIELDS.subjects]: ['국어'],
    }))
    expect(r.ok).toBe(false)
  })

  it('rejects when no subjects selected', () => {
    const r = parseTheme(fd({
      [THEME_FIELDS.title]: '기후 위기',
      [THEME_FIELDS.level]: '초',
      [THEME_FIELDS.grade]: '3',
    }))
    expect(r.ok).toBe(false)
  })

  it('rejects an unknown subject', () => {
    const r = parseTheme(fd({
      [THEME_FIELDS.title]: '기후 위기',
      [THEME_FIELDS.level]: '초',
      [THEME_FIELDS.grade]: '3',
      [THEME_FIELDS.subjects]: ['음악'],
    }))
    expect(r.ok).toBe(false)
  })
})

describe('canCreateSet', () => {
  const theme = { subjects: ['국어', '수학'] }

  it('allows a subject that is in the theme and has no set yet', () => {
    expect(canCreateSet(theme, '국어', []).ok).toBe(true)
  })

  it('rejects a subject not in the theme', () => {
    const r = canCreateSet(theme, '과학', [])
    expect(r.ok).toBe(false)
    expect(r.reason).toBeTruthy()
  })

  it('rejects a duplicate (set already exists for the subject)', () => {
    const r = canCreateSet(theme, '국어', ['국어'])
    expect(r.ok).toBe(false)
    expect(r.reason).toBeTruthy()
  })
})

describe('validateStandardSelection', () => {
  const theme = { level: '초', subject: '수학' }
  const std = (over: Partial<{ code: string; level: string; subject: string; verified: boolean }> = {}) =>
    ({ code: '[4수01-01]', level: '초', subject: '수학', verified: true, ...over })

  it('flags a single standard as too few (needs 2~6)', () => {
    const r = validateStandardSelection([std()], theme)
    expect(r.ok).toBe(false)
    expect(r.issues.length).toBeGreaterThan(0)
  })

  it('flags 7 standards as too many', () => {
    const seven = Array.from({ length: 7 }, (_, i) => std({ code: `[4수01-0${i}]` }))
    const r = validateStandardSelection(seven, theme)
    expect(r.ok).toBe(false)
  })

  it('flags a level mismatch', () => {
    const two = [std(), std({ code: '[6수01-01]', level: '고' })]
    const r = validateStandardSelection(two, theme)
    expect(r.ok).toBe(false)
    expect(r.issues.length).toBeGreaterThan(0)
  })

  it('flags a subject mismatch', () => {
    const two = [std(), std({ code: '[4국01-01]', subject: '국어' })]
    const r = validateStandardSelection(two, theme)
    expect(r.ok).toBe(false)
  })

  it('treats unverified standards as a warning only, not an issue', () => {
    const two = [std(), std({ code: '[4수01-02]', verified: false })]
    const r = validateStandardSelection(two, theme)
    expect(r.ok).toBe(true)
    expect(r.issues).toEqual([])
    expect(r.warnings.length).toBe(1)
  })

  it('accepts a valid 2~6 selection with no mismatches', () => {
    const two = [std(), std({ code: '[4수01-02]' })]
    const r = validateStandardSelection(two, theme)
    expect(r.ok).toBe(true)
    expect(r.issues).toEqual([])
  })

  it('requires theme.subject at the type level (no optional subject)', () => {
    // @ts-expect-error subject는 필수 필드다 — 과목 불일치 검사를 건너뛰지 못하게 한다.
    validateStandardSelection([std(), std()], { level: '초' })
  })
})

describe('validateStandardIds', () => {
  it('dedupes requested ids and returns them when all resolve', () => {
    const r = validateStandardIds(['a', 'b', 'a'], ['a', 'b', 'c'])
    expect(r.ok).toBe(true)
    expect(r.ok && r.ids).toEqual(['a', 'b'])
  })

  it('rejects when an id did not resolve to a standards row', () => {
    const r = validateStandardIds(['a', 'x'], ['a', 'b'])
    expect(r.ok).toBe(false)
  })

  it('rejects an empty selection', () => {
    expect(validateStandardIds([], []).ok).toBe(false)
  })
})

describe('parseSharedMaterialsInput / sharedMaterialsJson', () => {
  const materialA = { id: 'A', title: '설문 결과', kind: 'text' as const, body: '본문', table: null, source: '자작' as const }

  it('accepts the 2A wrapper shape ({ materials: [...] })', () => {
    const r = parseSharedMaterialsInput(JSON.stringify({ materials: [materialA] }))
    expect(r.ok).toBe(true)
    expect(r.ok && r.materials.map((m) => m.id)).toEqual(['A'])
    expect(r.ok && r.materials[0].images).toEqual([])
    // DB 에 저장된 v1 자료(source: '자작')는 v2 source 객체로 올라간다
    expect(r.ok && r.materials[0].source).toEqual({ kind: '자작', attribution: null, ai_assisted: false })
    expect(r.ok && r.materials[0].role).toBe('raw')
  })

  it('rejects a v1 string source that is not 자작 (공개 needs an attribution)', () => {
    expect(parseSharedMaterialsInput(JSON.stringify([{ ...materialA, source: '공개' }])).ok).toBe(false)
  })

  it('accepts a bare array — what themes.materials actually stores', () => {
    const r = parseSharedMaterialsInput(JSON.stringify([materialA]))
    expect(r.ok).toBe(true)
    expect(r.ok && r.materials.map((m) => m.id)).toEqual(['A'])
  })

  it('round-trips: save → seed the textarea → save again succeeds with the same materials', () => {
    const first = parseSharedMaterialsInput(JSON.stringify({ materials: [materialA] }))
    expect(first.ok).toBe(true)
    if (!first.ok) return
    // 저장은 배열만 남긴다(themes.materials). 화면은 그 배열을 다시 textarea 로 내려 준다.
    const seeded = sharedMaterialsJson(first.materials)
    const second = parseSharedMaterialsInput(seeded)
    expect(second.ok).toBe(true)
    expect(second.ok && second.materials).toEqual(first.materials)
  })

  it('seeds an empty wrapper when the theme has no materials yet', () => {
    expect(JSON.parse(sharedMaterialsJson(null))).toEqual({ materials: [] })
    const r = parseSharedMaterialsInput(sharedMaterialsJson(null))
    expect(r.ok).toBe(false) // 자료 0개는 스키마상 저장 대상이 아니다(min 1) — 빈 칸을 저장하려는 실수를 막는다
  })

  it('rejects invalid JSON and shapes that are not materials', () => {
    expect(parseSharedMaterialsInput('{').ok).toBe(false)
    expect(parseSharedMaterialsInput(JSON.stringify([{ id: 'AA', title: 'x' }])).ok).toBe(false)
  })
})

describe('addThemeSubjects', () => {
  it('appends new subjects after the existing ones, keeping the existing order', () => {
    const r = addThemeSubjects(['국어', '수학'], ['영어', '세계사'])
    expect(r.ok).toBe(true)
    expect(r.ok && r.subjects).toEqual(['국어', '수학', '영어', '세계사'])
  })

  it('dedupes an addition that is already in the theme', () => {
    const r = addThemeSubjects(['국어', '수학'], ['수학', '영어'])
    expect(r.ok).toBe(true)
    expect(r.ok && r.subjects).toEqual(['국어', '수학', '영어'])
  })

  it('dedupes repeated entries within the addition list itself', () => {
    const r = addThemeSubjects(['국어'], ['영어', '영어'])
    expect(r.ok).toBe(true)
    expect(r.ok && r.subjects).toEqual(['국어', '영어'])
  })

  it('rejects an empty addition list', () => {
    expect(addThemeSubjects(['국어'], []).ok).toBe(false)
  })

  it('rejects when every addition is already in the theme (nothing left to add)', () => {
    expect(addThemeSubjects(['국어', '수학'], ['국어']).ok).toBe(false)
  })

  it('rejects an unknown subject', () => {
    expect(addThemeSubjects(['국어'], ['음악']).ok).toBe(false)
  })
})

describe('removeThemeSubject', () => {
  const remove = app.studio.theme.addSubjects.remove

  it('removes a subject that has no set, keeping the order of the rest', () => {
    const r = removeThemeSubject(['국어', '수학', '과학', '세계사'], '과학', ['수학'])
    expect(r).toEqual({ ok: true, subjects: ['국어', '수학', '세계사'] })
  })

  it('refuses a subject that already has a set', () => {
    expect(removeThemeSubject(['수학', '과학'], '수학', ['수학'])).toEqual({ ok: false, error: remove.hasSet })
  })

  it('refuses a subject that is not in the theme', () => {
    const r = removeThemeSubject(['수학', '과학'], '영어', [])
    expect(r.ok).toBe(false)
    expect(!r.ok && r.error).toBe(app.studio.errors.subjectNotInTheme)
  })

  it('refuses to remove the last subject', () => {
    expect(removeThemeSubject(['수학'], '수학', [])).toEqual({ ok: false, error: remove.lastSubject })
  })
})

describe('학년 선택(대표 2026-09-26): 대주제는 학교급만 필수, 학년은 선택', () => {
  const base = { [THEME_FIELDS.title]: '학교 축제', [THEME_FIELDS.subjects]: ['수학'] }
  it('parseTheme reads an empty grade, "none" or a missing field as null (학년 지정 안 함)', () => {
    for (const grade of ['', GRADE_NONE, ' none ']) {
      const r = parseTheme(fd({ ...base, [THEME_FIELDS.level]: '중', [THEME_FIELDS.grade]: grade }))
      expect(r.ok && r.data.grade, JSON.stringify(grade)).toBeNull()
    }
    const missing = parseTheme(fd({ ...base, [THEME_FIELDS.level]: '초' }))
    expect(missing.ok && missing.data.grade).toBeNull()
  })
  it('parseTheme still keeps a set grade and rejects one outside the school level', () => {
    const r = parseTheme(fd({ ...base, [THEME_FIELDS.level]: '중', [THEME_FIELDS.grade]: '2' }))
    expect(r.ok && r.data.grade).toBe(2)
    expect(parseTheme(fd({ ...base, [THEME_FIELDS.level]: '중', [THEME_FIELDS.grade]: '5' })).ok).toBe(false)
    expect(parseTheme(fd({ ...base, [THEME_FIELDS.level]: '중', [THEME_FIELDS.grade]: '1.5' })).ok).toBe(false)
  })
  it('parseThemeGrade (학년 바꾸기의 순수 부분): none → null, 범위 안 숫자 → 숫자, 그 밖 → gradeInvalid', () => {
    expect(parseThemeGrade('중', GRADE_NONE)).toEqual({ ok: true, grade: null })
    expect(parseThemeGrade('중', null)).toEqual({ ok: true, grade: null })
    expect(parseThemeGrade('중', '3')).toEqual({ ok: true, grade: 3 })
    expect(parseThemeGrade('초', '6')).toEqual({ ok: true, grade: 6 })
    expect(parseThemeGrade('중', '4')).toEqual({ ok: false, error: app.studio.errors.gradeInvalid })
    expect(parseThemeGrade('중', 'abc')).toEqual({ ok: false, error: app.studio.errors.gradeInvalid })
    expect(parseThemeGrade('대', '1')).toEqual({ ok: false, error: app.studio.errors.levelInvalid })
  })
  it('gradeOptions lists the grades of each school level', () => {
    expect(gradeOptions('초')).toEqual([1, 2, 3, 4, 5, 6])
    expect(gradeOptions('중')).toEqual([1, 2, 3])
  })
  it('the create form offers "학년 지정 안 함(학년군 전체)" and the theme page has a 학년 바꾸기 control', () => {
    expect(app.studio.newTheme.gradeNone).toBe('학년 지정 안 함(학년군 전체)')
    expect(app.studio.theme.gradeEdit.label).toBe('학년 바꾸기')
  })
  it('theme header wording: "중 1학년" when set, "중등 · 1~3학년군" / "초등 · 3~6학년" when unset', () => {
    expect(app.studio.theme.meta('중', 1)).toBe('중 1학년')
    expect(app.studio.theme.meta('중', null)).toBe('중등 · 1~3학년군')
    expect(app.studio.theme.meta('초', null)).toBe('초등 · 3~6학년')
    expect(app.teacherItems.card.meta('중', null)).toBe('중등 · 1~3학년군')
  })
  it('UI band words (content/site.ts) match the prompt band words (level-map SCHOOL_BANDS)', () => {
    for (const level of ['초', '중', '고'] as const) {
      expect(app.studio.gradeBand[level]?.school).toBe(SCHOOL_BANDS[level].school)
      expect(app.studio.gradeBand[level]?.band).toBe(SCHOOL_BANDS[level].band)
      expect(app.packageView.cover.meta(level, null, '수학')).toBe(`${gradeLabel(level, null)} · 수학`)
    }
  })
})
