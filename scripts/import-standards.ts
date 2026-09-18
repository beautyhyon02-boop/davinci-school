/**
 * data/standards/*.json 을 Supabase standards 테이블에 upsert(code 기준)한다.
 *
 * 주의: 이 스크립트는 아직 실행하지 않는다. 호스팅된 DB에 아직 마이그레이션이
 * 적용되지 않았기 때문이다. 마이그레이션 적용 후 아래 명령으로 실행한다.
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
