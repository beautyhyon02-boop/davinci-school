/**
 * RED 보고서 폴더의 새 docx 를 스테이징에 올린다(대표 2026-10-15: "RED 보고서 폴더 올려 줘").
 *   npx tsx scripts/upload-red-reports.ts [폴더] [--date YYYY-MM-DD] [--publish]
 * 기본 폴더: 다빈치스쿨 홈페이지 구축/RED 보고서 (하위 폴더 _생성기 등은 보지 않는다). 이미 올린 파일(같은 이름)은 건너뛴다.
 * PRD 2026-10-16: 올리면 검수대기 — 본사 화면에서 [게시]한다. --publish 를 주면 올린 것을 바로 게시한다.
 * .env.local 의 NEXT_PUBLIC_SUPABASE_URL·SUPABASE_SERVICE_ROLE_KEY 로 service role 클라이언트를 만든다 — 본사 컴퓨터에서만 돌린다.
 */
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { ingestRedFiles } from '../lib/red/ingest'
import { todayKst } from '../lib/classroom/notice'

function loadEnv() {
  const p = resolve(process.cwd(), '.env.local')
  if (!existsSync(p)) return
  for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '')
  }
}

async function main() {
  loadEnv()
  const args = process.argv.slice(2)
  const publish = args.includes('--publish')
  const dateIx = args.indexOf('--date')
  const date = dateIx >= 0 && /^\d{4}-\d{2}-\d{2}$/.test(args[dateIx + 1] ?? '') ? args[dateIx + 1] : todayKst()
  const dir = resolve(args.find((a, i) => !a.startsWith('--') && (dateIx < 0 || i !== dateIx + 1)) ?? join('다빈치스쿨 홈페이지 구축', 'RED 보고서'))
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 없습니다(.env.local)')
  const admin = createClient(url, key, { auth: { persistSession: false } })

  const names = readdirSync(dir).filter((n) => /\.docx$/i.test(n) && statSync(join(dir, n)).isFile())
  const files = names.map((name) => { const body = readFileSync(join(dir, name)); return { name, size: body.length, type: '', body: new Uint8Array(body) } })
  const outcomes = await ingestRedFiles(admin, files, { date, createdBy: 'script' })
  let uploaded = 0, skipped = 0, failed = 0
  for (const o of outcomes) {
    if (o.status === 'uploaded') { uploaded += 1; console.log(`올림(${publish ? '게시' : '검수대기'}): ${o.name}`) }
    else if (o.status === 'duplicate') { skipped += 1; console.log(`이미 있음: ${o.name}`) }
    else { failed += 1; console.log(`실패: ${o.name} — ${o.error}`) }
  }
  const ids = outcomes.filter((o) => o.status === 'uploaded' && o.id).map((o) => o.id as string)
  if (publish && ids.length) {
    const { error } = await admin.from('resources').update({ status: 'published', published_at: new Date().toISOString() }).in('id', ids)
    if (error) { console.log(`게시 실패: ${error.message}`); process.exitCode = 1 }
  }
  console.log(`끝 — 올림 ${uploaded} · 이미 있음 ${skipped} · 실패 ${failed} (폴더 ${dir}, 날짜 ${date})`)
  if (failed > 0) process.exitCode = 1
}

main().catch((e) => { console.error(e); process.exit(1) })
