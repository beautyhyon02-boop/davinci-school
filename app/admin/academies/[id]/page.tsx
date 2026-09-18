import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { TeacherAccountForm } from './TeacherAccountForm'
import { app } from '@/content/site'

const copy = app.adminAcademies

export default async function AcademyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: a } = await supabase.from('academies').select('*').eq('id', id).single()
  if (!a) notFound()
  const { data: teachers } = await supabase.from('profiles').select('id, name, login_id').eq('academy_id', id).eq('role', 'teacher')

  return (
    <>
      <h1 className="text-2xl font-bold">
        {a.name} <span className="text-base font-normal text-ink-500">({a.code})</span>
      </h1>
      <p className="mt-1 text-ink-500">
        {a.region} · {copy.detailMeta.studentCapacity(a.student_capacity)} · {copy.detailMeta.monthlyGradingLimit(a.monthly_grading_limit)}
      </p>
      <h2 className="mt-8 text-lg font-bold">{copy.teacherAccount.heading}</h2>
      <ul className="mt-2 space-y-1">
        {(teachers ?? []).map(t => <li key={t.id}>{t.name} · {t.login_id}</li>)}
      </ul>
      <TeacherAccountForm academyId={id} />
    </>
  )
}
