import { NextResponse, type NextRequest } from 'next/server'
import { randomUUID } from 'node:crypto'
import { createClient } from '@/lib/supabase/server'
import { getSessionProfileOrNull } from '@/lib/auth/session'
import { validateUpload, sanitizeTarget, type UploadRuleError } from '@/lib/studio/upload-rules'

// uuid 형식(item_sets.id)만 허용 — 경로 조작 방지
const SET_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const STATUS_BY_ERROR: Record<UploadRuleError, number> = {
  invalid_target: 400,
  file_too_large: 413,
  invalid_type: 415,
}

export async function POST(req: NextRequest) {
  const s = await getSessionProfileOrNull()
  if (!s) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (s.role !== 'admin') return NextResponse.json({ error: 'forbidden' }, { status: 403 })

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

  const check = validateUpload({ size: file.size, type: file.type, name: file.name, target })
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: STATUS_BY_ERROR[check.error] })

  const path = `sets/${setId}/${sanitizeTarget(target)}/${randomUUID()}.${check.ext}`

  const supabase = await createClient()
  const { error: uploadErr } = await supabase.storage.from('materials').upload(path, file, {
    contentType: file.type,
    upsert: false,
  })
  if (uploadErr) return NextResponse.json({ error: 'upload_failed' }, { status: 400 })

  const { data } = supabase.storage.from('materials').getPublicUrl(path)
  return NextResponse.json({ url: data.publicUrl })
}
