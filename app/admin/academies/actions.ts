'use server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSessionProfile } from '@/lib/auth/session'
import { parseAcademy } from '@/lib/academies/validate'
import { generatePassword } from '@/lib/auth/passwords'
import { app } from '@/content/site'

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
    user_metadata: { role: 'teacher', academy_id: academyId, name, login_id: email },
  })
  if (error) return { error: error.message }
  revalidatePath(`/admin/academies/${academyId}`)
  return { issued: { email, password } }
}
