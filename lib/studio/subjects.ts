/**
 * 제작소 과목 묶음(대표 결정 2026-09-30): 사회·한국사·세계사를 따로 나누지 않고 「사회」 한 과목으로 묶는다.
 * DB enum·standards.subject·data/standards/*.json 의 값(사회/한국사/세계사 = 교육부 분류)은 그대로 두고,
 * 코드에서만 묶는다 — 옛 대주제·세트·게시 판의 한국사/세계사는 계속 읽힌다(lib/studio/schemas.ts SUBJECTS).
 * 이 파일은 화면(클라이언트)에서도 쓰므로 다른 모듈을 끌어오지 않는다.
 */

/** 새 대주제·새 세트에서 고를 수 있는 과목(원장 화면의 과목 필터도 이 다섯). */
export const STUDIO_SUBJECTS = ['국어', '영어', '수학', '과학', '사회'] as const
export type StudioSubject = (typeof STUDIO_SUBJECTS)[number]

/** 사회로 묶인 교육부 분류(성취기준 subject 값). 순서 = 화면·리포트 순서. */
const SOCIAL_GROUP = ['사회', '한국사', '세계사'] as const

export const isStudioSubject = (s: string): s is StudioSubject => (STUDIO_SUBJECTS as readonly string[]).includes(s)

/** 옛 과목 이름(한국사·세계사) — 읽기·빼기만 되고 새로 고를 수는 없다. */
export const isLegacySubject = (s: string): boolean => s === '한국사' || s === '세계사'

/** 세트 과목 → 그 세트가 고를 수 있는 성취기준의 subject 값들. 사회 → 사회·한국사·세계사, 그 밖에는 자기 자신. */
export function standardSubjectsFor(subject: string): string[] {
  return subject === '사회' ? [...SOCIAL_GROUP] : [subject]
}

/** 어떤 과목 이름이든 제작소 과목으로(한국사·세계사 → 사회). 필터·묶어 보기용. */
export function studioSubjectOf(subject: string): string {
  return isLegacySubject(subject) ? '사회' : subject
}

/** 역사 영역 성취기준 코드인가([9역…]·[10한사…]·[12세사…]·[12동역…]·[12역현…]). */
export function isHistoryCode(code: string): boolean {
  const m = /^\[\d+([가-힣]+)/u.exec(code.trim())
  if (!m) return false
  return ['역', '한사', '한국사', '세사', '세계사', '동역', '역현'].includes(m[1])
}

/**
 * 성취기준 고르기 화면의 묶음 열쇠. 코드 머리(학년 숫자 + 과목 글자, 괄호 포함)에서 뽑는다:
 * [9사(지리)01-01] → '9사(지리)', [10통사1-01-01] → '10통사', [12세사01-01] → '12세사', [4사01-01] → '4사'.
 * 중학교 역사([9역…])만 교육부 분류(한국사/세계사 영역)로 한 번 더 나눈다 → '9역-세계사'·'9역-한국사'.
 * 코드 모양이 아니면 ''(묶음 제목 없음).
 */
export function standardFamilyKey(code: string, subject: string): string {
  const m = /^\[(\d+)([가-힣]+(?:\([가-힣]+\))?)/u.exec(code.trim())
  if (!m) return ''
  const key = `${m[1]}${m[2]}`
  if (key === '9역' && isLegacySubject(subject)) return `${key}-${subject}`
  return key
}

export type FamilyRow = { code: string; subject: string; domain: string }
export type StandardFamily<T extends FamilyRow> = { key: string; domains: { domain: string; rows: T[] }[] }

const gradeOf = (key: string) => Number(/^\d+/.exec(key)?.[0] ?? 0)

/**
 * 한 세트 과목의 성취기준을 묶음(영역 가족) → 영역(domain) → 코드 순으로 정리한다.
 * 묶음 순서: 학년 숫자 → 사회(지리·일반사회…) 먼저, 역사 나중 → 그 묶음의 첫 코드. 사회가 아닌 과목은 묶음 하나(열쇠 '').
 */
export function groupStandardFamilies<T extends FamilyRow>(rows: T[], setSubject: string): StandardFamily<T>[] {
  const grouped = setSubject === '사회'
  const families = new Map<string, { history: boolean; first: string; domains: Map<string, T[]> }>()
  for (const r of [...rows].sort((a, b) => a.code.localeCompare(b.code, 'ko'))) {
    const key = grouped ? standardFamilyKey(r.code, r.subject) : ''
    let f = families.get(key)
    if (!f) { f = { history: grouped && (isLegacySubject(r.subject) || isHistoryCode(r.code)), first: r.code, domains: new Map() }; families.set(key, f) }
    const list = f.domains.get(r.domain) ?? []
    list.push(r)
    f.domains.set(r.domain, list)
  }
  return [...families.entries()]
    .sort(([ka, a], [kb, b]) => gradeOf(ka) - gradeOf(kb) || Number(a.history) - Number(b.history) || a.first.localeCompare(b.first, 'ko'))
    .map(([key, f]) => ({ key, domains: [...f.domains.entries()].map(([domain, list]) => ({ domain, rows: list })) }))
}
