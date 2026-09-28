import { Badge } from '@/components/ui/Badge'
import { app } from '@/content/site'

// 대주제 공동 자료 체크 목록(대표 결정 2026-09-28: 공동 자료는 세트마다 골라 쓴다, 기본 = 아무것도 안 씀).
// 세트 만들기 폼(StandardsPicker)과 세트 화면의 선택 카드(SharedMaterialsSelector)가 같이 쓰는 표시 조각이다.
// 'use client' 를 붙이지 않는다 — onToggle(함수)을 받으므로 클라이언트 컴포넌트 안에서만 쓴다(서버 → 클라이언트 경계에 함수 prop 금지).

const copy = app.studio.sharedSelection

/** 체크 목록 한 줄에 필요한 것만(평범한 데이터). title 은 부른 쪽이 출처 표기를 정리해 넘긴다(cleanMaterialTitle). */
export type SharedMaterialOption = { id: string; title: string; kind: string }

export function SharedMaterialCheckboxes({ options, selected, onToggle, disabled = false }: {
  options: SharedMaterialOption[]
  selected: string[]
  onToggle: (id: string) => void
  disabled?: boolean
}) {
  if (options.length === 0) return <p className="mt-2 text-sm text-ink-500">{copy.empty}</p>
  return (
    <ul className="mt-2 space-y-2">
      {options.map((o) => (
        <li key={o.id}>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" data-shared-material={o.id} checked={selected.includes(o.id)} onChange={() => onToggle(o.id)} disabled={disabled} className="mt-1" />
            <span className="font-semibold">{copy.idLabel(o.id)}</span>
            <span className="flex-1">{o.title}</span>
            <Badge tone="gray">{copy.kindLabel[o.kind] ?? o.kind}</Badge>
            <Badge tone="lavender">{app.packageView.materials.sharedBadge}</Badge>
          </label>
        </li>
      ))}
    </ul>
  )
}

/** 선택 토글(순수) — 있으면 빼고 없으면 넣은 뒤 오름차순. */
export function toggleSharedId(selected: string[], id: string): string[] {
  return (selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]).sort()
}
