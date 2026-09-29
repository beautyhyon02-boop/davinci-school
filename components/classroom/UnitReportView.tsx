import { app } from '@/content/site'
import { RadarChart } from './RadarChart'
import type { UnitReportBody, ReportSubject, ReportQuiz } from '@/lib/classroom/report-schema'

const copy = app.classroom.report.view

/**
 * 단원 리포트 한 부(설계 2026-09-29 §5.4). 상태·훅이 없는 순수 표시 컴포넌트 — 화면 미리보기와 인쇄에 같이 쓴다.
 * 앞면(data-report-page="front"): 학생·단원, 육각형, 역량별 점수, 과목별 한 줄 요약, 종합 코멘트.
 * 뒷면(data-report-page="detail"): 과목마다 한 덩어리 — 인쇄할 때 새 쪽에서 시작한다(app/globals.css).
 * 내용은 옆으로 잇지 않는다: 한 줄에 하나, 위계는 글자 크기·굵기·줄바꿈으로. 다른 학생과의 비교는 없다(R-7).
 * 인쇄: 앞면은 과목이 다섯이어도 A4 한 쪽에 들어가게 줄 간격·육각형 크기를 줄인다(app/globals.css 의 [data-unit-report] 규칙).
 * 「초안」 표시(data-report-draft)는 인쇄할 때 쪽마다 오른쪽 위에 찍힌다.
 */

function Heading({ children }: { children: React.ReactNode }) {
  return <h3 className="border-b border-ink-100 pb-1 text-base font-bold text-mint-700">{children}</h3>
}

function groupByLesson(quizzes: ReportQuiz[]): { lessonNo: number; items: ReportQuiz[] }[] {
  const out: { lessonNo: number; items: ReportQuiz[] }[] = []
  for (const q of quizzes) {
    const g = out.find((x) => x.lessonNo === q.lesson_no)
    if (g) g.items.push(q); else out.push({ lessonNo: q.lesson_no, items: [q] })
  }
  return out.sort((a, b) => a.lessonNo - b.lessonNo)
}

function MissingNote({ subject }: { subject: ReportSubject }) {
  const m = subject.missing
  if (!m.lessons.length && !m.quiz_answers.length && !m.items.length) return null
  return (
    <div data-report-missing className="mt-4 rounded-xl bg-lemon-50 p-3 text-sm text-ink-700">
      <p className="font-semibold">{copy.missingHeading}</p>
      <ul className="mt-1 space-y-1">
        {m.lessons.length > 0 && <li>{copy.missingLessons(m.lessons)}</li>}
        {m.quiz_answers.length > 0 && <li>{copy.missingQuiz(m.quiz_answers)}</li>}
        {m.items.length > 0 && <li>{copy.missingItems(m.items.map((i) => i.kind))}</li>}
      </ul>
    </div>
  )
}

