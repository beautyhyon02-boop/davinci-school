import { app } from '@/content/site'
import type { NoticeT } from '@/lib/classroom/notice-schema'

const copy = app.classroom.notice
const MARKS = ['①', '②', '③', '④', '⑤']

function Section({ no, title, children }: { no: string; title: string; children: React.ReactNode }) {
  return (
    <section className="mt-5 break-inside-avoid">
      <h3 className="border-b border-ink-100 pb-1 text-base font-bold text-mint-700">{no} {title}</h3>
      <div className="mt-2 space-y-1 text-sm leading-relaxed">{children}</div>
    </section>
  )
}

/**
 * 학생별 차시 안내장 한 장(학부모·학생 공동 수신). 상태·훅이 없는 순수 표시 컴포넌트 — 화면과 인쇄에 같이 쓴다.
 * 5개 섹션(스펙 §2.7, notice.json): ① 학습 내용 ② 참여·퀴즈 ③ 서·논술형(없으면 생략) ④ 다음 차시·가정 학습 ⑤ 원장 한마디(비면 생략) + 고정 고지.
 */
export function NoticeView({ notice }: { notice: NoticeT }) {
  const q = notice.participation.quiz
  const e = notice.essay_result
  const showParticipation = q.total > 0 || !!notice.participation.director_comment
  // 빠진 섹션이 있어도 번호가 이어지게, 그리는 순서대로 매긴다
  let k = 0
  const mark = () => MARKS[k++]
  return (
    <article className="mx-auto max-w-[720px] rounded-2xl bg-white p-6 text-ink-900 print:max-w-none print:rounded-none print:p-0">
      <header className="border-b-2 border-mint-300 pb-3">
        <p className="text-xs font-semibold text-mint-700">{copy.docTitle}</p>
        <h2 className="mt-1 text-xl font-bold">{copy.title(notice.student_name, notice.lesson_no)}</h2>
        <p className="mt-1 text-sm text-ink-500">{copy.date} {notice.date}</p>
      </header>

      <Section no={mark()} title={copy.sections.context}>
        <p><span className="font-semibold">{copy.keyQuestion}</span> · {notice.lesson_context.key_question}</p>
        <p><span className="font-semibold">{copy.goal}</span> · {notice.lesson_context.goal}</p>
        {notice.lesson_context.topic_summary && <p><span className="font-semibold">{copy.summary}</span> · {notice.lesson_context.topic_summary}</p>}
      </Section>

      {showParticipation && (
        <Section no={mark()} title={copy.sections.participation}>
          {q.total > 0 && (
            <>
              <p className="font-semibold">{copy.quizResult(q.correct, q.total)}</p>
              <table className="mt-1 w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-ink-100 text-ink-500">
                    <th className="w-10 py-1 font-semibold">{copy.quizCols.no}</th>
                    <th className="py-1 font-semibold">{copy.quizCols.q}</th>
                    <th className="w-20 py-1 font-semibold">{copy.quizCols.result}</th>
                    <th className="py-1 font-semibold">{copy.quizCols.note}</th>
                  </tr>
                </thead>
                <tbody>
                  {q.items.map((it, i) => (
                    <tr key={i} className="border-b border-ink-100 align-top">
                      <td className="py-1">{i + 1}</td>
                      <td className="py-1">{it.q}</td>
                      <td className={`py-1 font-semibold ${it.is_correct ? 'text-mint-700' : 'text-lavender-700'}`}>{it.is_correct ? copy.quizCorrect : copy.quizWrong}</td>
                      <td className="py-1 text-ink-700">{it.note ?? ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
          {notice.participation.director_comment && <p className="mt-2"><span className="font-semibold">{copy.directorCommentLabel}</span> · {notice.participation.director_comment}</p>}
        </Section>
      )}

      {e && (
        <Section no={mark()} title={`${copy.sections.essay} (${e.kind})`}>
          <p className="font-semibold">{copy.score(e.confirmed_score, e.total_points, e.band)}</p>
          <table className="mt-1 w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-ink-100 text-ink-500">
                <th className="py-1 font-semibold">{copy.criteriaCols.name}</th>
                <th className="w-14 py-1 font-semibold">{copy.criteriaCols.score}</th>
                <th className="py-1 font-semibold">{copy.criteriaCols.good}</th>
                <th className="py-1 font-semibold">{copy.criteriaCols.improve}</th>
              </tr>
            </thead>
            <tbody>
              {e.criteria_feedback.map((c, i) => (
                <tr key={i} className="border-b border-ink-100 align-top">
                  <td className="py-1 font-semibold">{c.criterion_name}</td>
                  <td className="py-1">{copy.criterionScore(c.band_score, c.max)}</td>
                  <td className="py-1">{c.good_point}</td>
                  <td className="py-1 text-ink-700">{c.improve_point ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {e.retry && (
            <p className="mt-2"><span className="font-semibold">{copy.retry(e.retry.before_score, e.retry.after_score)}</span>{e.retry.improvement_comment ? ` · ${e.retry.improvement_comment}` : ''}</p>
          )}
        </Section>
      )}

      <Section no={mark()} title={copy.sections.next}>
        {notice.next_lesson.preview && <p><span className="font-semibold">{copy.preview}</span> · {notice.next_lesson.preview}</p>}
        {notice.next_lesson.home_study_suggestion && <p><span className="font-semibold">{copy.homeStudy}</span> · {notice.next_lesson.home_study_suggestion}</p>}
      </Section>

      {notice.director_message && (
        <Section no={mark()} title={copy.sections.director}>
          <p className="whitespace-pre-wrap">{notice.director_message}</p>
        </Section>
      )}

      <footer className="mt-6 border-t border-ink-100 pt-2 text-xs text-ink-500">{notice.footer_disclaimer}</footer>
    </article>
  )
}
