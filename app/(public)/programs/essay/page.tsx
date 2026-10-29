import { ProgramPage } from '@/components/site/ProgramPage'
import { EssayCta } from '@/components/site/EssayCta'
import { getSessionProfileOrNull } from '@/lib/auth/session'

// 로그인한 사람·가맹 상품에 따라 단추가 달라지므로 요청마다 그린다
export const dynamic = 'force-dynamic'

export default async function EssayPage() {
  const s = await getSessionProfileOrNull()
  return <ProgramPage slug="essay" cta={<EssayCta role={s?.role ?? null} plan={s?.plan ?? null} />} />
}
