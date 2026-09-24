import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSessionProfileOrNull } from '@/lib/auth/session'
import { runStage, StageError } from '@/lib/studio/stages'
import { createSupabaseRepo } from '@/lib/studio/repo'
import type { Stage } from '@/lib/studio/schemas'

export const maxDuration = 300

/**
 * 세트 단계 실행. action: 'generate'(생성 + 자동 검사 메모) · 'accept'([확인], 출력만 있으면 됨) · 'review'(선택, AI 검토 의견 — 참고용).
 * 대표 결정 2026-09-26: 검토 결과로 막지 않는다. 알려진 거절(StageError)은 400, 그 밖은 500.
 */

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; stage: string }> }) {
  const s = await getSessionProfileOrNull()
  if (!s) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (s.role !== 'admin') return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const { id, stage } = await params
  let action: 'generate' | 'review' | 'accept'
  try {
    ;({ action } = await req.json() as { action: 'generate' | 'review' | 'accept' })
  } catch {
    return NextResponse.json({ error: 'bad request' }, { status: 400 })
  }
  const n = Number(stage)
  // 0~7단계(7 = 안내장 틀)
  if (!Number.isInteger(n) || n < 0 || n > 7 || !['generate','review','accept'].includes(action)) return NextResponse.json({ error: 'bad request' }, { status: 400 })
  const supabase = await createClient()
  try {
    const result = await runStage({ itemSetId: id, stage: n as Stage, action, repo: createSupabaseRepo(supabase) })
    return NextResponse.json(result)
  } catch (e) {
    if (e instanceof StageError) return NextResponse.json({ error: e.code, message: e.message }, { status: 400 })
    console.error('stage run failed', e)
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string; stage: string }> }) {
  const s = await getSessionProfileOrNull()
  if (!s) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (s.role !== 'admin') return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const { id, stage } = await params
  const supabase = await createClient()
  const { data } = await supabase.from('item_sets').select('stage_status').eq('id', id).single()
  return NextResponse.json({ status: data?.stage_status?.[`stage${stage}`] ?? { state: 'idle', attempt: 0 } })
}
