// tests/red-filename.test.ts
// 대표 2026-10-15: RED 보고서(학생용 작성양식 + 교사용 완성보고서 docx)를 홈페이지 탐구보고서 페이지에 원장만 보게 올린다 — BASIC(초등)/ADVANCED(중고등).
// 생성기(다빈치스쿨 홈페이지 구축/RED 보고서/_생성기/build.js)의 파일 이름 "RED Basic {series}_{stem} {종류}({수준}).docx"에서 칸을 읽는다.
// PRD 2026-10-16(RED 자료실): 종류 R/E/D 와 수준 낱말이 든 새 틀 "RED E Advanced_{series}_{stem} {종류}.docx" 도 읽는다. 옛 틀은 종류 E(소논문).
import { describe, it, expect } from 'vitest'
import { parseRedFilename, redSetKey, groupRedSets, redStoragePath, type RedReportRow } from '@/lib/red/reports'

describe('parseRedFilename', () => {
  it('교사용 완성보고서(초등) → BASIC·teacher, 시리즈·과목·제목', () => {
    expect(parseRedFilename('RED Basic 과학뉴스 지구과학_엘니뇨 바다가 뜨거워지면 내년이 더 더워진다고 교사용 완성보고서(초등).docx')).toEqual({
      ok: true, category: 'BASIC', kind: 'teacher', series: '과학뉴스', subject: '지구과학', title: '엘니뇨 바다가 뜨거워지면 내년이 더 더워진다고', redType: 'E',
    })
  })
  it('새 틀(PRD): RED {R|E|D} {Basic|Advanced}_{시리즈 과목}_{제목} {종류}.docx — 수준 낱말로 구분, 글자로 종류; 끝에 (초등) 이 붙어도 된다', () => {
    expect(parseRedFilename('RED E Advanced_과학뉴스 생명과학_걸을 때마다 혈액순환을 읽는 스마트 신발 교사용 완성보고서.docx')).toEqual({
      ok: true, category: 'ADVANCED', kind: 'teacher', series: '과학뉴스', subject: '생명과학', title: '걸을 때마다 혈액순환을 읽는 스마트 신발', redType: 'E',
    })
    expect(parseRedFilename('RED R Basic_독서_어린 왕자 학생용 작성양식(초등).docx')).toMatchObject({ ok: true, category: 'BASIC', kind: 'student', series: '독서', subject: '', title: '어린 왕자', redType: 'R' })
    expect(parseRedFilename('RED D Advanced_인문사회뉴스 사회_청소년 선거권 교사용 완성보고서.docx')).toMatchObject({ ok: true, redType: 'D', category: 'ADVANCED', series: '인문사회뉴스', subject: '사회' })
    expect(parseRedFilename('RED X Basic_독서_제목 교사용 완성보고서.docx')).toEqual({ ok: false, reason: 'pattern' })
  })
  it('시리즈와 과목은 띄어쓰기로 — 밑줄로 나누면 첫 밑줄까지가 시리즈, 나머지는 제목(검토 2026-10-16, 생성기 작성자가 알 것)', () => {
    expect(parseRedFilename('RED E Advanced_과학뉴스_생명과학_제목 교사용 완성보고서.docx')).toMatchObject({ ok: true, series: '과학뉴스', subject: '', title: '생명과학_제목' })
  })
  it('확장자 앞 공백은 지우고 읽는다; 수준 낱말과 괄호가 어긋나면(Basic 인데 (중고등)) 거부', () => {
    expect(parseRedFilename('RED E Advanced_과학뉴스 생명과학_제목 교사용 완성보고서 .docx')).toMatchObject({ ok: true, category: 'ADVANCED' })
    expect(parseRedFilename('RED E Basic_과학뉴스 생명과학_제목 교사용 완성보고서(중고등).docx')).toEqual({ ok: false, reason: 'pattern' })
  })
  it('학생용 작성양식, 제목에 괄호·번호가 있어도 그대로', () => {
    expect(parseRedFilename('RED Basic 사물놀이 물리_01 줄로 떠 있는 구조물(텐세그리티) 학생용 작성양식(초등).docx')).toEqual({
      ok: true, category: 'BASIC', kind: 'student', series: '사물놀이', subject: '물리', title: '01 줄로 떠 있는 구조물(텐세그리티)', redType: 'E',
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
    report_date: '2026-10-15', storage_path: 'red/x', red_type: 'E', status: 'published', hold_note: '', published_at: '2026-10-15T01:00:00Z', summary: '', source_links: [], created_by: 'a1',
    size_bytes: 1000, uploaded_at: '2026-10-15T01:00:00Z', ...over,
  })
  it('같은 구분·시리즈·과목·제목이면 같은 키', () => {
    expect(redSetKey(row({ kind: 'teacher' }))).toBe(redSetKey(row({ kind: 'student' })))
    expect(redSetKey(row({ category: 'ADVANCED' }))).not.toBe(redSetKey(row({})))
    expect(redSetKey(row({ red_type: 'R' }))).not.toBe(redSetKey(row({})))   // 종류가 다르면 다른 세트
  })
  it('세트별로 묶어 최신 날짜가 앞에 오고, 게시되지 않은 파일(검수대기·보류)은 빠지며, 한쪽만 있는 세트도 보인다', () => {
    const rows = [
      row({ id: 't1', kind: 'teacher' }), row({ id: 's1', kind: 'student' }),
      row({ id: 't2', kind: 'teacher', title: '엘니뇨', series: '과학뉴스', subject: '지구과학', report_date: '2026-10-16' }),
      row({ id: 'h', kind: 'student', title: '엘니뇨', series: '과학뉴스', subject: '지구과학', report_date: '2026-10-16', status: 'hold' }),
      row({ id: 'p', kind: 'teacher', title: '검수 전', report_date: '2026-10-17', status: 'pending' }),
    ]
    const sets = groupRedSets(rows)
    expect(sets.map((s) => s.title)).toEqual(['엘니뇨', '01 줄로 떠 있는 구조물(텐세그리티)'])
    expect(sets[0].teacher?.id).toBe('t2'); expect(sets[0].student).toBeNull()
    expect(sets[1].teacher?.id).toBe('t1'); expect(sets[1].student?.id).toBe('s1')
    expect(sets[0].date).toBe('2026-10-16'); expect(sets[0].category).toBe('BASIC'); expect(sets[0].redType).toBe('E'); expect(sets[0].summary).toBe('')
  })
  it('구분으로 거른다', () => {
    const rows = [row({ id: 'b' }), row({ id: 'a', category: 'ADVANCED', title: '다른 것' })]
    expect(groupRedSets(rows, 'ADVANCED').map((s) => s.teacher?.id)).toEqual(['a'])
  })
})

describe('redStoragePath — ASCII id 로만(Storage 키에 한글 불가)', () => {
  it('red/{구분}/{날짜}/{id}.docx, id 의 이상한 문자는 _ 로', () => {
    expect(redStoragePath('BASIC', '2026-10-15', '3f2a1c0e-1111-2222-3333-444455556666')).toBe('red/BASIC/2026-10-15/3f2a1c0e-1111-2222-3333-444455556666.docx')
    expect(redStoragePath('ADVANCED', '2026-10-15', '../한글 id:x')).toBe('red/ADVANCED/2026-10-15/..____id_x.docx')   // / 한 글 공백 : → _
  })
})
