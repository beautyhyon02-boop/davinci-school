/**
 * data/standards/*.json 을 Supabase standards 테이블에 upsert(code 기준)한다.
 *
 * 2026-09-19 호스팅 DB에 1379행 투입 완료. JSON을 다시 추출한 뒤 같은 명령으로
 * 재실행하면 code 기준으로 덮어쓴다.
 *
 *   npx dotenv -e .env.local -- npx tsx scripts/import-standards.ts
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { standardsSchema } from '../lib/standards/parse'

async function main() {
  const { NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env
  if (!NEXT_PUBLIC_SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error(
      'missing env: NEXT_PUBLIC_SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY. ' +
        'run with `npx dotenv -e .env.local -- npx tsx scripts/import-standards.ts`.'
    )
    process.exit(1)
  }

  const dir = 'data/standards'
  const sb = createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })

  for (const f of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
    const rows = standardsSchema.parse(JSON.parse(readFileSync(join(dir, f), 'utf8')))
    const { error } = await sb.from('standards').upsert(rows, { onConflict: 'code' })
    if (error) {
      console.error(f, error.message)
      process.exit(1)
    }
    console.log(`${f}: ${rows.length} rows upserted`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
