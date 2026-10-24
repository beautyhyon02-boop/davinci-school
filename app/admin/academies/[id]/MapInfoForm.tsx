'use client'
import { useActionState } from 'react'
import { setAcademyMapInfo } from '../actions'
import { Button } from '@/components/ui/Button'
import { SIDOS, type Sido } from '@/lib/academies/sido'
import { app } from '@/content/site'

const copy = app.adminAcademies
const input = 'rounded-xl border border-ink-300 px-3 py-2'

/** 지도 정보(대표 2026-10-25): 시·도·홈페이지·지도 표시. 체크박스는 항상 있으므로 키가 없으면 껐음이다(parseAcademyMap). */
export function MapInfoForm({ academyId, sido, website, showOnMap }: { academyId: string; sido: Sido | null; website: string; showOnMap: boolean }) {
  const [state, action, pending] = useActionState(setAcademyMapInfo.bind(null, academyId), undefined)
  return (
    <form action={action} className="mt-2 grid max-w-md gap-3 rounded-2xl bg-white p-4">
      <label className="grid gap-1 text-sm">
        {copy.form.labels.sido}
        <select name="sido" defaultValue={sido ?? ''} className={input}>
          <option value="">{copy.form.sidoNone}</option>
          {SIDOS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </label>
      <label className="grid gap-1 text-sm">
        {copy.form.labels.website}
        <input name="website" defaultValue={website} placeholder={copy.form.websitePlaceholder} className={input} />
      </label>
      <label className="flex items-center gap-2 text-sm">
        {/* 체크 해제 상태는 브라우저가 보내지 않으므로, 빈 값을 먼저 보내 「껐음」을 알린다(parseMapFields). */}
        <input type="hidden" name="show_on_map" value="" />
        <input type="checkbox" name="show_on_map" value="on" defaultChecked={showOnMap} />
        {copy.form.labels.showOnMap}
      </label>
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state?.saved && <p className="text-sm text-mint-700">{copy.map.saved}</p>}
      <Button type="submit" disabled={pending}>{copy.map.submit}</Button>
    </form>
  )
}
