import { QUESTION_KEYS, type InquirySource, type InquiryTask, type QuestionKey } from './schema'

/**
 * 게시 관문(설계 §4, 순수): 막는 것은 자료의 진위에 관한 것뿐이다 — 확인함 표시가 있는 논문 ≥ 2, 기사 ≥ 1, 도서 ≥ 1, 탐구 문제마다 확인된 자료 ≥ 1.
 * 그 밖에 학생 화면이 비지 않게 제목·과목 2개·문제 문장·확인된 자료의 제목과 URL 도 본다(빈 과제를 게시하지 않게).
 * 결과는 문구 열쇠 목록 — 문장은 content/site.ts(app.inquiry.gate)가 만든다.
 */

export const MIN_PAPERS = 2
export const MIN_NEWS = 1
export const MIN_BOOKS = 1

export type GateMissing =
  | { kind: 'papers'; need: number }
  | { kind: 'news' }
  | { kind: 'book' }
  | { kind: 'question'; key: QuestionKey }
  | { kind: 'title' }
  | { kind: 'subjects' }
  | { kind: 'questionText'; key: QuestionKey }
  | { kind: 'sourceIncomplete'; title: string }

/** 확인함 표시가 있는가(저장할 때 서버가 누가·언제를 찍는다 — lib/inquiry/save.ts). */
export const isVerified = (s: InquirySource): boolean => s.verified !== null

/** 확인함 표시가 있는 자료만(학생·원장에게 보이는 자료, Q-6). */
export function visibleSources(task: Pick<InquiryTask, 'sources'>): InquirySource[] {
  return task.sources.filter(isVerified)
}

export function publishGate(task: InquiryTask): { ok: boolean; missing: GateMissing[] } {
  const missing: GateMissing[] = []
  if (!task.title.trim()) missing.push({ kind: 'title' })
  if (task.subjects.length < 2) missing.push({ kind: 'subjects' })
  for (const key of QUESTION_KEYS) {
    if (!(task.questions.find((q) => q.key === key)?.text ?? '').trim()) missing.push({ kind: 'questionText', key })
  }
  const verified = visibleSources(task)
  const papers = verified.filter((s) => s.kind === 'paper').length
  if (papers < MIN_PAPERS) missing.push({ kind: 'papers', need: MIN_PAPERS - papers })
  if (verified.filter((s) => s.kind === 'news').length < MIN_NEWS) missing.push({ kind: 'news' })
  if (verified.filter((s) => s.kind === 'book').length < MIN_BOOKS) missing.push({ kind: 'book' })
  for (const key of QUESTION_KEYS) {
    if (!verified.some((s) => s.for_questions.includes(key))) missing.push({ kind: 'question', key })
  }
  for (const s of verified) {
    if (!s.title.trim() || !s.url.trim()) missing.push({ kind: 'sourceIncomplete', title: s.title.trim() || s.id })
  }
  return { ok: missing.length === 0, missing }
}

export type GateCopy = {
  papers: (n: number) => string; news: string; book: string; question: (key: string) => string
  title: string; subjects: string; questionText: (key: string) => string; sourceIncomplete: (title: string) => string
}

export function gateMessages(missing: GateMissing[], copy: GateCopy): string[] {
  return missing.map((m) => {
    switch (m.kind) {
      case 'papers': return copy.papers(m.need)
      case 'news': return copy.news
      case 'book': return copy.book
      case 'question': return copy.question(m.key)
      case 'title': return copy.title
      case 'subjects': return copy.subjects
      case 'questionText': return copy.questionText(m.key)
      case 'sourceIncomplete': return copy.sourceIncomplete(m.title)
    }
  })
}
