'use client'
import { useState, useTransition } from 'react'
import { submitQuiz, type QuizResult } from './actions'
import { Button } from '@/components/ui/Button'
import { app } from '@/content/site'

const copy = app.classroom.student.quiz
// answer·explanation 은 이미 제출한 차시에서만 온다(제출 전에는 서버가 빼고 보낸다). 방금 제출한 경우엔 submitQuiz 결과에서 읽는다.
type Quiz = { q: string; type: 'choice' | 'short'; choices: string[] | null; answer?: string; explanation?: string }
type Done = { response: string; correct: boolean }
/**
 * 대표 2026-09-26: 퀴즈는 단답형만(객관식 폐지) — 새 세트의 퀴즈는 모두 입력 칸이다. 보기 단추는 그 전에 게시된 판(스냅샷)의
 * 선택형 퀴즈를 그대로 보이고 채점하기 위해서만 남겨 둔다(lib/classroom/quiz.ts 는 선택형을 표시 기호 완전 일치로 본다).
 */
const isLegacyChoice = (q: Quiz) => q.type === 'choice' && (q.choices?.length ?? 0) > 0

export function QuizForm({ assignmentId, lessonNo, quiz, done }: { assignmentId: string; lessonNo: number; quiz: Quiz[]; done: Done[] | null }) {
  const [responses, setResponses] = useState<string[]>(quiz.map(() => ''))
  const [result, setResult] = useState<QuizResult | null>(null)
  const [pending, start] = useTransition()
  const submitted = done ?? (result?.ok ? result.results.map((r, i) => ({ response: responses[i], correct: r.correct })) : null)
  const keyOf = (i: number) => (!done && result?.ok ? result.results[i] : quiz[i])

  return (
    <section className="rounded-2xl bg-white p-5">
      <h3 className="text-lg font-bold">{copy.heading}</h3>
      <ol className="mt-3 space-y-4">
        {quiz.map((q, i) => (
          <li key={i}>
            <p className="font-semibold">{i + 1}. {q.q}</p>
            {submitted ? (
              <div className={`mt-2 rounded-xl p-3 ${submitted[i].correct ? 'bg-mint-100' : 'bg-red-50'}`}>
                <p>{copy.yourAnswer}: {submitted[i].response || '—'}</p>
                <p>{copy.answerLabel}: {keyOf(i)?.answer ?? ''}</p>
                <p className="text-sm text-ink-700">{copy.explanationLabel}: {keyOf(i)?.explanation ?? ''}</p>
              </div>
            ) : isLegacyChoice(q) ? (
              // 옛 판(2026-09-26 이전 게시)의 선택형만 — 새 세트는 아래 입력 칸(단답형)이 기본이다
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {(q.choices ?? []).map((c) => (
                  <button key={c} type="button" onClick={() => setResponses((r) => r.map((x, j) => (j === i ? c : x)))}
                    className={`rounded-xl border px-4 py-3 text-left ${responses[i] === c ? 'border-mint-500 bg-mint-50' : 'border-ink-100'}`}>{c}</button>
                ))}
              </div>
            ) : (
              <input value={responses[i]} onChange={(e) => setResponses((r) => r.map((x, j) => (j === i ? e.target.value : x)))}
                placeholder={copy.shortPlaceholder} className="mt-2 w-full rounded-xl border border-ink-300 px-4 py-3" />
            )}
          </li>
        ))}
      </ol>
      {submitted ? (
        <p className="mt-4 font-semibold">{copy.submitted(submitted.filter((d) => d.correct).length, quiz.length)}</p>
      ) : (
        <div className="mt-4">
          <Button type="button" disabled={pending || responses.some((r) => !r.trim())} onClick={() => start(async () => setResult(await submitQuiz(assignmentId, lessonNo, responses)))}>{copy.submit}</Button>
          {result && !result.ok && <p className="mt-2 text-sm text-red-600">{result.error}</p>}
        </div>
      )}
    </section>
  )
}
