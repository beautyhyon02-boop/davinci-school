'use server'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { toLoginEmail } from '@/lib/auth/login-id'
import { homePathFor, type Role } from '@/lib/auth/roles'
import { auth } from '@/content/site'

export async function login(_prev: { error?: string } | undefined, formData: FormData) {
  const loginId = String(formData.get('login_id') ?? '')
  const password = String(formData.get('password') ?? '')
  if (!loginId || !password) return { error: auth.login.errors.missing }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.signInWithPassword({ email: toLoginEmail(loginId), password })
  if (error || !data.user) return { error: auth.login.errors.invalid }

  const role = data.user.user_metadata?.role as Role | undefined
  redirect(role ? homePathFor(role) : '/')
}
