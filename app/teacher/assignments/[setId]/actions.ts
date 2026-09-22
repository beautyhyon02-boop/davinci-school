'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getSessionProfile } from '@/lib/auth/session'
import { app } from '@/content/site'

const errors = app.classroom.assign.errors
export type ActionResult = { ok: true } | { ok: false; error: string }

async function assertTeacher() {
  const s = await getSessionProfile()
  if (s.role !== 'teacher' || !s.academyId) throw new Error('forbidden')
  return { ...s, academyId: s.academyId }
}

/** 반 전체(studentIds 생략) 또는 지정 학생의 열린 차시 수를 바꾼다. RLS 가 academy 를 검사한다. */
export async function setOpenLessons(setId: string, openLessons: number, studentIds?: string[]): Promise<ActionResult> {
  await assertTeacher()
  if (!Number.isInteger(openLessons) || openLessons < 1 || openLessons > 8) return { ok: false, error: errors.invalidLessons }
  const supabase = await createClient()
  let q = supabase.from('assignments').update({ open_lessons: openLessons }).eq('item_set_id', setId)
  if (studentIds?.length) q = q.in('student_id', studentIds)
  const { error } = await q
  if (error) return { ok: false, error: errors.saveFailed }
  revalidatePath(`/teacher/assignments/${setId}`)
  return { ok: true }
}
