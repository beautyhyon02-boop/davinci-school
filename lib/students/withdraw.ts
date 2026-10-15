/**
 * 퇴원 처리(대표 2026-10-15): 학생 줄을 지우지 않고 enrolled=false 로 두고 로그인을 막는다 — 답안·채점·리포트 기록은 남는다.
 * (assignments.student_id → students 에 cascade 가 없어 하드 삭제는 어차피 막힌다.) 되돌리기는 본사가 enrolled=true + ban 해제로.
 */
/** Supabase admin.updateUserById 의 ban_duration — 사실상 영구(100년). 'none' 이면 해제. */
export const WITHDRAW_BAN_DURATION = '876000h'

import type { SupabaseClient } from '@supabase/supabase-js'

type Db = Pick<SupabaseClient, 'from'>

/** 주어진 학생 id 중 재원(enrolled=true)인 것만. 목록·수를 셀 때 퇴원 학생을 빼는 데 쓴다. 읽기 오류는 던진다(빈 집합으로 모두 빼 버리지 않는다). */
export async function enrolledIds(db: Db, ids: string[]): Promise<Set<string>> {
  const out = new Set<string>()
  for (let i = 0; i < ids.length; i += 100) {   // id 목록은 100개씩(주소 길이), 한 묶음은 1000줄 한도 안
    const { data, error } = await db.from('students').select('profile_id').in('profile_id', ids.slice(i, i + 100)).eq('enrolled', true).order('profile_id')
    if (error) throw error
    for (const r of (data ?? []) as { profile_id: string }[]) out.add(r.profile_id)
  }
  return out
}

/** 배정 화면용: 퇴원(enrolled=false)한 학생의 줄만 뺀다. students 가 없거나 enrolled 가 없으면(옛 질의) 남긴다. */
export function enrolledOnly<T extends { students?: { enrolled?: boolean | null } | null }>(rows: T[]): T[] {
  return rows.filter((r) => r.students?.enrolled !== false)
}
