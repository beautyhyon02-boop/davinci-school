/**
 * PostgREST는 기본적으로 한 응답에 최대 1000행만 돌려준다(설정에 따라 다를 수 있으나 기본값 가정 금지 불가).
 * 대주제에 과목이 여러 개면 성취기준이 1000개를 넘을 수 있어 select 한 번으로는 잘릴 수 있다.
 * build(from, to)가 매번 .range(from, to)를 적용한 쿼리를 만들어 넘기면, 마지막 페이지(길이 < pageSize)를
 * 받을 때까지 순차적으로 이어 붙인다.
 */
/** PostgREST 오류는 보통 Error 가 아닌 객체({ message, code, … })다 — 문구와 코드를 잃지 않게 Error 로 옮긴다. */
function toError(error: unknown): Error {
  const e = (typeof error === 'object' && error !== null ? error : {}) as { message?: unknown; code?: unknown }
  const message = typeof e.message === 'string' && e.message ? e.message : String(error)
  return Object.assign(new Error(message, { cause: error }), typeof e.code === 'string' ? { code: e.code } : {})
}

export async function fetchAll<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  pageSize = 1000,
): Promise<T[]> {
  const rows: T[] = []
  let from = 0
  for (;;) {
    const { data, error } = await build(from, from + pageSize - 1)
    if (error) throw error instanceof Error ? error : toError(error)
    const page = data ?? []
    rows.push(...page)
    if (page.length < pageSize) break
    from += pageSize
  }
  return rows
}
