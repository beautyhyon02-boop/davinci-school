'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { StageStatus } from '@/lib/studio/stages'
import { MAX_ATTEMPTS } from '@/lib/studio/max-attempts'
import { nextAction, shouldStopOnFailure } from '@/lib/studio/next-action'
import { app } from '@/content/site'

export const WIZARD_STAGES = [2, 3, 4, 5, 6] as const
export type WizardStage = (typeof WIZARD_STAGES)[number]
export type WizardActionKind = 'generate' | 'review' | 'accept'

const errors = app.studio.wizard.errors

async function fetchStatus(setId: string, stage: number): Promise<StageStatus> {
  const res = await fetch(`/api/studio/item-sets/${setId}/stages/${stage}`)
  const data = await res.json().catch(() => ({}))
  return (data?.status as StageStatus) ?? { state: 'idle', attempt: 0, updated_at: '' }
}

async function postAction(setId: string, stage: number, action: WizardActionKind): Promise<StageStatus> {
  const res = await fetch(`/api/studio/item-sets/${setId}/stages/${stage}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.error ?? errors.generic)
  return data.status as StageStatus
}

/** 세트 마법사(2~6단계) 훅: 상태 로드, 개별 실행, 기본값(첫 미확정 단계부터 자동) 진행. */
export function useStageRunner(setId: string) {
  const [statuses, setStatuses] = useState<Partial<Record<WizardStage, StageStatus>>>({})
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // runDefaults가 진행 중인 최신 상태를 즉시 읽을 수 있도록(React state는 비동기라 다음 stage로 넘어갈 때 stale일 수 있음) ref도 함께 둔다.
  const statusesRef = useRef(statuses)
  statusesRef.current = statuses

  const refresh = useCallback(async () => {
    const entries = await Promise.all(WIZARD_STAGES.map(async (s) => [s, await fetchStatus(setId, s)] as const))
    const next = Object.fromEntries(entries) as Partial<Record<WizardStage, StageStatus>>
    setStatuses(next)
    setLoaded(true)
  }, [setId])

  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setId])

  const run = useCallback(async (stage: WizardStage, action: WizardActionKind) => {
    setBusy(true)
    setError(null)
    try {
      const status = await postAction(setId, stage, action)
      setStatuses((prev) => ({ ...prev, [stage]: status }))
      statusesRef.current = { ...statusesRef.current, [stage]: status }
      return status
    } catch (e) {
      setError((e as Error).message)
      throw e
    } finally {
      setBusy(false)
    }
  }, [setId])

  const runDefaults = useCallback(async (fromStage: WizardStage = 2) => {
    setBusy(true)
    setError(null)
    try {
      for (const stage of WIZARD_STAGES) {
        if (stage < fromStage) continue
        const max = MAX_ATTEMPTS[stage] ?? 1
        // generate가 state:'failed'를 계속 돌려주면 nextAction(failed→'generate')만으로는 멈추지 않으므로
        // (재시도 자체는 정당한 동작), 이 stage에서 failed를 본 횟수를 세어 한도에 도달하면 직접 편집을 유도한다.
        let failedCount = 0
        for (;;) {
          const current = statusesRef.current[stage]
          if (current?.state === 'failed' && shouldStopOnFailure(failedCount, max)) {
            setError(errors.tooManyFailures)
            return
          }
          const action = nextAction(current, max)
          if (action === 'done') break
          if (action === 'edit') return
          try {
            const status = await postAction(setId, stage, action)
            setStatuses((prev) => ({ ...prev, [stage]: status }))
            statusesRef.current = { ...statusesRef.current, [stage]: status }
            if (status.state === 'failed') failedCount += 1
          } catch (e) {
            setError((e as Error).message)
            return
          }
        }
      }
    } finally {
      setBusy(false)
    }
  }, [setId])

  return { statuses, loaded, busy, error, run, runDefaults, refresh, setStatuses }
}
