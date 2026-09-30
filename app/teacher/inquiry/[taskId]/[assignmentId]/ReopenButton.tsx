'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { reopenInquiry } from '../actions'
import { Button } from '@/components/ui/Button'
import { app } from '@/content/site'

const copy = app.inquiry.teacher.report

/** [다시 쓰게 하기]: 제출을 풀어 학생이 고칠 수 있게 한다. */
export function ReopenButton({ taskId, assignmentId }: { taskId: string; assignmentId: string }) {
  const router = useRouter()
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const [pending, start] = useTransition()
  function onClick() {
    setMessage(null)
    start(async () => {
      const r = await reopenInquiry(taskId, assignmentId)
      if (!r.ok) { setMessage({ tone: 'error', text: r.error }); return }
      setMessage({ tone: 'ok', text: copy.reopened }); router.refresh()
    })
  }
  return (
    <span className="inline-flex flex-col gap-1">
      <Button type="button" variant="accent" onClick={onClick} disabled={pending}>{pending ? copy.reopening : copy.reopen}</Button>
      {message && <span className={`text-sm ${message.tone === 'ok' ? 'text-mint-700' : 'text-red-600'}`}>{message.text}</span>}
    </span>
  )
}
