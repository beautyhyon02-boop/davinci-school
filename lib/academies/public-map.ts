import type { SupabaseClient } from '@supabase/supabase-js'
import { isSido } from './sido'
import type { MapAcademy } from './map-group'

/** 함수가 없어서 난 오류인가(마이그레이션 0021 전). PostgREST PGRST202. */
function isMissingFunction(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const e = error as { code?: unknown; message?: unknown }
  if (e.code === 'PGRST202') return true
  return typeof e.message === 'string' && /could not find the function/i.test(e.message)
}

/** 비로그인 지도용 읽기(설계 2026-10-25 §4.3). 함수 없음·오류는 빈 목록 — 화면은 지도 칸을 그리지 않는다. */
export async function loadMapAcademies(db: SupabaseClient): Promise<MapAcademy[]> {
  try {
    const { data, error } = await db.rpc('public_map_academies')
    if (error) {
      if (!isMissingFunction(error)) console.error('[public_map_academies] read failed', error)
      return []
    }
    const rows = Array.isArray(data) ? (data as { name: string; sido: string; website: string }[]) : []
    return rows.filter((r): r is MapAcademy => isSido(r.sido)).map((r) => ({ name: r.name, sido: r.sido, website: r.website ?? '' }))
  } catch (e) {
    console.error('[public_map_academies] read failed', e)
    return []
  }
}
