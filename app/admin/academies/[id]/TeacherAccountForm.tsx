'use client'
import { useActionState } from 'react'
import { createTeacherAccount } from '../actions'
import { Button } from '@/components/ui/Button'
import { app } from '@/content/site'

const copy = app.adminAcademies.teacherAccount

export function TeacherAccountForm({ academyId }: { academyId: string }) {
  const [state, action, pending] = useActionState(createTeacherAccount.bind(null, academyId), undefined)

  return (
    <div className="mt-4 rounded-2xl bg-white p-6">
      <h3 className="font-bold">{copy.formHeading}</h3>
      {state?.issued ? (
        <div className="mt-3 rounded-xl bg-lemon-50 p-4">
          <p className="font-semibold">{copy.issuedNotice}</p>
          <p className="mt-2 font-mono">{copy.labels.id} {state.issued.email}</p>
          <p className="font-mono">{copy.labels.password} {state.issued.password}</p>
        </div>
      ) : (
        <form action={action} className="mt-3 grid max-w-md gap-3">
          <input name="name" placeholder={copy.placeholders.name} required className="rounded-xl border border-ink-300 px-4 py-2" />
          <input name="email" type="email" placeholder={copy.placeholders.email} required className="rounded-xl border border-ink-300 px-4 py-2" />
          {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
          <Button type="submit" disabled={pending}>{pending ? copy.submitting : copy.submit}</Button>
        </form>
      )}
    </div>
  )
}
