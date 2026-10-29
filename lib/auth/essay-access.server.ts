import { redirect } from 'next/navigation'
import { getSessionProfile, type SessionProfile } from '@/lib/auth/session'
import { canUseEssay } from '@/lib/academies/plan'

/** 서논술 페이지 맨 앞에서 부른다: 로그인 세션을 읽고, 다빈치올·관리자가 아니면 잠금 안내 페이지로 보낸다. */
export async function requireEssayPage(): Promise<SessionProfile> {
  const s = await getSessionProfile()
  if (!canUseEssay(s.role, s.plan)) redirect('/teacher/locked')
  return s
}
