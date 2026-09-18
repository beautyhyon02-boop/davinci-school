import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/Button'
import { countByAcademy } from '@/lib/academies/counts'
import { app } from '@/content/site'

const copy = app.adminAcademies

export default async function AcademiesPage() {
  const supabase = await createClient()
  const [{ data: academies }, { data: profiles }] = await Promise.all([
    supabase.from('academies').select('*').order('created_at', { ascending: false }),
    supabase.from('profiles').select('academy_id, role'),
  ])
  const counts = countByAcademy(profiles ?? [])

  return (
    <>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{copy.listTitle}</h1>
        <Button href="/admin/academies/new">{copy.newButton}</Button>
      </div>
      <div className="mt-6 overflow-hidden rounded-2xl bg-white">
        <table className="w-full text-sm">
          <thead className="bg-ink-100/60 text-left">
            <tr>
              <th className="p-3">{copy.columns.code}</th>
              <th className="p-3">{copy.columns.name}</th>
              <th className="p-3">{copy.columns.region}</th>
              <th className="p-3">{copy.columns.teacherCount}</th>
              <th className="p-3">{copy.columns.studentCount}</th>
            </tr>
          </thead>
          <tbody>
            {(academies ?? []).map(a => {
              const c = counts[a.id] ?? { teachers: 0, students: 0 }
              return (
                <tr key={a.id} className="border-t border-ink-100">
                  <td className="p-3">
                    <Link href={`/admin/academies/${a.id}`} className="font-semibold text-mint-700 underline">{a.code}</Link>
                  </td>
                  <td className="p-3">{a.name}</td>
                  <td className="p-3">{a.region}</td>
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
