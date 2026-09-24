'use client'
import { useState, useTransition } from 'react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { app } from '@/content/site'
import { canAccept as canAcceptStage, canGenerate as canGenerateStage, canReview as canReviewStage } from '@/lib/studio/next-action'
import type { StageStatus } from '@/lib/studio/stages'
import type { Issue } from '@/lib/studio/checks'
import { EXHAUSTED_ERROR } from '@/lib/studio/max-attempts'
import { cleanMaterialTitle } from '@/lib/studio/compat'
import { lessonAssessments } from '@/lib/studio/assessment-structure'
import { chooseKeyQuestion, saveStageEdit } from './actions'
import { WIZARD_STAGES, useStageRunner, type WizardStage } from './useStageRunner'
import { Attachments } from './Attachments'

const copy = app.studio.wizard

// 4단계 요약의 글 자료 본문 미리보기 길이 — 오너 지적(2026-09-26): 글 자료(F·H 등)는 제목만 보여서 미리보기를 열지 않으면
// 본문을 읽을 수 없었다. 표는 그대로 표 미리보기(위 5행)를 쓰고, 표가 없는 자료(text·chart·image)만 본문을 자른다.
const BODY_PREVIEW_LIMIT = 240
/** 본문을 BODY_PREVIEW_LIMIT 자로 자르고, 잘렸으면 "…"를 붙인다. */
function previewBody(body: string): string {
  return body.length > BODY_PREVIEW_LIMIT ? `${body.slice(0, BODY_PREVIEW_LIMIT)}…` : body
}

/** AI 출력 형식 검사 실패(lib/ai/claude.ts의 최종 에러 문구)인지 — 맞으면 안내 문구를 앞에 두고 원문은 작게 보여 준다. */
const isParseError = (message: string) => /^AI output could not be parsed after \d+ attempts/.test(message)

function StageErrorMessage({ message }: { message: string }) {
  if (isParseError(message)) {
    return (
      <div className="mt-3">
        <p className="text-sm text-red-600">{copy.parseErrorHeading}</p>
        <p className="mt-1 text-xs text-ink-400">{message}</p>
      </div>
    )
  }
  return <p className="mt-3 text-sm text-red-600">{copy.errorPrefix}{message}</p>
}

const STATE_TONE: Record<StageStatus['state'], 'gray' | 'lavender' | 'lemon' | 'mint'> = {
  idle: 'gray',
  generated: 'lavender',
  reviewed: 'lemon',
  accepted: 'mint',
  failed: 'gray',
}

// 요약 렌더용 느슨한 모양. v2 출력(learning_goals 객체·formative_check.quiz)을 읽되, v2 이전에 저장된 출력(문자열 목표·최상위 quiz)도 깨지지 않게 둘 다 받는다.
type Stage2Output = { reconstruction: string; learning_goals: (string | { text: string; axis: string })[]; key_question_candidates: string[] }
type Lesson = {
  no: number
  standards: string[]
  key_question: string
  formative_check?: { quiz: unknown[] }
  quiz?: unknown[]
  assessment: string[] | string | null   // v2 는 배열(단원 평가 차시 ['서술형', '논술형']), 옛 초안은 문자열·null
  mergeable_with: number | null
}
type Stage3Output = { lessons: Lesson[] }
type Material = { id: string; title: string; kind: 'table' | 'text' | 'chart' | 'image'; body: string | null; table: { columns: string[]; rows: (string | number)[][] } | null; images?: string[] }
type Stage4Output = { materials: Material[] }
type AssessmentItem = { kind: string; points: number; stem: string; exemplar_answers?: unknown[] }
type Stage5Output = {
  items: AssessmentItem[]
  grade_boundaries: { grade: number; min: number; max: number; band: string }[]
}
type Stage6Output = { glossary: { term: string; explanation: string }[]; per_lesson: { no: number; notes: string[] }[] }
type Stage7Output = { per_lesson?: { lesson_no: number; criteria_phrases: unknown[] | null }[] }

