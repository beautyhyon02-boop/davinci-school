// PostgREST's `.or()` filter string uses commas to separate conditions and parentheses for
// grouping, so a raw search term containing either (e.g. 사회 codes like `[9사(지리)01-01]`)
// must be wrapped in double quotes rather than stripped of those characters. Only quotes and
// backslashes — which would break out of the quoted value — need to be removed.
export function buildSearchFilter(q: string): string {
  const safe = q.replace(/["\\]/g, '')
  return `code.ilike."%${safe}%",text.ilike."%${safe}%"`
}
