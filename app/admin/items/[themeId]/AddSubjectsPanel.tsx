'use client'
import { useActionState } from 'react'
import { addSubjectsToTheme, removeSubjectFromTheme } from './actions'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { SUBJECTS, type Subject } from '@/lib/studio/schemas'
import { app } from '@/content/site'

const copy = app.studio.theme.addSubjects

type State = { ok?: boolean; error?: string } | undefined

export function AddSubjectsPanel({ themeId, themeSubjects, subjectsWithSets }: {
  themeId: string
  themeSubjects: Subject[]
  /** 이미 세트가 만들어진 과목 — 이 과목들에는 [빼기]를 두지 않는다(서버도 item_sets 로 다시 확인한다). */
  subjectsWithSets: string[]
}) {
  const remaining = SUBJECTS.filter((s) => !themeSubjects.includes(s))

  async function submit(_prev: State, formData: FormData): Promise<State> {
    return addSubjectsToTheme(themeId, formData)
  }
  const [state, action, pending] = useActionState(submit, undefined)

  // [빼기]는 누른 버튼의 name="subject" value 로 어느 과목인지 넘긴다
  async function remove(_prev: State, formData: FormData): Promise<State> {
    return removeSubjectFromTheme(themeId, formData)
  }
  const [removeState, removeAction, removing] = useActionState(remove, undefined)

  return (
    <Card>
      <h2 className="text-lg font-bold">{copy.heading}</h2>
      <p className="mt-1 text-sm text-ink-500">{copy.help}</p>

      <form action={removeAction} className="mt-3">
        <div className="flex flex-wrap items-center gap-3">
          {themeSubjects.map((s) => (
            <span key={s} className="flex items-center gap-1">
              <Badge tone="lavender">{s}</Badge>
              {!subjectsWithSets.includes(s) && themeSubjects.length > 1 && (
                <button type="submit" name="subject" value={s} disabled={removing} className="text-xs text-ink-500 underline disabled:opacity-50">
                  {removing ? copy.remove.removing : copy.remove.button}
                </button>
              )}
            </span>
          ))}
        </div>
        <p className="mt-1 text-xs text-ink-500">{copy.remove.help}</p>
        {removeState?.error && <p className="mt-1 text-sm text-red-600">{removeState.error}</p>}
        {removeState?.ok && <p className="mt-1 text-sm text-mint-700">{copy.remove.removed}</p>}
      </form>

      {remaining.length === 0 ? (
        <p className="mt-3 text-sm text-ink-500">{copy.nothingToAdd}</p>
      ) : (
        <form action={action} className="mt-3 grid gap-3">
          <div className="flex flex-wrap gap-3">
            {remaining.map((s) => (
              <label key={s} className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="subjects" value={s} className="h-4 w-4" />
                {s}
              </label>
            ))}
          </div>
          {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
          {state?.ok && <p className="text-sm text-mint-700">{copy.saved}</p>}
          <div>
            <Button type="submit" disabled={pending}>{pending ? copy.submitting : copy.submit}</Button>
          </div>
        </form>
      )}
    </Card>
  )
}
