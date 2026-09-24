'use client'
import { useActionState } from 'react'
import { runStandardsCrosscheck } from './actions'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { app } from '@/content/site'

const copy = app.adminStandards.crosscheck

export function CrosscheckPanel() {
  const [state, action, pending] = useActionState(runStandardsCrosscheck, undefined)

  return (
    <Card className="mt-4">
      <form action={action} className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="ghost" disabled={pending}>
          {pending ? copy.submitting : copy.button}
        </Button>
        {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
        {state && !state.error && (
          <p className="text-sm text-ink-700">
            {copy.result(state.verifiedCount ?? 0, state.mismatched?.length ?? 0, state.unmatchedCount ?? 0)}
          </p>
        )}
      </form>

      {state && !state.error && (
        <>
          <p className="mt-2 text-xs text-ink-500">{copy.unmatchedNote}</p>
          {!!state.mismatched?.length && (
            <div className="mt-4">
              <h3 className="text-sm font-bold">{copy.mismatchHeading}</h3>
              <div className="mt-2 max-h-96 overflow-auto rounded-xl border border-ink-100">
                <table className="w-full text-sm">
                  <thead className="bg-ink-100/60 text-left">
                    <tr>
                      <th className="p-3">{copy.mismatchColumns.code}</th>
                      <th className="p-3">{copy.mismatchColumns.dbText}</th>
                      <th className="p-3">{copy.mismatchColumns.levelText}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.mismatched.map((m) => (
                      <tr key={m.code} className="border-t border-ink-100 align-top">
                        <td className="p-3 whitespace-nowrap font-mono text-xs">{m.code}</td>
                        <td className="p-3 max-w-md whitespace-pre-wrap">{m.dbText}</td>
                        <td className="p-3 max-w-md whitespace-pre-wrap">{m.levelText}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </Card>
  )
}
