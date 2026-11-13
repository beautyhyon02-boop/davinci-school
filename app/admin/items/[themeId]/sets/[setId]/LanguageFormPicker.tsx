'use client'
import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { app } from '@/content/site'
import { LANGUAGE_FORM_DEFAULT, LANGUAGE_FORM_PICK, type LanguageForm } from '@/lib/studio/language-forms'
import { chooseLanguageForms } from './actions'

const copy = app.studio.wizard.languageForms

/**
 * 목표 문법 고르기(영어 세트, S-영-11 — 대표 2026-11-14 "AI가 후보 내고 본사가 고르는 방식").
 * 2단계가 낸 후보(3~4개)를 체크해 2~3개 고른다. 고른 적이 없으면 앞의 두 개가 체크돼 있고, 저장하지 않아도 그 둘로 진행된다(막지 않는다).
 * 뒤 단계가 이미 있으면 "다시 만들어야 할 수 있음" 안내만 보인다 — 저장이 뒤 단계를 초기화하지 않는다(공동 자료 선택과 같은 규칙).
 */
export function LanguageFormPicker({ setId, candidates, selected, hasLater, disabled = false, onSaved }: {
  setId: string
  candidates: LanguageForm[]
  /** 저장된 선택(이름). 비어 있으면 앞의 두 개를 미리 체크한다. */
  selected: string[]
  hasLater: boolean
  /** 단계가 도는 동안(생성·AI 검토) 잠근다 — 그 사이의 저장은 끝난 단계가 덮어쓴다. */
  disabled?: boolean
  onSaved?: () => void
}) {
  const known = candidates.map((c) => c.name)
  const initial = selected.filter((n) => known.includes(n))
  const [picked, setPicked] = useState<string[]>(initial.length > 0 ? initial : known.slice(0, LANGUAGE_FORM_DEFAULT))
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  if (candidates.length === 0) return null

  const toggle = (name: string) => { setSaved(false); setPicked((p) => (p.includes(name) ? p.filter((n) => n !== name) : [...p, name])) }
  const countOk = picked.length >= LANGUAGE_FORM_PICK.min && picked.length <= LANGUAGE_FORM_PICK.max
  function submit() {
    setError(null); setSaved(false)
    startTransition(async () => {
      const res = await chooseLanguageForms(setId, picked)
      if (res.ok) { setSaved(true); onSaved?.() } else setError(res.error)
    })
  }

  return (
    <Card className="mt-4">
      <h3 className="text-sm font-bold">{copy.heading}</h3>
      <p className="mt-1 text-sm text-ink-500">{copy.hint(LANGUAGE_FORM_PICK.min, LANGUAGE_FORM_PICK.max)}</p>
      <ul className="mt-3 space-y-3">
        {candidates.map((f, i) => (
          <li key={f.name} className="flex items-start gap-2 text-sm">
            <input type="checkbox" id={`language-form-${i}`} checked={picked.includes(f.name)} disabled={disabled} onChange={() => toggle(f.name)} className="mt-1" />
            <label htmlFor={`language-form-${i}`} className="block">
              <span className="font-semibold">{f.name}</span>
              <span className="mt-0.5 block text-ink-700">{copy.formLabel}: {f.form}</span>
              <span className="mt-0.5 block text-ink-700">{copy.exampleLabel}: {f.example}</span>
              <span className="mt-0.5 block text-ink-500">{copy.useLabel}: {f.use}</span>
              {f.basis && <span className="mt-0.5 block text-xs text-ink-500">{copy.basisLabel}: {f.basis}</span>}
            </label>
          </li>
        ))}
      </ul>
      {!countOk && <p className="mt-2 text-sm text-ink-500">{copy.countHint(LANGUAGE_FORM_PICK.min, LANGUAGE_FORM_PICK.max)}</p>}
      {hasLater && <p className="mt-2 text-sm text-ink-500">{copy.laterNotice}</p>}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      {saved && <p className="mt-2 text-sm text-mint-700">{copy.saved}</p>}
      <div className="mt-3">
        <Button variant="ghost" disabled={pending || disabled || !countOk} onClick={submit}>{copy.select}</Button>
      </div>
    </Card>
  )
}
