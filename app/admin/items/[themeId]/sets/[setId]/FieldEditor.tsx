// 'use client' 지시어를 두지 않는다: 클라이언트 컴포넌트(StageWizard)만 이 파일을 가져오므로 이미 클라이언트 쪽이고,
// onSaved 같은 함수 prop 은 클라이언트 → 클라이언트로만 넘어간다(RSC 경계를 넘지 않는다).
import { useMemo, useState, useTransition } from 'react'
import { Button } from '@/components/ui/Button'
import { app } from '@/content/site'
import { applyFieldEdits, expandFields, groupFields, validateEdited, type EditableField } from '@/lib/studio/editable-fields'
import type { StageStatus } from '@/lib/studio/stages'
import type { WizardStage } from '@/lib/studio/wizard-stages'
import { saveStageEdit } from './actions'

const copy = app.studio.wizard.fieldEditor

/** 칸 라벨(content/site.ts labels[경로]). 라벨이 없는 경로는 경로 자체를 보인다(테스트가 모든 경로의 라벨을 확인한다). */
export function fieldLabel(f: EditableField): string {
  return copy.labels[f.pattern]?.(f.indices, f.parent) ?? f.pattern
}
function groupLabel(top: string, tag: string): string {
  return copy.groups[top]?.(tag) ?? top
}

/**
 * 문장 고치기(대표 2026-09-26): 단계 출력의 문장만 칸으로 고쳐 저장한다. 저장은 고친 출력 전체를 saveStageEdit 로 보낸다 —
 * 형식 검사(zod) → 저장 → 뒤 단계 초기화(downstreamResets) → 자동 검사 메모 다시 계산. 이 단계는 '생성됨(편집됨)'으로 돌아가
 * 다시 [확인]해야 한다. 뒤 단계(laterStages: 준비 전이 아닌 단계)가 있으면 초기화 확인 칸을 체크해야 저장된다.
 */
export function FieldEditor({
  setId,
  stage,
  output,
  laterStages,
  onSaved,
}: {
  setId: string
  stage: WizardStage
  output: unknown
  /** 이 단계보다 뒤에 있고 준비 전(idle)이 아닌 단계 — 저장하면 초기화된다. */
  laterStages: number[]
  onSaved: (status: StageStatus) => void
}) {
  const fields = useMemo(() => expandFields(stage, output), [stage, output])
  const groups = useMemo(() => groupFields(fields), [fields])
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(fields.map((f) => [f.id, f.value])))
  const [confirmed, setConfirmed] = useState(false)
  const [error, setError] = useState<{ fieldId?: string; message: string } | null>(null)
  const [pending, startTransition] = useTransition()

  if (fields.length === 0) return <p className="mt-3 text-sm text-ink-500">{copy.empty}</p>

  const changed = fields.filter((f) => values[f.id] !== f.value).length
  const needsConfirm = laterStages.length > 0
  const canSave = changed > 0 && (!needsConfirm || confirmed) && !pending

  function setValue(id: string, v: string) {
    setValues((prev) => ({ ...prev, [id]: v }))
  }

  function save() {
    setError(null)
    const next = applyFieldEdits(output, fields, values)
    const invalid = validateEdited(stage, next, fields)
    if (invalid) {
      const field = fields.find((f) => f.id === invalid.fieldId)
      setError({ fieldId: invalid.fieldId, message: field ? copy.fieldError(fieldLabel(field), invalid.message) : invalid.message })
      return
    }
    startTransition(async () => {
      const res = await saveStageEdit(setId, stage, JSON.stringify(next))
      if (!res.ok) {
        setError({ message: res.error })
        return
      }
      // 저장 안내는 StagePanel 이 보인다 — 저장된 새 출력으로 이 칸들이 다시 그려진다(key)
      setConfirmed(false)
      onSaved(res.status)
    })
  }

  return (
    <div className="mt-3 space-y-4">
      <p className="text-sm text-ink-500">{copy.description}</p>
      {groups.map((g) => (
        <fieldset key={g.key} className="rounded-xl border border-ink-100 p-3">
          <legend className="px-1 text-sm font-bold">{groupLabel(g.top, g.tag)}</legend>
          <div className="space-y-2">
            {g.fields.map((f) => {
              const label = fieldLabel(f)
              const isChanged = values[f.id] !== f.value
              const cls = `mt-1 w-full rounded-lg border p-2 text-sm font-normal text-ink-900 ${error?.fieldId === f.id ? 'border-red-500' : isChanged ? 'border-lavender-500' : 'border-ink-300'}`
              return (
                <label key={f.id} className="block text-xs font-semibold text-ink-500">
                  {label}
                  {f.multiline ? (
                    <textarea
                      name={f.id}
                      value={values[f.id] ?? ''}
                      onChange={(e) => setValue(f.id, e.target.value)}
                      rows={Math.min(8, Math.max(2, Math.ceil((values[f.id] ?? '').length / 60)))}
                      className={cls}
                    />
                  ) : (
                    <input name={f.id} value={values[f.id] ?? ''} onChange={(e) => setValue(f.id, e.target.value)} className={cls} />
                  )}
                </label>
              )
            })}
          </div>
        </fieldset>
      ))}

      {needsConfirm && (
        <div className="rounded-xl bg-lemon-50 p-3 text-sm">
          <p className="font-semibold">{copy.resetWarning(stage + 1)}</p>
          <label className="mt-1 flex items-center gap-2">
            <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
            {copy.resetConfirm}
          </label>
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error.message}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <Button disabled={!canSave} onClick={save}>{pending ? copy.saving : copy.save}</Button>
        <Button
          variant="ghost"
          disabled={changed === 0 || pending}
          onClick={() => { setValues(Object.fromEntries(fields.map((f) => [f.id, f.value]))); setError(null) }}
        >
          {copy.reset}
        </Button>
        <span className="text-xs text-ink-500">{copy.changedCount(changed)}</span>
      </div>
    </div>
  )
}
