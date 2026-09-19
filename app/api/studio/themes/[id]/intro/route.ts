import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSessionProfileOrNull } from '@/lib/auth/session'
import { runThemeIntro } from '@/lib/studio/stages'
import { createSupabaseThemeRepo } from '@/lib/studio/repo'

export const maxDuration = 300

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const s = await getSessionProfileOrNull()
  if (!s) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (s.role !== 'admin') return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const { id } = await params
  let action: 'generate' | 'review' | 'accept'
  try {
    ;({ action } = await req.json() as { action: 'generate' | 'review' | 'accept' })
  } catch {
    return NextResponse.json({ error: 'bad request' }, { status: 400 })
  }
  if (!['generate', 'review', 'accept'].includes(action)) return NextResponse.json({ error: 'bad request' }, { status: 400 })
  const supabase = await createClient()
  try {
    const result = await runThemeIntro({ themeId: id, action, repo: createSupabaseThemeRepo(supabase) })
    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 })
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
