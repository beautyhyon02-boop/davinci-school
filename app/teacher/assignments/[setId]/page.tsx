import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { loadAssignmentSnapshot } from '@/lib/classroom/snapshot'
import { OpenLessonsControl } from './OpenLessonsControl'
import { QuizMatrix } from './QuizMatrix'
import { ReviewCard } from './ReviewCard'
import { Badge } from '@/components/ui/Badge'
import { overallFor, gradeFor } from '@/lib/classroom/scoring'
import { ASSESSMENT_LABELS } from '@/lib/classroom/lessons'
import { app } from '@/content/site'
import type { AssignmentRow, AnswerRow, GradingRow, QuizResponseRow } from '@/lib/classroom/types'

// regradeAi 는 AI 호출을 기다린다 — 기본 서버 액션 시간 제한(기본값이 짧음)보다 여유를 둔다.
export const maxDuration = 300

const copy = app.classroom.assign

// assignments.student_id → students(profile_id) 이지 profiles 로 곧장 이어지지 않으므로
// assignments→students 에는 FK 가 둘(student_id, academy 복합키)이라 !inner 만 쓰면 PostgREST 가 모호하다고 거부한다 — student_id FK 이름을 명시한다.
type Row = AssignmentRow & { students: { profile_id: string; profiles: { name: string } | null } | null }

export default async function AssignmentSetPage({ params }: { params: Promise<{ setId: string }> }) {
  const { setId } = await params
  const supabase = await createClient()
  const { data } = await supabase.from('assignments').select('*, students!assignments_student_id_fkey(profile_id, profiles(name))').eq('item_set_id', setId).order('created_at')
  const rows = (data ?? []) as unknown as Row[]
  if (rows.length === 0) notFound()
  const snapshot = await loadAssignmentSnapshot(supabase, setId, rows[0].item_set_version)
  if (!snapshot) notFound()
  const minOpen = Math.min(...rows.map((r) => r.open_lessons))

  // 추가 로드: 퀴즈 응답·답안은 배정 id 로, 채점은 답안 id 로 잇는다(빈 배열이면 두 번째 질의를 건너뛴다).
  const aids = rows.map((r) => r.id)
  const [{ data: quiz }, { data: answers }] = await Promise.all([
    supabase.from('quiz_responses').select('*').in('assignment_id', aids),
    supabase.from('answers').select('*').in('assignment_id', aids).order('attempt'),
  ])
  const answerRows = (answers ?? []) as AnswerRow[]
  const answerIds = answerRows.map((a) => a.id)
  const { data: gradings } = answerIds.length
    ? await supabase.from('gradings').select('*').in('answer_id', answerIds)
    : { data: [] as GradingRow[] }
  const quizRows = (quiz ?? []) as QuizResponseRow[]
  const gradingRows = (gradings ?? []) as GradingRow[]
  const items = snapshot.assessment?.items ?? []
  const lessonsMeta = snapshot.lessons.map((l) => ({ no: l.no, quizCount: l.quiz.length, types: l.quiz.map((q) => q.type) }))
  const students = rows.map((r) => ({ assignmentId: r.id, name: r.students?.profiles?.name ?? '' }))

  return (
    <>
      <Link href="/teacher/assignments" className="text-sm text-mint-700 underline">{copy.detail.backToList}</Link>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-bold">{snapshot.cover.title}</h1>
        <Badge tone="gray">{snapshot.cover.subject}</Badge>
        <Badge tone="gray">{app.teacherItems.card.versionLabel(snapshot.cover.version)}</Badge>
      </div>
      <div className="mt-4"><OpenLessonsControl setId={setId} current={minOpen} maxLessons={snapshot.lessons.length} /></div>
      <div className="mt-6"><QuizMatrix lessons={lessonsMeta} students={students} responses={quizRows} /></div>
      <h2 className="mt-8 text-lg font-bold">{app.classroom.review.answersHeading}</h2>
      <div className="mt-3 space-y-6">
        {rows.map((r) => {
          const own = answerRows.filter((a) => a.assignment_id === r.id)
          const gradingOf = (a: AnswerRow | null) => (a ? gradingRows.find((g) => g.answer_id === a.id) ?? null : null)
          const latest = (itemNo: number) => own.filter((a) => a.item_no === itemNo).sort((x, y) => y.attempt - x.attempt)[0] ?? null
          const finals = items.map((_, i) => { const g = gradingOf(own.find((a) => a.item_no === i + 1 && a.attempt === 1) ?? null); return g?.status === 'confirmed' ? g.final_score : null })
          const overall = overallFor(items, finals)
          const grade = overall.complete && snapshot.assessment ? gradeFor(snapshot.assessment.grade_boundaries, overall.total) : null
          return (
            <section key={r.id}>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-bold">{r.students?.profiles?.name}</h3>
                <span className="text-sm text-ink-500">{grade ? app.classroom.review.overall(overall.total, overall.max, grade.grade, grade.band) : app.classroom.review.overallPending}</span>
              </div>
              <div className="mt-2 grid gap-3 lg:grid-cols-3">
                {items.map((it, i) => {
                  const a = latest(i + 1)
                  const first = own.find((x) => x.item_no === i + 1 && x.attempt === 1) ?? null
                  const prev = a?.attempt === 2 ? { score: gradingOf(first)?.final_score ?? null } : undefined
                  const grading = gradingOf(a)
                  // 채점 실행기·확정·다시 고치기는 모두 updated_at 을 새로 찍는다 — key 가 바뀌면 카드를 새로 마운트한다(ReviewCard 의 useEffect 와 이중 안전장치).
                  const cardKey = `${i}-${grading?.id ?? 'none'}-${grading?.updated_at ?? ''}-${grading?.status ?? ''}-${grading?.model ?? ''}`
                  return <ReviewCard key={cardKey} item={{ itemNo: i + 1, label: ASSESSMENT_LABELS[i], points: it.points, answer: a, grading, prev }} />
                })}
              </div>
            </section>
          )
        })}
      </div>
    </>
  )
}
