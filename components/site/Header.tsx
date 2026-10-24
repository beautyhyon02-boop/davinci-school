import Link from 'next/link'
import { site } from '@/content/site'
import { Button } from '@/components/ui/Button'
import { getSessionProfileOrNull } from '@/lib/auth/session'
import { homePathFor } from '@/lib/auth/roles'

/**
 * 공개 홈페이지 머리말. 로그인돼 있으면 [내 화면]·[로그아웃], 아니면 [로그인](대표 2026-10-15: 원장이 홈으로 오면 [로그인]만 보여 "로그아웃됐다"고
 * 느꼈다 — 로그인은 남아 있다). 세션을 읽으므로 공개 페이지는 요청마다 그려진다.
 * 메뉴 글자는 16px 굵게(대표 2026-10-25 "글자 좀 더 크게" — 전에는 14px).
 */
export async function Header() {
  const s = await getSessionProfileOrNull()
  return (
    <header className="sticky top-0 z-40 border-b border-ink-100 bg-white/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <Link href="/" className="text-lg font-extrabold tracking-tight text-mint-700">{site.name}</Link>
        <nav className="hidden gap-8 text-base font-semibold text-ink-700 md:flex">
          {site.nav.map(n => n.external
            ? <a key={n.href} href={n.href} target="_blank" rel="noopener noreferrer" className="hover:text-mint-600">{n.label}</a>
            : <Link key={n.href} href={n.href} className="hover:text-mint-600">{n.label}</Link>)}
        </nav>
        <div className="flex items-center gap-2">
          {s ? (
            <>
              <Button href={homePathFor(s.role)} variant="ghost">{site.header.home[s.role]}</Button>
              <form action="/auth/signout" method="post"><Button type="submit" variant="ghost">{site.header.logout}</Button></form>
            </>
          ) : (
            <Button href="/login" variant="ghost">{site.header.login}</Button>
          )}
          <Button href="/franchise" variant="accent">{site.header.franchise}</Button>
        </div>
      </div>
    </header>
  )
}
