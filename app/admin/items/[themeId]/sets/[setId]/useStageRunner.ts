'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { StageStatus } from '@/lib/studio/stages'
import { autoConfirm } from '@/lib/studio/next-action'
import { app } from '@/content/site'

import { WIZARD_STAGES, type WizardStage } from '@/lib/studio/wizard-stages'

export { WIZARD_STAGES, type WizardStage }
export type WizardActionKind = 'generate' | 'review' | 'accept'
type Statuses = Partial<Record<WizardStage, StageStatus>>

const errors = app.studio.wizard.errors

async function fetchStatus(setId: string, stage: number): Promise<StageStatus> {
  const res = await fetch(`/api/studio/item-sets/${setId}/stages/${stage}`)
  const data = await res.json().catch(() => ({}))
  return (data?.status as StageStatus) ?? { state: 'idle', attempt: 0, updated_at: '' }
}

async function fetchAll(setId: string): Promise<Statuses> {
  const entries = await Promise.all(WIZARD_STAGES.map(async (s) => [s, await fetchStatus(setId, s)] as const))
  return Object.fromEntries(entries) as Statuses
}

async function postAction(setId: string, stage: number, action: WizardActionKind): Promise<StageStatus> {
  const res = await fetch(`/api/studio/item-sets/${setId}/stages/${stage}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.message ?? errors.generic)
  return data.status as StageStatus
}

/**
 * 세트 마법사(2~7단계) 훅: 상태 로드, 개별 실행, 기본값 진행.
 * `initial`은 서버 컴포넌트가 내려준 상태 — 첫 렌더부터(클라이언트 로드 전에도) 자동 진행이 올바른 상태를 보게 한다.
 */
export function useStageRunner(setId: string, initial: Statuses = {}) {
  const [statuses, setStatuses] = useState<Statuses>(initial)
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // runDefaults가 진행 중인 최신 상태를 즉시 읽을 수 있도록(React state는 비동기라 다음 stage로 넘어갈 때 stale일 수 있음) ref도 함께 둔다.
  // 렌더 중에는 쓰지 않는다 — 상태를 바꾸는 곳(setStage·로드)에서 state와 ref를 함께 갱신한다.
  const statusesRef = useRef<Statuses>(initial)

  /** 한 단계의 상태를 state 와 ref 에 함께 반영한다. JSON 편집 저장(onSaved)도 이것을 쓴다. */
  const setStageStatus = useCallback((stage: WizardStage, status: StageStatus) => {
    statusesRef.current = { ...statusesRef.current, [stage]: status }
    setStatuses((prev) => ({ ...prev, [stage]: status }))
  }, [])

  const applyAll = useCallback((next: Statuses) => {
    statusesRef.current = next
    setStatuses(next)
    setLoaded(true)
  }, [])

  const refresh = useCallback(async () => {
    applyAll(await fetchAll(setId))
  }, [setId, applyAll])

  // 세트가 바뀌면 서버의 최신 상태를 읽는다. setState 는 응답이 온 뒤(콜백)에서만 부르고, 그 사이 세트가 바뀌면 버린다.
  useEffect(() => {
    let cancelled = false
    fetchAll(setId).then((next) => { if (!cancelled) applyAll(next) }, () => {})
    return () => { cancelled = true }
  }, [setId, applyAll])

  // 실패는 error 상태로만 알린다 — StagePanel 은 onRun 을 await/catch 없이 부르므로, 다시 throw 하면
  // 실패할 때마다 잡히지 않는 rejection 이 난다.
  const run = useCallback(async (stage: WizardStage, action: WizardActionKind) => {
    setBusy(true)
    setError(null)
    try {
      const status = await postAction(setId, stage, action)
      setStageStatus(stage, status)
      return status
    } catch (e) {
      setError((e as Error).message)
      return undefined
    } finally {
      setBusy(false)
    }
  }, [setId, setStageStatus])

  /**
   * [기본값으로 진행]: fromStage 부터 7단계까지 각 단계를 생성하고 곧바로 확인한다(대표 결정 2026-09-26 — 검토 호출 없음).
   * 생성이 실패하거나 요청이 거절되면 그 단계에서 멈춘다. 멈춘(또는 마지막으로 다룬) 단계를 돌려준다 — 화면이 그 단계를 열 수 있게.
   */
  const runDefaults = useCallback(async (fromStage: WizardStage = 2): Promise<WizardStage | undefined> => {
    setBusy(true)
    setError(null)
    try {
      const { stage, stop } = await autoConfirm({
        stages: WIZARD_STAGES,
        from: fromStage,
        get: (s) => statusesRef.current[s],
        post: (s, action) => postAction(setId, s, action),
        onStatus: setStageStatus,
      })
      if (stop) setError(stop.kind === 'failed' ? errors.autoStopped : stop.message)
      return stage
    } finally {
      setBusy(false)
    }
  }, [setId, setStageStatus])

  return { statuses, loaded, busy, error, run, runDefaults, refresh, setStageStatus }
}
