import { describe, it, expect } from 'vitest'
import { parseImportCsv, nextCodes } from '@/lib/academies/import-rows'

// 설계 2026-10-25 §6 — 대표가 주는 표(CSV UTF-8, 머리 줄: 이름,시도,홈페이지[,시/군/구][,코드])
describe('parseImportCsv', () => {
  it('머리 줄 이름으로 열을 찾고 시·도 긴 이름·주소를 정리한다', () => {
    const { rows, problems } = parseImportCsv('이름,시도,홈페이지,시/군/구\n하늘원,경기도,www.a.com,성남\n바다원,부산광역시,,해운대')
    expect(problems).toEqual([])
    expect(rows).toEqual([
      { name: '하늘원', sido: '경기', website: 'https://www.a.com/', region: '성남', code: null },
      { name: '바다원', sido: '부산', website: '', region: '해운대', code: null },
    ])
  })
  it('코드 열이 있으면 소문자로 받는다', () => {
    const { rows } = parseImportCsv('이름,시도,홈페이지,코드\n하늘원,경기,,ABC1')
    expect(rows[0].code).toBe('abc1')
  })
  it('문제 줄은 번호와 까닭을 보고하고 그 줄만 뺀다', () => {
    const { rows, problems } = parseImportCsv('이름,시도,홈페이지\n하늘원,평양,\n,경기,\n바다원,부산,javascript:x\n한라원,제주,')
    expect(rows.map((r) => r.name)).toEqual(['한라원'])
    expect(problems).toEqual(['2행: 시·도를 모름 "평양"', '3행: 이름이 비었음', '4행: 홈페이지 주소가 틀림 "javascript:x"'])
  })
  it('따옴표 안의 쉼표·BOM 을 처리한다', () => {
    const { rows } = parseImportCsv('﻿이름,시도,홈페이지\n"하늘, 원",서울,')
    expect(rows[0].name).toBe('하늘, 원')
  })
  it('CSV 안 같은 이름은 뒤쪽을 문제로 보고하고 첫 줄만 남긴다', () => {
    const { rows, problems } = parseImportCsv('이름,시도,홈페이지\n하늘원,경기,\n바다원,부산,\n하늘원,서울,')
    expect(rows.map((r) => r.name)).toEqual(['하늘원', '바다원'])
    expect(rows[0].sido).toBe('경기')
    expect(problems).toEqual(['4행: 같은 이름 "하늘원" 이 2행에도 있음'])
  })
  it('영어 머리 줄(name,sido,website)도 받는다', () => {
    const { rows, problems } = parseImportCsv('name,sido,website\nA원,경기,a.com')
    expect(problems).toEqual([])
    expect(rows).toEqual([{ name: 'A원', sido: '경기', website: 'https://a.com/', region: '', code: null }])
  })
  it('필수 열이 없으면 problems 하나', () => {
    expect(parseImportCsv('홈페이지,지역\nx,y').problems).toEqual(['머리 줄에 이름·시도 열이 없음'])
  })
})

describe('nextCodes', () => {
  it('g001 부터 비어 있는 번호', () => {
    expect(nextCodes(['dgs', 'g001', 'g003'], 3)).toEqual(['g002', 'g004', 'g005'])
  })
})
