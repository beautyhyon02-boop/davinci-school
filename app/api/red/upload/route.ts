import { NextResponse, type NextRequest } from 'next/server'
import { getSessionProfileOrNull } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { validateRedUpload, RED_MAX_SIZE_BYTES, type RedUploadOutcome } from '@/lib/red/upload-rules'
import { redStoragePath } from '@/lib/red/reports'
import { todayKst } from '@/lib/classroom/notice'

export const maxDuration = 60
// 관리 화면은 파일을 하나씩 보낸다(Vercel 본문 상한 4.5MB 때문) — 라우트는 여러 개도 받되 길이는 이 안에서만
const MAX_CONTENT_LENGTH_BYTES = RED_MAX_SIZE_BYTES + 512 * 1024
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * POST /api/red/upload (본사만): form 의 files[] 를 하나씩 검증 → 비공개 bucket 'resources' 에 올리고 resources 줄을 넣는다.
 * 파일 이름이 같으면 건너뛴다(resources.filename unique). 서버 액션이 아니라 라우트 핸들러인 것은 본문 크기 제한(1MB) 때문.
 * 저장소에는 올렸는데 줄 넣기에 실패하면 올린 파일을 지워 반쪽을 남기지 않는다.
 */
export async function POST(req: NextRequest) {
  const s = await getSessionProfileOrNull()
  if (!s) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (s.role !== 'admin') return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const contentLength = req.headers.get('content-length')
  if (!contentLength || Number(contentLength) > MAX_CONTENT_LENGTH_BYTES) return NextResponse.json({ error: 'file_too_large' }, { status: 413 })

  let form: FormData
  try { form = await req.formData() } catch { return NextResponse.json({ error: 'bad request' }, { status: 400 }) }
  const files = form.getAll('files').filter((f): f is File => f instanceof File)
  if (files.length === 0) return NextResponse.json({ error: 'bad request' }, { status: 400 })
  const rawDate = form.get('date')
  const date = typeof rawDate === 'string' && DATE_RE.test(rawDate) ? rawDate : todayKst()

  const admin = createAdminClient()
  const outcomes: RedUploadOutcome[] = []
  for (const file of files) {
    const check = validateRedUpload({ name: file.name, size: file.size, type: file.type })
    if (!check.ok) { outcomes.push({ name: file.name, status: 'failed', error: check.error }); continue }
    const { data: dup } = await admin.from('resources').select('id').eq('filename', file.name).maybeSingle()
    if (dup) { outcomes.push({ name: file.name, status: 'duplicate' }); continue }
    const path = redStoragePath(check.parsed.category, date, file.name)
    const { error: upErr } = await admin.storage.from('resources').upload(path, file, { contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', upsert: true })
    if (upErr) { outcomes.push({ name: file.name, status: 'failed', error: 'upload_failed' }); continue }
    const { error: dbErr } = await admin.from('resources').insert({
      filename: file.name, description: check.parsed.title, audience: 'teacher', storage_path: path,
      category: check.parsed.category, kind: check.parsed.kind, series: check.parsed.series, subject: check.parsed.subject, title: check.parsed.title,
      report_date: date, hidden: false, size_bytes: file.size,
    })
    if (dbErr) { await admin.storage.from('resources').remove([path]); outcomes.push({ name: file.name, status: 'failed', error: 'db_failed' }); continue }
    outcomes.push({ name: file.name, status: 'uploaded' })
  }
  return NextResponse.json({ outcomes })
}
