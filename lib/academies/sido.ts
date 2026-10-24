/**
 * 시·도(설계 2026-10-25 §2.1). DB `academies.sido` 와 지도 자료(`data/map/korea-sido.json`)가 같은 짧은 이름을 쓴다.
 * 순서는 화면의 칩·목록 순서다(수도권 → 광역시 → 도).
 */
export const SIDOS = ['서울', '부산', '대구', '인천', '광주', '대전', '울산', '세종', '경기', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주'] as const
export type Sido = (typeof SIDOS)[number]

export function isSido(v: unknown): v is Sido {
  return typeof v === 'string' && (SIDOS as readonly string[]).includes(v)
}

/** 긴 이름·옛 이름 → 짧은 이름. 대표가 주는 표(「전라북도」·「전북특별자치도」 …)를 맞추는 데 쓴다. 모르면 null(지어내지 않음). */
const LONG: Record<string, Sido> = {
  서울특별시: '서울', 부산광역시: '부산', 대구광역시: '대구', 인천광역시: '인천', 광주광역시: '광주', 대전광역시: '대전', 울산광역시: '울산',
  세종특별자치시: '세종', 세종시: '세종', 경기도: '경기', 강원도: '강원', 강원특별자치도: '강원', 충청북도: '충북', 충청남도: '충남',
  전라북도: '전북', 전북특별자치도: '전북', 전라남도: '전남', 경상북도: '경북', 경상남도: '경남', 제주특별자치도: '제주', 제주도: '제주',
}
export function toSido(input: string): Sido | null {
  const s = input.replace(/\s+/g, '')
  if (isSido(s)) return s
  return LONG[s] ?? null
}
