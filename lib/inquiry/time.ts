/**
 * 서울 시각 표기(순수, 화면에서도 쓴다 — lib/classroom/notice.ts 의 kstDateTime 과 같은 규칙이지만 그 파일은 제작소 스키마를 끌어와 클라이언트에 무겁다).
 * 서버·브라우저 어디서 그려도 같은 글자가 나오게 시간대를 고정한다(수화 불일치 방지).
 */

/** ISO(UTC) → 'YYYY-MM-DD HH:mm'. 읽을 수 없으면 빈 문자열. */
export function kstDateTime(iso: string | null | undefined): string {
  if (!iso) return ''
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return ''
  return new Date(t + 9 * 3600_000).toISOString().slice(0, 16).replace('T', ' ')
}

/** ISO(UTC) → 'HH:mm'(저장됨 표시용). */
export function kstHm(iso: string | null | undefined): string {
  const s = kstDateTime(iso)
  return s ? s.slice(11) : ''
}
