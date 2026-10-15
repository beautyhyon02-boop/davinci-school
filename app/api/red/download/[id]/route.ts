import { NextResponse, type NextRequest } from 'next/server'
import { getSessionProfileOrNull } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { contentDisposition, DOCX_MIME } from '@/lib/red/reports'

const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * GET /api/red/download/[id] (원장·본사만): 줄은 사용자 클라이언트로 읽어 RLS(원장은 숨기지 않은 줄만)가 한 번 더 거르고,
 * 파일은 service role 로 비공개 bucket 'resources' 에서 읽어 한글 파일 이름 그대로 내려준다(Content-Disposition filename*).
 * 서명 URL 대신 라우트로 주는 까닭: Storage 의 download 매개변수가 한글 이름을 그대로 전하지 못했다(대표 2026-10-15).
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const s = await getSessionProfileOrNull()
  if (!s) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (s.role !== 'teacher' && s.role !== 'admin') return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const { id } = await ctx.params
  if (!ID_RE.test(id)) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  const supabase = await createClient()
  const { data: row } = await supabase.from('resources').select('id, filename, storage_path, hidden').eq('id', id).maybeSingle()
  if (!row || (row.hidden && s.role !== 'admin')) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  const { data: blob, error } = await createAdminClient().storage.from('resources').download(row.storage_path)
  if (error || !blob) return NextResponse.json({ error: 'download_failed' }, { status: 502 })
  return new NextResponse(blob, {
    status: 200,
    headers: { 'Content-Type': DOCX_MIME, 'Content-Disposition': contentDisposition(row.filename), 'Cache-Control': 'private, no-store' },
  })
}
