import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSessionProfileOrNull } from '@/lib/auth/session'
import { runGrading } from '@/lib/classroom/grade'

export const maxDuration = 300

/** 호출 자격: 그 답안의 학생 본인, 그 원의 원장, 본사. 자격 확인은 사용자 클라이언트(RLS)로, 실행은 service role 로. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const s = await getSessionProfileOrNull()
  if (!s) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const supabase = await createClient()
  let allowed = s.role === 'admin'
  if (s.role === 'teacher') {
    const { data } = await supabase.from('gradings').select('id').eq('id', id).maybeSingle()
    allowed = !!data
  } else if (s.role === 'student') {
    const { data } = await createAdminClient().from('gradings').select('answers(assignments(student_id))').eq('id', id).maybeSingle()
    allowed = (data?.answers as unknown as { assignments: { student_id: string } } | null)?.assignments?.student_id === s.userId
  }
  if (!allowed) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  try {
    const status = await runGrading({ gradingId: id, db: createAdminClient() })
    return NextResponse.json({ status })
  } catch (e) {
    console.error('[grading run]', e)
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
}
