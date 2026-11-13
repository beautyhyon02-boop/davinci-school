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

/** 2단계 출력의 후보(없거나 모양이 다르면 빈 배열 — 옛 세트·다른 과목). 이름이 겹친 후보는 앞의 것만 남긴다(고르기·화면의 키가 이름이다). */
export function languageFormCandidates(stage2: unknown): LanguageForm[] {
  const list = (stage2 as { language_form_candidates?: unknown } | null | undefined)?.language_form_candidates
  if (!Array.isArray(list)) return []
  const seen = new Set<string>()
  return list.filter(isForm).filter((f) => (seen.has(f.name) ? false : (seen.add(f.name), true)))
}

/**
 * 이 세트가 쓰는 목표 언어 형식: 본사가 고른 이름(language_forms)에 해당하는 후보를 후보 순서대로.
 * 고른 것이 없으면 앞의 두 개. 고른 이름 가운데 후보에 남은 것이 두 개가 안 되면(2단계를 고쳐 이름이 바뀜) 앞의 후보로 두 개까지 채운다 —
 * 세트는 언제나 2개 이상을 가르친다(S-영-11). 후보가 없으면 빈 배열, 후보가 하나뿐이면 그 하나.
 */
export function selectedLanguageForms(stage2: unknown): LanguageForm[] {
  const candidates = languageFormCandidates(stage2)
  if (candidates.length === 0) return []
  const picked = (stage2 as { language_forms?: unknown }).language_forms
  const names = new Set(Array.isArray(picked) ? picked.filter((n): n is string => typeof n === 'string') : [])
  const chosen = new Set(candidates.filter((c) => names.has(c.name)).map((c) => c.name))
  for (const c of candidates) { if (chosen.size >= LANGUAGE_FORM_DEFAULT) break; chosen.add(c.name) }
  return candidates.filter((c) => chosen.has(c.name))
}

/** 고른 이름 검사: 후보에 있는 이름만, 겹침은 하나로, 2~3개. 돌려주는 이름은 후보 순서. */
export function validateLanguageFormPick(names: string[], candidates: LanguageForm[]): { ok: true; names: string[] } | { ok: false; code: 'unknown' | 'count' } {
  const known = [...new Set(candidates.map((c) => c.name))]
  const unique = [...new Set(names)]
  if (unique.some((n) => !known.includes(n))) return { ok: false, code: 'unknown' }
  if (unique.length < LANGUAGE_FORM_PICK.min || unique.length > LANGUAGE_FORM_PICK.max) return { ok: false, code: 'count' }
  return { ok: true, names: known.filter((n) => unique.includes(n)) }
}

/** 3·4·5·6단계 프롬프트에 붙이는 줄 — 고른 형식만 보여 준다(고르지 않은 후보는 입력에 넣지 않는다). 없으면 ''. */
export function languageFormsBlock(forms: LanguageForm[]): string {
  if (forms.length === 0) return ''
  return `목표 언어 형식(본사가 고른 것, S-영-11):\n${forms.map((f, i) => `${i + 1}. ${f.name} — 꼴: ${f.form} — 예문: ${f.example} — 하는 일: ${f.use}`).join('\n')}`
}

type Rec = Record<string, unknown>
const isRec = (v: unknown): v is Rec => !!v && typeof v === 'object' && !Array.isArray(v)
const without = (o: Rec, keys: string[]): Rec => Object.fromEntries(Object.entries(o).filter(([k]) => !keys.includes(k)))
/** 차시마다·퀴즈마다 fn 으로 고친 3단계 출력(모양이 다르면 그대로). */
function mapLessonsAndQuiz(o: unknown, lessonFn: (l: Rec) => Rec, quizFn: (q: Rec) => Rec): unknown {
  if (!isRec(o) || !Array.isArray(o.lessons)) return o
  return { ...o, lessons: o.lessons.map((l) => {
    if (!isRec(l)) return l
    const fc = l.formative_check
    const next = isRec(fc) && Array.isArray(fc.quiz) ? { ...l, formative_check: { ...fc, quiz: fc.quiz.map((q) => (isRec(q) ? quizFn(q) : q)) } } : l
    return lessonFn(next)
  }) }
}

/**
 * 형식 검사(zod) 전 손질 — 모델이 새 칸을 null 로 내거나(선택 칸은 null 을 받지 않는다) 2단계에서 본사가 고르는 칸(language_forms)을 스스로 채우면
 * 생성이 통째로 실패하거나 "본사가 고른 것"으로 보이게 된다(독립 검토 2026-11-14). 2단계: language_forms 삭제, 배열이 아닌 후보 삭제.
 * 3단계: null 인 language_focus·language_form 삭제. 그 밖의 단계는 그대로.
 */
export function repairLanguageKeys(stage: number, raw: unknown): unknown {
  if (stage === 2 && isRec(raw)) {
    const o = without(raw, ['language_forms'])
    return Array.isArray(o.language_form_candidates) ? o : without(o, ['language_form_candidates'])
  }
  if (stage === 3) {
    const dropNull = (key: string) => (o: Rec) => (o[key] === null || o[key] === '' ? without(o, [key]) : o)
    return mapLessonsAndQuiz(raw, dropNull('language_focus'), dropNull('language_form'))
  }
  return raw
}

/**
 * 형식 검사 뒤 손질 — 스키마의 선택 칸은 모든 과목의 생성에 보이므로, 영어가 아닌 세트나 목표 문법을 정하지 않은 영어 세트(2단계에 후보가 없는
 * 옛 세트)가 이 칸들을 지어내면 뺀다: 그대로 두면 지어낸 language_form 이 게시돼 AI 뜻 판정이 "그 형식을 쓰지 않았으면 틀림"으로 채점한다.
 * 2단계: 영어가 아니면 후보 삭제. 3단계: language_focus·퀴즈 language_form 삭제. 6단계: language_forms 삭제. (hasForms = 고른 형식이 있다)
 */
export function scrubLanguageForms(stage: number, output: unknown, ctx: { subject: string; hasForms: boolean }): unknown {
  const english = ctx.subject === '영어'
  if (stage === 2) return !english && isRec(output) ? without(output, ['language_form_candidates', 'language_forms']) : output
  if (english && ctx.hasForms) return output
  if (stage === 3) return mapLessonsAndQuiz(output, (l) => without(l, ['language_focus']), (q) => without(q, ['language_form']))
  if (stage === 6) return isRec(output) ? without(output, ['language_forms']) : output
  return output
}
