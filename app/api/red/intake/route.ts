import { NextResponse, type NextRequest } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { ingestRedFiles, readRedForm, MAX_CONTENT_LENGTH_BYTES } from '@/lib/red/ingest'

export const maxDuration = 60

function keyMatches(given: string | null, expected: string | undefined): boolean {
  if (!given || !expected) return false
  const a = Buffer.from(given), b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

/**
 * POST /api/red/intake (PRD 2026-10-16 US-007): 생성기가 X-RED-INTAKE-KEY 헤더로 docx 를 보내면 검수대기 줄로 넣는다(created_by 'auto').
 * 키는 환경변수 RED_INTAKE_KEY — 없으면 문이 닫혀 있다(그래도 401). 키 없음·틀림 401. 올린 것이 하나도 없으면 422, 있으면 201 + 파일마다 id.
 */
export async function POST(req: NextRequest) {
  const expected = process.env.RED_INTAKE_KEY
  // 키가 설정되지 않았어도 401 — 문이 열렸는지 바깥에 알리지 않는다(검토 2026-10-16). 서버 로그에만 남긴다.
  if (!expected) console.warn('[red intake] RED_INTAKE_KEY 가 없어 intake 가 닫혀 있다')
  if (!keyMatches(req.headers.get('x-red-intake-key'), expected)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const contentLength = req.headers.get('content-length')
  if (!contentLength || Number(contentLength) > MAX_CONTENT_LENGTH_BYTES) return NextResponse.json({ error: 'file_too_large' }, { status: 413 })
  const form = await readRedForm(req)
  if (!form) return NextResponse.json({ error: 'bad request' }, { status: 400 })
  const outcomes = await ingestRedFiles(createAdminClient(), form.files.map((f) => ({ name: f.name, size: f.size, type: f.type, body: f })), { date: form.date, createdBy: 'auto' })
  const status = outcomes.some((o) => o.status === 'uploaded') ? 201 : 422
  return NextResponse.json({ outcomes }, { status })
}
