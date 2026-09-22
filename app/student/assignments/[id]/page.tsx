import { notFound } from 'next/navigation'
import type { ReactNode } from 'react'
import { createClient } from '@/lib/supabase/server'
import { getSessionProfile } from '@/lib/auth/session'
import { loadAssignmentSnapshot } from '@/lib/classroom/snapshot'
import { assessmentItemNoForLesson, ASSESSMENT_LABELS } from '@/lib/classroom/lessons'
import { LessonTabs } from './LessonTabs'
import { QuizForm } from './QuizForm'
import { AnswerEditor } from './AnswerEditor'
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
  const [{ data: quiz }, { data: answers }] = await Promise.all([
    supabase.from('quiz_responses').select('*').eq('assignment_id', id),
    supabase.from('answers').select('*').eq('assignment_id', id),
  ])
  const quizRows = (quiz ?? []) as QuizResponseRow[]
  const answerRows = (answers ?? []) as AnswerRow[]
  const lessonNos = snapshot.lessons.map((l) => l.no)
  const initial = Math.min(assignment.open_lessons, lessonNos.length)

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
        {/* Task 8: <ResultView …/> 와 <RetryButton …/> */}
      </div>
    )
  }

  return (
    <>
      <h1 className="text-2xl font-bold">{snapshot.cover.title}</h1>
      <p className="text-ink-500">{snapshot.cover.subject} · {snapshot.key_question}</p>
      <div className="mt-6">
        <LessonTabs lessons={lessonNos} openLessons={assignment.open_lessons} initial={initial} panels={panels} />
      </div>
    </>
  )
}
