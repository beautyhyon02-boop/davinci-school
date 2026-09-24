import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSessionProfileOrNull } from '@/lib/auth/session'
import { runStage, StageError } from '@/lib/studio/stages'
import { createSupabaseRepo } from '@/lib/studio/repo'
import type { Stage } from '@/lib/studio/schemas'

export const maxDuration = 300

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
