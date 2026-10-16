'use client'
import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { app } from '@/content/site'
import type { RedUploadOutcome } from '@/lib/red/upload-rules'

const copy = app.adminRed

/** docx 여러 개를 골라 /api/red/upload 로 보낸다. 결과는 파일마다 한 줄(올림/이미 있음/실패 — 까닭). */
export function RedUploadForm() {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [date, setDate] = useState('')
  const [busy, setBusy] = useState(false)
  const [lines, setLines] = useState<string[]>([])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const files = fileRef.current?.files
    if (!files || files.length === 0) return
    setBusy(true); setLines([])
    const out: string[] = []
    // 거절 사유에 실제로 받은 file.type 을 붙인다(본사 2026-10-16) — 어떤 형식으로 들어왔는지 보고 판단할 수 있게
    const why = (error?: string, detail?: string) => (copy.errors[error ?? ''] ?? error ?? '') + (detail !== undefined ? ` ${copy.typeDetail(detail)}` : '')
    const line = (o: RedUploadOutcome) => o.status === 'uploaded' ? copy.result.uploaded(o.name) : o.status === 'duplicate' ? copy.result.duplicate(o.name) : copy.result.failed(o.name, why(o.error, o.detail))
    try {
      // 파일마다 한 요청 — Vercel 은 본문 4.5MB 를 넘는 요청을 JSON 없이 413 으로 끊는다(독립 검토 2026-10-15). 응답이 JSON 이 아니어도 줄 하나로 보인다.
      for (const f of Array.from(files)) {
        const fd = new FormData()
        fd.append('files', f)
        if (date) fd.set('date', date)
        try {
          const res = await fetch('/api/red/upload', { method: 'POST', body: fd })
          const body = (await res.json().catch(() => ({}))) as { outcomes?: RedUploadOutcome[]; error?: string }
          if (!res.ok || !body.outcomes) out.push(copy.result.failed(f.name, copy.errors[body.error ?? ''] ?? copy.errors.upload_failed))
          else out.push(...body.outcomes.map(line))
        } catch {
          out.push(copy.result.failed(f.name, copy.errors.upload_failed))
        }
        setLines([...out])
      }
      if (fileRef.current) fileRef.current.value = ''
      router.refresh()
    } finally { setBusy(false) }
  }

  return (
    <form onSubmit={submit} className="rounded-2xl bg-white p-5">
      <p className="text-sm text-ink-700">{copy.intro}</p>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="block font-semibold">{copy.pick}</span>
          <input ref={fileRef} type="file" name="files" accept=".docx" multiple className="mt-1 block text-sm" />
        </label>
        <label className="text-sm">
          <span className="block font-semibold">{copy.dateLabel}</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-1 rounded-lg border border-ink-100 px-2 py-1" />
        </label>
        <Button type="submit" disabled={busy}>{busy ? copy.uploading : copy.upload}</Button>
      </div>
      {lines.length > 0 && <ul className="mt-3 space-y-1 text-sm">{lines.map((l, i) => <li key={i} className={l.startsWith('실패') ? 'text-red-700' : 'text-ink-700'}>{l}</li>)}</ul>}
    </form>
  )
}
