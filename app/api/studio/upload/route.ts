import { NextResponse, type NextRequest } from 'next/server'
import { randomUUID } from 'node:crypto'
import { createClient } from '@/lib/supabase/server'
import { getSessionProfileOrNull } from '@/lib/auth/session'
import { validateUpload, sanitizeTarget, type UploadRuleError } from '@/lib/studio/upload-rules'

// uuid 형식(item_sets.id)만 허용 — 경로 조작 방지
const SET_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// multipart 오버헤드를 감안한 여유치 — 실제 파일 크기 상한(5MB)은 validateUpload가 다시 확인한다.
const MAX_CONTENT_LENGTH_BYTES = 6 * 1024 * 1024

const STATUS_BY_ERROR: Record<UploadRuleError, number> = {
  invalid_target: 400,
  file_too_large: 413,
  invalid_type: 415,
}

export async function POST(req: NextRequest) {
  const s = await getSessionProfileOrNull()
  if (!s) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (s.role !== 'admin') return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  // body를 파싱하기 전에 Content-Length로 먼저 거른다 — 큰 요청을 굳이 메모리에 올려 파싱하지 않는다.
  const contentLength = Number(req.headers.get('content-length') ?? '0')
  if (contentLength > MAX_CONTENT_LENGTH_BYTES) {
    return NextResponse.json({ error: 'file_too_large' }, { status: 413 })
  }

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ error: 'bad request' }, { status: 400 })
  }

  const file = form.get('file')
  const setId = form.get('setId')
  const target = form.get('target')

  if (!(file instanceof File) || typeof setId !== 'string' || typeof target !== 'string') {
    return NextResponse.json({ error: 'bad request' }, { status: 400 })
  }
  if (!SET_ID_RE.test(setId)) return NextResponse.json({ error: 'invalid_set_id' }, { status: 400 })

  const supabase = await createClient()
  const { data: itemSet, error: itemSetErr } = await supabase.from('item_sets').select('id').eq('id', setId).single()
  if (itemSetErr || !itemSet) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const check = validateUpload({ size: file.size, type: file.type, name: file.name, target })
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: STATUS_BY_ERROR[check.error] })

  const path = `sets/${setId}/${sanitizeTarget(target)}/${randomUUID()}.${check.ext}`

  const { error: uploadErr } = await supabase.storage.from('materials').upload(path, file, {
    contentType: file.type,
    upsert: false,
  })
  if (uploadErr) return NextResponse.json({ error: 'upload_failed' }, { status: 400 })

  const { data } = supabase.storage.from('materials').getPublicUrl(path)
  return NextResponse.json({ url: data.publicUrl })
}
