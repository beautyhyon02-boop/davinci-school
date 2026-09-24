'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { app } from '@/content/site'

const copy = app.studio.intro

type IntroOutput = { intro: string; subject_ideas: { subject: string; idea: string }[] }
// 대주제 소개는 검토 관문이 없다(2026-09-24 오너 결정) — 화면은 생성(AI 초안)·저장 두 동작만 다룬다.
type IntroStatus = {
  state: 'idle' | 'generated' | 'accepted' | 'failed'
  output?: IntroOutput
  error?: string
  model?: string
  updated_at: string
}
type FieldErrors = { intro?: string; ideas: Record<string, string> }

function ideaFor(output: IntroOutput | undefined, subject: string): string {
  return output?.subject_ideas.find((i) => i.subject === subject)?.idea ?? ''
}

export function ThemeIntroPanel({ themeId, initialStatus, themeSubjects, acceptedIntro }: {
  themeId: string
  initialStatus: IntroStatus | null
  /** 대주제 참여 과목 — 과목마다 한 줄 아이디어 칸을 하나씩 둔다. */
  themeSubjects: string[]
  /** 확정된 소개 문구(themes.intro). 아직 AI 초안을 받지 않았을 때 칸의 초기값으로 쓴다. */
  acceptedIntro: string | null
}) {
  const initialOutput = initialStatus?.output
  const [intro, setIntro] = useState(initialOutput?.intro ?? acceptedIntro ?? '')
  const [ideas, setIdeas] = useState<Record<string, string>>(
    () => Object.fromEntries(themeSubjects.map((s) => [s, ideaFor(initialOutput, s)])),
  )
  const [model, setModel] = useState<string | undefined>(initialStatus?.model)
  const [draftBusy, setDraftBusy] = useState(false)
  const [saveBusy, setSaveBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({ ideas: {} })
  const router = useRouter()

  async function draft() {
    setDraftBusy(true)
    setFormError(null)
    setSaved(false)
    try {
      const res = await fetch(`/api/studio/themes/${themeId}/intro`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'generate' }),
      })
      const data = await res.json()
      if (!res.ok) {
        setFormError(data?.message ?? copy.errors.generic)
        return
      }
      const status = data.status as IntroStatus
      setModel(status.model)
      if (status.state === 'failed') {
        setFormError(copy.errors.generic)
        return
      }
      if (status.output) {
        setIntro(status.output.intro)
        setIdeas(Object.fromEntries(themeSubjects.map((s) => [s, ideaFor(status.output, s)])))
        setFieldErrors({ ideas: {} })
      }
    } catch {
      setFormError(copy.errors.generic)
    } finally {
      setDraftBusy(false)
    }
  }

  function validate(): boolean {
    const errs: FieldErrors = { ideas: {} }
    if (intro.trim().length < 20) errs.intro = copy.errors.introTooShort
    for (const subject of themeSubjects) {
      if ((ideas[subject] ?? '').trim().length < 5) errs.ideas[subject] = copy.errors.ideaTooShort
    }
    setFieldErrors(errs)
    return !errs.intro && Object.keys(errs.ideas).length === 0
  }

  async function save() {
    setFormError(null)
    setSaved(false)
    if (!validate()) return
    setSaveBusy(true)
    try {
      const res = await fetch(`/api/studio/themes/${themeId}/intro`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save',
          output: { intro, subject_ideas: themeSubjects.map((subject) => ({ subject, idea: ideas[subject] ?? '' })) },
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setFormError(data?.message ?? copy.errors.generic)
        return
      }
      const status = data.status as IntroStatus
      setModel(status.model)
      setSaved(true)
      router.refresh()
    } catch {
      setFormError(copy.errors.generic)
    } finally {
      setSaveBusy(false)
    }
  }

  const busy = draftBusy || saveBusy

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-bold">{copy.heading}</h2>
        {model === 'mock' && <Badge tone="lemon">{copy.mockBadge}</Badge>}
      </div>
      <p className="mt-2 text-sm text-ink-500">{copy.help}</p>

      <div className="mt-4 grid gap-3">
        <label className="grid gap-1 text-sm">
          <span className="font-semibold">{copy.introLabel}</span>
          <textarea
            value={intro}
            onChange={(e) => setIntro(e.target.value)}
            rows={4}
            className="rounded-lg border border-ink-100 p-2"
          />
          {fieldErrors.intro && <p className="text-sm text-red-600">{fieldErrors.intro}</p>}
        </label>
        {themeSubjects.map((subject) => (
          <label key={subject} className="grid gap-1 text-sm">
            <span className="font-semibold">{copy.ideaLabel(subject)}</span>
            <input
              type="text"
              value={ideas[subject] ?? ''}
              onChange={(e) => setIdeas((prev) => ({ ...prev, [subject]: e.target.value }))}
              className="rounded-lg border border-ink-100 p-2"
            />
            {fieldErrors.ideas[subject] && <p className="text-sm text-red-600">{fieldErrors.ideas[subject]}</p>}
          </label>
        ))}
      </div>

      {formError && <p className="mt-3 text-sm text-red-600">{formError}</p>}
      {saved && <p className="mt-3 text-sm text-mint-700">{copy.saved}</p>}

      <div className="mt-4 flex gap-2">
        <Button variant="ghost" disabled={busy} onClick={draft}>
          {draftBusy ? copy.busy : copy.draftButton}
        </Button>
        <Button disabled={busy} onClick={save}>
          {saveBusy ? copy.busy : copy.save}
        </Button>
      </div>
    </Card>
  )
}
