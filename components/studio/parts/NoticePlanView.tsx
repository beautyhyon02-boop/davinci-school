import { app } from '@/content/site'
import { Label, arr } from './common'

// 안내장 틀 전체 보기(카드 틀 없이) — 차시마다 학습 요약·다음 차시·가정 학습·퀴즈 오답 코멘트·요소별 문구, 맨 아래 고지 문장.
// 원장 패키지 화면(PackageView)과 제작소 7단계 탭이 같은 모양을 쓴다(오너 규칙 2026-09-26: 단계 탭은 완성본 그대로).
// 저장된 출력(옛 판·손으로 고친 판)을 그대로 받으므로 모든 필드를 느슨하게 읽는다.

export type NoticePlanLike = {
  per_lesson?: {
    lesson_no: number
    topic_summary?: string
    preview?: string
    home_study_suggestion?: string
    quiz_notes?: { quiz_no: number; wrong_note: string }[]
    criteria_phrases?: { criterion_name: string; good?: string[]; improve?: string[] }[] | null
  }[]
  footer_disclaimer?: string
}

const c = app.packageView.noticePlan

export function NoticePlanView({ plan }: { plan: NoticePlanLike }) {
  return (
    <div className="mt-3 space-y-2 text-sm">
      {arr(plan.per_lesson).map((p) => {
        const quizNotes = arr(p.quiz_notes)
        return (
          <div key={p.lesson_no} data-notice-lesson={p.lesson_no} className="rounded-xl border border-ink-100 p-3">
            <p className="font-semibold">{c.lessonLabel(p.lesson_no)}</p>
            <p><Label>{c.summary}:</Label> {p.topic_summary}</p>
            <p><Label>{c.preview}:</Label> {p.preview}</p>
            <p><Label>{c.home}:</Label> {p.home_study_suggestion}</p>
            {quizNotes.length > 0 && <p className="text-ink-500">{c.quizNotes}: {quizNotes.map((q) => `${q.quiz_no}) ${q.wrong_note}`).join(' / ')}</p>}
            {p.criteria_phrases && (
              <div className="mt-1">
                <p className="font-semibold text-ink-500">{c.phrases}</p>
                <ul className="list-disc pl-5">
                  {p.criteria_phrases.map((cp) => (
                    <li key={cp.criterion_name}><span className="font-semibold">{cp.criterion_name}</span> — {c.good}: {arr(cp.good).join(' / ')} · {c.improve}: {arr(cp.improve).join(' / ')}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )
      })}
      {plan.footer_disclaimer && <p className="text-ink-500">{plan.footer_disclaimer}</p>}
    </div>
  )
}
