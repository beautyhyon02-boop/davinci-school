import { NextResponse, type NextRequest } from 'next/server'
import { getSessionProfileOrNull } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { ingestRedFiles, readRedForm, MAX_CONTENT_LENGTH_BYTES } from '@/lib/red/ingest'

export const maxDuration = 60
/**
 * POST /api/red/upload (본사만): form 의 files[] 를 하나씩 검증 → 비공개 bucket 'resources' 에 올리고 resources 줄을 검수대기로 넣는다(lib/red/ingest.ts).
 * 파일 이름이 같으면 건너뛴다(resources.filename unique). 서버 액션이 아니라 라우트 핸들러인 것은 본문 크기 제한(1MB) 때문.
 */
export async function POST(req: NextRequest) {
  const s = await getSessionProfileOrNull()
  if (!s) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (s.role !== 'admin') return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const contentLength = req.headers.get('content-length')
  if (!contentLength || Number(contentLength) > MAX_CONTENT_LENGTH_BYTES) return NextResponse.json({ error: 'file_too_large' }, { status: 413 })
  const form = await readRedForm(req)
  if (!form) return NextResponse.json({ error: 'bad request' }, { status: 400 })
  const outcomes = await ingestRedFiles(createAdminClient(), form.files.map((f) => ({ name: f.name, size: f.size, type: f.type, body: f })), { date: form.date, createdBy: s.userId })
  // 관리 화면에는 id 가 필요 없다(올림/이미 있음/실패만)
  return NextResponse.json({ outcomes: outcomes.map((o) => ({ name: o.name, status: o.status, ...(o.error ? { error: o.error } : {}), ...(o.detail !== undefined ? { detail: o.detail } : {}) })) })
}
