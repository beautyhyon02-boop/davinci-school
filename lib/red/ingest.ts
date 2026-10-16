import { randomUUID } from 'node:crypto'
import { validateRedUpload, hasZipSignature, readHead, RED_MAX_SIZE_BYTES, type RedUploadOutcome } from './upload-rules'
import { redStoragePath, DOCX_MIME } from './reports'
import { todayKst } from '@/lib/classroom/notice'
import type { SupabaseClient } from '@supabase/supabase-js'

// 관리 화면은 파일을 하나씩 보낸다(Vercel 본문 상한 4.5MB 때문) — 라우트는 여러 개도 받되 길이는 이 안에서만
export const MAX_CONTENT_LENGTH_BYTES = RED_MAX_SIZE_BYTES + 512 * 1024
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** 요청의 form 에서 파일 목록과 날짜를 읽는다(올리기 라우트·intake 가 함께 쓴다). 파일이 없거나 form 이 아니면 null. */
export async function readRedForm(req: Request): Promise<{ files: File[]; date: string } | null> {
  let form: FormData
  try { form = await req.formData() } catch { return null }
  const files = form.getAll('files').filter((f): f is File => f instanceof File)
  if (files.length === 0) return null
  const rawDate = form.get('date')
  const date = typeof rawDate === 'string' && DATE_RE.test(rawDate) ? rawDate : todayKst()
  return { files, date }
}

/**
 * RED 파일 받아들이기(PRD 2026-10-16): 본사 올리기 라우트(/api/red/upload)·생성기 intake(/api/red/intake)·내 스크립트가 같은 길을 쓴다.
 * 파일마다: 확장자·크기·이름 틀 검증 → ZIP 서명 확인 → 같은 이름이면 건너뜀 → 비공개 저장소에 올림(키는 ASCII uuid) → resources 줄(검수대기) → 줄 실패면 올린 파일을 지운다.
 * admin 은 service role 클라이언트(저장소 정책이 없어 서버만 쓴다).
 */
type AdminLike = Pick<SupabaseClient, 'from' | 'storage'>
export type RedIngestFile = { name: string; size: number; type: string; body: Blob | Uint8Array }
export type RedIngestOutcome = RedUploadOutcome & { id?: string }

export async function ingestRedFiles(admin: AdminLike, files: RedIngestFile[], opts: { date: string; createdBy: string }): Promise<RedIngestOutcome[]> {
  const outcomes: RedIngestOutcome[] = []
  for (const file of files) {
    const check = validateRedUpload({ name: file.name, size: file.size, type: file.type })
    if (!check.ok) { outcomes.push({ name: file.name, status: 'failed', error: check.error, ...(check.detail !== undefined ? { detail: check.detail } : {}) }); continue }
    // 이름만 .docx 인 다른 파일은 여기서 걸린다 — docx 는 ZIP 이라 앞 4바이트가 50 4B 03 04(본사 2026-10-16)
    if (!hasZipSignature(await readHead(file.body))) { outcomes.push({ name: file.name, status: 'failed', error: 'bad_content', detail: file.type ?? '' }); continue }
    const { data: dup } = await admin.from('resources').select('id').eq('filename', file.name).maybeSingle()
    if (dup) { outcomes.push({ name: file.name, status: 'duplicate' }); continue }
    const id = randomUUID()
    const path = redStoragePath(check.parsed.category, opts.date, id)
    const { error: upErr } = await admin.storage.from('resources').upload(path, file.body, { contentType: DOCX_MIME, upsert: true })
    if (upErr) { outcomes.push({ name: file.name, status: 'failed', error: 'upload_failed' }); continue }
    const { error: dbErr } = await admin.from('resources').insert({
      id, filename: file.name, description: check.parsed.title, audience: 'teacher', storage_path: path,
      category: check.parsed.category, kind: check.parsed.kind, red_type: check.parsed.redType,
      series: check.parsed.series, subject: check.parsed.subject, title: check.parsed.title,
      report_date: opts.date, status: 'pending', created_by: opts.createdBy, size_bytes: file.size,
    })
    if (dbErr) { await admin.storage.from('resources').remove([path]); outcomes.push({ name: file.name, status: 'failed', error: 'db_failed' }); continue }
    outcomes.push({ name: file.name, status: 'uploaded', id })
  }
  return outcomes
}
