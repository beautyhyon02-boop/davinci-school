'use client'
import { useState, useTransition } from 'react'
import { reissueTeacherPassword } from '../actions'
import { app } from '@/content/site'

const copy = app.adminAcademies.teacherAccount

type Teacher = { id: string; name: string; login_id: string }
type Result = { error?: string; issued?: { email: string; password: string } }

/**
 * 원장 계정 목록 + [비밀번호 다시 발급](대표 2026-11-11). 누르면 확인 창 뒤 새 비밀번호를 정해 그 줄 아래에 한 번만 보여 준다
 * (발급 폼의 안내 상자와 같은 모양) — 화면을 벗어나면 다시 볼 수 없다.
 */
export function TeacherList({ academyId, teachers }: { academyId: string; teachers: Teacher[] }) {
  const [results, setResults] = useState<Record<string, Result>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [, start] = useTransition()

  function reissue(t: Teacher) {
    if (!window.confirm(copy.reissue.confirm(t.name))) return
    setBusy(t.id)
    start(async () => {
      const r = await reissueTeacherPassword(academyId, t.id)
      setResults((prev) => ({ ...prev, [t.id]: r }))
      setBusy(null)
    })
  }

  return (
    <ul className="mt-2 space-y-2">
      {teachers.map((t) => {
        const r = results[t.id]
        return (
          <li key={t.id}>
            <div className="flex flex-wrap items-center gap-3">
              <span>{t.name} · {t.login_id}</span>
              <button type="button" onClick={() => reissue(t)} disabled={busy === t.id} className="rounded-full border border-ink-300 px-3 py-1 text-sm text-ink-700 hover:bg-ink-100 disabled:opacity-50">
                {busy === t.id ? copy.reissue.pending : copy.reissue.button}
              </button>
            </div>
            {r?.error && <p className="mt-1 text-sm text-red-600">{r.error}</p>}
            {r?.issued && (
              <div className="mt-2 max-w-md rounded-xl bg-lemon-50 p-4">
                <p className="font-semibold">{copy.reissue.notice}</p>
                <p className="mt-2 font-mono">{copy.labels.id} {r.issued.email}</p>
                <p className="font-mono">{copy.labels.password} {r.issued.password}</p>
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}
