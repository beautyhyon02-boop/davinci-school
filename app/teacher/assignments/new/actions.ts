'use server'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getSessionProfile } from '@/lib/auth/session'
import { latestPublishedVersion } from '@/lib/classroom/snapshot'
import { app } from '@/content/site'

const errors = app.classroom.assign.errors

export type AssignState = { error?: string } | undefined

export async function createAssignments(setId: string, _prev: AssignState, formData: FormData): Promise<AssignState> {
  const s = await getSessionProfile()
  if (s.role !== 'teacher' || !s.academyId) throw new Error('forbidden')
  const studentIds = formData.getAll('student').map(String).filter(Boolean)
  if (studentIds.length === 0) return { error: errors.noStudents }
  const openLessons = Number.parseInt(String(formData.get('open_lessons') ?? '1'), 10)
  if (!Number.isInteger(openLessons) || openLessons < 1 || openLessons > 8) return { error: errors.invalidLessons }
  const dueRaw = String(formData.get('due_at') ?? '')
  const dueAt = dueRaw ? new Date(`${dueRaw}T23:59:59+09:00`).toISOString() : null
  const allowRetry = formData.get('allow_retry') === 'on'

  const supabase = await createClient()
  const version = await latestPublishedVersion(supabase, setId)
  if (version === null) return { error: errors.setNotFound }

  // RLS(teacher_rw_assignments)가 academy_id 를 검사한다. 학생이 이 원 소속인지도 확인한다.
  const { data: own } = await supabase.from('students').select('profile_id').in('profile_id', studentIds).eq('academy_id', s.academyId)
  const ownIds = new Set((own ?? []).map((r) => r.profile_id))
  const rows = studentIds.filter((id) => ownIds.has(id)).map((studentId) => ({
    item_set_id: setId, item_set_version: version, academy_id: s.academyId, student_id: studentId,
    assigned_by: s.userId, due_at: dueAt, allow_retry: allowRetry, open_lessons: openLessons,
  }))
  if (rows.length === 0) return { error: errors.noStudents }
  // 이미 배정된 학생은 unique index 로 막힌다 → upsert ignoreDuplicates 로 조용히 건너뛴다
  const { error } = await supabase.from('assignments').upsert(rows, { onConflict: 'student_id,item_set_id', ignoreDuplicates: true })
  if (error) return { error: errors.saveFailed }
  redirect(`/teacher/assignments/${setId}`)
}
