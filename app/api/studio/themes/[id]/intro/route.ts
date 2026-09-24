import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSessionProfileOrNull } from '@/lib/auth/session'
import { runThemeIntro, StageError, type ThemeIntroAction } from '@/lib/studio/stages'
import { createSupabaseThemeRepo } from '@/lib/studio/repo'

export const maxDuration = 300

const ACTIONS: ThemeIntroAction[] = ['generate', 'save']

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const s = await getSessionProfileOrNull()
  if (!s) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (s.role !== 'admin') return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const { id } = await params
  let action: ThemeIntroAction
  // 'save'일 때만 쓰는 값: { intro, subject_ideas } — 검증은 runThemeIntro 가 한다
  let output: unknown
  try {
    ;({ action, output } = await req.json() as { action: ThemeIntroAction; output?: unknown })
  } catch {
    return NextResponse.json({ error: 'bad request' }, { status: 400 })
  }
  if (!ACTIONS.includes(action)) return NextResponse.json({ error: 'bad request' }, { status: 400 })
  const supabase = await createClient()
  try {
    const result = await runThemeIntro({ themeId: id, action, repo: createSupabaseThemeRepo(supabase), edit: output })
    return NextResponse.json(result)
  } catch (e) {
    if (e instanceof StageError) return NextResponse.json({ error: e.code, message: e.message }, { status: 400 })
    console.error('theme intro run failed', e)
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const s = await getSessionProfileOrNull()
  if (!s) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (s.role !== 'admin') return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const { id } = await params
  const supabase = await createClient()
  const { data } = await supabase.from('themes').select('intro_ideas').eq('id', id).single()
  return NextResponse.json({ status: data?.intro_ideas ?? { state: 'idle', attempt: 0 } })
}