function SubjectBlock({ subject }: { subject: ReportSubject }) {
  const lessons = groupByLesson(subject.quizzes)
  return (
    <section data-report-subject={subject.subject} className="mt-6 break-inside-avoid rounded-2xl border border-ink-100 p-5 print:rounded-none print:border-0 print:border-t print:px-0">
      <h3 className="text-lg font-bold text-ink-900">{subject.subject}</h3>
      {subject.key_question && (
        <div className="mt-1">
          <p className="text-xs font-semibold text-ink-500">{copy.keyQuestion}</p>
          <p className="text-sm leading-relaxed text-ink-900">{subject.key_question}</p>
        </div>
      )}

      <div className="mt-4">
        <p className="text-sm font-bold text-mint-700">{copy.quizHeading}</p>
        {lessons.length === 0 ? (
          <p className="mt-1 text-sm text-ink-500">{copy.quizNone}</p>
        ) : (
          <>
            <p className="mt-1 text-sm text-ink-700">{copy.quizScore(subject.quiz_correct, subject.quiz_total)}</p>
            <ul className="mt-2 space-y-3">
              {lessons.map((l) => {
                const wrong = l.items.filter((q) => !q.correct)
                return (
                  <li key={l.lessonNo} data-report-lesson={l.lessonNo}>
                    <p className="text-sm">
                      <span className="font-semibold">{copy.lesson(l.lessonNo)}</span>
                      {l.items.map((q) => (
                        <span key={q.quiz_no} aria-label={copy.markAria(q.quiz_no, q.correct)} className={`ml-3 font-bold ${q.correct ? 'text-mint-700' : 'text-lavender-700'}`}>
                          {q.correct ? copy.markCorrect : copy.markWrong}
                        </span>
                      ))}
                    </p>
                    {wrong.length > 0 && (
                      <ul className="mt-1 space-y-2 border-l-2 border-lavender-200 pl-3">
                        {wrong.map((q) => (
                          <li key={q.quiz_no} data-report-wrong>
                            <p className="text-sm text-ink-900">{copy.wrongQuestion(q.quiz_no, q.question)}</p>
                            {q.wrong_note && <p className="text-sm text-ink-500">{q.wrong_note}</p>}
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                )
              })}
            </ul>
          </>
        )}
      </div>

      <div className="mt-4">
        <p className="text-sm font-bold text-mint-700">{copy.assessmentHeading}</p>
        {subject.assessment.length === 0 ? (
          <p className="mt-1 text-sm text-ink-500">{copy.assessmentNone}</p>
        ) : (
          <ul className="mt-2 space-y-4">
            {subject.assessment.map((a) => (
              <li key={a.item_no} data-report-item={a.item_no}>
                <p className="text-sm font-bold text-ink-900">{copy.itemLine(a.kind, a.points, a.max)}</p>
                <ul className="mt-1 space-y-2 pl-3">
                  {a.criteria.map((c) => (
                    <li key={c.name} data-report-criterion>
                      <p className="text-sm font-semibold text-ink-700">{copy.criterionLine(c.name, c.points, c.max)}</p>
                      {c.phrase && <p className="text-sm text-ink-500">{c.phrase}</p>}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </div>

      <MissingNote subject={subject} />
    </section>
  )
}

export function UnitReportView({ body, academyName, date, draft = false }: {
  body: UnitReportBody
  academyName: string
  /** YYYY-MM-DD */
  date: string
  /** 확정 전이면 「초안」 표시를 함께 그린다(인쇄에도 찍힌다). */
  draft?: boolean
}) {
  return (
    <article data-unit-report className="mx-auto max-w-[720px] rounded-2xl bg-white p-6 text-ink-900 print:max-w-none print:rounded-none print:p-0">
      <section data-report-page="front">
        <header className="border-b-2 border-mint-300 pb-3">
          <div className="flex items-start justify-between gap-3">
            <p className="text-xs font-semibold text-mint-700">{copy.frontLabel}</p>
            {draft && <p data-report-draft className="rounded-full border border-ink-300 px-2.5 py-0.5 text-xs font-semibold text-ink-500">{copy.draftMark}</p>}
          </div>
          {academyName && <p className="mt-1 text-sm text-ink-500">{academyName}</p>}
          <h2 className="mt-1 text-2xl font-bold">{copy.studentName(body.student_name)}</h2>
          <p className="mt-1 text-base font-semibold text-ink-700">{body.theme_title}</p>
          <p className="mt-1 text-sm text-ink-500">{copy.date} {date}</p>
          <p className="text-sm text-ink-500">{copy.subjects} {body.included_subjects.join(' · ')}</p>
        </header>

        <div className="mt-5 break-inside-avoid">
          <Heading>{copy.radarHeading}</Heading>
          <div className="mt-2">
            <RadarChart
              axes={body.radar.map((a) => ({ label: a.competency, ratio: a.ratio, sparse: a.sparse }))}
              sparseNote={copy.sparseNote}
              ariaLabel={copy.radarAria(body.student_name)}
              size={460}
            />
          </div>
        </div>

        <div className="mt-4 break-inside-avoid">
          <Heading>{copy.axesHeading}</Heading>
          <ul data-report-axes className="mt-2 space-y-1 text-sm">
            {body.radar.map((a) => (
              <li key={a.competency} className={a.ratio === null || a.sparse ? 'text-ink-500' : 'text-ink-900'}>
                {a.ratio === null ? copy.axisEmpty(a.competency) : copy.axisLine(a.competency, a.earned, a.possible, a.count)}
                {a.ratio !== null && a.sparse ? ` · ${copy.sparseNote}` : ''}
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-5 break-inside-avoid">
          <Heading>{copy.summaryHeading}</Heading>
          <ul data-report-summaries className="mt-2 space-y-1 text-sm leading-relaxed">
            {body.subjects.filter((s) => s.summary).map((s) => <li key={s.subject}>{s.summary}</li>)}
          </ul>
        </div>

        {body.overall_comment && (
          <div className="mt-5 break-inside-avoid">
            <Heading>{copy.overallHeading}</Heading>
            <p data-report-overall className="mt-2 whitespace-pre-wrap rounded-xl bg-mint-50 p-3 text-sm leading-relaxed">{body.overall_comment}</p>
          </div>
        )}

        <footer className="mt-6 space-y-1 border-t border-ink-100 pt-2 text-xs text-ink-500">
          <p>{copy.basisNote}</p>
          <p>{body.footer_disclaimer}</p>
        </footer>
      </section>

      <section data-report-page="detail" className="mt-8">
        <h2 className="text-xl font-bold">{copy.detailHeading}</h2>
        {body.subjects.map((s) => <SubjectBlock key={s.subject} subject={s} />)}
      </section>
    </article>
  )
}
