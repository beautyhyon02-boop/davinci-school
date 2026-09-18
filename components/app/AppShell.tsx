import Link from 'next/link'
import type { Role } from '@/lib/auth/roles'
import { site, app } from '@/content/site'

const roleTone: Record<Role, string> = { admin: 'bg-lavender-100 text-lavender-700', teacher: 'bg-mint-100 text-mint-700', student: 'bg-lemon-100 text-lemon-600' }

export function AppShell({ role, name, nav, children }: { role: Role; name: string; nav: { href: string; label: string }[]; children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-ink-100/40">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-ink-100 bg-white p-5 md:flex">
        <Link href="/" className="text-lg font-extrabold text-mint-700">{site.name}</Link>
        <span className={`mt-2 w-fit rounded-full px-2.5 py-0.5 text-xs font-semibold ${roleTone[role]}`}>{app.roleLabel[role]}</span>
        <nav className="mt-8 flex flex-col gap-1">
          {nav.map(n => <Link key={n.href} href={n.href} className="rounded-xl px-3 py-2 text-sm font-medium text-ink-700 hover:bg-mint-50">{n.label}</Link>)}
        </nav>
        <form action="/auth/signout" method="post" className="mt-auto">
          <p className="mb-2 text-sm text-ink-500">{name}</p>
          <button className="text-sm text-ink-500 hover:text-ink-900">{app.logout}</button>
        </form>
      </aside>
      <main className={`flex-1 p-6 md:p-10 ${role === 'student' ? 'text-lg' : ''}`}>{children}</main>
    </div>
  )
}
