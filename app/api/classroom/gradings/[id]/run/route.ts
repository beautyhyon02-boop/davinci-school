import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSessionProfileOrNull } from '@/lib/auth/session'
import { runGrading } from '@/lib/classroom/grade'

export const maxDuration = 300

/** 호출 자격: 그 답안의 학생 본인(pending 일 때만), 그 원의 원장, 본사. 자격 확인은 사용자 클라이언트(RLS)로, 실행은 service role 로. */
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
    // 학생은 제출 직후 한 번 부르는 용도 — pending 인 자기 답안만. failed/drafted 를 다시 돌리는 건 원장의 [AI 다시 채점] 몫이다
    // (학생이 유료 호출을 반복해 일으키지 못하게). 실행 중인 pending 을 다시 부르면 runGrading 의 줄 잡기가 막는다.
    const { data } = await createAdminClient().from('gradings').select('status, answers(assignments(student_id))').eq('id', id).maybeSingle()
    allowed = data?.status === 'pending' && (data?.answers as unknown as { assignments: { student_id: string } } | null)?.assignments?.student_id === s.userId
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
