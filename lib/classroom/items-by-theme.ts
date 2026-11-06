import { STUDIO_SUBJECTS, studioSubjectOf } from '@/lib/studio/subjects'

/**
 * 원장 「문항 찾기」 두 단계(대표 2026-11-06): 게시된 세트를 대주제 상자로 묶고, 상자 안은 과목 카드로.
 * 과목 순서는 제작소 과목 순(국어·영어·수학·과학·사회), 옛 한국사·세계사 세트는 「사회」로 묶는다(2026-09-30 결정).
 */
export type PublishedSetRow = {
  id: string
  subject: string
  level: string
  grade: number | null
  version: number
  theme_id: string
  themes: { title: string } | null
}
export type SubjectGroup = { subject: string; sets: { id: string; subject: string; version: number }[] }
export type ThemeGroup = { id: string; title: string; level: string; grade: number | null; subjects: SubjectGroup[] }

export function groupSetsByTheme(rows: PublishedSetRow[]): ThemeGroup[] {
  const byTheme = new Map<string, ThemeGroup & { bySubject: Map<string, SubjectGroup> }>()
  for (const r of rows) {
    let t = byTheme.get(r.theme_id)
    if (!t) {
      t = { id: r.theme_id, title: r.themes?.title?.trim() || '-', level: r.level, grade: r.grade, subjects: [], bySubject: new Map() }
      byTheme.set(r.theme_id, t)
    }
    const subject = studioSubjectOf(r.subject)
    let g = t.bySubject.get(subject)
    if (!g) { g = { subject, sets: [] }; t.bySubject.set(subject, g) }
    g.sets.push({ id: r.id, subject: r.subject, version: r.version })
  }
  const order = (s: string) => { const i = (STUDIO_SUBJECTS as readonly string[]).indexOf(s); return i < 0 ? STUDIO_SUBJECTS.length : i }
  return [...byTheme.values()]
    .map(({ bySubject, ...t }) => ({
      ...t,
      subjects: [...bySubject.values()]
        .map((g) => ({ ...g, sets: [...g.sets].sort((a, b) => b.version - a.version) }))
        .sort((a, b) => order(a.subject) - order(b.subject)),
    }))
    .sort((a, b) => a.title.localeCompare(b.title, 'ko'))
}
