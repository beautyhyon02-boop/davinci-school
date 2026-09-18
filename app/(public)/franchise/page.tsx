import { Section } from '@/components/site/Section'
import { InquiryForm } from '@/components/site/InquiryForm'
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
        <InquiryForm />
      </Section>
    </>
  )
}
