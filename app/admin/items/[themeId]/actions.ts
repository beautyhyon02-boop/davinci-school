'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getSessionProfile } from '@/lib/auth/session'
import { canCreateSet, validateStandardSelection, validateStandardIds, parseSharedMaterialsInput, addThemeSubjects, removeThemeSubject } from '@/lib/studio/themes'
import type { Subject } from '@/lib/studio/schemas'
import { app } from '@/content/site'

const errors = app.studio.errors

async function assertAdmin() {
  const s = await getSessionProfile()
  if (s.role !== 'admin') throw new Error('forbidden')
  return s
}

export async function createItemSet(themeId: string, subject: Subject, standardIds: string[]) {
  await assertAdmin()
  const supabase = await createClient()

  const { data: theme, error: themeErr } = await supabase
    .from('themes')
    .select('subjects, level, grade')
    .eq('id', themeId)
    .single()
  if (themeErr || !theme) return { ok: false as const, error: errors.themeNotFound }

  const { data: existingSets } = await supabase.from('item_sets').select('subject').eq('theme_id', themeId)
  const existingSubjects = (existingSets ?? []).map((s) => s.subject as string)

  const setCheck = canCreateSet({ subjects: (theme.subjects ?? []) as string[] }, subject, existingSubjects)
  if (!setCheck.ok) return { ok: false as const, error: setCheck.reason ?? errors.subjectNotInTheme }

  const { data: standardRows, error: stdErr } = await supabase
    .from('standards')
    .select('id, code, level, subject, verified_at')
    .in('id', Array.from(new Set(standardIds)))
  if (stdErr) return { ok: false as const, error: errors.saveFailed }

  // standardIds가 전부 실제 standards 행으로 해소되는지(중복 제거 후) 먼저 확인 — insert 전에 걸러야
  // 존재하지 않는 id로 item_sets/item_set_standards가 만들어지는 것을 막는다.
  const idCheck = validateStandardIds(standardIds, (standardRows ?? []).map((s) => s.id as string))
  if (!idCheck.ok) return { ok: false as const, error: idCheck.error }

  const standards = (standardRows ?? []).map((s) => ({
    code: s.code as string,
    level: s.level as string,
    subject: s.subject as string,
    verified: !!s.verified_at,
  }))

  const validation = validateStandardSelection(standards, { level: theme.level as string, subject })
  if (!validation.ok) return { ok: false as const, error: validation.issues[0] }

  const { data: itemSet, error: insertErr } = await supabase
    .from('item_sets')
    .insert({
      theme_id: themeId,
      subject,
      level: theme.level,
      grade: theme.grade,
      status: 'draft',
      stage_status: {
        stage1: {
          state: 'accepted',
          attempt: 1,
          output: { selected: standards.map((s) => s.code) },
          updated_at: new Date().toISOString(),
        },
      },
    })
    .select('id')
    .single()
  if (insertErr) return { ok: false as const, error: insertErr.code === '23505' ? errors.subjectDuplicate : errors.saveFailed }
  if (!itemSet) return { ok: false as const, error: errors.saveFailed }

  const rows = idCheck.ids.map((id) => ({ item_set_id: itemSet.id, standard_id: id }))
  const { error: linkErr } = await supabase.from('item_set_standards').insert(rows)
  if (linkErr) {
    // item_set_standards가 실패했으면 방금 만든 item_sets 행이 고아로 남지 않게 되돌린다.
    await supabase.from('item_sets').delete().eq('id', itemSet.id)
    return { ok: false as const, error: errors.saveFailed }
  }

  revalidatePath(`/admin/items/${themeId}`)
  return { ok: true as const, id: itemSet.id as string }
}

export async function addSubjectsToTheme(themeId: string, formData: FormData) {
  await assertAdmin()
  const supabase = await createClient()

  const { data: theme, error: themeErr } = await supabase.from('themes').select('subjects').eq('id', themeId).single()
  if (themeErr || !theme) return { ok: false as const, error: errors.themeNotFound }

  const toAdd = formData.getAll('subjects').map((v) => String(v))
  const r = addThemeSubjects((theme.subjects ?? []) as string[], toAdd)
  if (!r.ok) return { ok: false as const, error: r.error }

  const { error } = await supabase.from('themes').update({ subjects: r.subjects }).eq('id', themeId)
  if (error) return { ok: false as const, error: errors.saveFailed }

  revalidatePath(`/admin/items/${themeId}`)
  return { ok: true as const }
}

/** 대주제에서 과목 하나를 뺀다. 그 과목의 세트가 있는지는 화면이 아니라 여기서 item_sets 로 다시 확인한다. */
export async function removeSubjectFromTheme(themeId: string, formData: FormData) {
  await assertAdmin()
  const supabase = await createClient()

  const { data: theme, error: themeErr } = await supabase.from('themes').select('subjects').eq('id', themeId).single()
  if (themeErr || !theme) return { ok: false as const, error: errors.themeNotFound }

  const { data: sets, error: setsErr } = await supabase.from('item_sets').select('subject').eq('theme_id', themeId)
  if (setsErr) return { ok: false as const, error: errors.saveFailed }

  const subject = String(formData.get('subject') ?? '')
  const r = removeThemeSubject((theme.subjects ?? []) as string[], subject, (sets ?? []).map((s) => s.subject as string))
  if (!r.ok) return { ok: false as const, error: r.error }

  const { error } = await supabase.from('themes').update({ subjects: r.subjects }).eq('id', themeId)
  if (error) return { ok: false as const, error: errors.saveFailed }

  revalidatePath(`/admin/items/${themeId}`)
  return { ok: true as const }
}

export async function saveSharedMaterials(themeId: string, materialsJson: string) {
  await assertAdmin()
  // 배열·래퍼 두 모양을 모두 받는다(화면이 보여 준 값을 그대로 다시 저장할 수 있도록).
  const r = parseSharedMaterialsInput(materialsJson)
  if (!r.ok) return { ok: false as const, error: r.error }

  const supabase = await createClient()
  const { data, error } = await supabase.from('themes').update({ materials: r.materials }).eq('id', themeId).select('id')
  if (error) return { ok: false as const, error: errors.saveFailed }
  if (!data || data.length === 0) return { ok: false as const, error: errors.themeNotFound }

  revalidatePath(`/admin/items/${themeId}`)
  return { ok: true as const }
}
