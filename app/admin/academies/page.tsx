import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/Button'
import { countByAcademy } from '@/lib/academies/counts'
import { isPlan, DEFAULT_PLAN, type Plan } from '@/lib/academies/plan'
import { app } from '@/content/site'

const copy = app.adminAcademies

/** 가맹원 목록. ?plan=davinci|davinci_basic 로 가맹 상품별 필터(PRD 2026-10-20). */
export default async function AcademiesPage({ searchParams }: { searchParams: Promise<{ plan?: string }> }) {
  const { plan: planParam } = await searchParams
  const filter: Plan | null = isPlan(planParam) ? planParam : null
  const supabase = await createClient()
  const [{ data: academies }, { data: profiles }] = await Promise.all([
    supabase.from('academies').select('*').order('created_at', { ascending: false }),
    supabase.from('profiles').select('academy_id, role'),
  ])
  const counts = countByAcademy(profiles ?? [])
  const all = academies ?? []
  const nAll = all.filter(a => a.plan === 'davinci').length
  const nBasic = all.filter(a => a.plan === 'davinci_basic').length
  const list = filter ? all.filter(a => a.plan === filter) : all

  const chip = (value: Plan | null, label: string) => (
    <Link
      href={value ? `/admin/academies?plan=${value}` : '/admin/academies'}
      className={`rounded-full px-3 py-1 text-sm ${filter === value ? 'bg-mint-700 text-white' : 'bg-ink-100 text-ink-700'}`}
    >
      {label}
    </Link>
  )

  return (
    <>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{copy.listTitle}</h1>
        <Button href="/admin/academies/new">{copy.newButton}</Button>
      </div>
      <p className="mt-2 text-sm text-ink-500">{copy.plan.summary(nAll, nBasic)}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {chip(null, copy.plan.filterAll)}
        {chip('davinci', copy.plan.names.davinci)}
        {chip('davinci_basic', copy.plan.names.davinci_basic)}
      </div>
      <div className="mt-4 overflow-x-auto rounded-2xl bg-white">
        <table className="w-full text-sm">
          <thead className="bg-ink-100/60 text-left">
            <tr>
              <th className="p-3">{copy.columns.code}</th>
              <th className="p-3">{copy.columns.name}</th>
              <th className="p-3">{copy.columns.sido}</th>
              <th className="p-3">{copy.columns.region}</th>
              <th className="p-3">{copy.columns.plan}</th>
              <th className="p-3">{copy.columns.teacherCount}</th>
              <th className="p-3">{copy.columns.studentCount}</th>
            </tr>
          </thead>
          <tbody>
            {list.map(a => {
              const c = counts[a.id] ?? { teachers: 0, students: 0 }
              const plan: Plan = isPlan(a.plan) ? a.plan : DEFAULT_PLAN
              return (
                <tr key={a.id} className="border-t border-ink-100">
                  <td className="p-3">
                    <Link href={`/admin/academies/${a.id}`} className="font-semibold text-mint-700 underline">{a.code}</Link>
                  </td>
                  <td className="p-3">{a.name}</td>
                  <td className="p-3">{a.sido ?? ''}</td>
                  <td className="p-3">{a.region}</td>
                  <td className="p-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${plan === 'davinci' ? 'bg-mint-100 text-mint-700' : 'bg-ink-100 text-ink-700'}`}>
                      {copy.plan.names[plan]}
                    </span>
                  </td>
                  <td className="p-3">{c.teachers}</td>
                  <td className="p-3">{c.students}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </>
  )
}
