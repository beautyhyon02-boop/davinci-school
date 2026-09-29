/**
 * 마이그레이션 0015(`subject` enum 에 '도덕')가 아직 적용되지 않은 DB 에서도 화면이 뜨게 한다.
 *
 * enum 에 없는 값을 조건에 넣으면(`.in('subject', ['사회', …, '도덕'])`) Postgres 가 조회 전체를
 * 22P02 `invalid input value for enum subject: "도덕"` 오류로 돌려준다 — 빈 결과가 아니다. 그래서 그 오류가
 * 바로 그 값 때문일 때만 그 값을 빼고 한 번 더 조회한다(0015 적용 뒤에는 첫 조회가 그대로 성공한다).
 * 다른 오류는 건드리지 않고 그대로 돌려주거나 던진다.
 */

/** 마이그레이션으로 나중에 더해진 subject 값 — enum 에 없을 수 있다. */
export const OPTIONAL_SUBJECTS: readonly string[] = ['도덕']

/** 오류가 "enum 에 없는 값"이면 그 값을, 아니면 null 을 돌려준다. */
export function missingEnumValue(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) return null
  const e = error as { code?: unknown; message?: unknown }
  if (typeof e.code === 'string' && e.code !== '22P02') return null
  const m = /invalid input value for enum\s+\S+:\s*"([^"]*)"/i.exec(typeof e.message === 'string' ? e.message : '')
  return m ? m[1] : null
}

type Log = (message: string) => void

/**
 * run(subjects)를 실행한다. 결과의 `error`(또는 던져진 오류)가 OPTIONAL_SUBJECTS 값이 enum 에 없다는 오류면
 * 그 값을 뺀 목록으로 다시 실행한다. 뺄 값이 없거나 목록이 비게 되면 처음 결과를 그대로 돌려준다(던져진 오류는 다시 던진다).
 */
export async function withOptionalSubjects<T>(
  subjects: readonly string[],
  run: (subjects: string[]) => PromiseLike<T>,
  log: Log = (message) => console.warn(message),
): Promise<T> {
  let list = [...subjects]
  for (;;) {
    let result: T | undefined
    let thrown: unknown
    let failed = false
    try {
      result = await run(list)
    } catch (e) {
      thrown = e
      failed = true
    }
    const error = failed ? thrown : (result as { error?: unknown } | null | undefined)?.error
    const missing = missingEnumValue(error)
    const next = missing !== null && OPTIONAL_SUBJECTS.includes(missing) && list.includes(missing) ? list.filter((s) => s !== missing) : null
    if (next === null || next.length === 0) {
      if (failed) throw thrown
      return result as T
    }
    log(`[subjects] enum 에 '${missing}' 값이 없습니다(마이그레이션 0015 적용 전) — '${missing}' 을(를) 빼고 다시 조회합니다.`)
    list = next
  }
}
