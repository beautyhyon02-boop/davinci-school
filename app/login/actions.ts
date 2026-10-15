'use server'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { toLoginEmail } from '@/lib/auth/login-id'
import { homePathFor, type Role } from '@/lib/auth/roles'
import { safeNextPath } from '@/lib/auth/safe-next'
import { auth } from '@/content/site'

export async function login(_prev: { error?: string } | undefined, formData: FormData) {
  const loginId = String(formData.get('login_id') ?? '')
  const password = String(formData.get('password') ?? '')
  if (!loginId || !password) return { error: auth.login.errors.missing }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.signInWithPassword({ email: toLoginEmail(loginId), password })
  if (error || !data.user) return { error: auth.login.errors.invalid }

  const role = data.user.app_metadata?.role as Role | undefined
  // ?next=… 로 온 사이트 안 경로가 있으면 거기로(탐구보고서 페이지의 RED 보고서 로그인 단추, 2026-10-15). 바깥 주소는 safeNextPath 가 버린다.
  const next = safeNextPath(formData.get('next'))
  redirect(next ?? (role ? homePathFor(role) : '/'))
}
