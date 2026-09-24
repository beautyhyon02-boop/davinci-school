// 자료 제목 표시 정리. 별도 파일인 이유: compat.ts는 checks.ts를 가져오고(conditionHints·materialNumbers),
// checks.ts도 이 정리 함수를 쓰므로(4단계 [TS] 자문) compat.ts에 두면 순환 참조가 생긴다.

/** 자료 제목에 남은 출처 표기 낱말(대표 지시 2026-09-26: 화면 어디에도 자작·가상 같은 출처 표기를 보이지 않는다 — 출처는 source 필드에만). */
const TITLE_MARKER_WORDS = new Set(['자작', '가상', '본사', '본사 자작', '공개', '공개 자료'])

/**
 * 자료 제목의 괄호 표기에서 출처 표기 낱말만 지운다(표시 시점 정리 — 저장된 제목은 그대로 두고 보여 줄 때마다 다시 지운다).
 * 괄호 안을 쉼표로 나눠 표기 낱말과 정확히 같은 조각만 뺀다("(학생회 조사, 가상)" → "(학생회 조사)") — 남는 조각이
 * 없으면 괄호째 지운다("(자작)"·"(본사 자작)"·"(공개 자료)" → ""). 표기 낱말이 없는 제목·괄호는 그대로 둔다.
 */
export function cleanMaterialTitle(title: string): string {
  const cleaned = title.replace(/\(([^()]*)\)/g, (_, inner: string) => {
    const kept = inner.split(',').map((s) => s.trim()).filter((s) => s && !TITLE_MARKER_WORDS.has(s))
    return kept.length ? `(${kept.join(', ')})` : ''
  })
  return cleaned.replace(/\s{2,}/g, ' ').trim()
}

/** 4단계 [TS] 자문(checks.ts)용 — 제목에 출처 표기 낱말이 남아 있는지(cleanMaterialTitle로 지워질 것이 있는지). */
export const titleHasSourceMarker = (title: string): boolean => cleanMaterialTitle(title) !== title
