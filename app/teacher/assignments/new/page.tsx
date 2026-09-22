import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getSessionProfile } from '@/lib/auth/session'
import { latestPublishedVersion, loadAssignmentSnapshot } from '@/lib/classroom/snapshot'
import { AssignForm, type StudentOption } from './AssignForm'
import { app } from '@/content/site'

const copy = app.classroom.assign

export default async function NewAssignmentPage({ searchParams }: { searchParams: Promise<{ set?: string }> }) {
  const { set: setId } = await searchParams
  if (!setId) notFound()
  const s = await getSessionProfile()
  const supabase = await createClient()
  const version = await latestPublishedVersion(supabase, setId)
  if (version === null) notFound()
  const snapshot = await loadAssignmentSnapshot(supabase, setId, version)
  if (!snapshot) notFound()

  const [{ data: students }, { data: assigned }] = await Promise.all([
    supabase.from('students').select('profile_id, grade, profiles(name)').eq('academy_id', s.academyId!).eq('enrolled', true).order('seq'),
    supabase.from('assignments').select('student_id').eq('item_set_id', setId),
  ])
  const assignedIds = new Set((assigned ?? []).map((a) => a.student_id))
  const options: StudentOption[] = (students ?? []).map((st) => ({
    id: st.profile_id, grade: st.grade, assigned: assignedIds.has(st.profile_id),
    name: (st.profiles as unknown as { name: string } | null)?.name ?? '',
  }))

  return (
    <>
      <h1 className="text-2xl font-bold">{copy.newTitle}</h1>
      <p className="mt-1 text-ink-500">{snapshot.cover.title} · {snapshot.cover.subject} · {app.teacherItems.card.versionLabel(version)}</p>
      <div className="mt-6"><AssignForm setId={setId} setGrade={snapshot.cover.grade} students={options} maxLessons={snapshot.lessons.length} /></div>
    </>
  )
}
