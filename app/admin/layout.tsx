import { redirect } from 'next/navigation'
import { AppShell } from '@/components/app/AppShell'
import { getSessionProfile } from '@/lib/auth/session'
import { homePathFor } from '@/lib/auth/roles'
import { app } from '@/content/site'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const s = await getSessionProfile()
  if (s.role !== 'admin') redirect(homePathFor(s.role))
  return <AppShell role="admin" name={s.name} nav={app.nav.admin}>{children}</AppShell>
}
