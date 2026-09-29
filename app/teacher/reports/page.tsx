import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getSessionProfile } from '@/lib/auth/session'
import { loadReportIndex, type ReportViewer } from '@/lib/classroom/report-data'
import { Badge } from '@/components/ui/Badge'
import { app } from '@/content/site'

const copy = app.classroom.report.index
const TONE = { none: 'gray', draft: 'lemon', confirmed: 'mint' } as const

/**
 * 단원 리포트 목록(설계 2026-09-29 §5.4): 대주제(크게) → 학생 한 줄에 하나 → 아랫줄에 과목별 준비 상태 → [리포트 보기].
 * 다른 학생과 견주는 숫자·순서는 없다 — 학생은 이름 순서로만 놓는다. 대주제는 최근에 배정한 것이 위로 온다.
 * 읽다가 오류가 나면 목록 대신 안내 한 줄만 보인다(0개로 잘못 보이지 않게).
 */
export default async function TeacherReportsPage() {
  const s = await getSessionProfile()
  if (s.role !== 'teacher' && s.role !== 'admin') notFound()
  const viewer: ReportViewer = { role: s.role, userId: s.userId, academyId: s.academyId }
  const supabase = await createClient()
  const index = await loadReportIndex(supabase, viewer)

  return (
    <>
      <h1 className="text-2xl font-bold">{copy.title}</h1>
      <div className="mt-2 space-y-1 text-sm text-ink-500">
        {copy.intro.map((line) => <p key={line}>{line}</p>)}
      </div>
      {index.loadFailed && <p className="mt-4 rounded-xl bg-lemon-50 p-3 text-sm text-ink-700">{copy.loadFailed}</p>}
      {!index.finalizeAvailable && <p className="mt-4 rounded-xl bg-lemon-50 p-3 text-sm text-ink-700">{copy.finalizeUnavailable}</p>}
      {!index.reportsAvailable && <p className="mt-2 rounded-xl bg-lemon-50 p-3 text-sm text-ink-700">{copy.reportsUnavailable}</p>}
      {!index.loadFailed && index.themes.length === 0 && <p className="mt-8 text-ink-500">{copy.empty}</p>}

      <div className="mt-6 space-y-8">
        {index.themes.map((t) => (
          <section key={t.themeId} className="rounded-2xl bg-white p-6 shadow-[0_2px_20px_rgba(31,36,48,0.06)]">
            <h2 className="text-xl font-bold text-ink-900">{t.title}</h2>
            <ul className="mt-3 divide-y divide-ink-100">
              {t.students.map((st) => (
                <li key={st.studentId} className="py-4">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="text-base font-bold">{st.name}</span>
                    <Badge tone={TONE[st.status]}>{copy.status[st.status]}</Badge>
                  </p>
                  <ul className="mt-1 space-y-0.5 text-sm text-ink-500">
                    {st.subjects.map((r) => (
                      <li key={r.subject}>{r.unreadable ? copy.unreadable(r.subject) : copy.readiness(r.subject, r.finalizedLessons, r.teachingLessons, r.confirmedItems, r.items)}</li>
                    ))}
                  </ul>
                  <p className="mt-2">
                    <Link href={`/teacher/reports/${t.themeId}/${st.studentId}`} className="text-sm font-semibold text-mint-700 underline">{copy.open}</Link>
                  </p>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </>
  )
}
