import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { Role } from '@/lib/auth/roles'

export type SessionProfile = { userId: string; role: Role; name: string; academyId: string | null }

export async function getSessionProfile(): Promise<SessionProfile> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: p } = await supabase.from('profiles').select('role, name, academy_id').eq('id', user.id).single()
  if (!p) redirect('/login')
  return { userId: user.id, role: p.role as Role, name: p.name, academyId: p.academy_id }
}
