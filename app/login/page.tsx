import { LoginForm } from './LoginForm'
import { safeNextPath } from '@/lib/auth/safe-next'

/** 로그인 페이지 — ?next=… (사이트 안 경로만, 2026-10-15 탐구보고서의 RED 보고서 로그인 단추)를 걸러 폼에 넘긴다. */
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const sp = await searchParams
  const raw = Array.isArray(sp.next) ? sp.next[0] : sp.next
  return <LoginForm next={safeNextPath(raw) ?? ''} />
}
