import { notFound } from 'next/navigation'
import type { ReactNode } from 'react'
import { createClient } from '@/lib/supabase/server'
import { getSessionProfile } from '@/lib/auth/session'
import { loadAssignmentSnapshot } from '@/lib/classroom/snapshot'
import { assessmentItemNoForLesson, ASSESSMENT_LABELS } from '@/lib/classroom/lessons'
import { overallFor, gradeFor } from '@/lib/classroom/scoring'
import { LessonTabs } from './LessonTabs'
import { QuizForm } from './QuizForm'
import { AnswerEditor } from './AnswerEditor'
import { ResultView, type StudentGrading } from './ResultView'
import { RetryButton } from './RetryButton'
import { app } from '@/content/site'
import type { AnswerRow, AssignmentRow, QuizResponseRow } from '@/lib/classroom/types'

const copy = app.classroom.student

export default async function StudentAssignmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const s = await getSessionProfile()
  const supabase = await createClient()
  const { data: a } = await supabase.from('assignments').select('*').eq('id', id).eq('student_id', s.userId).maybeSingle()
  if (!a) notFound()
  const assignment = a as AssignmentRow
  const snapshot = await loadAssignmentSnapshot(supabase, assignment.item_set_id, assignment.item_set_version)
  if (!snapshot) notFound()
  const [{ data: quiz }, { data: answers }, { data: sg }] = await Promise.all([
    supabase.from('quiz_responses').select('*').eq('assignment_id', id),
    supabase.from('answers').select('*').eq('assignment_id', id),
    supabase.from('student_gradings').select('*'),
  ])
  const quizRows = (quiz ?? []) as QuizResponseRow[]
  const answerRows = (answers ?? []) as AnswerRow[]
  const results = (sg ?? []) as StudentGrading[]
  const resultOf = (a: AnswerRow | null | undefined) => (a ? results.find((g) => g.answer_id === a.id) ?? null : null)
  const lessonNos = snapshot.lessons.map((l) => l.no)
  const initial = Math.min(assignment.open_lessons, lessonNos.length)
  const items = snapshot.assessment?.items ?? []
  const finals = items.map((_, i) => resultOf(answerRows.find((r) => r.item_no === i + 1 && r.attempt === 1))?.final_score ?? null)
  const overall = overallFor(items, finals)
  const grade = overall.complete && snapshot.assessment ? gradeFor(snapshot.assessment.grade_boundaries, overall.total) : null

  // 서버 컴포넌트는 함수를 클라이언트 컴포넌트로 못 넘긴다 — 열린 차시만 미리 패널(React 노드)로 만들어 둔다.
  // 잠긴 차시는 탭이 비활성이라 고를 수 없으므로 만들 필요도, 정답을 화면으로 보낼 필요도 없다.
  const panels: Record<number, ReactNode> = {}
  for (const no of lessonNos) {
    if (no > assignment.open_lessons) continue
    const lesson = snapshot.lessons.find((l) => l.no === no)!
    const done = quizRows.filter((q) => q.lesson_no === no).sort((x, y) => x.quiz_no - y.quiz_no)
    const itemNo = assessmentItemNoForLesson(snapshot, no)
    const item = itemNo ? snapshot.assessment?.items[itemNo - 1] : null
    const ans1 = itemNo ? answerRows.find((r) => r.item_no === itemNo && r.attempt === 1) : null
    panels[no] = (
      <div className="space-y-5">
        <section className="rounded-2xl bg-white p-5">
          <p className="text-sm font-semibold text-ink-500">{copy.keyQuestion}</p>
          <p className="mt-1 text-xl font-bold">{lesson.key_question}</p>
          <p className="mt-2">{lesson.goal}</p>
        </section>
        {lesson.quiz.length > 0 && (
          <QuizForm assignmentId={id} lessonNo={no} quiz={lesson.quiz} done={done.length ? done.map((d) => ({ response: d.response, correct: d.correct })) : null} />
        )}
        {item && itemNo && (
          <AnswerEditor assignmentId={id} itemNo={itemNo} attempt={1} initialBody={ans1?.body ?? ''} submitted={!!ans1?.submitted_at}
            label={ASSESSMENT_LABELS[itemNo - 1]} points={item.points} conditions={item.conditions} />
        )}
        {item && itemNo && (() => {
          const r1 = resultOf(ans1)
          const ans2 = answerRows.find((r) => r.item_no === itemNo && r.attempt === 2) ?? null
          const r2 = resultOf(ans2)
          return (
            <>
              {r1 && <ResultView label={ASSESSMENT_LABELS[itemNo - 1]} points={item.points} attempt={1} grading={r1} />}
              {r1 && assignment.allow_retry && !ans2 && <RetryButton assignmentId={id} itemNo={itemNo} />}
              {ans2 && (
                <AnswerEditor assignmentId={id} itemNo={itemNo} attempt={2} initialBody={ans2.body} submitted={!!ans2.submitted_at}
                  label={`${ASSESSMENT_LABELS[itemNo - 1]} · ${copy.result.attempt(2)}`} points={item.points} conditions={item.conditions} />
              )}
              {r2 && <ResultView label={ASSESSMENT_LABELS[itemNo - 1]} points={item.points} attempt={2} grading={r2} />}
            </>
          )
        })()}
      </div>
    )
  }

  return (
    <>
      <h1 className="text-2xl font-bold">{snapshot.cover.title}</h1>
      <p className="text-ink-500">{snapshot.cover.subject} · {snapshot.key_question}</p>
      {grade && <p className="mt-2 inline-block rounded-full bg-lemon-100 px-4 py-1 font-bold">{copy.result.overall(overall.total, overall.max, grade.grade, grade.band)}</p>}
      <div className="mt-6">
        <LessonTabs lessons={lessonNos} openLessons={assignment.open_lessons} initial={initial} panels={panels} />
      </div>
    </>
  )
}
