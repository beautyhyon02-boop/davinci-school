import { requireEssayPage } from '@/lib/auth/essay-access.server'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { app } from '@/content/site'
import { groupSetsByTheme, type PublishedSetRow } from '@/lib/classroom/items-by-theme'

const copy = app.teacherItems

type SearchParams = { theme?: string }

/**
 * 원장 「문항 찾기」 두 단계(대표 2026-11-06): ?theme 이 없으면 대주제 상자(제목·학교급·학년·들어 있는 과목), 상자를 누르면 그 대주제의 과목 카드(버전·[열기]).
 * RLS(스펙 §4.4): item_sets 는 status='published' 일 때만 원장(authenticated)이 읽을 수 있고, 원 구분 없이 전체 공개다.
 */
export default async function TeacherItemsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireEssayPage()
  const { theme } = await searchParams
  const supabase = await createClient()
  const { data } = await supabase.from('item_sets').select('id, subject, level, grade, version, theme_id, themes(title)').eq('status', 'published')
  const themes = groupSetsByTheme((data ?? []) as unknown as PublishedSetRow[])

  if (theme) {
    const t = themes.find((x) => x.id === theme)
    return (
      <>
        <Link href="/teacher/items" className="text-sm text-ink-500 hover:text-ink-900">{copy.subjectList.back}</Link>
        <h1 className="mt-2 text-2xl font-bold">{t?.title ?? copy.title}</h1>
        {t ? (
          <>
            <p className="mt-1 text-sm text-ink-500">{copy.card.meta(t.level, t.grade)} · {copy.subjectList.intro}</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {t.subjects.flatMap((g) => g.sets.map((s) => (
                <Card key={s.id}>
                  <h2 className="text-lg font-bold">{g.subject}</h2>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {s.subject !== g.subject && <Badge tone="gray">{s.subject}</Badge>}
                    <Badge tone="mint">{copy.card.versionLabel(s.version)}</Badge>
                  </div>
                  <div className="mt-3">
                    <Link href={`/teacher/items/${s.id}`} className="text-sm font-semibold text-mint-700 underline">{copy.card.open}</Link>
                  </div>
                </Card>
              )))}
            </div>
          </>
        ) : (
          <p className="mt-8 text-center text-ink-500">{copy.subjectList.notFound}</p>
        )}
      </>
    )
  }

  return (
    <>
      <h1 className="text-2xl font-bold">{copy.title}</h1>
      <p className="mt-1 text-sm text-ink-500">{copy.themeList.intro}</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {themes.map((t) => (
          <Link key={t.id} href={`/teacher/items?theme=${t.id}`} className="block rounded-2xl bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
            <h2 className="text-lg font-bold">{t.title}</h2>
            <div className="mt-2 flex flex-wrap gap-2">
              <Badge tone="gray">{copy.card.meta(t.level, t.grade)}</Badge>
              <Badge tone="mint">{copy.themeList.subjectCount(t.subjects.length)}</Badge>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {t.subjects.map((g) => <Badge key={g.subject} tone="gray">{g.subject}</Badge>)}
            </div>
            <p className="mt-4 text-sm font-semibold text-mint-700">{copy.themeList.open} →</p>
          </Link>
        ))}
      </div>
      {themes.length === 0 && <p className="mt-8 text-center text-ink-500">{copy.empty}</p>}
    </>
  )
}
