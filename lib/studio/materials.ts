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

/**
 * 세트 자료 수(대표 2026-09-26): 실제 서논술 문항은 자료 2~4개를 쓴다 — 세트 자료는 문항·차시가 실제로 쓰는 것만 만들고,
 * 게시 판(buildSnapshot)에는 어느 문항·차시가 참조하는 자료만 싣는다. 참조 자료가 이보다 많으면 [TS] 자문(4·5단계)을 남긴다.
 */
export const MAX_SET_MATERIALS = 5

// 문장 속 자료 언급: "자료 A", "자료 A·B", "자료 A와 B", "자료 A, C", "자료B", 범위 "자료 A~D"·"A-D"·"A–D"·"A부터 D까지",
// 섞어 쓴 "자료 A~C와 E". 뒤에 영문자가 이어지면(자료 AB 등) 언급으로 보지 않는다.
const ID = '[A-Z](?![A-Za-z])'
const RANGE_SEP = '(?:~|-|–|부터)'
const TOKEN = `${ID}(?:\\s*${RANGE_SEP}\\s*${ID}(?:\\s*까지)?)?`
const LIST_SEP = '\\s*(?:,|·|/|와|과|및|또는)\\s*'
const MENTION = new RegExp(`자료\\s*(${TOKEN}(?:${LIST_SEP}${TOKEN})*)`, 'g')
const TOKEN_PARTS = new RegExp(`([A-Z])(?:\\s*${RANGE_SEP}\\s*([A-Z]))?`, 'g')

/** 문장에서 '자료 X' 언급의 ID(대문자 한 글자)를 모두 뽑는다(중복 제거 전). 범위(A~D)는 사이 글자까지 모두 펼친다. */
export function mentionedMaterialIds(text: string): string[] {
  const out: string[] = []
  for (const m of text.matchAll(MENTION)) {
    for (const [, from, to] of m[1].matchAll(TOKEN_PARTS)) {
      if (!to) { out.push(from); continue }
      const [a, b] = [from.charCodeAt(0), to.charCodeAt(0)].sort((x, y) => x - y)
      for (let c = a; c <= b; c++) out.push(String.fromCharCode(c))
    }
  }
  return out
}

/** 값 안의 모든 문자열(객체·배열을 끝까지 따라간다). */
function stringLeaves(v: unknown, out: string[] = []): string[] {
  if (typeof v === 'string') out.push(v)
  else if (Array.isArray(v)) for (const x of v) stringLeaves(x, out)
  else if (v && typeof v === 'object') for (const x of Object.values(v)) stringLeaves(x, out)
  return out
}

/**
 * 세트가 실제로 참조하는 자료 ID: 문항 materials_used·차시 materials_used와, 차시(활동지·발문·흐름)·문항(문두·조건)·지침서·안내장
 * 문장 속 '자료 X' 언급. 문장 언급까지 보는 까닭은 "어디서든 참조하는 자료는 절대 빼지 않는다"(대표 2026-09-26) — 더 넣는 쪽으로 틀린다.
 */
export function usedMaterialIds(parts: {
  lessons?: { materials_used?: string[] | null }[] | null
  items?: { materials_used?: string[] | null }[] | null
  texts?: unknown[]
}): Set<string> {
  const used = new Set<string>()
  for (const l of parts.lessons ?? []) for (const id of l.materials_used ?? []) used.add(id)
  for (const it of parts.items ?? []) for (const id of it.materials_used ?? []) used.add(id)
  for (const s of stringLeaves([parts.lessons ?? [], parts.items ?? [], ...(parts.texts ?? [])])) for (const id of mentionedMaterialIds(s)) used.add(id)
  return used
}
