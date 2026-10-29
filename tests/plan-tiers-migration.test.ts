import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// 마이그레이션 0022(대표 2026-10-29): 가맹 상품 두 단계. 파일 글자만 확인한다(DB 에는 연결하지 않는다).
const sql = readFileSync(join(process.cwd(), 'supabase/migrations/20261029000022_plan_tiers.sql'), 'utf8')

const OLD_PLAN = ['essay', 'only'].join('_') // 옛 값 글자가 코드 쪽에 남지 않도록 쪼갠다

describe('0022 plan_tiers', () => {
  it('옛 값은 davinci(다빈치올)로 옮긴다', () => {
    expect(sql).toContain(`update academies set plan = 'davinci' where plan = '${OLD_PLAN}'`)
  })
  it('check 는 두 값, 기본은 davinci_basic', () => {
    expect(sql).toContain(`drop constraint if exists academies_plan_check`)
    expect(sql).toContain(`check (plan in ('davinci', 'davinci_basic'))`)
    expect(sql).toContain(`set default 'davinci_basic'`)
  })
  it('resources 정책은 두 상품 모두 읽게', () => {
    expect(sql).toContain(`current_academy_plan() in ('davinci', 'davinci_basic')`)
    const policies = [...sql.matchAll(/(?:create|drop)\s+policy(?:\s+if\s+exists)?\s+\w+\s+on\s+(\w+)/gi)].map(m => m[1])
    expect(policies.length).toBeGreaterThan(0)
    expect(new Set(policies)).toEqual(new Set(['resources']))
  })
})
