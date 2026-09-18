import { redirect } from 'next/navigation'
import { AppShell } from '@/components/app/AppShell'
import { getSessionProfile } from '@/lib/auth/session'
import { homePathFor } from '@/lib/auth/roles'
import { app } from '@/content/site'

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const s = await getSessionProfile()
  if (s.role !== 'student') redirect(homePathFor(s.role))
  return <AppShell role="student" name={s.name} nav={app.nav.student}>{children}</AppShell>
}
