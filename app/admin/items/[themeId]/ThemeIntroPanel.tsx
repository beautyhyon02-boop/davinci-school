'use client'
import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EXHAUSTED_ERROR } from '@/lib/studio/max-attempts'
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

type Action = 'generate' | 'review' | 'accept' | 'edit'

export function ThemeIntroPanel({ themeId, initialStatus, themeSubjects, acceptedIntro }: {
  themeId: string
  initialStatus: IntroStatus | null
  /** 대주제 참여 과목 — 직접 수정 폼에 과목마다 아이디어 칸을 하나씩 둔다. */
  themeSubjects: string[]
  /** 확정된 소개 문구(themes.intro). 지금 출력이 없을 때(생성 실패 등) 직접 수정 폼의 초기값으로 쓴다. */
  acceptedIntro: string | null
}) {
  const [status, setStatus] = useState<IntroStatus>(initialStatus ?? { state: 'idle', attempt: 0, updated_at: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editSaved, setEditSaved] = useState(false)
  // 오류를 어디에 보여 줄지 가른다: 직접 수정의 오류는 폼 바로 아래, 나머지는 버튼 위
  const [lastAction, setLastAction] = useState<Action | null>(null)
  const router = useRouter()

  async function run(action: Action, output?: IntroOutput) {
    setBusy(true)
    setError(null)
    setEditSaved(false)
    setLastAction(action)
    try {
      const res = await fetch(`/api/studio/themes/${themeId}/intro`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(output ? { action, output } : { action }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data?.error === 'invalid-edit' ? copy.edit.invalid : (data?.message ?? copy.errors.generic))
        return
      }
      setStatus(data.status)
      if (action === 'edit') setEditSaved(true)
      if (action === 'accept' || action === 'edit') router.refresh()
    } catch {
      setError(copy.errors.generic)
    } finally {
      setBusy(false)
    }
  }

  function submitEdit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    run('edit', {
      intro: String(fd.get('intro') ?? ''),
      subject_ideas: themeSubjects.map((subject) => ({ subject, idea: String(fd.get(`idea:${subject}`) ?? '') })),
    })
  }

  // 생성은 언제든(검토 한도에 닿은 뒤에도) 누를 수 있다 — 한도 표지는 안내일 뿐 잠금이 아니다
  const canGenerate = !busy
  const canReview = !!status.output && status.state !== 'accepted'
  const canAccept = status.state === 'reviewed' && status.review?.pass === true
  const exhausted = status.error === EXHAUSTED_ERROR
  // 직접 수정 폼: 지금 출력이 있거나(생성·검토·확정) 예전에 확정한 소개가 있으면 보여 준다
  const editIntro = status.output?.intro ?? acceptedIntro ?? ''
  const canEdit = !!status.output || !!acceptedIntro
  const ideaFor = (subject: string) => status.output?.subject_ideas.find((i) => i.subject === subject)?.idea ?? ''

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

      {exhausted ? (
        <p className="mt-3 rounded-xl bg-lemon-50 p-3 text-sm">{copy.exhausted}</p>
      ) : (
        status.error && <p className="mt-3 text-sm text-red-600">{copy.errorPrefix}{status.error}</p>
      )}
      {error && lastAction !== 'edit' && <p className="mt-3 text-sm text-red-600">{error}</p>}
      {editSaved && <p className="mt-3 text-sm text-mint-700">{copy.edit.saved}</p>}

      <div className="mt-4 flex gap-2">
        <Button variant="ghost" disabled={!canGenerate} onClick={() => run('generate')}>
          {busy ? copy.busy : copy.actions.generate}
        </Button>
        <Button variant="ghost" disabled={busy || !canReview} onClick={() => run('review')}>
          {busy ? copy.busy : copy.actions.review}
        </Button>
        <Button disabled={busy || !canAccept} onClick={() => run('accept')}>
          {busy ? copy.busy : copy.actions.accept}
        </Button>
      </div>

      {canEdit && (
        // 상태가 바뀔 때마다(updated_at) 다시 그려 새 출력으로 초기값을 채운다. 검토에서 막혔으면 펼친 채로 보여 준다.
        <details key={status.updated_at} open={exhausted || status.review?.pass === false} className="mt-6 rounded-xl border border-ink-100 p-4">
          <summary className="cursor-pointer text-sm font-semibold">{copy.edit.heading}</summary>
          <p className="mt-2 text-sm text-ink-500">{copy.edit.help}</p>
          <form onSubmit={submitEdit} className="mt-3 grid gap-3">
            <label className="grid gap-1 text-sm">
              <span className="font-semibold">{copy.edit.introLabel}</span>
              <textarea name="intro" defaultValue={editIntro} rows={4} className="rounded-lg border border-ink-100 p-2" />
            </label>
            {themeSubjects.map((subject) => (
              <label key={subject} className="grid gap-1 text-sm">
                <span className="font-semibold">{copy.edit.ideaLabel(subject)}</span>
                <input type="text" name={`idea:${subject}`} defaultValue={ideaFor(subject)} className="rounded-lg border border-ink-100 p-2" />
              </label>
            ))}
            {error && lastAction === 'edit' && <p className="text-sm text-red-600">{error}</p>}
            <div>
              <Button type="submit" disabled={busy}>{busy ? copy.edit.submitting : copy.edit.submit}</Button>
            </div>
          </form>
        </details>
      )}
    </Card>
  )
}
