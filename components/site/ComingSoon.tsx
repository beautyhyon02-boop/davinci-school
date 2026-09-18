import { Button } from '@/components/ui/Button'
import { pages } from '@/content/site'

export function ComingSoon({ name }: { name: string }) {
  const t = pages.comingSoon
  return (
    <div className="mx-auto max-w-2xl px-4 py-32 text-center">
      <p className="text-sm font-semibold text-lavender-600">{t.eyebrow}</p>
      <h1 className="mt-2 text-3xl font-extrabold">{t.title(name)}</h1>
      <p className="mt-4 text-ink-700">{t.body}</p>
      <Button href="/" variant="ghost" className="mt-8">{t.back}</Button>
    </div>
  )
}
