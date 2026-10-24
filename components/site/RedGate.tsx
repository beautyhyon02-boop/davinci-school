import { pages } from '@/content/site'
import { Button } from '@/components/ui/Button'

const copy = pages.redReports

export type RedStat = { red_type: string; category: string; n: number; latest: string | null }

/**
 * 로그인하지 않았거나 학생 계정, 또는 서논술 전용 원장(PRD 2026-10-20)일 때의 RED 보고서 칸 — 파일 이름·목록은 보이지 않는다.
 * 서논술 전용 원장에게는 '소개까지만': 갈래별 게시 건수·최근 날짜와 가맹 안내·문의 연락처(환경변수 NEXT_PUBLIC_RED_CONTACT, 비어 있으면 '준비 중').
 */
export function RedGate({ role, stats = [] }: { role: 'student' | 'essay_only' | null; stats?: RedStat[] }) {
  if (role === 'essay_only') {
    const byType = (['R', 'E', 'D'] as const).map(t => {
      const rows = stats.filter(s => s.red_type === t)
      const n = rows.reduce((a, s) => a + Number(s.n), 0)
      const latest = rows.map(s => s.latest).filter(Boolean).sort().at(-1) ?? null
      return { t, n, latest }
    })
    const total = byType.reduce((a, b) => a + b.n, 0)
    const contact = process.env.NEXT_PUBLIC_RED_CONTACT?.trim()
    return (
      <div data-red-gate="essay_only" className="rounded-2xl bg-lavender-100/50 p-6">
        <p className="text-base font-semibold text-ink-900">{copy.planGate.heading}</p>
        <p className="mt-2 text-sm text-ink-700">{copy.planGate.body}</p>
        <ul className="mt-4 grid gap-2 sm:grid-cols-3">
          {byType.map(({ t, n, latest }) => (
            <li key={t} className="rounded-xl bg-white p-3 text-sm">
              <p className="font-semibold">{copy.redType[t]}</p>
              <p className="text-ink-700">{copy.planGate.files[t]}</p>
              <p className="mt-1 text-ink-500">{n > 0 ? copy.planGate.count(n, latest) : copy.planGate.preparing}</p>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-sm text-ink-500">{copy.planGate.daily(total)}</p>
        <details className="mt-4">
          <summary className="cursor-pointer text-sm font-semibold text-mint-700">{copy.planGate.contact}</summary>
          <p className="mt-2 text-sm text-ink-700">{contact || copy.planGate.contactPending}</p>
        </details>
      </div>
    )
  }
  return (
    <div data-red-gate className="rounded-2xl bg-lavender-100/50 p-6">
      <p className="text-sm text-ink-700">{role === 'student' ? copy.studentOnly : copy.gatedBody}</p>
      {role === null && <Button href="/login?next=%2Fprograms%2Finquiry" className="mt-4">{copy.login}</Button>}
    </div>
  )
}