function StageOutput({ stage, output }: { stage: WizardStage; output: unknown }) {
  if (output === undefined || output === null) return <p className="mt-3 text-sm text-ink-500">{copy.empty}</p>

  if (stage === 2) {
    const o = output as Stage2Output
    return (
      <div className="mt-3 space-y-3">
        <div>
          <p className="text-sm font-semibold text-ink-500">{copy.stage2.reconstructionLabel}</p>
          <p className="mt-1 whitespace-pre-wrap text-sm">{o.reconstruction}</p>
        </div>
        <div>
          <p className="text-sm font-semibold text-ink-500">{copy.stage2.goalsLabel}</p>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
            {o.learning_goals?.map((g, i) => <li key={i}>{typeof g === 'string' ? g : copy.stage2.goal(g.text, g.axis)}</li>)}
          </ul>
        </div>
        <div>
          <p className="text-sm font-semibold text-ink-500">{copy.stage2.candidatesLabel}</p>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
            {o.key_question_candidates?.map((q, i) => <li key={i}>{q}</li>)}
          </ul>
        </div>
      </div>
    )
  }

  if (stage === 3) {
    const o = output as Stage3Output
    const c = copy.stage3.columns
    return (
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead>
            <tr className="border-b border-ink-100 text-ink-500">
              <th className="py-1 pr-3">{c.no}</th>
              <th className="py-1 pr-3">{c.standards}</th>
              <th className="py-1 pr-3">{c.keyQuestion}</th>
              <th className="py-1 pr-3">{c.quizCount}</th>
              <th className="py-1 pr-3">{c.assessment}</th>
              <th className="py-1 pr-3">{c.mergeable}</th>
            </tr>
          </thead>
          <tbody>
            {o.lessons?.map((l) => (
              <tr key={l.no} className="border-b border-ink-50">
                <td className="py-1 pr-3">{l.no}</td>
                <td className="py-1 pr-3">{l.standards?.join(', ')}</td>
                <td className="py-1 pr-3">{l.key_question}</td>
                <td className="py-1 pr-3">{(l.formative_check?.quiz ?? l.quiz)?.length ?? 0}</td>
                <td className="py-1 pr-3">{lessonAssessments(l).join(' + ') || copy.stage3.noAssessment}</td>
                <td className="py-1 pr-3">{l.mergeable_with ?? copy.stage3.noAssessment}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  if (stage === 4) {
    const o = output as Stage4Output
    return (
      <div className="mt-3 space-y-3">
        {o.materials?.map((m) => (
          <div key={m.id} className="rounded-xl border border-ink-100 p-3">
            <p className="text-sm font-semibold">
              {copy.stage4.idLabel} {m.id} · {cleanMaterialTitle(m.title)} · {copy.stage4.kindLabel}: {m.kind}
              {(m.images?.length ?? 0) > 0 && <> · {copy.stage4.imagesCount(m.images!.length)}</>}
            </p>
            {/* 표 자료는 표 미리보기, 그 밖의 자료(글·차트·이미지)는 본문을 미리 보여 준다(오너 지적 2026-09-26: 미리보기를 열지 않으면 읽을 수 없었다) */}
            {!m.table && m.body && (
              <div className="mt-2">
                <p className="text-xs text-ink-500">{copy.stage4.bodyPreviewHeading}</p>
                <p className="mt-1 whitespace-pre-wrap text-xs">{previewBody(m.body)}</p>
              </div>
            )}
            {m.table && (
              <div className="mt-2 overflow-x-auto">
                <p className="text-xs text-ink-500">{copy.stage4.previewHeading}</p>
                <table className="mt-1 w-full min-w-[420px] text-left text-xs">
                  <thead>
                    <tr className="border-b border-ink-100 text-ink-500">
                      {m.table.columns.map((col, i) => <th key={i} className="py-1 pr-3">{col}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {m.table.rows.slice(0, 5).map((row, i) => (
                      <tr key={i} className="border-b border-ink-50">
                        {row.map((cell, j) => <td key={j} className="py-1 pr-3">{String(cell)}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))}
      </div>
    )
  }

  if (stage === 5) {
    const o = output as Stage5Output
    return (
      <div className="mt-3 space-y-4">
        <div>
          <p className="text-sm font-semibold text-ink-500">{copy.stage5.itemsHeading}</p>
          <ul className="mt-1 space-y-1 text-sm">
            {o.items?.map((it, i) => (
              <li key={i}>[{it.kind}] {it.stem} — {copy.stage5.pointsLabel(it.points)}</li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-sm font-semibold text-ink-500">{copy.stage5.boundariesHeading}</p>
          <ul className="mt-1 space-y-1 text-sm">
            {o.grade_boundaries?.map((b, i) => (
              <li key={i}>{copy.stage5.boundary(b.grade, b.min, b.max, b.band)}</li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-sm font-semibold text-ink-500">{copy.stage5.exemplarsHeading}</p>
          <ul className="mt-1 space-y-1 text-sm">
            {o.items?.map((it, i) => <li key={i}>{copy.stage5.exemplarCount(i + 1, it.exemplar_answers?.length ?? 0)}</li>)}
          </ul>
        </div>
      </div>
    )
  }

  if (stage === 7) {
    const o = output as Stage7Output
    return <p className="mt-3 text-sm">{copy.stage7.summary(o.per_lesson?.length ?? 0, o.per_lesson?.filter((p) => p.criteria_phrases).length ?? 0)}</p>
  }

  // stage 6
  const o = output as Stage6Output
  return (
    <div className="mt-3 space-y-1 text-sm">
      <p>{copy.stage6.termsCount(o.glossary?.length ?? 0)}</p>
      <p>{copy.stage6.notesCount(o.per_lesson?.reduce((s, l) => s + (l.notes?.length ?? 0), 0) ?? 0)}</p>
    </div>
  )
}

/**
 * 참고용 메모 목록(자동 검사 메모·AI 검토 의견). 대표 결정 2026-09-26: 검토는 참고일 뿐 진행을 막지 않으므로
 * 빨간색·'통과 못함' 표현 없이 중립 색으로만 보여 준다. 지적이 없으면 none 문구 한 줄.
 */
function AdvisoryList({ heading, none, issues }: { heading: string; none: string; issues: Issue[] }) {
  return (
    <div className="mt-4 rounded-xl bg-lavender-50 p-4">
      <p className="text-sm font-semibold">{heading}</p>
      {issues.length === 0 ? (
        <p className="mt-1 text-sm text-ink-500">{none}</p>
      ) : (
        <ul className="mt-2 list-disc pl-5 text-sm">
          {issues.map((issue, i) => <li key={i}>[{issue.kind}] {issue.detail}</li>)}
        </ul>
      )}
    </div>
  )
}

function KeyQuestionPicker({ setId, candidates, current }: { setId: string; candidates: string[]; current: string | null }) {
  // 수정 칸(대표 2026-09-26): 후보를 고르면 그 문장이 채워지고, 고쳐 쓴 문장을 그대로 저장한다. 고친 문장은 어느 후보와도 같지 않다.
  const [text, setText] = useState(current ?? candidates[0] ?? '')
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  if (candidates.length === 0) return <p className="mt-3 text-sm text-ink-500">{copy.keyQuestion.empty}</p>

  function submit() {
    setError(null)
    setSaved(false)
    startTransition(async () => {
      const res = await chooseKeyQuestion(setId, text)
      if (res.ok) setSaved(true)
      else setError(res.error)
    })
  }

  return (
    <Card className="mt-4">
      <h3 className="text-sm font-bold">{copy.keyQuestion.heading}</h3>
      {current && <p className="mt-1 text-sm text-mint-700">{copy.keyQuestion.current(current)}</p>}
      <ul className="mt-2 space-y-2">
        {candidates.map((q) => (
          <li key={q} className="flex items-start gap-2 text-sm">
            <input type="radio" name="key-question" checked={text === q} onChange={() => setText(q)} className="mt-1" />
            <span>{q}</span>
          </li>
        ))}
      </ul>
      <label className="mt-3 block text-sm font-semibold text-ink-500">
        {copy.keyQuestion.editLabel}
        <textarea
          value={text}
          onChange={(e) => { setText(e.target.value); setSaved(false) }}
          rows={2}
          className="mt-1 w-full rounded-xl border border-ink-300 p-2 text-sm font-normal text-ink-900"
        />
      </label>
      {text.trim() !== '' && !candidates.includes(text) && <p className="mt-1 text-xs text-ink-500">{copy.keyQuestion.editedHint}</p>}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      {saved && <p className="mt-2 text-sm text-mint-700">{copy.keyQuestion.saved}</p>}
      <div className="mt-3">
        <Button variant="ghost" disabled={pending || !text.trim()} onClick={submit}>{copy.keyQuestion.select}</Button>
      </div>
    </Card>
  )
}

function StagePanel({
  setId,
  stage,
  status,
  prevAccepted,
  busy,
  onRun,
  onSaved,
}: {
  setId: string
  stage: WizardStage
  status: StageStatus | undefined
  prevAccepted: boolean
  busy: boolean
  onRun: (stage: WizardStage, action: 'generate' | 'review' | 'accept') => void
  onSaved: (stage: WizardStage, status: StageStatus) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [editError, setEditError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const state = status?.state ?? 'idle'

  // 대표 결정 2026-09-26: [생성] → 읽기 → [확인]. 검토는 선택(AI 검토 의견 보기)이고 결과와 무관하게 [확인]할 수 있다.
  const canGenerate = prevAccepted && canGenerateStage(status)
  const canAccept = prevAccepted && canAcceptStage(status)
  const canReview = canReviewStage(status)
  // 옛 행에 남은 검토 한도 표지는 더 이상 뜻이 없으므로 보여 주지 않는다
  const shownError = status?.error && status.error !== EXHAUSTED_ERROR ? status.error : null

  function openEdit() {
    setDraft(JSON.stringify(status?.output ?? {}, null, 2))
    setEditError(null)
    setEditing(true)
  }

  function save() {
    setEditError(null)
    startTransition(async () => {
      const res = await saveStageEdit(setId, stage, draft)
      if (!res.ok) {
        setEditError(res.error)
        return
      }
      setEditing(false)
      onSaved(stage, res.status)
    })
  }

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-bold">{copy.stageNames[stage]}</h2>
        <Badge tone={STATE_TONE[state]}>{copy.stateLabel[state]}</Badge>
        {status && <Badge tone="gray">{copy.attemptLabel(status.attempt)}</Badge>}
        {status?.model === 'mock' && <Badge tone="lemon">{copy.mockBadge}</Badge>}
        {status?.model === 'edited' && <Badge tone="lavender">{copy.editedBadge}</Badge>}
      </div>

      {!prevAccepted && <p className="mt-3 text-sm text-lemon-600">{copy.prevStageHint}</p>}

      {editing ? (
        <div className="mt-3 space-y-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={16}
            className="w-full rounded-xl border border-ink-300 p-3 font-mono text-xs"
          />
          {editError && <p className="text-sm text-red-600">{editError}</p>}
          <div className="flex gap-2">
            <Button disabled={pending} onClick={save}>{pending ? copy.busy : copy.actions.save}</Button>
            <Button variant="ghost" disabled={pending} onClick={() => setEditing(false)}>{copy.actions.cancelEdit}</Button>
          </div>
        </div>
      ) : (
        <StageOutput stage={stage} output={status?.output} />
      )}

      {status?.notes && !editing && <AdvisoryList heading={copy.notesHeading} none={copy.notesNone} issues={status.notes} />}
      {status?.review && !editing && <AdvisoryList heading={copy.aiReviewHeading} none={copy.aiReviewNone} issues={status.review.issues} />}

      {shownError && <StageErrorMessage message={shownError} />}

      {!editing && (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="ghost" disabled={busy || !canGenerate} onClick={() => onRun(stage, 'generate')}>
            {busy ? copy.busy : copy.actions.generate}
          </Button>
          <Button disabled={busy || !canAccept} onClick={() => onRun(stage, 'accept')}>
            {busy ? copy.busy : copy.actions.accept}
          </Button>
          <Button variant="ghost" disabled={busy || !canReview} onClick={() => onRun(stage, 'review')}>
            {busy ? copy.busy : copy.actions.review}
          </Button>
          <Button variant="ghost" disabled={!status?.output} onClick={openEdit}>{copy.actions.editJson}</Button>
        </div>
      )}
    </Card>
  )
}

export function StageWizard({
  setId,
  initialStatuses,
  keyQuestion,
  candidates,
  materials = [],
  lessons = [],
}: {
  setId: string
  initialStatuses: Partial<Record<WizardStage, StageStatus>>
  keyQuestion: string | null
  candidates: string[]
  materials?: { id: string; images?: string[] }[]
  lessons?: { no: number; images?: string[] }[]
}) {
  // 서버가 내려준 초기 상태로 훅을 시작한다 — 클라이언트 로드 전에도 화면과 [기본값으로 진행]이 같은 상태를 본다.
  const { statuses: effective, busy, error, run, runDefaults, refresh, setStageStatus } = useStageRunner(setId, initialStatuses)
  const [active, setActive] = useState<WizardStage>(2)

  function firstNonAccepted(): WizardStage {
    for (const s of WIZARD_STAGES) {
      if (effective[s]?.state !== 'accepted') return s
    }
    return WIZARD_STAGES[WIZARD_STAGES.length - 1]
  }

  const activeStatus = effective[active]
  const prevAccepted = active === 2 || effective[(active - 1) as WizardStage]?.state === 'accepted'
  const stage2Accepted = effective[2]?.state === 'accepted'
  const stage2Candidates = (effective[2]?.output as { key_question_candidates?: string[] } | undefined)?.key_question_candidates ?? candidates

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="accent" disabled={busy} onClick={async () => { const at = await runDefaults(firstNonAccepted()); if (at) setActive(at) }}>
          {busy ? copy.busy : copy.actions.runDefaults}
        </Button>
        {busy && <span className="text-sm text-ink-500">{copy.busy}</span>}
      </div>

      {error && <p className="mt-2 text-sm text-red-600">{copy.errorPrefix}{error}</p>}

      <div className="mt-4 flex flex-wrap gap-2">
        {WIZARD_STAGES.map((s) => {
          const st = effective[s]
          const tone = st ? STATE_TONE[st.state] : 'gray'
          return (
            <button
              key={s}
              onClick={() => setActive(s)}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${active === s ? 'bg-ink-900 text-white' : 'bg-ink-100 text-ink-700 hover:bg-ink-200'}`}
            >
              {copy.stageNames[s]}
              {st && <Badge tone={tone}>{copy.stateLabel[st.state]}</Badge>}
            </button>
          )
        })}
      </div>

      <div className="mt-4">
        <StagePanel
          setId={setId}
          stage={active}
          status={activeStatus}
          prevAccepted={prevAccepted}
          busy={busy}
          onRun={run}
          // JSON 편집 저장은 하위 단계를 준비 전으로 되돌리므로(saveStageEdit), 고친 단계를 바로 반영한 뒤 전체를 다시 읽는다
          onSaved={(s, st) => { setStageStatus(s, st); void refresh() }}
        />
        {active === 4 && <Attachments setId={setId} materials={materials} lessons={lessons} />}
        {active === 2 && stage2Accepted && (
          <KeyQuestionPicker setId={setId} candidates={stage2Candidates} current={keyQuestion} />
        )}
      </div>
    </div>
  )
}
