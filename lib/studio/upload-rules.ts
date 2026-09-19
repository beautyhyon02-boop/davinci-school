// POST /api/studio/upload 의 순수 검증 로직. 라우트 핸들러가 아닌 여기서 테스트한다.

const MAX_SIZE_BYTES = 5 * 1024 * 1024 // 5MB

// MIME 타입별 허용 확장자(둘 다 확인 — 브라우저가 file.type을 잘못 주는 경우를 막는다).
const EXT_BY_MIME: Record<string, string[]> = {
  'image/png': ['png'],
  'image/jpeg': ['jpg', 'jpeg'],
  'image/webp': ['webp'],
}

// material:<A~Z 한 글자> 또는 lesson:<1 이상 정수>
const TARGET_RE = /^(material:[A-Z]|lesson:[1-9][0-9]?)$/

export type UploadRuleInput = {
  size: number
  type: string
  name: string
  target: string
}

export type UploadRuleError = 'invalid_target' | 'file_too_large' | 'invalid_type'

export type UploadRuleResult =
  | { ok: true; error?: undefined; ext: string }
  | { ok: false; error: UploadRuleError; ext?: undefined }

export function validateUpload({ size, type, name, target }: UploadRuleInput): UploadRuleResult {
  if (!TARGET_RE.test(target)) return { ok: false, error: 'invalid_target' }
  if (!Number.isFinite(size) || size <= 0 || size > MAX_SIZE_BYTES) return { ok: false, error: 'file_too_large' }

  const allowedExts = EXT_BY_MIME[type]
  if (!allowedExts) return { ok: false, error: 'invalid_type' }

  const rawExt = name.toLowerCase().split('.').pop() ?? ''
  if (!allowedExts.includes(rawExt)) return { ok: false, error: 'invalid_type' }

  const ext = rawExt === 'jpeg' ? 'jpg' : rawExt
  return { ok: true, ext }
}

/** 저장 경로용으로 target(`material:A`, `lesson:3`)의 `:` 를 안전한 문자로 바꾼다. */
export function sanitizeTarget(target: string): string {
  return target.replace(':', '_')
}

/**
 * attachImage가 받는 url이 실제로 우리 Supabase 프로젝트의 materials 버킷 공개 URL인지 확인한다.
 * (임의의 외부 URL을 자료/차시에 붙이는 것을 막는다 — 업로드 라우트가 반환한 URL만 허용.)
 */
export function isMaterialsPublicUrl(url: string, supabaseUrl: string): boolean {
  const base = supabaseUrl.replace(/\/+$/, '')
  if (!base) return false
  const prefix = `${base}/storage/v1/object/public/materials/`
  return url.startsWith(prefix)
}
