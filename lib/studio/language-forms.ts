// lib/studio/language-forms.ts
// 영어 세트의 목표 언어 형식(문법) — 대표 2026-11-14 "각 대주제에서 문법을 2개 이상 가르쳐야 해. 배운 문법을 사용해 문장을 다양하게 쓰는 연습".
// 2단계가 후보(language_form_candidates, 3~4개)를 내고 본사가 2~3개를 고른다(language_forms = 고른 이름). 고르지 않으면 앞의 두 개(막지 않는다).
// 고른 것만 3단계부터 쓴다(S-영-11~14). 설계: docs/superpowers/specs/2026-11-14-english-language-forms-design.md

export type LanguageForm = { name: string; form: string; example: string; use: string; basis?: string }

/** 본사가 고르는 개수(S-영-11). */
export const LANGUAGE_FORM_PICK = { min: 2, max: 3 } as const
/** 고르지 않았을 때 쓰는 개수 — 후보는 권하는 순서대로 놓인다. */
export const LANGUAGE_FORM_DEFAULT = 2

const isForm = (v: unknown): v is LanguageForm => !!v && typeof v === 'object' && typeof (v as LanguageForm).name === 'string' && (v as LanguageForm).name.trim() !== ''

/** 2단계 출력의 후보(없거나 모양이 다르면 빈 배열 — 옛 세트·다른 과목). */
export function languageFormCandidates(stage2: unknown): LanguageForm[] {
  const list = (stage2 as { language_form_candidates?: unknown } | null | undefined)?.language_form_candidates
  return Array.isArray(list) ? list.filter(isForm) : []
}

/**
 * 이 세트가 쓰는 목표 언어 형식: 본사가 고른 이름(language_forms)에 해당하는 후보를 후보 순서대로.
 * 고른 것이 없거나 후보에 없는 이름만 남았으면(2단계를 다시 생성해 후보가 바뀜) 앞의 두 개. 후보가 없으면 빈 배열.
 */
export function selectedLanguageForms(stage2: unknown): LanguageForm[] {
  const candidates = languageFormCandidates(stage2)
  if (candidates.length === 0) return []
  const picked = (stage2 as { language_forms?: unknown }).language_forms
  const names = Array.isArray(picked) ? picked.filter((n): n is string => typeof n === 'string') : []
  const chosen = candidates.filter((c) => names.includes(c.name))
  return chosen.length > 0 ? chosen : candidates.slice(0, LANGUAGE_FORM_DEFAULT)
}

/** 고른 이름 검사: 후보에 있는 이름만, 겹침은 하나로, 2~3개. 돌려주는 이름은 후보 순서. */
export function validateLanguageFormPick(names: string[], candidates: LanguageForm[]): { ok: true; names: string[] } | { ok: false; code: 'unknown' | 'count' } {
  const known = candidates.map((c) => c.name)
  const unique = [...new Set(names)]
  if (unique.some((n) => !known.includes(n))) return { ok: false, code: 'unknown' }
  if (unique.length < LANGUAGE_FORM_PICK.min || unique.length > LANGUAGE_FORM_PICK.max) return { ok: false, code: 'count' }
  return { ok: true, names: known.filter((n) => unique.includes(n)) }
}

/** 3·5·6단계 프롬프트에 붙이는 줄 — 고른 형식만 보여 준다(고르지 않은 후보는 입력에 넣지 않는다). 없으면 ''. */
export function languageFormsBlock(forms: LanguageForm[]): string {
  if (forms.length === 0) return ''
  return `목표 언어 형식(본사가 고른 것, S-영-11):\n${forms.map((f, i) => `${i + 1}. ${f.name} — 꼴: ${f.form} — 예문: ${f.example} — 하는 일: ${f.use}`).join('\n')}`
}
