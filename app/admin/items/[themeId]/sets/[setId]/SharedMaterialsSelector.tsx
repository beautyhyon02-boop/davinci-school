'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { app } from '@/content/site'
import { SharedMaterialCheckboxes, toggleSharedId, type SharedMaterialOption } from '../../SharedMaterialCheckboxes'
import { setSharedMaterialIds } from './actions'

const copy = app.studio.sharedSelection

/**
 * 세트 화면(제작 탭 맨 위) 「이 세트에서 쓸 공동 자료」 카드(대표 결정 2026-09-28). 체크한 공동 자료만 이 세트의 AI 생성·검토,
 * 제작소 4·5단계 탭, 미리보기·게시 판에 들어간다. 저장하면 서버 화면을 다시 읽어(router.refresh) 탭·미리보기가 새 선택을 쓴다.
 * 3단계 이후가 이미 있으면(showRegenNotice) 선택을 바꿀 때 "다시 만들어야 할 수 있음" 안내를 보인다 — 저장은 막지 않는다.
 */
export function SharedMaterialsSelector({ setId, options, initialSelected, showRegenNotice }: {
  setId: string
  options: SharedMaterialOption[]
  initialSelected: string[]
  showRegenNotice: boolean
}) {
  const [saved, setSaved] = useState<string[]>(initialSelected)
  const [selected, setSelected] = useState<string[]>(initialSelected)
  const [error, setError] = useState<string | null>(null)
  const [justSaved, setJustSaved] = useState(false)
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  const dirty = selected.join(',') !== saved.join(',')

  function save() {
    setError(null)
    setJustSaved(false)
    startTransition(async () => {
      const res = await setSharedMaterialIds(setId, selected)
      if (!res.ok) { setError(res.error); return }
      setSaved(selected)
      setJustSaved(true)
      router.refresh()
    })
  }

  return (
    <Card>
      <h2 className="text-lg font-bold">{copy.heading}</h2>
      <p className="mt-1 text-sm text-ink-500">{copy.description}</p>
      <SharedMaterialCheckboxes options={options} selected={selected} onToggle={(id) => { setSelected((s) => toggleSharedId(s, id)); setJustSaved(false) }} disabled={pending} />
      {options.length > 0 && (
        <p className="mt-2 text-sm text-ink-700">{saved.length > 0 ? copy.selectedSummary(saved) : copy.noneSelected}</p>
      )}
      {showRegenNotice && (dirty || justSaved) && <p className="mt-2 text-sm text-lemon-600">{copy.regenNotice}</p>}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      {justSaved && !dirty && <p className="mt-2 text-sm text-mint-700">{copy.saved}</p>}
      {options.length > 0 && (
        <div className="mt-3">
          <Button variant="ghost" disabled={pending || !dirty} onClick={save}>{pending ? copy.saving : copy.save}</Button>
        </div>
      )}
    </Card>
  )
}
