'use server'
import { createClient } from '@/lib/supabase/server'
import { getSessionProfile } from '@/lib/auth/session'
import { validateNewPassword } from '@/lib/auth/password-change'
import { auth } from '@/content/site'

const errors = auth.password.errors

export type ChangePasswordState = { error?: string; done?: boolean } | undefined

/** 원장·본사 비밀번호 바꾸기(대표 2026-10-29). 비밀번호는 로그에 남기지 않고, Supabase 오류 문장도 그대로 보여 주지 않는다. */
export async function changePassword(_prev: ChangePasswordState, formData: FormData): Promise<ChangePasswordState> {
  const s = await getSessionProfile()
  if (s.role === 'student') return { error: errors.studentNotAllowed }

  const current = String(formData.get('current_password') ?? '')
  const next = String(formData.get('new_password') ?? '')
  const confirm = String(formData.get('confirm_password') ?? '')
  const checked = validateNewPassword(current, next, confirm)
  if (!checked.ok) return { error: checked.error }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return { error: errors.failed }

  const { error: signInError } = await supabase.auth.signInWithPassword({ email: user.email, password: current })
  if (signInError) return { error: errors.currentWrong }

  const { error: updateError } = await supabase.auth.updateUser({ password: next })
  if (updateError) return { error: errors.failed }

  return { done: true }
}
