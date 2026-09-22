import { createClient } from '@/lib/supabase/server'
import { NewStudentForm } from './NewStudentForm'
import { ResetPasswordButton } from './ResetPasswordButton'
import { app } from '@/content/site'

const copy = app.classroom.students

type Row = { profile_id: string; level: string; grade: number; seq: number; profiles: { name: string; login_id: string | null } | null }

export default async function TeacherStudentsPage() {
  const supabase = await createClient()
  const [{ data: students }, { data: assignments }] = await Promise.all([
    supabase.from('students').select('profile_id, level, grade, seq, profiles(name, login_id)').eq('enrolled', true).order('seq'),
    supabase.from('assignments').select('student_id'),
  ])
  const counts: Record<string, number> = {}
  for (const a of assignments ?? []) counts[a.student_id] = (counts[a.student_id] ?? 0) + 1
  const rows = (students ?? []) as unknown as Row[]

  return (
    <>
      <h1 className="text-2xl font-bold">{copy.title}</h1>
      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="overflow-hidden rounded-2xl bg-white">
          <table className="w-full text-sm">
            <thead className="bg-ink-100/60 text-left"><tr>
              <th className="p-3">{copy.columns.name}</th><th className="p-3">{copy.columns.grade}</th>
              <th className="p-3">{copy.columns.loginId}</th><th className="p-3">{copy.columns.assignments}</th><th className="p-3">{copy.columns.actions}</th>
            </tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.profile_id} className="border-t border-ink-100">
                  <td className="p-3 font-semibold">{r.profiles?.name}</td>
                  <td className="p-3">{app.studio.theme.meta(r.level, r.grade)}</td>
                  <td className="p-3 font-mono text-xs">{r.profiles?.login_id}</td>
                  <td className="p-3">{counts[r.profile_id] ?? 0}</td>
                  <td className="p-3"><ResetPasswordButton profileId={r.profile_id} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length && <p className="p-8 text-center text-ink-500">{copy.empty}</p>}
        </div>
        <NewStudentForm />
      </div>
    </>
  )
}
