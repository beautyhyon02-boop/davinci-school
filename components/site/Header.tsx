import Link from 'next/link'
import { site } from '@/content/site'
import { Button } from '@/components/ui/Button'

export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-ink-100 bg-white/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <Link href="/" className="text-lg font-extrabold tracking-tight text-mint-700">{site.name}</Link>
        <nav className="hidden gap-6 text-sm text-ink-700 md:flex">
          {site.nav.map(n => <Link key={n.href} href={n.href} className="hover:text-mint-600">{n.label}</Link>)}
        </nav>
        <div className="flex items-center gap-2">
          <Button href="/login" variant="ghost">로그인</Button>
          <Button href="/franchise" variant="accent">가맹문의</Button>
        </div>
      </div>
    </header>
  )
}
