import { describe, it, expect } from 'vitest'
import { classifyHistory, codesToUpdate, WORLD_HISTORY_9YEOK_MAX_DOMAIN } from '@/scripts/reclassify-history'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { standardsSchema } from '@/lib/standards/parse'

// 기대값 근거: [별책7] 사회과 교육과정.pdf 물리 79쪽(인쇄쪽수 73)
// "역사과 교육과정 설계의 개요" — 세계사 관련 영역(9역03~07)/한국사 관련
// 영역(9역08~13) 명시, 그리고 실제 성취기준 문장 대조(9역02는 "선사 문화
// 및 문명의 형성", "서아시아⋅지중해 세계" 등 한국 특정 내용 없이 전부
// 세계 문명 비교). 자세한 근거는 data/standards/README.md "역사 분리" 절.
describe('classifyHistory', () => {
  it('중학교 역사: [9역02](문명의 발생과 고대 세계의 형성) → 세계사', () => {
    expect(classifyHistory('[9역02-01]', '선사 문화 및 문명의 형성을 이해하고, 각 문명의 특징을 비교한다.')).toBe(
      '세계사'
    )
  })

  it('중학교 역사: [9역06](세계 대전과 사회 변동) → 세계사', () => {
    expect(
      classifyHistory('[9역06-01]', '20세기 전반 세계 질서의 변화를 두 차례의 세계 대전을 중심으로 파악한다.')
    ).toBe('세계사')
  })

  it('중학교 역사: [9역08](국가의 형성과 발전) → 한국사', () => {
    expect(classifyHistory('[9역08-01]', '고조선과 여러 나라의 형성 과정 및 사회 모습을 탐구한다.')).toBe('한국사')
  })

  it('중학교 역사: [9역13](근⋅현대 사회로의 전환) → 한국사', () => {
    expect(classifyHistory('[9역13-01]', '근⋅현대 사회로의 전환')).toBe('한국사')
  })

  it('고등학교 한국사1: [10한사1-01-01] → 한국사', () => {
    expect(
      classifyHistory('[10한사1-01-01]', '전근대 한국사의 정치적 변동과 세계사적 상호 작용을 탐구한다.')
    ).toBe('한국사')
  })

  it('고등학교 한국사2: [10한사2-02-01] → 한국사', () => {
    expect(classifyHistory('[10한사2-02-01]', '대한민국의 발전')).toBe('한국사')
  })

  it('고등학교 동아시아 역사 기행: [12동역01-01] → 세계사(동아시아 지역사, 한국 단독 아님)', () => {
    expect(
      classifyHistory('[12동역01-01]', '역사 기행을 통한 탐구의 방법을 이해하고, 동아시아의 범위와 특징을 파악한다.')
    ).toBe('세계사')
  })

  it('고등학교 역사로 탐구하는 현대 세계: [12역현01-01] → 세계사(전지구적 현대사)', () => {
    expect(classifyHistory('[12역현01-01]', '현대 세계와 역사 탐구')).toBe('세계사')
  })

  it('고등학교 세계사(일반선택): [12세사01-01] → 세계사', () => {
    expect(classifyHistory('[12세사01-01]', '')).toBe('세계사')
  })

  it('영역 경계 상수가 07이다(README의 9역01~07=세계사, 9역08~13=한국사와 일치)', () => {
    expect(WORLD_HISTORY_9YEOK_MAX_DOMAIN).toBe(7)
  })

  it('알 수 없는 라벨은 에러를 던진다(추측으로 분류하지 않음)', () => {
    expect(() => classifyHistory('[9사01-01]', '')).toThrow()
  })
})

describe('codesToUpdate', () => {
  it('세계사.json 59건(역사 46 + [12세사] 13)에서 code 59개를 그대로 뽑는다', () => {
    const dir = join(__dirname, '..', 'data', 'standards')
    const rows = standardsSchema.parse(JSON.parse(readFileSync(join(dir, '세계사.json'), 'utf8')))
    const codes = codesToUpdate(rows)
    expect(codes).toHaveLength(59)
    expect(new Set(codes).size).toBe(59)
    expect(codes).toContain('[9역01-01]')
    expect(codes).toContain('[12역현01-01]')
    expect(codes.filter((c) => c.startsWith('[12세사'))).toHaveLength(13)
    // [12세사]는 더 이상 사회.json에 없다
    const social = standardsSchema.parse(JSON.parse(readFileSync(join(dir, '사회.json'), 'utf8')))
    expect(social.some((r) => r.code.startsWith('[12세사'))).toBe(false)
    expect(social).toHaveLength(307)
  })

  it('subject가 세계사가 아닌 행이 섞여 있으면 던진다', () => {
    const bad = [
      { level: '중' as const, subject: '한국사' as const, grade_band: '1-3', domain: '', code: '[9역08-01]', text: '고조선과 여러 나라의 형성 과정 및 사회 모습을 탐구한다.' },
    ]
    expect(() => codesToUpdate(bad)).toThrow()
  })
})
