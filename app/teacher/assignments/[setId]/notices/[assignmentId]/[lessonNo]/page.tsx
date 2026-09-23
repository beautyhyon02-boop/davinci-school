import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getSessionProfile } from '@/lib/auth/session'
import { loadAssignmentSnapshot } from '@/lib/classroom/snapshot'
import { Notice } from '@/lib/classroom/notice-schema'
import { NoticeView } from '@/components/classroom/NoticeView'
import { PrintButton } from '@/components/classroom/PrintButton'
import { Badge } from '@/components/ui/Badge'
import { NoticeDraftForm } from './NoticeDraftForm'
import { NoticeEditForm } from './NoticeEditForm'
import { app } from '@/content/site'

// draftNotice 는 AI 호출(서·논술형 차시)을 기다린다 — 배정 상세와 같은 여유를 둔다.
export const maxDuration = 300

const copy = app.classroom.notice

/**
 * 원장 전용 학생별 차시 안내장: 초안 만들기 → 문장 고치기 → 확정 → 인쇄.
 * 레이아웃이 원장만 들이지만 여기서도 역할을 다시 본다. 읽기는 원장 클라이언트(RLS: 자기 원 배정의 안내장만, 학생 정책 없음).
 */
export default async function NoticePage({ params }: { params: Promise<{ setId: string; assignmentId: string; lessonNo: string }> }) {
  const { setId, assignmentId, lessonNo: raw } = await params
  const lessonNo = Number(raw)
  if (!Number.isInteger(lessonNo) || lessonNo < 1 || lessonNo > 8) notFound()
  const s = await getSessionProfile()
  if (s.role !== 'teacher') notFound()
  const supabase = await createClient()
  const { data: a } = await supabase.from('assignments')
    .select('id, item_set_id, item_set_version, students!assignments_student_id_fkey(profiles(name))')
    .eq('id', assignmentId).maybeSingle()
  if (!a || a.item_set_id !== setId) notFound()
  const snapshot = await loadAssignmentSnapshot(supabase, a.item_set_id, a.item_set_version)
  if (!snapshot || !snapshot.lessons.some((l) => l.no === lessonNo)) notFound()
  const name = (a.students as unknown as { profiles: { name: string } | null } | null)?.profiles?.name ?? ''

  const { data: row } = await supabase.from('lesson_notices').select('body, status, confirmed_at, updated_at')
    .eq('assignment_id', assignmentId).eq('lesson_no', lessonNo).maybeSingle()
  const parsed = row ? Notice.safeParse(row.body) : null
  const notice = parsed?.success ? parsed.data : null
  const confirmed = row?.status === 'confirmed' && !!row.confirmed_at

  return (
    <>
      <div className="no-print">
        <Link href={`/teacher/assignments/${setId}`} className="text-sm text-mint-700 underline">{copy.back}</Link>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold">{copy.title(name, lessonNo)}</h1>
          {notice && <Badge tone={confirmed ? 'mint' : 'lemon'}>{confirmed ? copy.status.confirmed : copy.status.draft}</Badge>}
          {confirmed && row?.confirmed_at && <span className="text-sm text-ink-500">{copy.confirmedAt(String(row.confirmed_at).slice(0, 16).replace('T', ' '))}</span>}
        </div>
      </div>
      {!notice ? (
        <div className="mt-6 space-y-3">
          <p className="text-ink-700">{copy.noNotice}</p>
          <NoticeDraftForm assignmentId={assignmentId} lessonNo={lessonNo} redraft={false} />
        </div>
      ) : (
        <>
          <div className="no-print mt-4 flex flex-wrap items-start gap-3">
            {/* HITL: 확정 전 초안은 인쇄하지 않는다 */}
            {confirmed ? <PrintButton label={copy.print} /> : <p className="py-2.5 text-sm text-ink-500">{copy.printHint}</p>}
            <NoticeDraftForm assignmentId={assignmentId} lessonNo={lessonNo} redraft />
          </div>
          {!confirmed && <p className="hidden text-center text-sm font-bold text-ink-500 print:block">{copy.status.draft}</p>}
          <div className="mt-4 print:mt-0"><NoticeView notice={notice} /></div>
          <NoticeEditForm key={String(row?.updated_at ?? '')} assignmentId={assignmentId} lessonNo={lessonNo} notice={notice} confirmed={confirmed} />
        </>
      )}
    </>
  )
}
