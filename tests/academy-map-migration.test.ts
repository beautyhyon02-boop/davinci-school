import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { SIDOS } from '@/lib/academies/sido'

// 설계 2026-10-25 §2 — 공개 함수는 이름·시도·홈페이지만 돌려준다. RLS 는 바꾸지 않는다.
const sql = readFileSync('supabase/migrations/20261025000021_academy_map.sql', 'utf8')

describe('마이그레이션 0021', () => {
  it('칸 셋을 "있으면 건너뜀"으로 더한다', () => {
    expect(sql).toMatch(/alter table academies add column if not exists sido text/)
    expect(sql).toMatch(/alter table academies add column if not exists website text not null default ''/)
    expect(sql).toMatch(/alter table academies add column if not exists show_on_map boolean not null default true/)
  })
  it('sido 의 check 는 코드의 17개와 같다', () => {
    for (const s of SIDOS) expect(sql).toContain(`'${s}'`)
  })
  it('공개 함수는 이름·시도·홈페이지만, anon 에게 실행 허용, RLS 정책은 건드리지 않는다', () => {
    expect(sql).toMatch(/create or replace function public\.public_map_academies\(\)\s*returns table \(name text, sido text, website text\)/)
    expect(sql).toMatch(/select name, sido, website from academies\s+where active and show_on_map and sido is not null/)
    expect(sql).toMatch(/grant execute on function public\.public_map_academies\(\) to anon, authenticated/)
    expect(sql).not.toMatch(/create policy|drop policy/)
    expect(sql).not.toMatch(/director_phone|code|plan/)
  })
})
