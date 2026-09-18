import { AppShell } from '@/components/app/AppShell'
import { getSessionProfile } from '@/lib/auth/session'
import { app } from '@/content/site'

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const s = await getSessionProfile()
  return <AppShell role="student" name={s.name} nav={app.nav.student}>{children}</AppShell>
}
