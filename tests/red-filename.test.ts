// tests/red-filename.test.ts
// 대표 2026-10-15: RED 보고서(학생용 작성양식 + 교사용 완성보고서 docx)를 홈페이지 탐구보고서 페이지에 원장만 보게 올린다 — BASIC(초등)/ADVANCED(중고등).
// 생성기(다빈치스쿨 홈페이지 구축/RED 보고서/_생성기/build.js)의 파일 이름 "RED Basic {series}_{stem} {종류}({수준}).docx"에서 칸을 읽는다.
import { describe, it, expect } from 'vitest'
import { parseRedFilename, redSetKey, groupRedSets, redStoragePath, type RedReportRow } from '@/lib/red/reports'

describe('parseRedFilename', () => {
  it('교사용 완성보고서(초등) → BASIC·teacher, 시리즈·과목·제목', () => {
    expect(parseRedFilename('RED Basic 과학뉴스 지구과학_엘니뇨 바다가 뜨거워지면 내년이 더 더워진다고 교사용 완성보고서(초등).docx')).toEqual({
      ok: true, category: 'BASIC', kind: 'teacher', series: '과학뉴스', subject: '지구과학', title: '엘니뇨 바다가 뜨거워지면 내년이 더 더워진다고',
    })
  })
  it('학생용 작성양식, 제목에 괄호·번호가 있어도 그대로', () => {
    expect(parseRedFilename('RED Basic 사물놀이 물리_01 줄로 떠 있는 구조물(텐세그리티) 학생용 작성양식(초등).docx')).toEqual({
      ok: true, category: 'BASIC', kind: 'student', series: '사물놀이', subject: '물리', title: '01 줄로 떠 있는 구조물(텐세그리티)',
    })
  })
  it('(중고등)·(중고) → ADVANCED; 시리즈 한 낱말이면 과목은 빈 값', () => {
    expect(parseRedFilename('RED Basic 인문사회_청년 일자리와 플랫폼 노동 교사용 완성보고서(중고등).docx')).toMatchObject({ ok: true, category: 'ADVANCED', kind: 'teacher', series: '인문사회', subject: '', title: '청년 일자리와 플랫폼 노동' })
    expect(parseRedFilename('RED Basic 과학뉴스 생명_수면과 기억 학생용 작성양식(중고).docx')).toMatchObject({ ok: true, category: 'ADVANCED', kind: 'student', subject: '생명' })
  })
  it('틀에 맞지 않으면 ok:false 와 까닭', () => {
    expect(parseRedFilename('보고서.docx')).toEqual({ ok: false, reason: 'pattern' })
    expect(parseRedFilename('RED Basic 과학뉴스 지구과학_제목 교사용 완성보고서(초등).pdf')).toEqual({ ok: false, reason: 'extension' })
    expect(parseRedFilename('RED Basic 과학뉴스 지구과학_제목 요약본(초등).docx')).toEqual({ ok: false, reason: 'pattern' })
  })
})

describe('redSetKey · groupRedSets — 교사용·학생용을 한 세트로 묶는다', () => {
  const row = (over: Partial<RedReportRow>): RedReportRow => ({
    id: 'x', filename: 'f.docx', category: 'BASIC', kind: 'teacher', series: '사물놀이', subject: '물리', title: '01 줄로 떠 있는 구조물(텐세그리티)',
    report_date: '2026-10-15', storage_path: 'red/x', hidden: false, size_bytes: 1000, uploaded_at: '2026-10-15T01:00:00Z', ...over,
  })
  it('같은 구분·시리즈·과목·제목이면 같은 키', () => {
    expect(redSetKey(row({ kind: 'teacher' }))).toBe(redSetKey(row({ kind: 'student' })))
    expect(redSetKey(row({ category: 'ADVANCED' }))).not.toBe(redSetKey(row({})))
  })
  it('세트별로 묶어 최신 날짜가 앞에 오고, 숨긴 파일은 빠지며, 한쪽만 있는 세트도 보인다', () => {
    const rows = [
      row({ id: 't1', kind: 'teacher' }), row({ id: 's1', kind: 'student' }),
      row({ id: 't2', kind: 'teacher', title: '엘니뇨', series: '과학뉴스', subject: '지구과학', report_date: '2026-10-16' }),
      row({ id: 'h', kind: 'student', title: '엘니뇨', series: '과학뉴스', subject: '지구과학', report_date: '2026-10-16', hidden: true }),
    ]
    const sets = groupRedSets(rows)
    expect(sets.map((s) => s.title)).toEqual(['엘니뇨', '01 줄로 떠 있는 구조물(텐세그리티)'])
    expect(sets[0].teacher?.id).toBe('t2'); expect(sets[0].student).toBeNull()
    expect(sets[1].teacher?.id).toBe('t1'); expect(sets[1].student?.id).toBe('s1')
    expect(sets[0].date).toBe('2026-10-16'); expect(sets[0].category).toBe('BASIC')
  })
  it('구분으로 거른다', () => {
    const rows = [row({ id: 'b' }), row({ id: 'a', category: 'ADVANCED', title: '다른 것' })]
    expect(groupRedSets(rows, 'ADVANCED').map((s) => s.teacher?.id)).toEqual(['a'])
  })
})

describe('redStoragePath — 경로 문자를 걸러낸다', () => {
  it('슬래시·역슬래시·콜론 등은 _ 로, 한글·괄호·공백은 그대로', () => {
    expect(redStoragePath('BASIC', '2026-10-15', 'RED Basic a_b 교사용 완성보고서(초등).docx')).toBe('red/BASIC/2026-10-15/RED Basic a_b 교사용 완성보고서(초등).docx')
    expect(redStoragePath('ADVANCED', '2026-10-15', '../..\\x:y*z?.docx')).toBe('red/ADVANCED/2026-10-15/.._.._x_y_z_.docx')
  })
})
