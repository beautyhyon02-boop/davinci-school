'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSessionProfile } from '@/lib/auth/session'
import { STUDENT_DEFAULT_PASSWORD } from '@/lib/auth/student-password'
import { toLoginEmail } from '@/lib/auth/login-id'
import { parseNewStudent, buildLoginId } from '@/lib/students/new-student'
import { WITHDRAW_BAN_DURATION } from '@/lib/students/withdraw'
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
  const password = STUDENT_DEFAULT_PASSWORD   // 고정값(대표 2026-10-12) — 학생이 외우기 쉽게
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
  const password = STUDENT_DEFAULT_PASSWORD   // 초기화도 같은 고정값(대표 2026-10-12)
  const { error } = await createAdminClient().auth.admin.updateUserById(profileId, { password })
  if (error) return { error: errors.createFailed }
  return { password }
}

/** 자기 학원 학생인지(RLS 로 다른 학원은 안 보인다). */
async function findOwnStudent(profileId: string, academyId: string) {
  const supabase = await createClient()
  const { data } = await supabase.from('students').select('profile_id').eq('profile_id', profileId).eq('academy_id', academyId).maybeSingle()
  return data ? supabase : null
}

/** 퇴원 처리(대표 2026-10-15): 로그인 차단 + enrolled=false → 목록·배정·리포트·대시보드에서 빠진다. 기록은 남는다. */
export async function withdrawStudent(profileId: string): Promise<{ ok?: true; error?: string }> {
  const s = await assertTeacher()
  const supabase = await findOwnStudent(profileId, s.academyId)
  if (!supabase) return { error: errors.forbidden }
  // 차단이 먼저(검토 2026-10-15): 숨긴 뒤 차단이 실패하면 다시 누를 줄이 없다. 갱신이 실패하면 차단을 도로 푼다.
  const admin = createAdminClient()
  const { error: banErr } = await admin.auth.admin.updateUserById(profileId, { ban_duration: WITHDRAW_BAN_DURATION })
  if (banErr) return { error: errors.updateFailed }
  const { error } = await supabase.from('students').update({ enrolled: false }).eq('profile_id', profileId).eq('academy_id', s.academyId)
  if (error) { await admin.auth.admin.updateUserById(profileId, { ban_duration: 'none' }); return { error: errors.updateFailed } }
  revalidatePath('/teacher/students'); revalidatePath('/teacher/assignments'); revalidatePath('/teacher')
  return { ok: true }
}

/** 반이동(대표 2026-10-15) = 학교급·학년 바꾸기. 검증은 학생 추가와 같은 규칙. */
export async function moveStudent(profileId: string, formData: FormData): Promise<{ ok?: true; error?: string }> {
  const s = await assertTeacher()
  const fd = new FormData(); fd.set('name', '-'); fd.set('level', String(formData.get('level') ?? '')); fd.set('grade', String(formData.get('grade') ?? ''))
  const r = parseNewStudent(fd)
  if (!r.ok) return { error: errors[r.error] }
  const supabase = await findOwnStudent(profileId, s.academyId)
  if (!supabase) return { error: errors.forbidden }
  const { error } = await supabase.from('students').update({ level: r.data.level, grade: r.data.grade }).eq('profile_id', profileId).eq('academy_id', s.academyId)
  if (error) return { error: errors.updateFailed }
  revalidatePath('/teacher/students')
  return { ok: true }
}
