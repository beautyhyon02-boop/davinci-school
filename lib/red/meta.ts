import { z } from 'zod'
import { RED_TYPES, type RedSourceLink } from './reports'

/**
 * RED 줄의 메타 수정(PRD 2026-10-16 US-006): 구분·종류·시리즈·과목·제목·요약·날짜·참고 링크. 순수 검증만 — 저장은 app/admin/red/actions.ts.
 * 참고 링크 글상자는 한 줄에 하나, "이름 | 주소" 또는 주소만. http(s) 만 받는다(지어낸·이상한 주소가 원장 화면에 나가지 않게). 10개까지.
 */
export const MAX_SOURCE_LINKS = 10
const HTTP = /^https?:\/\/\S+$/i

export function parseSourceLinks(text: string): { ok: true; links: RedSourceLink[] } | { ok: false } {
  const links: RedSourceLink[] = []
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue
    const bar = line.indexOf('|')
    const label = bar >= 0 ? line.slice(0, bar).trim() : ''
    const url = (bar >= 0 ? line.slice(bar + 1) : line).trim()
    if (!HTTP.test(url) || url.length > 500 || label.length > 120) return { ok: false }
    links.push({ label: label || url, url })
  }
  if (links.length > MAX_SOURCE_LINKS) return { ok: false }
  return { ok: true, links }
}

const trimmed = (max: number) => z.string().trim().max(max)
export const RedMeta = z.object({
  category: z.enum(['BASIC', 'ADVANCED']),
  red_type: z.enum(RED_TYPES as [string, ...string[]]),
  series: trimmed(60),
  subject: trimmed(60),
  title: trimmed(200).min(1),
  summary: trimmed(600),
  report_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((d) => !Number.isNaN(Date.parse(d)) && d === new Date(d).toISOString().slice(0, 10)),
})
export type RedMeta = z.infer<typeof RedMeta> & { source_links: RedSourceLink[] }

/** 폼 → 저장할 조각. 하나라도 어긋나면 null. */
export function parseRedMeta(formData: FormData): RedMeta | null {
  const get = (k: string) => String(formData.get(k) ?? '')
  const parsed = RedMeta.safeParse({ category: get('category'), red_type: get('red_type'), series: get('series'), subject: get('subject'), title: get('title'), summary: get('summary'), report_date: get('report_date') })
  if (!parsed.success) return null
  const links = parseSourceLinks(get('source_links'))
  if (!links.ok) return null
  return { ...parsed.data, source_links: links.links }
}
