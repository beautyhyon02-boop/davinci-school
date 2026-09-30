import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { loadTasks } from '@/lib/inquiry/data'
import { visibleSources } from '@/lib/inquiry/publish-gate'
import { kstDateTime } from '@/lib/classroom/notice'
import { Badge } from '@/components/ui/Badge'
import { NewTaskButton } from './NewTaskButton'
import { app } from '@/content/site'

const copy = app.inquiry.admin

/** 탐구보고서 과제 목록(본사). 과제 한 줄에 하나: 제목(크게) → 부제 → 과목·대상·자료 수 → [열기]. 0016 전이면 안내 한 줄만. */
export default async function AdminInquiryPage() {
  const db = await createClient()
  const list = await loadTasks(db, { publishedOnly: false })
  return (
    <>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{copy.title}</h1>
          <p className="mt-1 text-sm text-ink-500">{copy.help}</p>
        </div>
        {list.available && <NewTaskButton />}
      </div>
      {!list.available && <p className="mt-4 rounded-xl bg-lemon-50 p-3 text-sm text-ink-700">{app.inquiry.unavailable}</p>}
      {list.loadFailed && <p className="mt-4 rounded-xl bg-lemon-50 p-3 text-sm text-ink-700">{app.inquiry.admin.errors.saveFailed}</p>}
      {list.available && !list.loadFailed && list.rows.length === 0 && <p className="mt-8 text-ink-500">{copy.empty}</p>}
      <ul className="mt-6 space-y-4">
        {list.rows.map((t) => {
          const total = t.task?.sources.length ?? 0
          const verified = t.task ? visibleSources(t.task).length : 0
          return (
            <li key={t.id} className="rounded-2xl bg-white p-6 shadow-[0_2px_20px_rgba(31,36,48,0.06)]">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-bold text-ink-900">{t.title.trim() || copy.untitled}</h2>
                <Badge tone={t.status === 'published' ? 'mint' : 'lemon'}>{copy.status[t.status]}</Badge>
              </div>
              {t.task?.subtitle && <p className="mt-1 text-base text-ink-700">{t.task.subtitle}</p>}
              <p className="mt-2 text-sm text-ink-500">{(t.task?.subjects ?? []).join(' · ')}{t.task ? ` · ${app.inquiry.level[t.task.level]}` : ''}</p>
              <p className="text-sm text-ink-500">{copy.sourcesCount(verified, total)}</p>
              {t.publishedAt && t.status === 'published' && <p className="text-sm text-ink-500">{copy.page.publishedAt(kstDateTime(t.publishedAt))}</p>}
              <p className="mt-3"><Link href={`/admin/inquiry/${t.id}`} className="text-sm font-semibold text-mint-700 underline">{copy.open}</Link></p>
            </li>
          )
        })}
      </ul>
    </>
  )
}
