'use client'
import { useActionState } from 'react'
import { newInquiryTask, type NewTaskState } from './actions'
import { Button } from '@/components/ui/Button'
import { app } from '@/content/site'

const copy = app.inquiry.admin

export function NewTaskButton() {
  const [state, action, pending] = useActionState<NewTaskState>(newInquiryTask, undefined)
  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <Button type="submit" disabled={pending}>{copy.newButton}</Button>
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
    </form>
  )
}
