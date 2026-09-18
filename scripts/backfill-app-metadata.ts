/**
 * 기존 auth.users 의 role/academy_id/login_id 를 user_metadata 에서 app_metadata 로 옮긴다.
 * (final-review C1 — 역할 식별자는 service role 만 수정 가능한 app_metadata 에 있어야 한다.)
 *
 * 대상: user_metadata.role 이 있고 app_metadata.role 이 아직 없는 사용자.
 * 결과는 건수만 출력한다(이메일·id 출력 없음). 대상 사용자는 다시 로그인해야 새 JWT 를 받는다.
 *
 *   npx dotenv -e .env.local -- npx tsx scripts/backfill-app-metadata.ts
 */
import { createClient } from '@supabase/supabase-js'

const PER_PAGE = 200

async function main() {
  const { NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env
  if (!NEXT_PUBLIC_SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error(
      'missing env: NEXT_PUBLIC_SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY. ' +
        'run with `npx dotenv -e .env.local -- npx tsx scripts/backfill-app-metadata.ts`.'
    )
    process.exit(1)
  }

  const sb = createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  let scanned = 0
  let updated = 0
  let skipped = 0
  let failed = 0

  for (let page = 1; ; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: PER_PAGE })
    if (error) throw new Error(`listUsers failed: ${error.message}`)
    const users = data.users
    if (users.length === 0) break

    for (const u of users) {
      scanned++
      const um = (u.user_metadata ?? {}) as Record<string, unknown>
      const am = (u.app_metadata ?? {}) as Record<string, unknown>
      if (typeof um.role !== 'string' || !um.role || typeof am.role === 'string') {
        skipped++
        continue
      }
      const { error: upErr } = await sb.auth.admin.updateUserById(u.id, {
        app_metadata: {
          role: um.role,
          academy_id: typeof um.academy_id === 'string' ? um.academy_id : '',
          login_id: typeof um.login_id === 'string' ? um.login_id : '',
        },
      })
      if (upErr) {
        failed++
        console.error(`update failed: ${upErr.message}`)
      } else {
        updated++
      }
    }

    if (users.length < PER_PAGE) break
  }

  console.log(`scanned: ${scanned}, updated: ${updated}, skipped: ${skipped}, failed: ${failed}`)
  if (updated > 0) {
    console.log('reminder: updated users must log out and log in again to receive a JWT with app_metadata.role.')
  }
  if (failed > 0) process.exit(1)
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
