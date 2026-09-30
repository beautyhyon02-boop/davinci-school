import { z } from 'zod'
import { STUDIO_SUBJECTS } from '@/lib/studio/subjects'

/**
 * 교과융합 탐구보고서의 자료 모양(설계 docs/superpowers/specs/2026-09-30-inquiry-report-design.md §4~§6) — 단일 출처.
 * 화면(클라이언트)에서도 쓰므로 서버 전용 모듈을 끌어오지 않는다.
 *
 * 과제(InquiryTask)는 "확인만 누르면 진행" 원칙대로 느슨하게 받는다 — 제목 한 글자만 있으면 초안으로 저장된다.
 * 빠진 것(과목 2개, 문제 문장, 확인된 자료 수)은 저장이 아니라 게시 관문(lib/inquiry/publish-gate.ts)이 알려 준다.
 */

export const QUESTION_KEYS = ['가', '나', '다'] as const
export type QuestionKey = (typeof QUESTION_KEYS)[number]
export const QuestionKeySchema = z.enum(QUESTION_KEYS)

export const SOURCE_KINDS = ['paper', 'news', 'book'] as const
export type SourceKind = (typeof SOURCE_KINDS)[number]

export const INQUIRY_LEVELS = ['초', '중'] as const
export type InquiryLevel = (typeof INQUIRY_LEVELS)[number]

/** 학생이 쓰는 칸 하나의 최대 글자 수(권장 분량은 훨씬 짧다 — 붙여넣기 폭주만 막는다). */
export const SECTION_MAX_CHARS = 3000
export const QUESTION_MAX_CHARS = 200
export const CAREER_MAX_CHARS = 200

const trimmed = (max: number) => z.string().trim().max(max)
/** 비어 있거나 http(s) 주소. */
const httpUrl = z.string().trim().max(500).refine((u) => u === '' || /^https?:\/\/\S+$/i.test(u), { message: 'url' })
const isoDate = z.string().trim().refine((d) => d === '' || /^\d{4}-\d{2}-\d{2}$/.test(d), { message: 'date' })

export const InquiryExcerpt = z.object({
  text: trimmed(600),
  locator: trimmed(120).default(''),
})
export type InquiryExcerpt = z.infer<typeof InquiryExcerpt>

/** 확인함 표시 — 누가·언제. null 이면 아직 확인하지 않은 자료(학생·원장에게 보이지 않는다, Q-6). */
export const Verified = z.object({ by: trimmed(80), at: trimmed(40) })
export type Verified = z.infer<typeof Verified>

export const InquirySource = z.object({
  id: z.string().trim().min(1).max(40),
  kind: z.enum(SOURCE_KINDS),
  title: trimmed(300),
  /** 저자(논문·도서) 또는 기자(기사). 여러 명이면 쉼표로 잇는다. */
  authors: trimmed(200).default(''),
  /** 연도 네 자리(참고문헌의 (연도)). */
  year: trimmed(10).default(''),
  /** 기사 날짜 YYYY-MM-DD(참고문헌의 (연도-월-일)). 논문·도서는 비운다. */
  date: isoDate.default(''),
  /** 학술지 · 매체 · 출판사 */
  container: trimmed(200).default(''),
  /** 권(호)·쪽, 학술대회 자료집 이름 등(참고문헌에서 학술지 뒤에 붙는다). */
  detail: trimmed(200).default(''),
  url: httpUrl.default(''),
  /** 학술대회 발표문 등 비고(교사용). */
  note: trimmed(200).default(''),
  /** 학생용 쉬운 요약 2~3문장. */
  easy_summary: trimmed(600).default(''),
  excerpts: z.array(InquiryExcerpt).max(10).default([]),
  for_questions: z.array(QuestionKeySchema).max(3).default([]),
  verified: Verified.nullable().default(null),
})
export type InquirySource = z.infer<typeof InquirySource>

export const InquiryQuestion = z.object({
  key: QuestionKeySchema,
  text: trimmed(QUESTION_MAX_CHARS).default(''),
  /** "사회의 눈 / 국어의 눈 / 융합" — 어느 과목의 눈으로 보는 문제인가. */
  lens: trimmed(60).default(''),
})
export type InquiryQuestion = z.infer<typeof InquiryQuestion>

/** 칸 길잡이 덮어쓰기: 비운 항목은 content/site.ts 기본 문구. */
export const SectionGuide = z.object({ question: trimmed(300).default(''), length: trimmed(60).default('') })
export type SectionGuide = z.infer<typeof SectionGuide>

/** 탐구 문제는 가·나·다 순서 그대로 정확히 3개. */
const threeQuestions = z.array(InquiryQuestion).length(3).refine((qs) => qs.every((q, i) => q.key === QUESTION_KEYS[i]), { message: 'question keys must be 가·나·다 in order' })

