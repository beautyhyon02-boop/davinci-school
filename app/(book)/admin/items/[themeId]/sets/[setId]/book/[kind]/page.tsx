import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getSessionProfile } from '@/lib/auth/session'
import { buildSnapshot, upgradeSnapshot, type Snapshot } from '@/lib/studio/publish'
import type { StageStatus } from '@/lib/studio/stages'
import { buildBookPlan, type BookKind } from '@/lib/book/plan'
import { BookShell } from '@/components/book/BookShell'
import { StudentBook } from '@/components/book/StudentBook'
import { TeacherBook } from '@/components/book/TeacherBook'

// 본사: 제본용 교재 인쇄 전용 쪽 /admin/items/[themeId]/sets/[setId]/book/student · /book/teacher(설계 2026-10-01 §4).
// 게시 판이 있으면 최신 게시 판으로, 없으면 지금 단계 출력으로 초안 미리보기(「초안 미리보기」 표시 — 세트 화면 미리보기와 같은 buildSnapshot).
// (book) 경로 그룹이라 app/admin/layout.tsx(옆 메뉴)를 거치지 않는다 — 역할은 proxy 와 여기서 다시 본다.

const KINDS: readonly BookKind[] = ['student', 'teacher']
const isKind = (k: string): k is BookKind => (KINDS as readonly string[]).includes(k)

export default async function AdminBookPage({ params }: { params: Promise<{ themeId: string; setId: string; kind: string }> }) {
  const { themeId, setId, kind } = await params
  if (!isKind(kind)) notFound()
  const s = await getSessionProfile()
  if (s.role !== 'admin') notFound()
  const supabase = await createClient()

  const { data: itemSet } = await supabase
    .from('item_sets')
    .select('id, theme_id, subject, level, grade, status, version, key_question, stage_status, materials, unit_plan, lessons, reconstruction, reconstruction_detail, learning_goals, assessment, teacher_guide, notice_plan, shared_material_ids')
    .eq('id', setId)
    .single()
  if (!itemSet || itemSet.theme_id !== themeId) notFound()

  const { data: published } = await supabase
    .from('item_set_versions')
    .select('snapshot, version')
    .eq('item_set_id', setId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle()

  let snapshot: Snapshot
  let draft = false
  if (published?.snapshot) {
    snapshot = upgradeSnapshot(published.snapshot)
  } else {
    const { data: theme } = await supabase.from('themes').select('title, level, grade, intro, materials').eq('id', themeId).single()
    if (!theme) notFound()
    const { data: standardRows } = await supabase.from('item_set_standards').select('standards(code, text)').eq('item_set_id', setId)
    const standards = (standardRows ?? [])
      .map((r) => r.standards as unknown as { code: string; text: string } | null)
      .filter((x): x is { code: string; text: string } => !!x)
      .sort((a, b) => a.code.localeCompare(b.code))
    const stageStatus = (itemSet.stage_status ?? {}) as Record<string, StageStatus>
    snapshot = buildSnapshot({
      theme: { title: theme.title, level: theme.level, grade: theme.grade, intro: theme.intro, materials: theme.materials },
      itemSet: { ...itemSet, stage_status: stageStatus },
      standards,
      version: (published?.version ?? 0) + 1,
    })
    draft = true
  }
  const plan = buildBookPlan(snapshot, kind)
  return (
    <BookShell kind={kind} backHref={`/admin/items/${themeId}/sets/${setId}`}>
      {kind === 'student' ? <StudentBook plan={plan} draft={draft} /> : <TeacherBook plan={plan} draft={draft} />}
    </BookShell>
  )
}
