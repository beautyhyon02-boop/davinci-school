import { AppShell } from '@/components/app/AppShell'
import { getSessionProfile } from '@/lib/auth/session'
import { app } from '@/content/site'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const s = await getSessionProfile()
  return <AppShell role="admin" name={s.name} nav={app.nav.admin}>{children}</AppShell>
}
