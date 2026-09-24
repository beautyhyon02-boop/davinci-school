import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { PackageView } from '@/components/studio/PackageView'
import { upgradeSnapshot, type Snapshot } from '@/lib/studio/publish'
import { Button } from '@/components/ui/Button'
import { PrintButton } from '@/components/classroom/PrintButton'
import { app } from '@/content/site'

const copy = app.teacherItems

// 최신 버전 스냅샷만 보여준다 — RLS(item_set_versions)가 status='published' 세트의 스냅샷만 authenticated에게 허용한다.
export default async function TeacherItemDetailPage({ params }: { params: Promise<{ setId: string }> }) {
  const { setId } = await params
  const supabase = await createClient()

  const { data } = await supabase
    .from('item_set_versions')
    .select('snapshot')
    .eq('item_set_id', setId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!data) notFound()

  const snapshot: Snapshot = upgradeSnapshot(data.snapshot)   // v1 판도 v2 모양으로 읽는다(스펙 §4.3)

  return (
    <>
      <div className="no-print">
        <Link href="/teacher/items" className="text-sm text-mint-700 underline">{copy.detail.backToList}</Link>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button href={`/teacher/assignments/new?set=${setId}`}>{app.classroom.assign.button}</Button>
          {/* 문제지 인쇄: 표지·자료·문항·답란만(app/globals.css html.print-questions) */}
          <PrintButton label={app.packageView.print.button} sheet="questions" />
        </div>
      </div>
      <div className="mt-4">
        <PackageView snapshot={snapshot} mode="teacher" showAnswers />
      </div>
    </>
  )
}
