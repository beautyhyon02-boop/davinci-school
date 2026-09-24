'use client'
import { useActionState, useState } from 'react'
import { createTheme } from '../actions'
import { THEME_FIELDS, GRADE_NONE, gradeOptions } from '@/lib/studio/themes'
import { SUBJECTS, LEVELS, type Level } from '@/lib/studio/schemas'
import { Button } from '@/components/ui/Button'
import { app } from '@/content/site'

const copy = app.studio.newTheme
const input = 'rounded-xl border border-ink-300 px-4 py-3 font-normal'

export function ThemeForm() {
  const [state, action, pending] = useActionState(createTheme, undefined)
  // 학년은 선택(대표 2026-09-26) — 기본값은 "학년 지정 안 함(학년군 전체)", 보기는 학교급에 맞춰 바뀐다
  const [level, setLevel] = useState<Level>(LEVELS[0])

  return (
    <form action={action} className="grid max-w-md gap-4">
      <label className="grid gap-1 text-sm font-semibold">
        {copy.labels.title}
        <input name={THEME_FIELDS.title} required className={input} />
      </label>
      <label className="grid gap-1 text-sm font-semibold">
        {copy.labels.level}
        <select name={THEME_FIELDS.level} value={level} onChange={(e) => setLevel(e.target.value as Level)} className={input}>
          {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
      </label>
      <label className="grid gap-1 text-sm font-semibold">
        {copy.labels.grade}
        <select key={level} name={THEME_FIELDS.grade} defaultValue={GRADE_NONE} className={input}>
          <option value={GRADE_NONE}>{copy.gradeNone}</option>
          {gradeOptions(level).map((g) => <option key={g} value={String(g)}>{copy.gradeOption(g)}</option>)}
        </select>
        <span className="text-xs font-normal text-ink-500">{copy.gradeHelp}</span>
      </label>
      <fieldset className="grid gap-1 text-sm font-semibold">
        <legend>{copy.labels.subjects}</legend>
        <div className="flex flex-wrap gap-3 font-normal">
          {SUBJECTS.map((s) => (
            <label key={s} className="flex items-center gap-1.5">
              <input type="checkbox" name={THEME_FIELDS.subjects} value={s} />
              {s}
            </label>
          ))}
        </div>
      </fieldset>
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      <Button type="submit" disabled={pending}>{pending ? copy.submitting : copy.submit}</Button>
    </form>
  )
}
