import { Section } from '@/components/site/Section'
import { Button } from '@/components/ui/Button'
import { pages } from '@/content/site'

export default function FranchisePage() {
  const f = pages.franchise
  return (
    <>
      <div className="bg-lavender-50">
        <div className="mx-auto max-w-6xl px-4 py-20">
          <h1 className="text-4xl font-extrabold tracking-tight">{f.title}</h1>
          <p className="mt-4 max-w-2xl text-lg text-ink-700">{f.intro}</p>
        </div>
      </div>
      <Section title={f.formTitle}>
        <form className="grid max-w-xl gap-4">
          <label className="grid gap-1 text-sm font-semibold">
            {f.fields.name.label}
            <input name="name" required className="rounded-xl border border-ink-300 px-4 py-3 font-normal" />
          </label>
          <label className="grid gap-1 text-sm font-semibold">
            {f.fields.phone.label}
            <input name="phone" required className="rounded-xl border border-ink-300 px-4 py-3 font-normal" placeholder={f.fields.phone.placeholder} />
          </label>
          <label className="grid gap-1 text-sm font-semibold">
            {f.fields.region.label}
            <input name="region" required className="rounded-xl border border-ink-300 px-4 py-3 font-normal" placeholder={f.fields.region.placeholder} />
          </label>
          <label className="grid gap-1 text-sm font-semibold">
            {f.fields.message.label}
            <textarea name="message" rows={5} className="rounded-xl border border-ink-300 px-4 py-3 font-normal" />
          </label>
          <Button type="submit" variant="accent">{f.submit}</Button>
        </form>
      </Section>
    </>
  )
}
