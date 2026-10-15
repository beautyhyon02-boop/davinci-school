// POST /api/red/upload 의 순수 검증 — docx 만, 10MB 까지. 라우트 핸들러가 아닌 여기서 시험한다(tests/red-upload-rules.test.ts).
import { parseRedFilename, type ParsedRedFilename } from './reports'

export const RED_MAX_SIZE_BYTES = 10 * 1024 * 1024
const DOCX_MIMES = new Set(['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/octet-stream', ''])

export type RedUploadError = 'file_too_large' | 'invalid_type' | 'bad_name'
/** /api/red/upload 가 파일마다 돌려주는 결과(라우트·관리 화면이 함께 쓴다). */
export type RedUploadOutcome = { name: string; status: 'uploaded' | 'duplicate' | 'failed'; error?: string }
export type RedUploadCheck =
  | { ok: true; parsed: Extract<ParsedRedFilename, { ok: true }> }
  | { ok: false; error: RedUploadError }

/** 브라우저가 docx 의 MIME 을 빈 값·octet-stream 으로 주기도 해서 확장자를 기준으로 본다. 이름이 생성기 틀에 맞아야 칸을 채울 수 있다. */
export function validateRedUpload({ name, size, type }: { name: string; size: number; type: string }): RedUploadCheck {
  if (!Number.isFinite(size) || size <= 0 || size > RED_MAX_SIZE_BYTES) return { ok: false, error: 'file_too_large' }
  if (!/\.docx$/i.test(name) || !DOCX_MIMES.has(type)) return { ok: false, error: 'invalid_type' }
  const parsed = parseRedFilename(name)
  if (!parsed.ok) return { ok: false, error: 'bad_name' }
  return { ok: true, parsed }
}
