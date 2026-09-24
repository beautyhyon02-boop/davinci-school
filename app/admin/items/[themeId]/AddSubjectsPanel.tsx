'use client'
import { useActionState } from 'react'
import { addSubjectsToTheme } from './actions'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { SUBJECTS, type Subject } from '@/lib/studio/schemas'
import { app } from '@/content/site'

const copy = app.studio.theme.addSubjects

type State = { ok?: boolean; error?: string } | undefined

export function AddSubjectsPanel({ themeId, themeSubjects }: { themeId: string; themeSubjects: Subject[] }) {
  const remaining = SUBJECTS.filter((s) => !themeSubjects.includes(s))

  async function submit(_prev: State, formData: FormData): Promise<State> {
    return addSubjectsToTheme(themeId, formData)
  }
  const [state, action, pending] = useActionState(submit, undefined)

  return (
    <Card>
      <h2 className="text-lg font-bold">{copy.heading}</h2>
      <p className="mt-1 text-sm text-ink-500">{copy.help}</p>

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
