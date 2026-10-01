import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getSessionProfile } from '@/lib/auth/session'
import { upgradeSnapshot } from '@/lib/studio/publish'
import { buildBookPlan, type BookKind } from '@/lib/book/plan'
import { BookShell } from '@/components/book/BookShell'
import { StudentBook } from '@/components/book/StudentBook'
import { TeacherBook } from '@/components/book/TeacherBook'

// 원장: 제본용 교재 인쇄 전용 쪽 /teacher/items/[setId]/book/student · /book/teacher(설계 2026-10-01 §4).
// (book) 경로 그룹이라 app/teacher/layout.tsx(옆 메뉴)를 거치지 않는다 — 역할은 proxy(경로 접두어)와 여기서 다시 본다. 학생 경로는 없다.
// 최신 게시 판만(원장 문항 화면과 같은 조회 — RLS 가 published 세트의 스냅숏만 허용).

const KINDS: readonly BookKind[] = ['student', 'teacher']
const isKind = (k: string): k is BookKind => (KINDS as readonly string[]).includes(k)

export default async function TeacherBookPage({ params }: { params: Promise<{ setId: string; kind: string }> }) {
  const { setId, kind } = await params
  if (!isKind(kind)) notFound()
  const s = await getSessionProfile()
  if (s.role !== 'teacher' && s.role !== 'admin') notFound()
  const supabase = await createClient()
  const { data } = await supabase
    .from('item_set_versions')
    .select('snapshot')
    .eq('item_set_id', setId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!data) notFound()
  const plan = buildBookPlan(upgradeSnapshot(data.snapshot), kind)
  return (
    <BookShell kind={kind} backHref={`/teacher/items/${setId}`}>
      {kind === 'student' ? <StudentBook plan={plan} /> : <TeacherBook plan={plan} />}
    </BookShell>
  )
}
