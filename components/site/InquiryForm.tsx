'use client'
import { useActionState } from 'react'
import { submitInquiry } from '@/app/(public)/franchise/actions'
import { Button } from '@/components/ui/Button'
import { HONEYPOT_FIELD } from '@/lib/inquiries/validate'
import { pages } from '@/content/site'

const input = 'rounded-xl border border-ink-300 px-4 py-3 font-normal'

export function InquiryForm() {
  const f = pages.franchise
  const [state, action, pending] = useActionState(submitInquiry, undefined)

  if (state?.ok) {
    return (
      <div className="rounded-2xl bg-mint-50 p-8 text-center">
        <p className="text-xl font-bold">{f.success.title}</p>
        <p className="mt-2 text-ink-700">{f.success.body}</p>
      </div>
    )
  }

  return (
    <form action={action} className="grid max-w-xl gap-4">
      {/* 허니팟: 사람에게는 보이지 않고, 봇이 채우면 서버가 조용히 무시한다. */}
      <input name={HONEYPOT_FIELD} tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />
      <label className="grid gap-1 text-sm font-semibold">
        {f.fields.name.label}
        <input name="name" required className={input} />
      </label>
      <label className="grid gap-1 text-sm font-semibold">
        {f.fields.phone.label}
        <input name="phone" required className={input} placeholder={f.fields.phone.placeholder} />
      </label>
      <label className="grid gap-1 text-sm font-semibold">
        {f.fields.region.label}
        <input name="region" required className={input} placeholder={f.fields.region.placeholder} />
      </label>
      <label className="grid gap-1 text-sm font-semibold">
        {f.fields.message.label}
        <textarea name="message" rows={5} className={input} />
      </label>
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      <Button type="submit" variant="accent" disabled={pending}>{pending ? f.submitting : f.submit}</Button>
    </form>
  )
}
