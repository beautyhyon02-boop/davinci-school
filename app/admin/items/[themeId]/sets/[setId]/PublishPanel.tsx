'use client'
import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { app } from '@/content/site'
import { publishItemSet } from './actions'

const copy = app.studio.publish

function blockerLabel(blocker: string): string {
  if (blocker === 'noKeyQuestion') return copy.blockers.noKeyQuestion
  if (blocker === 'saveFailed') return copy.errors.saveFailed
  if (blocker.startsWith('stageNotAccepted:')) return copy.blockers.stageNotAccepted(Number(blocker.slice('stageNotAccepted:'.length)))
  if (blocker.startsWith('unverifiedStandard:')) return copy.blockers.unverifiedStandard(blocker.slice('unverifiedStandard:'.length))
  if (blocker.startsWith('quizChoice:')) return copy.blockers.quizChoice(Number(blocker.slice('quizChoice:'.length)))
  return copy.blockers.unknown
}

export function PublishPanel({
  setId,
  currentVersion,
  nextVersion,
  initialBlockers,
}: {
  setId: string
  currentVersion: number
  nextVersion: number
  initialBlockers: string[]
}) {
  const [blockers, setBlockers] = useState(initialBlockers)
  const [publishedVersion, setPublishedVersion] = useState<number | null>(null)
  const [pending, startTransition] = useTransition()

  function submit() {
    setPublishedVersion(null)
    startTransition(async () => {
      const res = await publishItemSet(setId)
      if (res.ok) {
        setBlockers([])
        setPublishedVersion(res.version)
      } else {
        setBlockers(res.blockers)
      }
    })
  }

  return (
    <Card>
      <h2 className="text-lg font-bold">{copy.heading}</h2>
      <p className="mt-1 text-sm text-ink-500">{copy.currentVersionLabel(currentVersion)} → {copy.nextVersionLabel(nextVersion)}</p>

      {blockers.length > 0 && (
        <div className="mt-3 rounded-xl bg-lemon-50 p-4">
          <p className="text-sm font-semibold">{copy.blockersHeading}</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
            {blockers.map((b) => <li key={b}>{blockerLabel(b)}</li>)}
          </ul>
        </div>
      )}

      {publishedVersion !== null && (
        <p className="mt-3 text-sm text-mint-700">{copy.success(publishedVersion)}</p>
      )}

      <div className="mt-4">
        <Button disabled={pending} onClick={submit}>{pending ? copy.busy : copy.button}</Button>
      </div>
    </Card>
  )
}
