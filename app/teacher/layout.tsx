import { AppShell } from '@/components/app/AppShell'
import { getSessionProfile } from '@/lib/auth/session'
import { app } from '@/content/site'

export default async function TeacherLayout({ children }: { children: React.ReactNode }) {
  const s = await getSessionProfile()
  return <AppShell role="teacher" name={s.name} nav={app.nav.teacher}>{children}</AppShell>
}
