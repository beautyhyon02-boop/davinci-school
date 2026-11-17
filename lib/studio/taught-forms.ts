// lib/studio/taught-forms.ts
// 같은 학교급의 다른 영어 세트에서 본사가 이미 정한 목표 언어 형식을 읽는다(S-영-11 덧붙임 — 2026-11-17).
// 도서관 영어 2단계의 후보 넷 가운데 셋이 일회용품 영어에서 이미 고른 문법이었다 → 2단계 생성·검토(repo.ts loadContext)와
// 「목표 문법 고르기」 화면(page.tsx)이 같은 목록을 쓴다. 읽기에 실패하면 빈 배열 — 생성을 막지 않는다.
import type { createClient } from '@/lib/supabase/server'
import { taughtLanguageForms, type TaughtForms } from './language-forms'

type Supabase = Awaited<ReturnType<typeof createClient>>
type SetRow = { id: string; theme_id: string; status: string | null; stage2: unknown }

export async function loadTaughtLanguageForms(supabase: Supabase, a: { setId: string; level: string }): Promise<TaughtForms[]> {
  try {
    // stage_status 는 세트의 단계 출력 전체라 크다 — 2단계 칸만 골라 읽는다
    const { data, error } = await supabase
      .from('item_sets')
      .select('id, theme_id, status, stage2:stage_status->stage2')
      .eq('subject', '영어')
      .eq('level', a.level)
    if (error || !data) return []
    const others = (data as unknown as SetRow[]).filter((s) => s.id !== a.setId && s.status !== 'retired')
    if (others.length === 0) return []
    // 대주제 이름은 화면에만 쓴다 — 못 읽으면 빈 글자로 두고 형식의 이름은 넘긴다(프롬프트는 이름만 쓴다)
    const { data: themes } = await supabase.from('themes').select('id, title').in('id', [...new Set(others.map((s) => s.theme_id))])
    const title = new Map(((themes ?? []) as { id: string; title: string }[]).map((t) => [t.id, t.title]))
    return taughtLanguageForms(others.map((s) => ({ id: s.id, theme: title.get(s.theme_id) ?? '', stage2: s.stage2 })), a.setId)
  } catch {
    // 이 목록은 도움말이다 — 읽다가 던져도 loadContext(모든 단계)와 세트 화면이 멈추면 안 된다(독립 검토 2026-11-17)
    return []
  }
}
