import { NextResponse, type NextRequest } from 'next/server'
import { randomUUID } from 'node:crypto'
import { getSessionProfileOrNull } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { MAX_CONTENT_LENGTH_BYTES } from '@/lib/red/ingest'
import { RED_MAX_SIZE_BYTES } from '@/lib/red/upload-rules'
import { redStoragePath, DOCX_MIME, type RedCategory } from '@/lib/red/reports'

export const maxDuration = 60
const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * POST /api/red/replace/[id] (본사만, PRD 2026-10-16 US-006): form 의 file(docx) 로 줄의 파일을 바꾼다 — 새 경로에 올리고 줄(파일 이름·경로·크기)을 고친 뒤 옛 파일을 지운다.
 * 이름 틀은 묻지 않는다(메타는 줄에 이미 있다). 줄 갱신이 실패하면 새 파일을 지워 반쪽을 남기지 않는다.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const s = await getSessionProfileOrNull()
  if (!s) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (s.role !== 'admin') return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const { id } = await ctx.params
  if (!ID_RE.test(id)) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  const contentLength = req.headers.get('content-length')
  if (!contentLength || Number(contentLength) > MAX_CONTENT_LENGTH_BYTES) return NextResponse.json({ error: 'file_too_large' }, { status: 413 })
  const admin = createAdminClient()
  const { data: row } = await admin.from('resources').select('id, category, report_date, storage_path').eq('id', id).maybeSingle()
  if (!row) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  let form: FormData
  try { form = await req.formData() } catch { return NextResponse.json({ error: 'bad request' }, { status: 400 }) }
  const file = form.get('file')
  if (!(file instanceof File) || !/\.docx$/i.test(file.name) || file.size <= 0 || file.size > RED_MAX_SIZE_BYTES) return NextResponse.json({ error: 'invalid_type' }, { status: 422 })
  // 같은 이름의 다른 줄이 있으면(resources_filename_uniq) 올리기 전에 409 — 올린 뒤 갱신 실패로 알게 되지 않게(검토 2026-10-16)
  const { data: dup } = await admin.from('resources').select('id').eq('filename', file.name).maybeSingle()
  if (dup && dup.id !== id) return NextResponse.json({ error: 'duplicate' }, { status: 409 })

  const path = redStoragePath(row.category as RedCategory, String(row.report_date), randomUUID())
  const { error: upErr } = await admin.storage.from('resources').upload(path, file, { contentType: DOCX_MIME, upsert: true })
  if (upErr) return NextResponse.json({ error: 'upload_failed' }, { status: 502 })
  const { error: dbErr } = await admin.from('resources').update({ filename: file.name, storage_path: path, size_bytes: file.size }).eq('id', id)
  if (dbErr) { await admin.storage.from('resources').remove([path]); return NextResponse.json({ error: 'db_failed' }, { status: 500 }) }
  await admin.storage.from('resources').remove([row.storage_path])
  return NextResponse.json({ ok: true, filename: file.name })
}
