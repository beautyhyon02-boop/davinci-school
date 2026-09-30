import { app } from '@/content/site'
import type { InquiryReport, InquirySource, InquiryTask, Outline } from '@/lib/inquiry/schema'
import { effectiveQuestions } from '@/lib/inquiry/schema'
import { buildOutline, guideFor, type Chapter, type OutlineSection } from '@/lib/inquiry/outline'
import { referenceLines } from '@/lib/inquiry/references'

const copy = app.inquiry
const v = copy.view

/**
 * 탐구보고서 한 부(설계 §7) — 상태·훅이 없는 순수 표시 컴포넌트. 화면 보기(원장·학생)와 인쇄에 같이 쓴다.
 * 표지(제목·부제·학년 반 번호 이름·융합 과목) → 차례 → 본문(로마 숫자 장) → 참고문헌. 모든 학생이 같은 모양.
 * 학년·반·번호는 손으로 쓰는 빈줄, 이름은 프로필에서. 인쇄 규칙은 app/globals.css 의 [data-inquiry-report](A4, 표지 뒤 새 쪽, 장은 가르지 않음).
 * 대표가 포맷 파일을 주면 이 컴포넌트 하나만 바꾼다.
 */

export type InquiryReportViewProps = {
  task: Pick<InquiryTask, 'title' | 'subtitle' | 'subjects' | 'questions' | 'section_guides'>
  outline: Outline
  report: Pick<InquiryReport, 'sections' | 'questions' | 'used_source_ids' | 'career_field'>
  /** 확인함 표시가 있는 자료만 넘긴다(참고문헌은 그중 학생이 체크한 것). */
  sources: InquirySource[]
  studentName: string
  academyName?: string
}

function Blank({ label, value }: { label: string; value?: string }) {
  return (
    <span className="inline-flex items-baseline gap-2">
      <span className="text-sm text-ink-500">{label}</span>
      <span data-inquiry-blank className="inline-block min-w-[3.5rem] border-b border-ink-900 px-1 text-base">{value ?? ' '}</span>
    </span>
  )
}

function Body({ text }: { text: string }) {
  const t = text.trim()
  if (!t) return <p className="text-sm text-ink-500">{v.emptySection}</p>
  return <p className="whitespace-pre-wrap text-base leading-relaxed text-ink-900">{t}</p>
}

export function InquiryReportView({ task, outline, report, sources, studentName, academyName }: InquiryReportViewProps) {
  const chapters = buildOutline(outline)
  const questions = effectiveQuestions(task, report)
  const refs = referenceLines(sources, report.used_source_ids)
  const career = outline.career ? report.career_field.trim() : ''

  const sectionTitle = (s: OutlineSection): string => {
    if (s.kind === 'text') return guideFor(s, task, outline, copy).title
    if (s.kind === 'questions') return copy.section.questions.title
    return copy.section.references.title
  }

  const renderSection = (ch: Chapter, s: OutlineSection, i: number) => {
    const showNo = ch.sections.length > 1
    const heading = showNo ? v.sectionNo(i + 1, sectionTitle(s)) : null
    return (
      <div key={s.kind === 'text' ? s.key : s.kind} data-inquiry-section={s.kind === 'text' ? s.key : s.kind} className="mt-3">
        {heading && <h4 className="text-base font-bold text-ink-900">{heading}</h4>}
        {s.kind === 'text' && (
          <div className="mt-1">
            {s.question && <p className="mb-1 text-sm font-semibold text-ink-700">{questions.find((q) => q.key === s.question)?.text}</p>}
            <Body text={report.sections[s.key] ?? ''} />
          </div>
        )}
        {s.kind === 'questions' && (
          <ol className="mt-1 space-y-1 text-base leading-relaxed">
            {questions.map((q) => <li key={q.key}><span className="font-semibold">{q.key}.</span> {q.text.trim() || v.emptySection}</li>)}
          </ol>
        )}
        {s.kind === 'references' && (
          refs.length === 0 ? <p className="mt-1 text-sm text-ink-500">{v.referencesNone}</p>
            : <ol data-inquiry-references className="mt-1 space-y-1.5 text-sm leading-relaxed">{refs.map((line, k) => <li key={k} className="break-words">{line}</li>)}</ol>
        )}
      </div>
    )
  }

  return (
    <article data-inquiry-report className="mx-auto max-w-[720px] rounded-2xl bg-white p-6 text-ink-900 print:max-w-none print:rounded-none print:p-0">
      {/* 표지 */}
      <section data-inquiry-page="cover" className="flex min-h-[60vh] flex-col justify-between border-b-2 border-mint-300 pb-6 print:min-h-0 print:border-0">
        <div>
          <p className="text-xs font-semibold text-mint-700">{v.coverLabel}</p>
          {academyName && <p className="mt-1 text-sm text-ink-500">{v.academyLine(academyName)}</p>}
        </div>
        <div className="my-10 text-center">
          <h2 className="text-3xl font-bold leading-snug">{task.title}</h2>
          {task.subtitle && <p className="mt-3 text-lg text-ink-700">{task.subtitle}</p>}
          <p className="mt-6 text-sm text-ink-500">{v.subjectsLine(task.subjects)}</p>
        </div>
        <div className="space-y-3">
          <p className="flex flex-wrap gap-x-6 gap-y-2">
            <Blank label={v.coverFields.grade} />
            <Blank label={v.coverFields.klass} />
            <Blank label={v.coverFields.number} />
            <Blank label={v.coverFields.name} value={studentName || undefined} />
          </p>
          {career && <p data-inquiry-career className="text-sm text-ink-700">{v.careerLine(career)}</p>}
        </div>
      </section>

      {/* 차례 */}
      <section data-inquiry-page="toc" className="mt-8">
        <h3 className="text-xl font-bold">{v.tocHeading}</h3>
        <ol className="mt-3 space-y-1.5 text-base">
          {chapters.map((ch) => (
            <li key={ch.key}>
              <p className="font-semibold">{v.chapterNo(ch.roman, copy.chapter[ch.key])}</p>
              {ch.sections.length > 1 && (
                <ol className="mt-0.5 space-y-0.5 pl-5 text-sm text-ink-700">
                  {ch.sections.map((s, i) => <li key={s.kind === 'text' ? s.key : s.kind}>{v.sectionNo(i + 1, sectionTitle(s))}</li>)}
                </ol>
              )}
            </li>
          ))}
        </ol>
      </section>

      {/* 본문 */}
      <section data-inquiry-page="body" className="mt-8 space-y-8">
        {chapters.map((ch) => (
          <div key={ch.key} data-inquiry-chapter={ch.key} className="break-inside-avoid">
            <h3 className="border-b border-ink-100 pb-1 text-lg font-bold text-mint-700">{v.chapterNo(ch.roman, copy.chapter[ch.key])}</h3>
            {ch.sections.map((s, i) => renderSection(ch, s, i))}
          </div>
        ))}
      </section>
    </article>
  )
}
