'use client'
import { useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { app } from '@/content/site'
import { attachImage, detachImage } from './actions'

const copy = app.studio.attachments

type MaterialLite = { id: string; images?: string[] }
type LessonLite = { no: number; images?: string[] }

type TargetOption = { value: string; label: string; images: string[] }

function buildOptions(materials: MaterialLite[], lessons: LessonLite[]): TargetOption[] {
  const materialOptions = materials.map((m) => ({ value: `material:${m.id}`, label: copy.materialLabel(m.id), images: m.images ?? [] }))
  const lessonOptions = lessons.map((l) => ({ value: `lesson:${l.no}`, label: copy.lessonLabel(l.no), images: l.images ?? [] }))
  return [...materialOptions, ...lessonOptions]
}

/** 4단계(자료) 패널에 붙는 이미지 첨부 위젯. 업로드 API → attachImage 서버 액션 → router.refresh() 순서로 반영한다. */
export function Attachments({ setId, materials, lessons }: { setId: string; materials: MaterialLite[]; lessons: LessonLite[] }) {
  const router = useRouter()
  const options = useMemo(() => buildOptions(materials, lessons), [materials, lessons])
  const [target, setTarget] = useState(options[0]?.value ?? '')
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const current = options.find((o) => o.value === target) ?? options[0]

  if (options.length === 0) {
    return (
      <Card className="mt-4">
        <h3 className="text-sm font-bold">{copy.heading}</h3>
        <p className="mt-2 text-sm text-ink-500">{copy.noTargets}</p>
      </Card>
    )
  }

  async function upload() {
    setError(null)
    const file = fileInputRef.current?.files?.[0]
    if (!file || !current) return

    setUploading(true)
    try {
      const form = new FormData()
      form.set('file', file)
      form.set('setId', setId)
      form.set('target', current.value)
      const res = await fetch('/api/studio/upload', { method: 'POST', body: form })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || typeof data?.url !== 'string') {
        setError(mapUploadError(data?.error))
        return
      }
      const url = data.url as string
      startTransition(async () => {
        const r = await attachImage(setId, current.value, url)
        if (!r.ok) {
          setError(r.error)
          return
        }
        if (fileInputRef.current) fileInputRef.current.value = ''
        router.refresh()
      })
    } catch {
      setError(copy.errors.uploadFailed)
    } finally {
      setUploading(false)
    }
  }

  function remove(url: string) {
    setError(null)
    startTransition(async () => {
      const r = await detachImage(setId, target, url)
      if (!r.ok) {
        setError(r.error)
        return
      }
      router.refresh()
    })
  }

  const busy = uploading || pending

  return (
    <Card className="mt-4">
      <h3 className="text-sm font-bold">{copy.heading}</h3>
      <p className="mt-1 text-sm text-ink-500">{copy.description}</p>

      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="block text-ink-500">{copy.targetLabel}</span>
          <select
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            className="mt-1 rounded-lg border border-ink-300 px-3 py-2 text-sm"
          >
            {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
        <label className="text-sm">
          <span className="block text-ink-500">{copy.fileLabel}</span>
          <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp" className="mt-1 block text-sm" />
        </label>
        <Button variant="ghost" disabled={busy} onClick={upload}>{busy ? copy.uploading : copy.upload}</Button>
      </div>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      <div className="mt-4 flex flex-wrap gap-3">
        {current && current.images.length === 0 && <p className="text-sm text-ink-500">{copy.empty}</p>}
        {current?.images.map((url) => (
          <div key={url} className="w-32 rounded-xl border border-ink-100 p-2 text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt="" className="h-24 w-full rounded-lg object-cover" />
            <button
              type="button"
              disabled={pending}
              onClick={() => remove(url)}
              className="mt-2 text-xs font-semibold text-red-600 underline disabled:opacity-50"
            >
              {copy.delete}
            </button>
          </div>
        ))}
      </div>
    </Card>
  )
}

function mapUploadError(code: unknown): string {
  switch (code) {
    case 'file_too_large': return copy.errors.fileTooLarge
    case 'invalid_type': return copy.errors.invalidType
    case 'invalid_target': return copy.errors.invalidTarget
    default: return copy.errors.uploadFailed
  }
}
