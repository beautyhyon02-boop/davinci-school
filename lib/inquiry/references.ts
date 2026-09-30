import type { InquirySource } from './schema'

/**
 * 참고문헌 한 줄(순수). 대표 샘플 형식:
 *   논문  저자. (연도). 제목. 학술지, 권(호), 쪽. URL
 *   기사  기자. (연도-월-일). 제목. 매체. URL
 *   도서  저자. (연도). 제목. 출판사.
 * 비어 있는 조각은 건너뛴다(빈 괄호·겹친 마침표가 생기지 않게). 참고문헌 순서는 논문 → 기사 → 도서, 같은 종류 안에서는 과제에 적힌 순서.
 */

const KIND_ORDER: Record<InquirySource['kind'], number> = { paper: 0, news: 1, book: 2 }

/** 끝의 마침표를 하나만 남긴다. */
const dot = (s: string) => { const t = s.trim(); return t ? (t.endsWith('.') ? t : `${t}.`) : '' }

export function formatReference(s: InquirySource): string {
  const parts: string[] = []
  const authors = s.authors.trim()
  if (authors) parts.push(dot(authors))
  const when = s.kind === 'news' ? (s.date.trim() || s.year.trim()) : s.year.trim()
  if (when) parts.push(`(${when}).`)
  if (s.title.trim()) parts.push(dot(s.title))
  if (s.kind === 'paper') {
    const venue = [s.container.trim(), s.detail.trim()].filter(Boolean).join(', ')
    if (venue) parts.push(dot(venue))
    if (s.url.trim()) parts.push(s.url.trim())
  } else if (s.kind === 'news') {
    if (s.container.trim()) parts.push(dot(s.container))
    if (s.url.trim()) parts.push(s.url.trim())
  } else {
    if (s.container.trim()) parts.push(dot(s.container))
  }
  return parts.join(' ')
}

/** 학생이 「읽었어요」에 체크한 자료만, 종류 순서로. 모르는 id 는 버린다. */
export function referenceLines(sources: InquirySource[], usedIds: string[]): string[] {
  const used = new Set(usedIds)
  return sources
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => used.has(s.id))
    .sort((a, b) => KIND_ORDER[a.s.kind] - KIND_ORDER[b.s.kind] || a.i - b.i)
    .map(({ s }) => formatReference(s))
}