export const InquiryTask = z.object({
  title: trimmed(120),
  subtitle: trimmed(160).default(''),
  subjects: z.array(z.enum(STUDIO_SUBJECTS)).max(STUDIO_SUBJECTS.length).default([]).transform((s) => [...new Set(s)]),
  level: z.enum(INQUIRY_LEVELS).default('중'),
  theme_id: z.uuid().nullable().default(null),
  questions: threeQuestions,
  sources: z.array(InquirySource).max(30).default([]).refine((ss) => new Set(ss.map((s) => s.id)).size === ss.length, { message: 'source ids must be unique' }),
  section_guides: z.record(z.string(), SectionGuide).default({}),
  teacher_tips: z.array(trimmed(200)).max(20).default([]),
})
export type InquiryTask = z.infer<typeof InquiryTask>

/** 파일(data/inquiry/*.json)이나 붙여넣기에서 들어오는 과제 — 확인함 표시는 받지 않는다(본사가 화면에서 직접 체크한다). */
export function parseTaskJson(raw: unknown): { ok: true; task: InquiryTask } | { ok: false; error: 'json' | 'shape' } {
  let value: unknown = raw
  if (typeof raw === 'string') {
    try { value = JSON.parse(raw) } catch { return { ok: false, error: 'json' } }
  }
  const parsed = InquiryTask.safeParse(value)
  if (!parsed.success) return { ok: false, error: 'shape' }
  return { ok: true, task: { ...parsed.data, sources: parsed.data.sources.map((s) => ({ ...s, verified: null })) } }
}

/** 빈 과제(새 과제를 만들 때). */
export function emptyTask(): InquiryTask {
  return {
    title: '', subtitle: '', subjects: [], level: '중', theme_id: null,
    questions: QUESTION_KEYS.map((key) => ({ key, text: '', lens: '' })),
    sources: [], section_guides: {}, teacher_tips: [],
  }
}

// ── 목차·보고서 ─────────────────────────────────────────────────────────

export const OUTLINE_METHODS = ['none', 'survey', 'experiment', 'data'] as const
export type OutlineMethod = (typeof OUTLINE_METHODS)[number]

export const Outline = z.object({
  method: z.enum(OUTLINE_METHODS).default('none'),
  career: z.boolean().default(true),
})
export type Outline = z.infer<typeof Outline>
export const DEFAULT_OUTLINE: Outline = { method: 'none', career: true }

/** 학생이 글을 쓰는 칸의 열쇠(희망 진로·탐구 문제·참고문헌은 글 칸이 아니라 따로 저장한다). */
export const TEXT_SECTION_KEYS = ['motive', 'background', 'method', 'result_가', 'result_나', 'result_다', 'conclusion', 'reflection'] as const
export type TextSectionKey = (typeof TEXT_SECTION_KEYS)[number]
export const TextSectionKeySchema = z.enum(TEXT_SECTION_KEYS)
export const isTextSectionKey = (k: string): k is TextSectionKey => (TEXT_SECTION_KEYS as readonly string[]).includes(k)

/** sections jsonb — 열쇠마다 글(칸 하나 최대 SECTION_MAX_CHARS). 모르는 열쇠는 버린다. */
export const ReportSections = z.record(z.string(), z.string().max(SECTION_MAX_CHARS)).transform((rec) => {
  const out: Partial<Record<TextSectionKey, string>> = {}
  for (const k of TEXT_SECTION_KEYS) if (typeof rec[k] === 'string') out[k] = rec[k]
  return out
})
export type ReportSections = Partial<Record<TextSectionKey, string>>

export const ReportQuestion = z.object({ key: QuestionKeySchema, text: z.string().max(QUESTION_MAX_CHARS) })
export type ReportQuestion = z.infer<typeof ReportQuestion>

export const InquiryReport = z.object({
  sections: ReportSections.default({}),
  questions: z.array(ReportQuestion).max(3).default([]),
  used_source_ids: z.array(z.string().max(40)).max(30).default([]),
  career_field: z.string().max(CAREER_MAX_CHARS).default(''),
  updated_at: z.string().nullable().default(null),
  submitted_at: z.string().nullable().default(null),
})
export type InquiryReport = z.infer<typeof InquiryReport>

export function emptyReport(): InquiryReport {
  return { sections: {}, questions: [], used_source_ids: [], career_field: '', updated_at: null, submitted_at: null }
}

/** 학생 보고서의 탐구 문제: 학생이 고친 사본이 있으면 그것, 없으면 과제의 문제. 늘 가·나·다 3개. */
export function effectiveQuestions(task: Pick<InquiryTask, 'questions'>, report: Pick<InquiryReport, 'questions'>): ReportQuestion[] {
  return QUESTION_KEYS.map((key) => {
    const mine = report.questions.find((q) => q.key === key)
    const base = task.questions.find((q) => q.key === key)
    return { key, text: mine?.text ?? base?.text ?? '' }
  })
}
