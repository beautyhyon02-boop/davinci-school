'use client'
import { useActionState } from 'react'
import { updateThemeGrade } from './actions'
import { Button } from '@/components/ui/Button'
import { GRADE_NONE, gradeOptions, parseThemeGrade } from '@/lib/studio/themes'
import type { Level } from '@/lib/studio/schemas'
import { app } from '@/content/site'

const copy = app.studio.theme.gradeEdit
const newThemeCopy = app.studio.newTheme

type State = { ok?: boolean; error?: string } | undefined

/** 대주제 머리말 아래의 작은 "학년 바꾸기" — 학년 지정 안 함(학년군 전체)으로 되돌릴 수 있다(대표 2026-09-26). */
export function GradeEditor({ themeId, level, grade }: { themeId: string; level: Level; grade: number | null }) {
  async function submit(_prev: State, formData: FormData): Promise<State> {
    const g = parseThemeGrade(level, formData.get('grade'))
    if (!g.ok) return { error: g.error }
    const r = await updateThemeGrade(themeId, g.grade)
    return r.ok ? { ok: true } : { error: r.error }
  }
  const [state, action, pending] = useActionState(submit, undefined)

  return (
    <form action={action} className="mt-2 flex flex-wrap items-center gap-2 text-sm">
      <label className="flex items-center gap-2">
        <span className="font-semibold">{copy.label}</span>
        <select name="grade" defaultValue={grade == null ? GRADE_NONE : String(grade)} className="rounded-xl border border-ink-300 px-3 py-1.5">
          <option value={GRADE_NONE}>{newThemeCopy.gradeNone}</option>
          {gradeOptions(level).map((g) => <option key={g} value={String(g)}>{newThemeCopy.gradeOption(g)}</option>)}
        </select>
      </label>
      <Button type="submit" variant="ghost" disabled={pending}>{pending ? copy.submitting : copy.submit}</Button>
      {state?.error && <span className="text-red-600">{state.error}</span>}
      {state?.ok && <span className="text-mint-700">{copy.saved}</span>}
      <p className="w-full text-xs text-ink-500">{copy.help}</p>
    </form>
  )
}
