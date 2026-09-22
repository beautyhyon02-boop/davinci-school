'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSessionProfile } from '@/lib/auth/session'
import { generatePassword } from '@/lib/auth/passwords'
import { toLoginEmail } from '@/lib/auth/login-id'
import { parseNewStudent, buildLoginId } from '@/lib/students/new-student'
import { app } from '@/content/site'

const errors = app.classroom.students.errors

async function assertTeacher() {
  const s = await getSessionProfile()
  if (s.role !== 'teacher' || !s.academyId) throw new Error('forbidden')
  return { ...s, academyId: s.academyId }
}

export type IssuedState = { error?: string; issued?: { name: string; loginId: string; password: string } } | undefined

export async function createStudent(_prev: IssuedState, formData: FormData): Promise<IssuedState> {
  const s = await assertTeacher()
  const r = parseNewStudent(formData)
  if (!r.ok) return { error: errors[r.error] }

  const supabase = await createClient()
  const { data: academy } = await supabase.from('academies').select('code').eq('id', s.academyId).single()
  if (!academy) return { error: errors.forbidden }

  // 번호는 RPC(advisory lock)로 받는다. unique(academy_id, seq) 가 마지막 안전장치.
  const { data: seq, error: seqErr } = await supabase.rpc('next_student_seq', { p_academy_id: s.academyId })
  if (seqErr || typeof seq !== 'number') return { error: errors.createFailed }

  const loginId = buildLoginId(academy.code, seq)
  const password = generatePassword(8)
  const admin = createAdminClient()
  const { data: created, error } = await admin.auth.admin.createUser({
    email: toLoginEmail(loginId),
    password,
    email_confirm: true,
    app_metadata: { role: 'student', academy_id: s.academyId, login_id: loginId },
    user_metadata: { name: r.data.name },
  })
  if (error || !created.user) return { error: errors.createFailed }

  const { error: insErr } = await admin.from('students').insert({
    profile_id: created.user.id, academy_id: s.academyId, level: r.data.level, grade: r.data.grade, seq,
  })
  if (insErr) {
    await admin.auth.admin.deleteUser(created.user.id) // 반쪽 계정을 남기지 않는다
    return { error: errors.createFailed }
  }
  revalidatePath('/teacher/students')
  return { issued: { name: r.data.name, loginId, password } }
}

export async function resetStudentPassword(profileId: string): Promise<{ password?: string; error?: string }> {
  const s = await assertTeacher()
  const supabase = await createClient()
  // RLS: 원장은 자기 원 students 만 보이므로 여기서 걸러진다
  const { data: st } = await supabase.from('students').select('profile_id').eq('profile_id', profileId).eq('academy_id', s.academyId).maybeSingle()
  if (!st) return { error: errors.forbidden }
  const password = generatePassword(8)
  const { error } = await createAdminClient().auth.admin.updateUserById(profileId, { password })
  if (error) return { error: errors.createFailed }
  return { password }
}
