'use client'
import { useTransition } from 'react'
import { startRetry } from './actions'
import { Button } from '@/components/ui/Button'
import { app } from '@/content/site'

const copy = app.classroom.student.result

export function RetryButton({ assignmentId, itemNo }: { assignmentId: string; itemNo: number }) {
  const [pending, start] = useTransition()
  return (
    <div className="rounded-2xl bg-white p-5">
      <p className="text-sm text-ink-700">{copy.retryHint}</p>
      <div className="mt-3"><Button type="button" disabled={pending} onClick={() => start(async () => { await startRetry(assignmentId, itemNo) })}>{copy.retry}</Button></div>
    </div>
  )
}
