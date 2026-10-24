/**
 * 홈페이지 주소 정리(설계 2026-10-25 §5). '' = 홈페이지 없음(지도에서 이름만), null = 틀린 주소(거절).
 * 스킴이 없으면 https:// 를 붙이고, http/https 만 받고, 호스트에 점이 있어야 한다.
 */
export function normalizeWebsite(raw: string): string | null {
  const s = raw.trim()
  if (!s) return ''
  if (/\s/.test(s)) return null
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(s) ? s : `https://${s}`
  let u: URL
  try { u = new URL(withScheme) } catch { return null }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
  if (!u.hostname.includes('.')) return null
  return u.toString()
}
