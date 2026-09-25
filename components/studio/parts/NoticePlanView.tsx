import { app } from '@/content/site'
import { KV, LabeledLines, SubLabel, arr } from './common'

// 안내장 틀 전체 보기(카드 틀 없이) — 차시마다 학습 요약·다음 차시·가정 학습·퀴즈 오답 코멘트·요소별 문구, 맨 아래 고지 문장.
// 원장 패키지 화면(PackageView)과 제작소 7단계 탭이 같은 모양을 쓴다(오너 규칙 2026-09-26: 단계 탭은 완성본 그대로).
// 읽기 위계(오너 요청 2026-09-26): 차시 이름(굵게) → 이름표 줄 → 오답 코멘트·요소별 문구는 한 줄에 하나씩(' / ' 로 잇지 않음).
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
    <div className="mt-3 space-y-3 text-sm">
      {arr(plan.per_lesson).map((p) => {
        const quizNotes = arr(p.quiz_notes)
        const phrases = arr(p.criteria_phrases)
        return (
          <div key={p.lesson_no} data-notice-lesson={p.lesson_no} className="space-y-2 rounded-xl border border-ink-100 p-4">
            <p className="text-base font-bold">{c.lessonLabel(p.lesson_no)}</p>
            <div className="space-y-1">
              <KV label={c.summary}>{p.topic_summary}</KV>
              <KV label={c.preview}>{p.preview}</KV>
              <KV label={c.home}>{p.home_study_suggestion}</KV>
            </div>
            {quizNotes.length > 0 && (
              <LabeledLines label={c.quizNotes} items={quizNotes.map((q) => <><span className="font-semibold">{c.quizNoteNo(q.quiz_no)}</span> {q.wrong_note}</>)} />
            )}
            {phrases.length > 0 && (
              <div>
                <SubLabel>{c.phrases}</SubLabel>
                <ul className="mt-1 space-y-2">
                  {phrases.map((cp) => (
                    <li key={cp.criterion_name} data-notice-criterion={cp.criterion_name}>
                      <p className="font-semibold">{cp.criterion_name}</p>
                      <div className="mt-1 grid gap-2 pl-3 sm:grid-cols-2">
                        <LabeledLines label={c.good} items={arr(cp.good)} />
                        <LabeledLines label={c.improve} items={arr(cp.improve)} />
                      </div>
                    </li>
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
