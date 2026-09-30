'use client'
import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { importInquiryTask, saveInquiryTask, setInquiryTaskStatus } from './actions'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { STUDIO_SUBJECTS } from '@/lib/studio/subjects'
import { INQUIRY_LEVELS, QUESTION_KEYS, SOURCE_KINDS, type InquiryExcerpt, type InquirySource, type InquiryTask, type QuestionKey, type SourceKind } from '@/lib/inquiry/schema'
import { publishGate, gateMessages } from '@/lib/inquiry/publish-gate'
import { kstDateTime } from '@/lib/inquiry/time'
import { app } from '@/content/site'

const copy = app.inquiry.admin.page
const inquiry = app.inquiry

/** 칸 길잡이 덮어쓰기 열쇠(학생 쓰기 칸 순서). */
const GUIDE_KEYS = ['career', 'motive', 'questions', 'background', 'method', 'result_가', 'result_나', 'result_다', 'conclusion', 'reflection', 'references'] as const
const guideTitle = (k: (typeof GUIDE_KEYS)[number]) =>
  k.startsWith('result_') ? inquiry.section.result.title(k.slice('result_'.length)) : inquiry.section[k as Exclude<typeof k, `result_${string}`>].title

const input = 'w-full rounded-xl border border-ink-300 px-3 py-2 text-sm'
const label = 'grid gap-1 text-sm font-semibold'
const card = 'rounded-2xl bg-white p-6 shadow-[0_2px_20px_rgba(31,36,48,0.06)]'

function newSource(existing: InquirySource[], kind: SourceKind): InquirySource {
  let n = existing.length + 1
  const taken = new Set(existing.map((s) => s.id))
  while (taken.has(`${kind[0]}${n}`)) n += 1
  return { id: `${kind[0]}${n}`, kind, title: '', authors: '', year: '', date: '', container: '', detail: '', url: '', note: '', easy_summary: '', excerpts: [], for_questions: [], verified: null }
}

type Props = { taskId: string; initial: InquiryTask; status: 'draft' | 'published'; publishedAt: string | null; themes: { id: string; title: string }[] }

/**
 * 과제 편집(본사). 위에서 아래로: 저장·게시 줄 → 기본 정보 → 탐구 문제 → 자료(자료마다 세로 카드) → 지도 팁 → 칸 길잡이 덮어쓰기(접힘) → JSON 불러오기(접힘).
 * 아무것도 막지 않는다 — 게시 관문만 자료 진위(확인함 수)를 본다(설계 §4). [게시]는 저장을 먼저 하고 게시한다(한 번 누르면 진행).
 */
