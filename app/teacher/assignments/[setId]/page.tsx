import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { loadAssignmentSnapshot } from '@/lib/classroom/snapshot'
import { OpenLessonsControl } from './OpenLessonsControl'
import { Badge } from '@/components/ui/Badge'
import { app } from '@/content/site'
import type { AssignmentRow } from '@/lib/classroom/types'

const copy = app.classroom.assign

// assignments.student_id → students(profile_id) 이지 profiles 로 곧장 이어지지 않으므로
// students!inner(...) 를 거쳐 profiles 를 끌어온다(문항 4 브리핑의 대안 형태).
type Row = AssignmentRow & { students: { profile_id: string; profiles: { name: string } | null } | null }

export default async function AssignmentSetPage({ params }: { params: Promise<{ setId: string }> }) {
  const { setId } = await params
  const supabase = await createClient()
  const { data } = await supabase.from('assignments').select('*, students!inner(profile_id, profiles(name))').eq('item_set_id', setId).order('created_at')
  const rows = (data ?? []) as unknown as Row[]
  if (rows.length === 0) notFound()
  const snapshot = await loadAssignmentSnapshot(supabase, setId, rows[0].item_set_version)
  if (!snapshot) notFound()
  const minOpen = Math.min(...rows.map((r) => r.open_lessons))

  return (
    <>
      <Link href="/teacher/assignments" className="text-sm text-mint-700 underline">{copy.detail.backToList}</Link>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-bold">{snapshot.cover.title}</h1>
        <Badge tone="gray">{snapshot.cover.subject}</Badge>
        <Badge tone="gray">{app.teacherItems.card.versionLabel(snapshot.cover.version)}</Badge>
      </div>
      <div className="mt-4"><OpenLessonsControl setId={setId} current={minOpen} maxLessons={snapshot.lessons.length} /></div>
      {/* Task 7: <QuizMatrix …/> 와 학생별 <ReviewCard …/> */}
    </>
  )
}
