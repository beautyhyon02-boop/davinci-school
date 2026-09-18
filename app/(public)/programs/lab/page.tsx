import { ComingSoon } from '@/components/site/ComingSoon'
import { site } from '@/content/site'

export default function LabPage() {
  const p = site.programs.find(x => x.slug === 'lab')!
  return <ComingSoon name={p.name} />
}
