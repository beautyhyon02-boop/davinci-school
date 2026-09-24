import { notFound } from 'next/navigation'
import type { ReactNode } from 'react'
import { createClient } from '@/lib/supabase/server'
import { getSessionProfile } from '@/lib/auth/session'
import { loadAssignmentSnapshot } from '@/lib/classroom/snapshot'
import { itemNosForLesson, itemLabel, materialIdsForLesson, studentConditions } from '@/lib/classroom/lessons'
import { isUnitAssessmentSession } from '@/lib/studio/assessment-structure'
import { MaterialsSection } from '@/components/studio/PackageView'
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
    // 이 차시의 서·논술형: 단원 평가 차시(마지막 교수 차시 뒤)는 서술형·논술형 두 문항, 교수 차시는 없음, 옛 판 차시는 한 문항
    const itemNos = itemNosForLesson(snapshot, no)
    const lessonItems = itemNos.map((n) => snapshot.assessment!.items[n - 1])
    const materialIds = materialIdsForLesson(lesson, lessonItems)
    panels[no] = (
      <div className="space-y-5">
        <section className="rounded-2xl bg-white p-5">
          <p className="text-sm font-semibold text-ink-500">{copy.keyQuestion}</p>
          <p className="mt-1 text-xl font-bold">{lesson.key_question}</p>
          <p className="mt-2">{lesson.goal}</p>
          {isUnitAssessmentSession(lesson) && <p className="mt-2 rounded-xl bg-lemon-100 p-3 text-sm">{copy.assessmentIntro}</p>}
        </section>
        {/* 이 차시가 쓰는 자료(표·자동 그래프·설명글) — 결석생도 앱만 보고 풀 수 있어야 한다(스펙 §5.2). */}
        <MaterialsSection materials={snapshot.materials.filter((m) => materialIds.includes(m.id))} />
        {lesson.formative_check.quiz.length > 0 && (
          // 제출 전에는 정답·해설을 브라우저로 보내지 않는다(문제·유형·보기만). 제출한 뒤에야 결과 화면용으로 전체를 넘긴다.
          <QuizForm assignmentId={id} lessonNo={no}
            quiz={done.length ? lesson.formative_check.quiz : lesson.formative_check.quiz.map(({ q, type, choices }) => ({ q, type, choices }))}
            done={done.length ? done.map((d) => ({ response: d.response, correct: d.correct })) : null} />
        )}
        {itemNos.map((itemNo, k) => {
          const item = lessonItems[k]
          const label = itemLabel(snapshot, itemNo)
          // 학생에게는 조건 문장·분량·형식·답안 방식만 넘긴다. 종이 답안 문항(answer_mode 'paper')은 AnswerEditor 가 입력칸 대신 안내를 보인다.
          const conditions = studentConditions(item)
          const ans1 = answerRows.find((r) => r.item_no === itemNo && r.attempt === 1) ?? null
          const r1 = resultOf(ans1)
          const ans2 = answerRows.find((r) => r.item_no === itemNo && r.attempt === 2) ?? null
          const r2 = resultOf(ans2)
          return (
            <div key={itemNo} className="space-y-5">
              <AnswerEditor assignmentId={id} itemNo={itemNo} attempt={1} initialBody={ans1?.body ?? ''} submitted={!!ans1?.submitted_at}
                label={label} points={item.points} stem={item.stem} conditions={conditions} />
              {r1 && <ResultView label={label} points={item.points} attempt={1} grading={r1} />}
              {r1 && assignment.allow_retry && !ans2 && <RetryButton assignmentId={id} itemNo={itemNo} />}
              {ans2 && (
                <AnswerEditor assignmentId={id} itemNo={itemNo} attempt={2} initialBody={ans2.body} submitted={!!ans2.submitted_at}
                  label={`${label} · ${copy.result.attempt(2)}`} points={item.points} stem={item.stem} conditions={conditions} />
              )}
              {r2 && <ResultView label={label} points={item.points} attempt={2} grading={r2} />}
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <>
      <h1 className="text-2xl font-bold">{snapshot.cover.title}</h1>
      <p className="text-ink-500">{snapshot.cover.subject} · {snapshot.key_question}</p>
      {grade && <p className="mt-2 inline-block rounded-full bg-lemon-100 px-4 py-1 font-bold">{copy.result.overall(overall.total, overall.max, grade.grade, grade.band)}</p>}
      <div className="mt-6">
        <LessonTabs lessons={lessonNos} openLessons={assignment.open_lessons} initial={initial} panels={panels}
          labels={Object.fromEntries(snapshot.lessons.filter(isUnitAssessmentSession).map((l) => [l.no, copy.assessmentTab(l.no)]))} />
      </div>
    </>
  )
}
