'use client'
import { OUTLINE_METHODS, type Outline } from '@/lib/inquiry/schema'
import { buildOutline } from '@/lib/inquiry/outline'
import { app } from '@/content/site'

const copy = app.inquiry.teacher.page
const inquiry = app.inquiry

/** 목차 고르기(탐구 방법 드롭다운 + 희망 진로 체크) + 학생이 보게 될 차례 미리보기. 훅 없음 — 배정 폼과 목차 폼이 같이 쓴다. */
export function OutlineFields({ outline, onChange }: { outline: Outline; onChange: (o: Outline) => void }) {
  const chapters = buildOutline(outline)
  return (
    <div className="grid gap-3">
      <label className="grid gap-1 text-sm font-semibold">{copy.methodLabel}
        <select className="rounded-xl border border-ink-300 px-3 py-2 font-normal" value={outline.method} onChange={(e) => onChange({ ...outline, method: e.target.value as Outline['method'] })}>
          {OUTLINE_METHODS.map((m) => <option key={m} value={m}>{inquiry.method[m]}</option>)}
        </select>
      </label>
      <label className="flex items-center gap-2 text-sm font-semibold">
        <input type="checkbox" checked={outline.career} onChange={(e) => onChange({ ...outline, career: e.target.checked })} />{copy.careerLabel}
      </label>
      <div className="rounded-xl bg-ink-100/50 p-3">
        <p className="text-xs font-semibold text-ink-500">{copy.outlinePreview}</p>
        <ol className="mt-1 space-y-0.5 text-sm">
          {chapters.map((ch) => <li key={ch.key}>{inquiry.view.chapterNo(ch.roman, inquiry.chapter[ch.key])}</li>)}
        </ol>
      </div>
    </div>
  )
}
