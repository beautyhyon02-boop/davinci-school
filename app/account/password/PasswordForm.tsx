'use client'
import { useActionState } from 'react'
import { changePassword } from './actions'
import { Button } from '@/components/ui/Button'
import { auth } from '@/content/site'

const copy = auth.password

export function PasswordForm() {
  const [state, action, pending] = useActionState(changePassword, undefined)
  return (
    <form action={action} className="mt-6 grid max-w-md gap-3 rounded-2xl bg-white p-4">
      <label className="grid gap-1 text-sm">
        {copy.labels.current}
        <input type="password" name="current_password" autoComplete="current-password" className="rounded-xl border border-ink-300 px-3 py-2" />
      </label>
      <label className="grid gap-1 text-sm">
        {copy.labels.next}
        <input type="password" name="new_password" autoComplete="new-password" className="rounded-xl border border-ink-300 px-3 py-2" />
      </label>
      <label className="grid gap-1 text-sm">
        {copy.labels.confirm}
        <input type="password" name="confirm_password" autoComplete="new-password" className="rounded-xl border border-ink-300 px-3 py-2" />
      </label>
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state?.done && <p className="text-sm text-mint-700">{copy.done}</p>}
      <Button type="submit" disabled={pending}>{pending ? copy.submitting : copy.submit}</Button>
    </form>
  )
}
