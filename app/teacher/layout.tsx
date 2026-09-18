import { redirect } from 'next/navigation'
import { AppShell } from '@/components/app/AppShell'
import { getSessionProfile } from '@/lib/auth/session'
import { homePathFor } from '@/lib/auth/roles'
import { app } from '@/content/site'

export default async function TeacherLayout({ children }: { children: React.ReactNode }) {
  const s = await getSessionProfile()
  if (s.role !== 'teacher') redirect(homePathFor(s.role))
  return <AppShell role="teacher" name={s.name} nav={app.nav.teacher}>{children}</AppShell>
}
