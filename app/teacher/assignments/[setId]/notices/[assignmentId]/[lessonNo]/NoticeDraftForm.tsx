'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { draftNotice } from '../../../actions'
import { Button } from '@/components/ui/Button'
import { app } from '@/content/site'

const copy = app.classroom.notice

/** [초안 만들기]/[다시 만들기]: 서버가 확정 채점·퀴즈로 뼈대를 만들고 (서·논술형 결과가 있으면) AI 1회 → 린트 통과 시에만 저장. */
export function NoticeDraftForm({ assignmentId, lessonNo, redraft }: { assignmentId: string; lessonNo: number; redraft: boolean }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [issues, setIssues] = useState<string[]>([])
  const run = () => {
    if (redraft && !window.confirm(copy.redraftConfirm)) return
    start(async () => {
      const r = await draftNotice(assignmentId, lessonNo)
      setError(r.ok ? null : r.error); setIssues(r.issues ?? [])
      if (r.ok) router.refresh()
    })
  }
  return (
    <div className="no-print">
      <Button type="button" variant={redraft ? 'ghost' : 'primary'} disabled={pending} onClick={run}>{pending ? copy.drafting : redraft ? copy.redraft : copy.draft}</Button>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      {issues.length > 0 && (
        <ul className="mt-1 list-disc pl-5 text-sm text-red-600">{issues.map((i) => <li key={i}>{i}</li>)}</ul>
      )}
    </div>
  )
}
