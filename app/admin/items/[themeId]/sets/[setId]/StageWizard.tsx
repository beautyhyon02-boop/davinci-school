'use client'
import { useMemo, useState, useTransition } from 'react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { app } from '@/content/site'
import { canAccept as canAcceptStage, canGenerate as canGenerateStage, canReview as canReviewStage } from '@/lib/studio/next-action'
import type { StageStatus } from '@/lib/studio/stages'
import type { Issue } from '@/lib/studio/checks'
import { EXHAUSTED_ERROR } from '@/lib/studio/max-attempts'
import { syncAssessmentSessionMaterials } from '@/lib/studio/assessment-structure'
import type { MaterialLike } from '@/components/studio/parts/MaterialsFull'
import { chooseKeyQuestion, saveStageEdit } from './actions'
import { WIZARD_STAGES, useStageRunner, type WizardStage } from './useStageRunner'
import { Attachments } from './Attachments'
import { FieldEditor } from './FieldEditor'
import { StageOutput } from './StageOutput'

const copy = app.studio.wizard

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

/**
 * StageOutput에 넘길 단계별 출력(마법사의 outputs prop). 저장된 값을 그대로 보이는 게 원칙이지만, 단원 평가 차시의
 * materials_used만은 예외다 — 5단계를 저장할 때 저장소(repo.ts saveOutput·saveStageEdit)가 3단계 lessons 열도 같이
 * 고치지만, 그 반영이 읽기 전용 재조회 전에는 화면에 닿지 않아(예: [확인] 직후 setStageStatus만으로 넘어갈 때) 3단계
 * 탭이 예전 값(예: 무관한 공유 자료 A~D)을 그대로 보일 수 있다. 순수 함수라 상태는 그대로 두고 여기서 보일 값만 맞춘다
 * (오너 규칙 2026-09-26 보완). 바뀔 게 없으면 outputs[3]을 새로 만들지 않는다(참조 그대로).
 */
export function stageOutputsFor(effective: Partial<Record<WizardStage, StageStatus>>): Partial<Record<WizardStage, unknown>> {
  const base: Partial<Record<WizardStage, unknown>> = Object.fromEntries(WIZARD_STAGES.map((s) => [s, effective[s]?.output]))
  const stage3 = base[3] as { lessons?: { no: number; kind?: string; assessment?: unknown; materials_used?: string[] | null }[] } | undefined
  const stage5 = base[5] as { items?: { kind: string; points: number; materials_used?: string[] | null }[] } | undefined
  if (!stage3 || !Array.isArray(stage3.lessons) || !stage5 || !Array.isArray(stage5.items)) return base
  const lessons = syncAssessmentSessionMaterials(stage3.lessons, stage5.items)
  return lessons === stage3.lessons ? base : { ...base, 3: { ...stage3, lessons } }
}

function StagePanel({
  setId,
  stage,
  status,
  outputs,
  sharedMaterials,
  prevAccepted,
  laterStages,
  busy,
  onRun,
  onSaved,
}: {
  setId: string
  stage: WizardStage
  status: StageStatus | undefined
  /** 모든 단계의 현재 출력 — 결과 보기가 다른 단계 것(3↔6 지침서 메모, 4 ← 자료 참조)을 함께 읽는다. */
  outputs: Partial<Record<WizardStage, unknown>>
  sharedMaterials: MaterialLike[]
  prevAccepted: boolean
  /** 이 단계 뒤의, 준비 전이 아닌 단계 — 이 단계를 고쳐 저장하면 초기화된다(문장 고치기가 확인을 받는다). */
  laterStages: number[]
  busy: boolean
  onRun: (stage: WizardStage, action: 'generate' | 'review' | 'accept') => void
  onSaved: (stage: WizardStage, status: StageStatus) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [editError, setEditError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  // 문장 고치기 저장 직후 안내 — 저장된 상태(updated_at)가 그대로일 때만 보인다(다시 생성·확인하면 사라진다).
  // FieldEditor 는 새 출력마다 다시 그려지므로(key) 안내를 여기서 들고 있는다.
  const [fieldSavedAt, setFieldSavedAt] = useState<string | null>(null)

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
        <StageOutput stage={stage} outputs={outputs} sharedMaterials={sharedMaterials} />
      )}

      {/* 문장 고치기(대표 2026-09-26): 기본은 접혀 있고, 구조를 바꿀 때는 아래 [JSON 편집]을 쓴다 */}
      {!editing && status?.output != null && (
        <details className="mt-4 rounded-xl border border-ink-100 p-3">
          <summary className="cursor-pointer text-sm font-semibold">{copy.fieldEditor.heading}</summary>
          <FieldEditor
            key={`${status.updated_at}:${status.model ?? ''}`}
            setId={setId}
            stage={stage}
            output={status.output}
            laterStages={laterStages}
            onSaved={(st) => { setFieldSavedAt(st.updated_at); onSaved(stage, st) }}
          />
        </details>
      )}
      {!editing && fieldSavedAt !== null && fieldSavedAt === status?.updated_at && (
        <p className="mt-2 text-sm text-mint-700">{copy.fieldEditor.saved}</p>
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
  sharedMaterials = [],
}: {
  setId: string
  initialStatuses: Partial<Record<WizardStage, StageStatus>>
  keyQuestion: string | null
  candidates: string[]
  materials?: { id: string; images?: string[] }[]
  lessons?: { no: number; images?: string[] }[]
  /** 대주제 공유 자료(v2 기본값을 입힌 평범한 데이터) — 4단계 탭에 이 세트가 가리키는 것만 '공유'로 보인다. */
  sharedMaterials?: MaterialLike[]
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
  const outputs: Partial<Record<WizardStage, unknown>> = useMemo(() => stageOutputsFor(effective), [effective])
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
          outputs={outputs}
          sharedMaterials={sharedMaterials}
          prevAccepted={prevAccepted}
          laterStages={WIZARD_STAGES.filter((s) => s > active && (effective[s]?.state ?? 'idle') !== 'idle')}
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
