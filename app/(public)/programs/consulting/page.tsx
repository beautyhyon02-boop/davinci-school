import { ComingSoon } from '@/components/site/ComingSoon'
import { site } from '@/content/site'

export default function ConsultingPage() {
  const p = site.programs.find(x => x.slug === 'consulting')!
  return <ComingSoon name={p.name} />
}
