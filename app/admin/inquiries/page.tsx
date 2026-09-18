import { createClient } from '@/lib/supabase/server'
import { Badge } from '@/components/ui/Badge'
import { app } from '@/content/site'
import { setInquiryStatus } from './actions'

const copy = app.adminInquiries
const tone = { new: 'lemon', contacted: 'mint', done: 'gray' } as const

export default async function InquiriesPage() {
  const supabase = await createClient()
  const { data: rows } = await supabase.from('franchise_inquiries').select('*').order('created_at', { ascending: false })
  return (
    <>
      <h1 className="text-2xl font-bold">{copy.title}</h1>
      <div className="mt-6 overflow-hidden rounded-2xl bg-white">
        <table className="w-full text-sm">
          <thead className="bg-ink-100/60 text-left">
            <tr>
              <th className="p-3">{copy.columns.date}</th>
              <th className="p-3">{copy.columns.name}</th>
              <th className="p-3">{copy.columns.phone}</th>
              <th className="p-3">{copy.columns.region}</th>
              <th className="p-3">{copy.columns.message}</th>
              <th className="p-3">{copy.columns.status}</th>
            </tr>
          </thead>
          <tbody>
            {(rows ?? []).map(r => (
              <tr key={r.id} className="border-t border-ink-100 align-top">
                <td className="p-3 whitespace-nowrap">{new Date(r.created_at).toLocaleDateString('ko-KR')}</td>
                <td className="p-3">{r.name}</td><td className="p-3">{r.phone}</td><td className="p-3">{r.region}</td>
                <td className="p-3 max-w-md whitespace-pre-wrap">{r.message}</td>
                <td className="p-3">
                  <Badge tone={tone[r.status as keyof typeof tone]}>{copy.statusLabel[r.status as keyof typeof copy.statusLabel]}</Badge>
                  <div className="mt-2 flex gap-1">
                    {(['new', 'contacted', 'done'] as const).filter(s => s !== r.status).map(s => (
                      <form key={s} action={setInquiryStatus.bind(null, r.id, s)}><button className="text-xs text-ink-500 underline">{copy.statusLabel[s]}</button></form>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows?.length && <p className="p-8 text-center text-ink-500">{copy.empty}</p>}
      </div>
    </>
  )
}
