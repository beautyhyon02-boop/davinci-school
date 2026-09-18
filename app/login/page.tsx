'use client'
import { useActionState } from 'react'
import Link from 'next/link'
import { login } from './actions'
import { Button } from '@/components/ui/Button'
import { site, auth } from '@/content/site'

export default function LoginPage() {
  const [state, action, pending] = useActionState(login, undefined)
  return (
    <div className="flex min-h-screen items-center justify-center bg-mint-50 px-4">
      <form action={action} className="w-full max-w-sm rounded-3xl bg-white p-8 shadow-[0_2px_30px_rgba(31,36,48,0.08)]">
        <Link href="/" className="text-xl font-extrabold text-mint-700">{site.name}</Link>
        <h1 className="mt-6 text-2xl font-bold">{auth.login.title}</h1>
        <p className="mt-1 text-sm text-ink-500">{auth.login.subtitle}</p>
        <label className="mt-6 block text-sm font-semibold">{auth.login.idLabel}
          <input name="login_id" autoComplete="username" className="mt-1 w-full rounded-xl border border-ink-300 px-4 py-3 font-normal" />
        </label>
        <label className="mt-4 block text-sm font-semibold">{auth.login.passwordLabel}
          <input name="password" type="password" autoComplete="current-password" className="mt-1 w-full rounded-xl border border-ink-300 px-4 py-3 font-normal" />
        </label>
        {state?.error && <p className="mt-3 text-sm text-red-600">{state.error}</p>}
        <Button type="submit" disabled={pending} className="mt-6 w-full">{pending ? auth.login.submitting : auth.login.submit}</Button>
      </form>
    </div>
  )
}
