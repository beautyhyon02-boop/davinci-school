import { redirect } from 'next/navigation'
import { AppShell } from '@/components/app/AppShell'
import { getSessionProfile } from '@/lib/auth/session'
import { homePathFor } from '@/lib/auth/roles'
import { teacherNavFor } from '@/lib/auth/essay-access'
import { app } from '@/content/site'

/** /account/* 는 /teacher·/admin 밖이라 역할별 레이아웃을 못 탄다 — 세션을 읽어 역할에 맞는 AppShell 로 감싼다. 로그인 안 했으면 getSessionProfile 이 /login 으로 보낸다. */
export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const s = await getSessionProfile()
  if (s.role === 'student') redirect(homePathFor('student'))
  return <AppShell role={s.role} name={s.name} nav={s.role === 'teacher' ? teacherNavFor(s.plan) : app.nav[s.role]}>{children}</AppShell>
}
