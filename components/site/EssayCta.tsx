import { pages } from '@/content/site'
import { Button } from '@/components/ui/Button'
import { canUseEssay, type Plan } from '@/lib/academies/plan'

const copy = pages.program.essayCta

/**
 * 「서논술형」 수업 페이지의 단추(대표 2026-10-29). 비로그인·학생: 가맹 문의 / 다빈치올 원장: 원장 화면 / 다빈치 베이직 원장: 안내 + 본사 문의 / 본사: 문항 제작소.
 * 세션을 읽는 일은 페이지가 하고, 여기서는 받은 값만 보고 그린다(순수).
 */
export function EssayCta({ role, plan }: { role: 'admin' | 'teacher' | 'student' | null; plan: Plan | null }) {
  if (role === 'admin') return <Button href="/admin/items" className="mt-10">{copy.admin}</Button>
  if (role === 'teacher') {
    if (canUseEssay(role, plan)) return <Button href="/teacher/items" className="mt-10">{copy.open}</Button>
    return (
      <div className="mt-10 rounded-2xl bg-lavender-100/50 p-6">
        <p className="font-bold text-ink-900">{copy.locked.heading}</p>
        <p className="mt-2 text-ink-700">{copy.locked.body}</p>
        <Button href="/franchise" variant="accent" className="mt-4">{copy.locked.button}</Button>
      </div>
    )
  }
  return <Button href="/franchise" variant="accent" className="mt-10">{pages.program.cta}</Button>
}
