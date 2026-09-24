/**
 * DB의 성취기준(`data/standards/*.json`을 정규식으로 추출한 것)을 평가원 성취수준
 * 원문(`data/reference/levels/*.json`, `scripts/parse_levels.py`가 PDF에서 파싱)과
 * 코드 기준으로 대조하는 순수 함수. DB나 파일에 접근하지 않는다 — 호출자(오프라인
 * 스크립트 `scripts/crosscheck_standards.ts`, 관리자 서버 액션)가 두 배열을 읽어 넘긴다.
 *
 * "검증"의 의미: 같은 코드의 문장이 공백·문장부호 차이를 빼고 글자 그대로 같다는
 * 뜻이지, 내용이 옳다는 뜻은 아니다(두 자료 모두 같은 2022 개정 교육과정 성취기준을
 * 옮긴 것이므로 코드가 같으면 문장도 같아야 정상이다).
 */

/**
 * 공백을 한 칸으로 접고, 가운뎃점 계열 문자(·/ㆍ/⋅)를 하나로 통일하고, 인용부호
 * 계열을 통일하고, 문장 끝의 마침표(./。)를 지운다 — 추출 스크립트(정규식)와 PDF
 * 파싱 스크립트(레이아웃 기반)가 같은 문장을 서로 다른 문장부호 코드포인트나
 * 후행 마침표 유무로 옮겼을 수 있어, 내용이 같은데 다른 것으로 잘못 판정하지
 * 않기 위함이다.
 */
export function normalizeStandardText(s: string): string {
  return s
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[ㆍ⋅]/g, '·')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[。.]+$/u, '')
    .trim()
}

export type DbStandardRow = { id: string; code: string; subject: string; text: string }
export type LevelRecordInput = { code: string; text: string; source: string }

export type CrosscheckResult = {
  verified: { id: string; code: string }[]
  mismatched: { id: string; code: string; dbText: string; levelText: string; source: string }[]
  unmatched: { id: string; code: string }[]
}

/**
 * dbRows 각각을 code로 levelRecords에서 찾아 세 무리로 나눈다:
 * - verified: 같은 code가 있고 정규화한 문장이 동일
 * - mismatched: 같은 code가 있지만 정규화한 문장이 다름
 * - unmatched: levelRecords 전체에 그 code가 없음(예: 고등학교·세계사처럼
 *   평가원 성취수준 PDF 자체가 없는 학교급/과목)
 *
 * levelRecords에 같은 code가 여러 번 나오면 첫 번째 항목을 쓴다(현재 데이터에는
 * 파일 간 code 중복이 없다 — 있다면 로더가 잘못 합친 것).
 */
export function crosscheckStandards(dbRows: DbStandardRow[], levelRecords: LevelRecordInput[]): CrosscheckResult {
  const byCode = new Map<string, LevelRecordInput>()
  for (const r of levelRecords) {
    if (!byCode.has(r.code)) byCode.set(r.code, r)
  }

  const result: CrosscheckResult = { verified: [], mismatched: [], unmatched: [] }
  for (const row of dbRows) {
    const level = byCode.get(row.code)
    if (!level) {
      result.unmatched.push({ id: row.id, code: row.code })
      continue
    }
    if (normalizeStandardText(row.text) === normalizeStandardText(level.text)) {
      result.verified.push({ id: row.id, code: row.code })
    } else {
      result.mismatched.push({ id: row.id, code: row.code, dbText: row.text, levelText: level.text, source: level.source })
    }
  }
  return result
}
