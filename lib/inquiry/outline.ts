import { QUESTION_KEYS, TEXT_SECTION_KEYS, type InquiryReport, type InquiryTask, type Outline, type OutlineMethod, type QuestionKey, type TextSectionKey } from './schema'

/**
 * 목차(설계 §5·Q-7, 순수): Ⅰ 서론(탐구 동기·탐구 문제) → Ⅱ 이론적 배경 → (Ⅲ 탐구 방법) → 탐구 결과 → 결론 → 배우고 느낀 점 → 참고문헌.
 * 탐구 방법을 생략하면(기본값) 그 뒤 장 번호를 당긴다(탐구 결과가 Ⅲ). 희망 진로는 장이 아니라 표지 아래 한 줄이다(Q-9).
 * 학생이 쓰는 칸의 순서(설계 §6): 희망 진로(선택) → 탐구 동기 → 탐구 문제 → 이론적 배경 → (탐구 방법) → 탐구 결과 가·나·다 → 결론 → 배우고 느낀 점 → 참고문헌.
 */

export type ChapterKey = 'intro' | 'background' | 'method' | 'results' | 'conclusion' | 'reflection' | 'references'
/** 장 안의 절: 글 칸 열쇠, 탐구 문제 목록, 참고문헌 목록. */
export type OutlineSection = { kind: 'text'; key: TextSectionKey; question?: QuestionKey } | { kind: 'questions' } | { kind: 'references' }
export type Chapter = { no: number; roman: string; key: ChapterKey; sections: OutlineSection[] }

const ROMAN = ['Ⅰ', 'Ⅱ', 'Ⅲ', 'Ⅳ', 'Ⅴ', 'Ⅵ', 'Ⅶ', 'Ⅷ']
export const romanNumeral = (n: number): string => ROMAN[n - 1] ?? String(n)

export function buildOutline(outline: Outline): Chapter[] {
  const raw: { key: ChapterKey; sections: OutlineSection[] }[] = [
    { key: 'intro', sections: [{ kind: 'text', key: 'motive' }, { kind: 'questions' }] },
    { key: 'background', sections: [{ kind: 'text', key: 'background' }] },
    ...(outline.method === 'none' ? [] : [{ key: 'method' as const, sections: [{ kind: 'text' as const, key: 'method' as const }] }]),
    { key: 'results', sections: QUESTION_KEYS.map((q) => ({ kind: 'text' as const, key: `result_${q}` as TextSectionKey, question: q })) },
    { key: 'conclusion', sections: [{ kind: 'text', key: 'conclusion' }] },
    { key: 'reflection', sections: [{ kind: 'text', key: 'reflection' }] },
    { key: 'references', sections: [{ kind: 'references' }] },
  ]
  return raw.map((c, i) => ({ no: i + 1, roman: romanNumeral(i + 1), ...c }))
}

/** 학생 쓰기 화면의 칸 순서(위에서 아래로). */
export type WritingBox = { kind: 'career' } | { kind: 'questions' } | { kind: 'text'; key: TextSectionKey; question?: QuestionKey } | { kind: 'references' }

export function writingBoxes(outline: Outline): WritingBox[] {
  const boxes: WritingBox[] = []
  if (outline.career) boxes.push({ kind: 'career' })
  for (const ch of buildOutline(outline)) for (const s of ch.sections) boxes.push(s)
  // 서론 = 탐구 동기 → 탐구 문제 순서 그대로(§6)
  return boxes
}

/** 지금 목차에 들어 있는 글 칸 열쇠. */
export function activeTextKeys(outline: Outline): TextSectionKey[] {
  return writingBoxes(outline).flatMap((b) => (b.kind === 'text' ? [b.key] : []))
}

/** 목차를 바꿔 숨긴 칸(글은 지우지 않고 숨긴다 — 설계 §5). 지금은 탐구 방법 칸뿐이다. */
export function hiddenTextKeys(outline: Outline, sections: InquiryReport['sections']): TextSectionKey[] {
  const active = new Set(activeTextKeys(outline))
  return TEXT_SECTION_KEYS.filter((k) => !active.has(k) && (sections[k] ?? '').trim().length > 0)
}

/** 작성 현황: 지금 목차의 글 칸(희망 진로 칸이 켜져 있으면 그것도) 가운데 글이 있는 칸 수 / 전체. */
export function progressOf(outline: Outline, report: Pick<InquiryReport, 'sections' | 'career_field'>): { filled: number; total: number } {
  const keys = activeTextKeys(outline)
  let filled = keys.filter((k) => (report.sections[k] ?? '').trim().length > 0).length
  let total = keys.length
  if (outline.career) { total += 1; if (report.career_field.trim().length > 0) filled += 1 }
  return { filled, total }
}

/** 칸의 길잡이 질문·권장 분량: 과제의 덮어쓰기(section_guides) → 기본 문구(copy). 탐구 방법 칸은 고른 방법의 질문. */
export type GuideCopy = {
  section: Record<'career' | 'motive' | 'questions' | 'background' | 'method' | 'conclusion' | 'reflection' | 'references', { title: string; guide: string; length: string }> & { result: { title: (key: string) => string; guide: string; length: string } }
  methodGuide: Record<Exclude<OutlineMethod, 'none'>, string>
}

export type BoxGuide = { title: string; guide: string; length: string }

export function guideFor(box: WritingBox, task: Pick<InquiryTask, 'section_guides'>, outline: Outline, copy: GuideCopy): BoxGuide {
  const guideKey = box.kind === 'text' ? box.key : box.kind
  const override = task.section_guides[guideKey]
  let base: BoxGuide
  if (box.kind === 'text' && box.question) base = { title: copy.section.result.title(box.question), guide: copy.section.result.guide, length: copy.section.result.length }
  else if (box.kind === 'text' && box.key === 'method') base = { ...copy.section.method, guide: outline.method === 'none' ? copy.section.method.guide : copy.methodGuide[outline.method] }
  else if (box.kind === 'text') base = copy.section[box.key as Exclude<TextSectionKey, 'method' | `result_${QuestionKey}`>]
  else base = copy.section[box.kind]
  return { title: base.title, guide: override?.question?.trim() || base.guide, length: override?.length?.trim() || base.length }
}