export function TaskEditor({ taskId, initial, status, publishedAt, themes }: Props) {
  const router = useRouter()
  const [task, setTask] = useState<InquiryTask>(initial)
  const [dirty, setDirty] = useState(false)
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const [missing, setMissing] = useState<string[]>([])
  const [json, setJson] = useState('')
  const [pending, start] = useTransition()
  const gate = useMemo(() => publishGate(task), [task])
  const gateLines = useMemo(() => gateMessages(gate.missing, inquiry.gate), [gate])

  const patch = (p: Partial<InquiryTask>) => { setTask((t) => ({ ...t, ...p })); setDirty(true) }
  const patchQuestion = (key: QuestionKey, p: Partial<InquiryTask['questions'][number]>) =>
    patch({ questions: task.questions.map((q) => (q.key === key ? { ...q, ...p } : q)) })
  const patchSource = (id: string, p: Partial<InquirySource>) => patch({ sources: task.sources.map((s) => (s.id === id ? { ...s, ...p } : s)) })
  const removeSource = (id: string) => patch({ sources: task.sources.filter((s) => s.id !== id) })
  const patchExcerpt = (id: string, i: number, p: Partial<InquiryExcerpt>) => {
    const src = task.sources.find((s) => s.id === id); if (!src) return
    patchSource(id, { excerpts: src.excerpts.map((e, k) => (k === i ? { ...e, ...p } : e)) })
  }

  async function doSave(): Promise<boolean> {
    const r = await saveInquiryTask(taskId, task)
    if (!r.ok) { setMessage({ tone: 'error', text: r.error }); return false }
    if (r.task) setTask(r.task)
    setDirty(false)
    return true
  }
  function onSave() {
    setMessage(null); setMissing([])
    start(async () => { if (await doSave()) { setMessage({ tone: 'ok', text: copy.saved }); router.refresh() } })
  }
  function onPublish(next: 'published' | 'draft') {
    setMessage(null); setMissing([])
    start(async () => {
      if (next === 'published' && !(await doSave())) return
      const r = await setInquiryTaskStatus(taskId, next)
      if (!r.ok) { setMessage({ tone: 'error', text: r.error }); setMissing(r.missing ?? []); return }
      setMessage({ tone: 'ok', text: next === 'published' ? copy.published : copy.unpublished })
      router.refresh()
    })
  }
  function onImport() {
    setMessage(null); setMissing([])
    start(async () => {
      const r = await importInquiryTask(taskId, json)
      if (!r.ok) { setMessage({ tone: 'error', text: r.error }); return }
      if (r.task) setTask(r.task)
      setDirty(false); setJson('')
      setMessage({ tone: 'ok', text: copy.imported }); router.refresh()
    })
  }

  return (
    <div className="mt-4 space-y-6">
      {/* 저장·게시 줄 */}
      <section className={card}>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={status === 'published' ? 'mint' : 'lemon'}>{inquiry.admin.status[status]}</Badge>
          {status === 'published' && publishedAt && <span className="text-sm text-ink-500">{copy.publishedAt(kstDateTime(publishedAt))}</span>}
          {dirty && <span className="text-sm text-lemon-600">{copy.unsaved}</span>}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="button" onClick={onSave} disabled={pending}>{pending ? copy.saving : copy.save}</Button>
          {status === 'published'
            ? <Button type="button" variant="ghost" onClick={() => onPublish('draft')} disabled={pending}>{copy.unpublish}</Button>
            : <Button type="button" variant="accent" onClick={() => onPublish('published')} disabled={pending}>{copy.publish}</Button>}
        </div>
        {message && <p className={`mt-3 text-sm ${message.tone === 'ok' ? 'text-mint-700' : 'text-red-600'}`}>{message.text}</p>}
        {(missing.length > 0 || (!gate.ok && status !== 'published')) && (
          <div className="mt-3 rounded-xl bg-lemon-50 p-3 text-sm text-ink-700">
            <p className="font-semibold">{inquiry.gate.heading}</p>
            <ul className="mt-1 space-y-0.5">{(missing.length > 0 ? missing : gateLines).map((m) => <li key={m}>{m}</li>)}</ul>
          </div>
        )}
        {gate.ok && missing.length === 0 && <p className="mt-3 text-sm text-mint-700">{copy.gateOk}</p>}
      </section>

      {/* 기본 정보 */}
      <section className={card}>
        <h2 className="text-lg font-bold">{copy.basicHeading}</h2>
        <div className="mt-3 grid gap-3">
          <label className={label}>{copy.titleLabel}<input className={input} value={task.title} onChange={(e) => patch({ title: e.target.value })} /></label>
          <label className={label}>{copy.subtitleLabel}<input className={input} value={task.subtitle} onChange={(e) => patch({ subtitle: e.target.value })} /></label>
          <fieldset>
            <legend className="text-sm font-semibold">{copy.levelLabel}</legend>
            <div className="mt-1 flex gap-4 text-sm">
              {INQUIRY_LEVELS.map((lv) => (
                <label key={lv} className="flex items-center gap-1"><input type="radio" name="level" checked={task.level === lv} onChange={() => patch({ level: lv })} />{inquiry.level[lv]}</label>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="text-sm font-semibold">{copy.subjectsLabel}</legend>
            <div className="mt-1 flex flex-wrap gap-4 text-sm">
              {STUDIO_SUBJECTS.map((sub) => (
                <label key={sub} className="flex items-center gap-1">
                  <input type="checkbox" checked={task.subjects.includes(sub)} onChange={(e) => patch({ subjects: e.target.checked ? [...task.subjects, sub] : task.subjects.filter((x) => x !== sub) })} />{sub}
                </label>
              ))}
            </div>
          </fieldset>
          <label className={label}>{copy.themeLabel}
            <select className={input} value={task.theme_id ?? ''} onChange={(e) => patch({ theme_id: e.target.value || null })}>
              <option value="">{copy.themeNone}</option>
              {themes.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
            </select>
          </label>
        </div>
      </section>

      {/* 탐구 문제 */}
      <section className={card}>
        <h2 className="text-lg font-bold">{copy.questionsHeading}</h2>
        <p className="mt-1 text-sm text-ink-500">{copy.questionsHelp}</p>
        <div className="mt-3 space-y-4">
          {task.questions.map((q) => (
            <div key={q.key} className="rounded-xl border border-ink-100 p-4">
              <p className="text-base font-bold">{inquiry.questionLabel(q.key)}</p>
              <label className={`${label} mt-2`}>{copy.questionText}<input className={input} value={q.text} onChange={(e) => patchQuestion(q.key, { text: e.target.value })} /></label>
              <label className={`${label} mt-2`}>{copy.questionLens}<input className={input} value={q.lens} onChange={(e) => patchQuestion(q.key, { lens: e.target.value })} /></label>
            </div>
          ))}
        </div>
      </section>

      {/* 자료 */}
      <section className={card}>
        <h2 className="text-lg font-bold">{copy.sourcesHeading}</h2>
        <p className="mt-1 text-sm text-ink-500">{copy.sourcesHelp}</p>
        <div className="mt-3 space-y-5">
          {task.sources.map((s) => (
            <div key={s.id} data-inquiry-source={s.id} className={`rounded-xl border p-4 ${s.verified ? 'border-mint-300 bg-mint-50/40' : 'border-ink-100'}`}>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="lavender">{inquiry.kind[s.kind]}</Badge>
                <span className="text-base font-bold">{s.title.trim() || inquiry.admin.untitled}</span>
                {s.verified && <Badge tone="mint">{copy.verifiedBy(s.verified.by, kstDateTime(s.verified.at) || s.verified.at)}</Badge>}
              </div>
              <div className="mt-3 grid gap-2">
                <label className={label}>{copy.sourceKind}
                  <select className={input} value={s.kind} onChange={(e) => patchSource(s.id, { kind: e.target.value as SourceKind })}>
                    {SOURCE_KINDS.map((k) => <option key={k} value={k}>{inquiry.kind[k]}</option>)}
                  </select>
                </label>
                <label className={label}>{copy.sourceFields.title}<input className={input} value={s.title} onChange={(e) => patchSource(s.id, { title: e.target.value })} /></label>
                <label className={label}>{copy.sourceFields.authors}<input className={input} value={s.authors} onChange={(e) => patchSource(s.id, { authors: e.target.value })} /></label>
                <label className={label}>{copy.sourceFields.year}<input className={input} value={s.year} onChange={(e) => patchSource(s.id, { year: e.target.value })} /></label>
                {s.kind === 'news' && <label className={label}>{copy.sourceFields.date}<input className={input} value={s.date} onChange={(e) => patchSource(s.id, { date: e.target.value })} /></label>}
                <label className={label}>{copy.sourceFields.container}<input className={input} value={s.container} onChange={(e) => patchSource(s.id, { container: e.target.value })} /></label>
                {s.kind !== 'news' && <label className={label}>{copy.sourceFields.detail}<input className={input} value={s.detail} onChange={(e) => patchSource(s.id, { detail: e.target.value })} /></label>}
                <label className={label}>{copy.sourceFields.url}<input className={input} value={s.url} onChange={(e) => patchSource(s.id, { url: e.target.value })} /></label>
                {/^https?:\/\//i.test(s.url) && <a href={s.url} target="_blank" rel="noreferrer" className="text-sm font-semibold text-mint-700 underline">{copy.openUrl}</a>}
                <label className={label}>{copy.sourceFields.note}<input className={input} value={s.note} onChange={(e) => patchSource(s.id, { note: e.target.value })} /></label>
                <label className={label}>{copy.sourceFields.easySummary}<textarea className={input} rows={3} value={s.easy_summary} onChange={(e) => patchSource(s.id, { easy_summary: e.target.value })} /></label>
              </div>

              <div className="mt-3">
                <p className="text-sm font-semibold">{copy.excerptsHeading}</p>
                <ul className="mt-1 space-y-2">
                  {s.excerpts.map((e, i) => (
                    <li key={i} className="grid gap-1 rounded-lg bg-ink-100/50 p-2">
                      <label className={label}>{copy.excerptText}<textarea className={input} rows={2} value={e.text} onChange={(ev) => patchExcerpt(s.id, i, { text: ev.target.value })} /></label>
                      <label className={label}>{copy.excerptLocator}<input className={input} value={e.locator} onChange={(ev) => patchExcerpt(s.id, i, { locator: ev.target.value })} /></label>
                      <div><Button type="button" variant="ghost" onClick={() => patchSource(s.id, { excerpts: s.excerpts.filter((_, k) => k !== i) })}>{copy.removeExcerpt}</Button></div>
                    </li>
                  ))}
                </ul>
                <div className="mt-1"><Button type="button" variant="ghost" onClick={() => patchSource(s.id, { excerpts: [...s.excerpts, { text: '', locator: '' }] })}>{copy.addExcerpt}</Button></div>
              </div>

              <fieldset className="mt-3">
                <legend className="text-sm font-semibold">{copy.forQuestions}</legend>
                <div className="mt-1 flex flex-wrap gap-4 text-sm">
                  {QUESTION_KEYS.map((k) => (
                    <label key={k} className="flex items-center gap-1">
                      <input type="checkbox" checked={s.for_questions.includes(k)} onChange={(e) => patchSource(s.id, { for_questions: e.target.checked ? QUESTION_KEYS.filter((x) => x === k || s.for_questions.includes(x)) : s.for_questions.filter((x) => x !== k) })} />
                      {inquiry.questionLabel(k)}
                    </label>
                  ))}
                </div>
              </fieldset>

              <label className="mt-3 flex items-start gap-2 rounded-lg bg-lemon-50 p-3 text-sm font-semibold">
                <input type="checkbox" className="mt-1" checked={s.verified !== null} onChange={(e) => patchSource(s.id, { verified: e.target.checked ? { by: '', at: '' } : null })} />
                <span>{copy.verified}</span>
              </label>
              <div className="mt-2"><Button type="button" variant="ghost" onClick={() => removeSource(s.id)}>{copy.removeSource}</Button></div>
            </div>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {SOURCE_KINDS.map((k) => (
            <Button key={k} type="button" variant="ghost" onClick={() => patch({ sources: [...task.sources, newSource(task.sources, k)] })}>{copy.addSource} · {inquiry.kind[k]}</Button>
          ))}
        </div>
      </section>

      {/* 지도 팁 */}
      <section className={card}>
        <h2 className="text-lg font-bold">{copy.tipsHeading}</h2>
        <p className="mt-1 text-sm text-ink-500">{copy.tipsHelp}</p>
        <textarea className={`${input} mt-3`} rows={6} value={task.teacher_tips.join('\n')} onChange={(e) => patch({ teacher_tips: e.target.value.split('\n') })} onBlur={() => patch({ teacher_tips: task.teacher_tips.map((t) => t.trim()).filter(Boolean) })} />
      </section>

      {/* 칸 길잡이 덮어쓰기(접힘) */}
      <details className={card}>
        <summary className="cursor-pointer text-lg font-bold">{copy.guidesHeading}</summary>
        <p className="mt-1 text-sm text-ink-500">{copy.guidesHelp}</p>
        <div className="mt-3 space-y-3">
          {GUIDE_KEYS.map((k) => {
            const g = task.section_guides[k] ?? { question: '', length: '' }
            const set = (p: Partial<typeof g>) => patch({ section_guides: { ...task.section_guides, [k]: { ...g, ...p } } })
            return (
              <div key={k} className="rounded-xl border border-ink-100 p-3">
                <p className="text-sm font-bold">{guideTitle(k)}</p>
                <label className={`${label} mt-1`}>{copy.guideQuestion}<input className={input} value={g.question} onChange={(e) => set({ question: e.target.value })} /></label>
                <label className={`${label} mt-1`}>{copy.guideLength}<input className={input} value={g.length} onChange={(e) => set({ length: e.target.value })} /></label>
              </div>
            )
          })}
        </div>
      </details>

      {/* JSON 불러오기(접힘) */}
      <details className={card}>
        <summary className="cursor-pointer text-lg font-bold">{copy.importHeading}</summary>
        <p className="mt-1 text-sm text-ink-500">{copy.importHelp}</p>
        <textarea className={`${input} mt-3 font-mono text-xs`} rows={10} value={json} onChange={(e) => setJson(e.target.value)} />
        <div className="mt-2"><Button type="button" onClick={onImport} disabled={pending || !json.trim()}>{pending ? copy.importing : copy.importButton}</Button></div>
      </details>
    </div>
  )
}
