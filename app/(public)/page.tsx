import { site } from '@/content/site'
import { Button } from '@/components/ui/Button'
import { Section } from '@/components/site/Section'
import { ProgramCard } from '@/components/site/ProgramCard'

export default function HomePage() {
  return (
    <>
      <section className="bg-gradient-to-b from-mint-50 to-white">
        <div className="mx-auto max-w-6xl px-4 py-24 text-center">
          <h1 className="text-4xl font-extrabold tracking-tight md:text-5xl">{site.tagline}</h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-ink-700">{site.intro}</p>
          <div className="mt-8 flex justify-center gap-3">
            <Button href="/programs/essay">서논술형 수업 보기</Button>
            <Button href="/franchise" variant="accent">가맹문의</Button>
          </div>
          <dl className="mx-auto mt-14 grid max-w-3xl grid-cols-3 gap-4">
            {site.stats.map(s => (
              <div key={s.label} className="rounded-2xl bg-white/70 p-4">
                <dt className="text-sm text-ink-500">{s.label}</dt>
                <dd className="text-2xl font-extrabold text-mint-700">{s.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <Section eyebrow="PROGRAMS" title="다빈치스쿨의 네 가지 수업">
        <div className="grid gap-5 md:grid-cols-2">
          {site.programs.map(p => <ProgramCard key={p.slug} p={p} />)}
        </div>
      </Section>

      <Section eyebrow="WHY DAVINCI" title="왜 다빈치인가">
        <div className="grid gap-5 md:grid-cols-3">
          {site.why.map(w => (
            <div key={w.title} className="rounded-2xl border border-ink-100 p-6">
              <h3 className="mb-2 text-lg font-bold">{w.title}</h3>
              <p className="text-ink-700">{w.body}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section>
        <div className="rounded-3xl bg-lavender-50 p-10 text-center">
          <h2 className="text-2xl font-extrabold">우리 지역에 다빈치스쿨을 열고 싶다면</h2>
          <p className="mt-2 text-ink-700">본사가 교재·문항·교사용 지침서를 준비합니다.</p>
          <Button href="/franchise" variant="accent" className="mt-6">가맹 안내 보기</Button>
        </div>
      </Section>
    </>
  )
}
