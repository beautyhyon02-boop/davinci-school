import { pages } from '@/content/site'
import { Button } from '@/components/ui/Button'

const copy = pages.redReports

/**
 * 로그인하지 않았거나 학생 계정일 때의 RED 보고서 칸 — 파일 이름·목록은 보이지 않는다.
 * (원장은 두 가맹 상품 모두 RED 가 열리므로 이 칸을 보지 않는다 — 대표 2026-10-29.)
 */
export function RedGate({ role }: { role: 'student' | null }) {
  return (
    <div data-red-gate className="rounded-2xl bg-lavender-100/50 p-6">
      <p className="text-sm text-ink-700">{role === 'student' ? copy.studentOnly : copy.gatedBody}</p>
      {role === null && <Button href="/login?next=%2Fprograms%2Finquiry" className="mt-4">{copy.login}</Button>}
    </div>
  )
}
