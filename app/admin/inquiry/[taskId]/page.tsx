import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { loadTask } from '@/lib/inquiry/data'
import { emptyTask } from '@/lib/inquiry/schema'
import { TaskEditor } from './TaskEditor'
import { app } from '@/content/site'

const copy = app.inquiry.admin
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** 과제 하나(본사): 세로로 쌓인 편집 폼. 레이아웃이 관리자만 들인다. */
export default async function AdminInquiryTaskPage({ params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await params
  if (!UUID.test(taskId)) notFound()
  const db = await createClient()
  const [loaded, themes] = await Promise.all([
    loadTask(db, taskId),
    db.from('themes').select('id, title').order('created_at', { ascending: false }),
  ])
  if (!loaded.available) {
    return (
      <>
        <Link href="/admin/inquiry" className="text-sm text-mint-700 underline">{copy.page.back}</Link>
        <p className="mt-4 rounded-xl bg-lemon-50 p-3 text-sm text-ink-700">{app.inquiry.unavailable}</p>
      </>
    )
  }
  if (loaded.loadFailed) {
    return (
      <>
        <Link href="/admin/inquiry" className="text-sm text-mint-700 underline">{copy.page.back}</Link>
        <p className="mt-4 rounded-xl bg-lemon-50 p-3 text-sm text-ink-700">{copy.errors.saveFailed}</p>
      </>
    )
  }
  if (!loaded.row) notFound()
  const row = loaded.row
  // 모양이 맞지 않는 줄(있을 수 없지만)은 빈 과제로 열어 다시 저장할 수 있게 한다 — 제목은 남긴다
  const initial = row.task ?? { ...emptyTask(), title: row.title }

  return (
    <>
      <Link href="/admin/inquiry" className="text-sm text-mint-700 underline">{copy.page.back}</Link>
      <h1 className="mt-2 text-2xl font-bold">{row.title.trim() || copy.untitled}</h1>
      <p className="mt-1 text-sm text-ink-500">{copy.page.help}</p>
      <TaskEditor
        key={`${row.status}:${row.updatedAt ?? ''}`}
        taskId={taskId} initial={initial} status={row.status} publishedAt={row.publishedAt}
        themes={((themes.data ?? []) as { id: string; title: string }[]).map((t) => ({ id: t.id, title: t.title }))}
      />
    </>
  )
}
