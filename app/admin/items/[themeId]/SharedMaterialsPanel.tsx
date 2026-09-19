'use client'
import { useActionState } from 'react'
import { saveSharedMaterials } from './actions'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { app } from '@/content/site'

const copy = app.studio.materials

type State = { ok?: boolean; error?: string } | undefined

export function SharedMaterialsPanel({ themeId, initialJson }: { themeId: string; initialJson: string }) {
  async function submit(_prev: State, formData: FormData): Promise<State> {
    const json = String(formData.get('materials') ?? '')
    return saveSharedMaterials(themeId, json)
  }
  const [state, action, pending] = useActionState(submit, undefined)

  return (
    <Card className="mt-6">
      <h2 className="text-lg font-bold">{copy.heading}</h2>
      <p className="mt-1 text-sm text-ink-500">{copy.description}</p>
      <form action={action} className="mt-3 grid gap-3">
        <textarea
          name="materials"
          defaultValue={initialJson}
          rows={10}
          className="rounded-xl border border-ink-300 p-3 font-mono text-xs"
        />
        {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
        {state?.ok && <p className="text-sm text-mint-700">{copy.saved}</p>}
        <div>
          <Button type="submit" disabled={pending}>{pending ? copy.submitting : copy.submit}</Button>
        </div>
      </form>
    </Card>
  )
}
