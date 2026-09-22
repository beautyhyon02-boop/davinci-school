import type { SupabaseClient } from '@supabase/supabase-js'
import type { Snapshot } from '@/lib/studio/publish'

/** 배정이 묶인 판의 스냅샷. RLS: item_set_versions 는 게시된 세트만 authenticated 에게 열려 있다. */
export async function loadAssignmentSnapshot(supabase: SupabaseClient, itemSetId: string, version: number): Promise<Snapshot | null> {
  const { data } = await supabase.from('item_set_versions').select('snapshot').eq('item_set_id', itemSetId).eq('version', version).maybeSingle()
  return (data?.snapshot as Snapshot | undefined) ?? null
}

/** 게시된 최신 판 번호. 배정 생성 때 쓴다. */
export async function latestPublishedVersion(supabase: SupabaseClient, itemSetId: string): Promise<number | null> {
  const { data } = await supabase.from('item_set_versions').select('version').eq('item_set_id', itemSetId).order('version', { ascending: false }).limit(1).maybeSingle()
  return data?.version ?? null
}
