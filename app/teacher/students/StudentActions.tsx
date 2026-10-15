'use client'
import { useState, useTransition } from 'react'
import { resetStudentPassword, withdrawStudent, moveStudent } from './actions'
import { LEVELS } from '@/lib/studio/schemas'
import { app } from '@/content/site'
import { STUDENT_DEFAULT_PASSWORD } from '@/lib/auth/student-password'

const copy = app.classroom.students

/**
 * 학생 관리 「동작」 칸(대표 2026-10-15): [비밀번호 초기화] [반이동] [퇴원].
 * 반이동은 누르면 학교급·학년 폼이 펼쳐지고, 퇴원은 확인 창 뒤 바로 처리(숨김 + 로그인 차단, 기록은 남음).
 */
export function StudentActions({ profileId, name, level, grade }: { profileId: string; name: string; level: string; grade: number }) {
  const [message, setMessage] = useState<string | null>(null)
  const [moving, setMoving] = useState(false)
  const [pending, start] = useTransition()

  function reset() {
    if (!window.confirm(copy.reset.confirm(STUDENT_DEFAULT_PASSWORD))) return
    start(async () => { const r = await resetStudentPassword(profileId); setMessage(r.password ? `${copy.reset.done}: ${r.password}` : r.error ?? null) })
  }
  function withdraw() {
    if (!window.confirm(copy.withdraw.confirm(name))) return
    start(async () => { const r = await withdrawStudent(profileId); if (r.error) setMessage(r.error) })   // 성공하면 액션의 revalidatePath 로 줄이 사라진다
  }
  function move(formData: FormData) {
    start(async () => {
      const r = await moveStudent(profileId, formData)
      setMessage(r.ok ? copy.move.done : r.error ?? null)
      if (r.ok) setMoving(false)
    })
  }

  const box = 'rounded-lg border border-ink-300 px-2 py-1 text-xs hover:bg-ink-100 disabled:opacity-50'
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" onClick={reset} disabled={pending} className={box}>{copy.reset.button}</button>
      <button type="button" onClick={() => setMoving((v) => !v)} disabled={pending} className={box} aria-expanded={moving}>{copy.move.button}</button>
      <button type="button" onClick={withdraw} disabled={pending} className={`${box} font-semibold text-ink-700`}>{copy.withdraw.button}</button>
      {moving && (
        <form action={move} className="flex items-center gap-1 text-xs">
          <select name="level" defaultValue={level} aria-label={copy.form.levelLabel} className="rounded-lg border border-ink-300 px-2 py-1">
            {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
          <input name="grade" type="number" min={1} max={6} defaultValue={grade} aria-label={copy.form.gradeLabel} className="w-14 rounded-lg border border-ink-300 px-2 py-1" />
          <button type="submit" disabled={pending} className={`${box} bg-mint-100`}>{copy.move.submit}</button>
          <button type="button" onClick={() => setMoving(false)} className={box}>{copy.move.cancel}</button>
        </form>
      )}
      {message && <span className="rounded bg-lemon-100 px-2 py-0.5 font-mono text-xs">{message}</span>}
    </div>
  )
}
