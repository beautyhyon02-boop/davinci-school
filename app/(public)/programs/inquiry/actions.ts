'use server'
import { getSessionProfileOrNull } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { pages } from '@/content/site'
import { RED_SIGNED_URL_SECONDS } from '@/lib/red/reports'

const copy = pages.redReports
// 서명 URL 유효 시간(초)은 lib/red/reports.ts RED_SIGNED_URL_SECONDS — 'use server' 파일은 async 함수만 내보낼 수 있다

/**
 * RED 보고서 내려받기 주소(대표 2026-10-15): 로그인한 원장·본사만. 줄은 사용자 클라이언트로 읽어 RLS(resources: 원장 읽기)가 한 번 더 거르고,
 * 서명 URL 은 service role 로 만든다(비공개 bucket 'resources' 에는 storage 정책이 없다). 숨긴 파일은 본사만 받을 수 있다.
 */
export async function redDownloadUrl(id: string): Promise<{ url?: string; error?: string }> {
  const s = await getSessionProfileOrNull()
  if (!s || (s.role !== 'teacher' && s.role !== 'admin')) return { error: copy.studentOnly }
  const supabase = await createClient()
  const { data: row } = await supabase.from('resources').select('id, filename, storage_path, hidden').eq('id', id).maybeSingle()
  if (!row || (row.hidden && s.role !== 'admin')) return { error: copy.downloadFailed }
  const { data, error } = await createAdminClient().storage.from('resources').createSignedUrl(row.storage_path, RED_SIGNED_URL_SECONDS, { download: row.filename })
  if (error || !data?.signedUrl) return { error: copy.downloadFailed }
  return { url: data.signedUrl }
}
