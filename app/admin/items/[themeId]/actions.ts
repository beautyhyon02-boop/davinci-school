'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getSessionProfile } from '@/lib/auth/session'
import { canCreateSet, validateStandardSelection } from '@/lib/studio/themes'
import { Materials, ThemeIntro, type Subject } from '@/lib/studio/schemas'
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

  if (standardIds.length === 0) return { ok: false as const, error: errors.standardCountInvalid }
  const { data: standardRows, error: stdErr } = await supabase
    .from('standards')
    .select('id, code, level, subject, verified_at')
    .in('id', standardIds)
  if (stdErr) return { ok: false as const, error: stdErr.message }
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
  if (insertErr || !itemSet) return { ok: false as const, error: insertErr?.message ?? errors.saveFailed }

  const rows = standardIds.map((id) => ({ item_set_id: itemSet.id, standard_id: id }))
  const { error: linkErr } = await supabase.from('item_set_standards').insert(rows)
  if (linkErr) return { ok: false as const, error: linkErr.message }

  revalidatePath(`/admin/items/${themeId}`)
  return { ok: true as const, id: itemSet.id as string }
}

export async function acceptThemeIntro(themeId: string, intro: string, ideas: { subject: string; idea: string }[]) {
  await assertAdmin()
  const r = ThemeIntro.safeParse({ intro, subject_ideas: ideas })
  if (!r.success) return { ok: false as const, error: errors.introInvalid }

  const supabase = await createClient()
  const { error } = await supabase
    .from('themes')
    .update({
      intro: r.data.intro,
      intro_ideas: { state: 'accepted', output: { intro: r.data.intro, subject_ideas: r.data.subject_ideas }, updated_at: new Date().toISOString() },
    })
    .eq('id', themeId)
  if (error) return { ok: false as const, error: error.message }

  revalidatePath(`/admin/items/${themeId}`)
  return { ok: true as const }
}

export async function saveSharedMaterials(themeId: string, materialsJson: string) {
  await assertAdmin()
  let parsed: unknown
  try {
    parsed = JSON.parse(materialsJson)
  } catch {
    return { ok: false as const, error: errors.materialsInvalid }
  }
  const r = Materials.safeParse(parsed)
  if (!r.success) return { ok: false as const, error: errors.materialsInvalid }

  const supabase = await createClient()
  const { error } = await supabase.from('themes').update({ materials: r.data.materials }).eq('id', themeId)
  if (error) return { ok: false as const, error: error.message }

  revalidatePath(`/admin/items/${themeId}`)
  return { ok: true as const }
}
