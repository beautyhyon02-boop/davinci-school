/**
 * 로그인 뒤 돌아갈 경로(?next=…) — 같은 사이트 안의 경로만 받는다(대표 2026-10-15, 탐구보고서 페이지의 RED 보고서 로그인 단추).
 * "https://…"·"//evil.com"·"javascript:" 같은 값은 버린다(열린 리다이렉트 방지). 로그인 페이지 자신으로 되돌리지도 않는다.
 */
export function safeNextPath(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const v = raw.trim()
  if (!v.startsWith('/') || v.startsWith('//') || v.startsWith('/\\')) return null
  if (/[\u0000-\u001f\s]/.test(v)) return null
  if (v === '/login' || v.startsWith('/login?')) return null
  return v
}
