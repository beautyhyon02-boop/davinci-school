'use client'
import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { saveInquiryPatch, submitInquiry } from './actions'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { InquiryReportView } from '@/components/inquiry/InquiryReportView'
import { SECTION_MAX_CHARS, QUESTION_MAX_CHARS, CAREER_MAX_CHARS, effectiveQuestions, type InquiryReport, type InquirySource, type InquiryTask, type Outline, type QuestionKey, type ReportQuestion, type TextSectionKey } from '@/lib/inquiry/schema'
import { writingBoxes, guideFor, progressOf, type WritingBox } from '@/lib/inquiry/outline'
import { referenceLines } from '@/lib/inquiry/references'
import type { ReportPatch } from '@/lib/inquiry/save'
import { kstHm } from '@/lib/inquiry/time'
import { app } from '@/content/site'

const copy = app.inquiry.student.page
const inquiry = app.inquiry
const DEBOUNCE_MS = 1500

export type WriterTask = Pick<InquiryTask, 'title' | 'subtitle' | 'subjects' | 'questions' | 'section_guides'>
type Props = {
  assignmentId: string; task: WriterTask; outline: Outline; sources: InquirySource[]; initial: InquiryReport
  status: 'assigned' | 'submitted' | 'reopened'; studentName: string; academyName: string
}
type BoxStatus = { kind: 'saving' } | { kind: 'saved'; at: string } | { kind: 'failed'; text: string }

const boxId = (b: WritingBox) => (b.kind === 'text' ? b.key : b.kind)

/** 칸 머리: 제목(굵게) → 길잡이 질문 → 권장 분량(각각 한 줄). */
function BoxGuide({ box, task, outline }: { box: WritingBox; task: WriterTask; outline: Outline }) {
  const g = guideFor(box, task, outline, inquiry)
  return (
    <>
      <h2 className="text-xl font-bold">{g.title}</h2>
      <p className="mt-1 text-base text-ink-700"><span className="text-sm font-semibold text-mint-700">{copy.guideLabel}</span> {g.guide}</p>
      {g.length && <p className="text-sm text-ink-500"><span className="font-semibold">{copy.lengthLabel}</span> {g.length}</p>}
    </>
  )
}

/**
 * 학생 쓰기 화면(설계 §6): 목차 순서대로 세로로 쌓인 칸. 칸마다 제목(굵게) → 길잡이 질문 → 권장 분량 → 입력칸 → 글자 수·「저장됨 hh:mm」.
 * 자동 저장: 키를 멈추고 1.5초 뒤(또는 칸을 벗어날 때) 조각 하나를 보낸다. 저장은 한 줄로 차례로 보낸다(칸끼리 서로 덮어쓰지 않게).
 * [제출] 뒤에는 읽기 전용 — 보고서 모양(InquiryReportView)과 안내 한 줄.
 */
