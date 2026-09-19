'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { app } from '@/content/site'

const copy = app.studio.intro

type ReviewIssue = { kind: string; detail: string }
type IntroOutput = { intro: string; subject_ideas: { subject: string; idea: string }[] }
type IntroStatus = {
  state: 'idle' | 'generated' | 'reviewed' | 'accepted' | 'failed'
  attempt: number
  output?: IntroOutput
  review?: { pass: boolean; issues: ReviewIssue[] }
  error?: string
  model?: string
  updated_at: string
}

const STATE_TONE = { idle: 'gray', generated: 'lavender', reviewed: 'lemon', accepted: 'mint', failed: 'gray' } as const

export function ThemeIntroPanel({ themeId, initialStatus }: { themeId: string; initialStatus: IntroStatus | null }) {
  const [status, setStatus] = useState<IntroStatus>(initialStatus ?? { state: 'idle', attempt: 0, updated_at: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  async function run(action: 'generate' | 'review' | 'accept') {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/studio/themes/${themeId}/intro`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data?.error ?? copy.errors.generic)
        return
      }
      setStatus(data.status)
      if (action === 'accept') router.refresh()
    } catch {
      setError(copy.errors.generic)
    } finally {
      setBusy(false)
    }
  }

  const canReview = !!status.output && status.state !== 'accepted'
  const canAccept = status.state === 'reviewed' && status.review?.pass === true

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-bold">{copy.heading}</h2>
        <Badge tone={STATE_TONE[status.state]}>{copy.stateLabel[status.state]}</Badge>
        {status.model === 'mock' && <Badge tone="lemon">{copy.mockBadge}</Badge>}
      </div>

      {status.output ? (
        <div className="mt-4 space-y-3">
          <div>
            <p className="text-sm font-semibold text-ink-500">{copy.introLabel}</p>
            <p className="mt-1 whitespace-pre-wrap text-sm">{status.output.intro}</p>
          </div>
          <div>
            <p className="text-sm font-semibold text-ink-500">{copy.ideasLabel}</p>
            <ul className="mt-1 space-y-1 text-sm">
              {status.output.subject_ideas.map((idea) => (
                <li key={idea.subject}>
                  <span className="font-semibold">{idea.subject}</span> — {idea.idea}
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : (
        <p className="mt-4 text-sm text-ink-500">{copy.empty}</p>
      )}

      {status.review && !status.review.pass && (
        <div className="mt-4 rounded-xl bg-lemon-50 p-4">
          <p className="text-sm font-semibold">{copy.reviewIssuesHeading}</p>
          <ul className="mt-2 list-disc pl-5 text-sm">
            {status.review.issues.map((issue, i) => (
              <li key={i}>[{issue.kind}] {issue.detail}</li>
            ))}
          </ul>
        </div>
      )}

      {status.error && <p className="mt-3 text-sm text-red-600">{copy.errorPrefix}{status.error}</p>}
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <div className="mt-4 flex gap-2">
        <Button variant="ghost" disabled={busy} onClick={() => run('generate')}>
          {busy ? copy.busy : copy.actions.generate}
        </Button>
        <Button variant="ghost" disabled={busy || !canReview} onClick={() => run('review')}>
          {busy ? copy.busy : copy.actions.review}
        </Button>
        <Button disabled={busy || !canAccept} onClick={() => run('accept')}>
          {busy ? copy.busy : copy.actions.accept}
        </Button>
      </div>
    </Card>
  )
}
