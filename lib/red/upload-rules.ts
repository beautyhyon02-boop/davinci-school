// RED docx 올리기의 순수 검증 — 크기, 확장자, 이름 틀, ZIP 서명. 라우트가 아닌 여기서 시험한다(tests/red-upload-rules.test.ts).
import { parseRedFilename, type ParsedRedFilename } from './reports'

export const RED_MAX_SIZE_BYTES = 10 * 1024 * 1024

export type RedUploadError = 'file_too_large' | 'invalid_type' | 'bad_name' | 'bad_content'
/** 라우트가 파일마다 돌려주는 결과(관리 화면이 함께 쓴다). detail 은 거절 사유에 붙는 실제 값(받은 file.type). */
export type RedUploadOutcome = { name: string; status: 'uploaded' | 'duplicate' | 'failed'; error?: string; detail?: string }
export type RedUploadCheck =
  | { ok: true; parsed: Extract<ParsedRedFilename, { ok: true }> }
  | { ok: false; error: RedUploadError; detail?: string }

/** docx 판별은 확장자로만(본사 2026-10-16). */
export const isDocxName = (name: string): boolean => name.toLowerCase().endsWith('.docx')

/**
 * 본사 2026-10-16: docx 판별은 MIME(file.type)이 아니라 **파일 이름의 확장자**로 한다 — 브라우저·OS 가 주는 file.type 은
 * 빈 값, application/octet-stream, application/zip 등 제각각이라 그것으로 거절하면 멀쩡한 파일이 막힌다.
 * 거절할 때는 받은 file.type 을 detail 로 같이 돌려줘 화면에 보인다. 내용 확인(ZIP 서명)은 hasZipSignature 로 서버가 한 번 더 한다.
 */
export function validateRedUpload({ name, size, type }: { name: string; size: number; type: string }): RedUploadCheck {
  if (!Number.isFinite(size) || size <= 0 || size > RED_MAX_SIZE_BYTES) return { ok: false, error: 'file_too_large' }
  if (!isDocxName(name)) return { ok: false, error: 'invalid_type', detail: type ?? '' }
  const parsed = parseRedFilename(name)
  if (!parsed.ok) return { ok: false, error: 'bad_name' }
  return { ok: true, parsed }
}

/** docx 는 ZIP 꾸러미라 앞 4바이트가 50 4B 03 04 — 이름만 .docx 인 다른 파일을 서버에서 거른다. */
export function hasZipSignature(head: Uint8Array): boolean {
  return head.length >= 4 && head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04
}

/** 파일(Blob 또는 바이트)의 앞 4바이트. */
export async function readHead(body: Blob | Uint8Array, n = 4): Promise<Uint8Array> {
  if (body instanceof Uint8Array) return body.subarray(0, n)
  return new Uint8Array(await body.slice(0, n).arrayBuffer())
}