export function InquiryWriter({ assignmentId, task, outline, sources, initial, status, studentName, academyName }: Props) {
  const router = useRouter()
  const [sections, setSections] = useState<Partial<Record<TextSectionKey, string>>>(initial.sections)
  const [questions, setQuestions] = useState<ReportQuestion[]>(effectiveQuestions(task, initial))
  const [usedIds, setUsedIds] = useState<string[]>(initial.used_source_ids)
  const [career, setCareer] = useState(initial.career_field)
  const [boxStatus, setBoxStatus] = useState<Record<string, BoxStatus>>({})
  const [submitted, setSubmitted] = useState(status === 'submitted')
  const [note, setNote] = useState<string | null>(null)
  const [pending, start] = useTransition()

  // 저장 줄: 앞 저장이 끝난 뒤에 다음 저장을 보낸다. 타이머는 칸마다 하나.
  const queue = useRef<Promise<unknown>>(Promise.resolve())
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const latest = useRef<Map<string, ReportPatch>>(new Map())

  const flush = useCallback((id: string) => {
    const t = timers.current.get(id)
    if (t) { clearTimeout(t); timers.current.delete(id) }
    const patch = latest.current.get(id)
    if (!patch) return
    latest.current.delete(id)
    setBoxStatus((s) => ({ ...s, [id]: { kind: 'saving' } }))
    queue.current = queue.current.then(async () => {
      const r = await saveInquiryPatch(assignmentId, patch)
      setBoxStatus((s) => ({ ...s, [id]: r.ok ? { kind: 'saved', at: kstHm(r.updatedAt) } : { kind: 'failed', text: r.error } }))
    })
  }, [assignmentId])

  const schedule = useCallback((id: string, patch: ReportPatch) => {
    latest.current.set(id, patch)
    const prev = timers.current.get(id)
    if (prev) clearTimeout(prev)
    timers.current.set(id, setTimeout(() => flush(id), DEBOUNCE_MS))
  }, [flush])

  // 화면을 떠날 때 남은 저장을 보낸다
  useEffect(() => {
    const timerMap = timers.current
    return () => { for (const id of [...timerMap.keys()]) flush(id) }
  }, [flush])

  const flushAll = useCallback(async () => {
    for (const id of [...timers.current.keys()]) flush(id)
    await queue.current
  }, [flush])

  function onSection(key: TextSectionKey, value: string) {
    const text = value.slice(0, SECTION_MAX_CHARS)
    setSections((s) => ({ ...s, [key]: text }))
    schedule(key, { kind: 'section', key, text })
  }
  function onQuestion(key: QuestionKey, value: string) {
    const next = questions.map((q) => (q.key === key ? { key, text: value.slice(0, QUESTION_MAX_CHARS) } : q))
    setQuestions(next)
    schedule('questions', { kind: 'questions', questions: next })
  }
  function onUsed(id: string, on: boolean) {
    const next = on ? [...new Set([...usedIds, id])] : usedIds.filter((x) => x !== id)
    setUsedIds(next)
    schedule('references', { kind: 'sources', ids: next })
  }
  function onCareer(value: string) {
    const text = value.slice(0, CAREER_MAX_CHARS)
    setCareer(text)
    schedule('career', { kind: 'career', text })
  }
  function onSubmit() {
    if (!window.confirm(copy.submitConfirm)) return
    setNote(null)
    start(async () => {
      await flushAll()
      const r = await submitInquiry(assignmentId)
      if (!r.ok) { setNote(r.error); return }
      setSubmitted(true); setNote(copy.submitted); router.refresh()
    })
  }

  const report = { sections, questions, used_source_ids: usedIds, career_field: career }
  if (submitted) {
    return (
      <>
        <p className="no-print mt-3 rounded-xl bg-mint-50 p-3 text-base">{note ?? copy.submittedNote}</p>
        <h2 className="no-print mt-6 text-xl font-bold">{copy.myReport}</h2>
        <div className="mt-3">
          <InquiryReportView task={task} outline={outline} report={report} sources={sources} studentName={studentName} academyName={academyName} />
        </div>
      </>
    )
  }

  const boxes = writingBoxes(outline)
  const progress = progressOf(outline, report)
  const empty = progress.total - progress.filled
  const statusLine = (id: string) => {
    const s = boxStatus[id]
    if (!s) return null
    return <span className={s.kind === 'failed' ? 'text-red-600' : 'text-ink-500'}>{s.kind === 'saving' ? copy.saving : s.kind === 'saved' ? copy.saved(s.at) : s.text}</span>
  }

  return (
    <div className="mt-4 space-y-6">
      {status === 'reopened' && <p className="rounded-xl bg-lemon-50 p-3 text-base">{copy.reopenedNote}</p>}
      {boxes.map((box) => {
        const id = boxId(box)
        if (box.kind === 'career') {
          return (
            <section key={id} data-inquiry-box={id} className="rounded-2xl bg-white p-5">
              <BoxGuide box={box} task={task} outline={outline} />
              <input value={career} onChange={(e) => onCareer(e.target.value)} onBlur={() => flush(id)} placeholder={copy.placeholder}
                className="mt-3 w-full rounded-xl border border-ink-300 p-3 text-lg" />
              <div className="mt-2 flex items-center justify-between text-sm text-ink-500"><span>{copy.chars(career.length)}</span>{statusLine(id)}</div>
            </section>
          )
        }
        if (box.kind === 'questions') {
          return (
            <section key={id} data-inquiry-box={id} className="rounded-2xl bg-white p-5">
              <BoxGuide box={box} task={task} outline={outline} />
              <ul className="mt-3 space-y-3">
                {questions.map((q) => (
                  <li key={q.key}>
                    <p className="text-base font-bold">{inquiry.questionLabel(q.key)}</p>
                    <input value={q.text} onChange={(e) => onQuestion(q.key, e.target.value)} onBlur={() => flush(id)} placeholder={copy.questionPlaceholder(q.key)}
                      className="mt-1 w-full rounded-xl border border-ink-300 p-3 text-lg" />
                  </li>
                ))}
              </ul>
              <div className="mt-2 flex justify-end text-sm text-ink-500">{statusLine(id)}</div>
            </section>
          )
        }
        if (box.kind === 'references') {
          const lines = referenceLines(sources, usedIds)
          return (
            <section key={id} data-inquiry-box={id} className="rounded-2xl bg-white p-5">
              <BoxGuide box={box} task={task} outline={outline} />
              <p className="mt-2 text-sm text-ink-500">{copy.referencesHelp}</p>
              <ul className="mt-3 space-y-2">
                {sources.map((s) => (
                  <li key={s.id} className="flex items-start gap-2 text-base">
                    <input type="checkbox" className="mt-1.5" checked={usedIds.includes(s.id)} onChange={(e) => onUsed(s.id, e.target.checked)} />
                    <span><Badge tone="lavender">{inquiry.kind[s.kind]}</Badge> <span className="font-semibold">{s.title}</span> <span className="text-sm text-ink-500">— {copy.readIt}</span></span>
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-sm font-semibold text-mint-700">{copy.referencesPreview}</p>
              {lines.length === 0 ? <p className="mt-1 text-sm text-ink-500">{copy.referencesNone}</p>
                : <ol className="mt-1 space-y-1 text-sm leading-relaxed text-ink-700">{lines.map((l, i) => <li key={i} className="break-words">{l}</li>)}</ol>}
              <div className="mt-2 flex justify-end text-sm text-ink-500">{statusLine(id)}</div>
            </section>
          )
        }
        // 글 칸
        const text = sections[box.key] ?? ''
        const q = box.question; const forQ = q ? sources.filter((s) => s.for_questions.includes(q)) : []
        return (
          <section key={id} data-inquiry-box={id} className="rounded-2xl bg-white p-5">
            <BoxGuide box={box} task={task} outline={outline} />
            {box.question && (
              <div className="mt-3 rounded-xl bg-mint-50 p-3">
                <p className="text-xs font-semibold text-mint-700">{copy.resultQuestion}</p>
                <p className="text-lg font-semibold">{questions.find((q) => q.key === box.question)?.text}</p>
              </div>
            )}
            <textarea value={text} onChange={(e) => onSection(box.key, e.target.value)} onBlur={() => flush(id)} placeholder={copy.placeholder} rows={box.question ? 10 : 7}
              className="mt-3 w-full rounded-xl border border-ink-300 p-4 text-lg leading-relaxed" />
            <div className="mt-2 flex items-center justify-between text-sm text-ink-500"><span>{copy.maxChars(text.length, SECTION_MAX_CHARS)}</span>{statusLine(id)}</div>
            {forQ.length > 0 && (
              <div className="mt-4 border-t border-ink-100 pt-3">
                <p className="text-sm font-bold text-mint-700">{copy.sourcesFor}</p>
                <ul className="mt-2 space-y-4">
                  {forQ.map((s) => (
                    <li key={s.id} data-inquiry-source={s.id} className="rounded-xl bg-lavender-50 p-3">
                      <p className="flex flex-wrap items-center gap-2"><Badge tone="lavender">{inquiry.kind[s.kind]}</Badge><span className="text-base font-bold">{s.title}</span></p>
                      {s.easy_summary && <p className="mt-1 text-base leading-relaxed text-ink-700"><span className="text-sm font-semibold text-lavender-700">{copy.sourceSummary}</span> {s.easy_summary}</p>}
                      {s.excerpts.length > 0 && (
                        <div className="mt-2">
                          <p className="text-sm font-semibold text-lavender-700">{copy.sourceExcerpts}</p>
                          <ul className="mt-1 space-y-1.5 border-l-2 border-lavender-200 pl-3 text-base leading-relaxed text-ink-700">
                            {s.excerpts.map((e, i) => <li key={i}>{e.text}{e.locator && <span className="block text-sm text-ink-500">{copy.sourceLocator(e.locator)}</span>}</li>)}
                          </ul>
                        </div>
                      )}
                      {s.url && <a href={s.url} target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm font-semibold text-mint-700 underline">{copy.openSource}</a>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )
      })}

      <section className="rounded-2xl bg-white p-5">
        {empty > 0 && <p className="mb-3 text-sm text-ink-500">{copy.emptyBoxes(empty)}</p>}
        <Button type="button" onClick={onSubmit} disabled={pending}>{pending ? copy.submitting : copy.submit}</Button>
        {note && <p className="mt-2 text-sm text-red-600">{note}</p>}
      </section>
    </div>
  )
}
