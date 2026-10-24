'use server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSessionProfile } from '@/lib/auth/session'
import { parseAcademy } from '@/lib/academies/validate'
import { generatePassword } from '@/lib/auth/passwords'
import { app } from '@/content/site'
import { isPlan } from '@/lib/academies/plan'

const copy = app.adminAcademies

async function assertAdmin() {
  const s = await getSessionProfile()
  if (s.role !== 'admin') throw new Error('forbidden')
}

export async function createAcademy(_prev: { error?: string } | undefined, formData: FormData) {
  await assertAdmin()
  const r = parseAcademy(formData)
  if (!r.ok) return { error: r.error }
  const supabase = await createClient()
  const { data, error } = await supabase.from('academies').insert(r.data).select('id').single()
  if (error) return { error: error.code === '23505' ? copy.errors.codeTaken : error.message }
  redirect(`/admin/academies/${data.id}`)
}

export async function createTeacherAccount(
  academyId: string,
  _prev: { error?: string; issued?: { email: string; password: string } } | undefined,
  formData: FormData,
) {
  await assertAdmin()
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  const name = String(formData.get('name') ?? '').trim()
  if (!email || !name) return { error: copy.errors.teacherMissing }
  const password = generatePassword()
  const admin = createAdminClient()
  const { error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    // role/academy_id/login_id 는 service role 만 쓸 수 있는 app_metadata 에 둔다(사용자가 수정 불가).
    app_metadata: { role: 'teacher', academy_id: academyId, login_id: email },
    user_metadata: { name },
  })
  if (error) return { error: error.message }
  revalidatePath(`/admin/academies/${academyId}`)
  return { issued: { email, password } }
}

/** 가맹 상품 바꾸기(PRD 2026-10-20): 본사만. 바꾸면 그 원의 원장에게 RED 자료실이 바로 열리거나 닫힌다(RLS·API 가 academies.plan 을 본다). */
export async function setAcademyPlan(
  academyId: string,
  _prev: { error?: string; saved?: boolean } | undefined,
  formData: FormData,
) {
  const s = await getSessionProfile()
  if (s.role !== 'admin') throw new Error('forbidden')
  const plan = String(formData.get('plan') ?? '')
  if (!isPlan(plan)) return { error: copy.errors.planInvalid }
  const note = String(formData.get('plan_note') ?? '').trim()
  const supabase = await createClient()
  const { error } = await supabase.from('academies')
    .update({ plan, plan_note: note, plan_changed_at: new Date().toISOString(), plan_changed_by: s.userId })
    .eq('id', academyId)
  if (error) return { error: error.message }
  revalidatePath(`/admin/academies/${academyId}`)
  revalidatePath('/admin/academies')
  revalidatePath('/programs/inquiry')
  return { saved: true }
}
