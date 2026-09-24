'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getSessionProfile } from '@/lib/auth/session'
import { fetchAll } from '@/lib/supabase/fetch-all'
import { getAllLevelRecords } from '@/lib/reference/levels'
import { crosscheckStandards, type DbStandardRow } from '@/lib/standards/crosscheck'
import { app } from '@/content/site'

/** update(...).in('id', chunk) 한 번에 넣는 id 개수 상한. 검증됨 건수가 이보다 많으면 여러 번 나눠 호출한다. */
const VERIFY_CHUNK_SIZE = 500

export type CrosscheckState =
  | {
      error?: string
      verifiedCount?: number
      unmatchedCount?: number
      mismatched?: { code: string; dbText: string; levelText: string }[]
    }
  | undefined

export async function verifyStandard(id: string, verified: boolean, _formData?: FormData) {
  const s = await getSessionProfile()
  if (s.role !== 'admin') throw new Error('forbidden')
  const supabase = await createClient()
  await supabase.from('standards').update({
    verified_at: verified ? new Date().toISOString() : null,
    verified_by: verified ? s.userId : null,
  }).eq('id', id)
  revalidatePath('/admin/standards')
}

export async function setSourcePage(id: string, page: number | null, _formData?: FormData) {
  const s = await getSessionProfile()
  if (s.role !== 'admin') throw new Error('forbidden')
  const supabase = await createClient()
  await supabase.from('standards').update({ source_page: page }).eq('id', id)
  revalidatePath('/admin/standards')
}

/**
 * "원문 자동 대조" 버튼의 서버 액션. DB의 모든 성취기준을 평가원 성취수준 원문
 * (`data/reference/levels/*.json`)과 코드 기준으로 대조해(`crosscheckStandards`),
 * 문장이 일치하는 행만 검증됨으로 표시한다(`verified_at`/`verified_by`). 불일치·대조 불가
 * 행은 자동으로 손대지 않고 화면에 목록만 보여줘 관리자가 직접 판단하게 한다 —
 * 미검증 상태로 남기는 실수를 자동화가 대신 저지르지 않기 위함이다.
 */
export async function runStandardsCrosscheck(_prev: CrosscheckState, _formData: FormData): Promise<CrosscheckState> {
  const s = await getSessionProfile()
  if (s.role !== 'admin') throw new Error('forbidden')
  const supabase = await createClient()

  const dbRows = await fetchAll<DbStandardRow>((from, to) =>
    supabase.from('standards').select('id, code, subject, text').order('code').range(from, to),
  )
  if (!dbRows.length) return { error: app.adminStandards.crosscheck.error }

  const levelRecords = getAllLevelRecords()
  const result = crosscheckStandards(dbRows, levelRecords)

  const verifiedIds = result.verified.map((r) => r.id)
  const now = new Date().toISOString()
  for (let i = 0; i < verifiedIds.length; i += VERIFY_CHUNK_SIZE) {
    const chunk = verifiedIds.slice(i, i + VERIFY_CHUNK_SIZE)
    const { error } = await supabase
      .from('standards')
      .update({ verified_at: now, verified_by: s.userId })
      .in('id', chunk)
    if (error) return { error: app.adminStandards.crosscheck.error }
  }

  revalidatePath('/admin/standards')

  return {
    verifiedCount: result.verified.length,
    unmatchedCount: result.unmatched.length,
    mismatched: result.mismatched
      .map(({ code, dbText, levelText }) => ({ code, dbText, levelText }))
      .sort((a, b) => a.code.localeCompare(b.code, 'ko')),
  }
}
