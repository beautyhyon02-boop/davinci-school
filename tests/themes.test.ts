import { describe, it, expect } from 'vitest'
import { parseTheme, canCreateSet, validateStandardSelection, validateStandardIds, THEME_FIELDS } from '@/lib/studio/themes'

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
