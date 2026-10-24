import { createClient } from '@/lib/supabase/server'
import { loadMapAcademies } from '@/lib/academies/public-map'
import { groupBySido } from '@/lib/academies/map-group'
import { Section } from '@/components/site/Section'
import { FranchiseMap } from '@/components/site/FranchiseMap'
import { pages } from '@/content/site'

/** 홈·가맹 안내의 「전국 가맹원」 칸(설계 2026-10-25 §4.1). 가맹원이 0곳이거나 0021 전(함수 없음)이면 그리지 않는다. */
export async function FranchiseMapSection() {
  const supabase = await createClient()
  const groups = groupBySido(await loadMapAcademies(supabase))
  if (groups.total === 0) return null
  return (
    <Section eyebrow={pages.franchiseMap.eyebrow} title={pages.franchiseMap.title}>
      <FranchiseMap groups={groups} />
    </Section>
  )
}
