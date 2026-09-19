import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { Role } from '@/lib/auth/roles'

export type SessionProfile = { userId: string; role: Role; name: string; academyId: string | null }

/** 로그인·프로필이 없으면 null (redirect 하지 않음). API 라우트처럼 JSON으로 401을 돌려줘야 하는 곳에서 쓴다. */
export async function getSessionProfileOrNull(): Promise<SessionProfile | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: p } = await supabase.from('profiles').select('role, name, academy_id').eq('id', user.id).single()
  if (!p) return null
  return { userId: user.id, role: p.role as Role, name: p.name, academyId: p.academy_id }
}

/** 페이지·서버 액션용: 로그인·프로필이 없으면 /login 으로 redirect. */
export async function getSessionProfile(): Promise<SessionProfile> {
  const s = await getSessionProfileOrNull()
  if (!s) redirect('/login')
  return s
}
