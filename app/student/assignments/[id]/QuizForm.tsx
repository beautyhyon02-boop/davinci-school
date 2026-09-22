'use client'
import { useState, useTransition } from 'react'
import { submitQuiz, type QuizResult } from './actions'
import { Button } from '@/components/ui/Button'
import { app } from '@/content/site'

const copy = app.classroom.student.quiz
// answer·explanation 은 이미 제출한 차시에서만 온다(제출 전에는 서버가 빼고 보낸다). 방금 제출한 경우엔 submitQuiz 결과에서 읽는다.
type Quiz = { q: string; type: 'choice' | 'short'; choices: string[] | null; answer?: string; explanation?: string }
type Done = { response: string; correct: boolean }

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
            ) : q.type === 'choice' ? (
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
