/**
 * RED 보고서 폴더의 새 docx 를 스테이징에 올린다(대표 2026-10-15: "RED 보고서 폴더 올려 줘").
 *   npx tsx scripts/upload-red-reports.ts [폴더] [--date YYYY-MM-DD]
 * 기본 폴더: 다빈치스쿨 홈페이지 구축/RED 보고서 (하위 폴더 _생성기 등은 보지 않는다). 이미 올린 파일(같은 이름)은 건너뛴다.
 * .env.local 의 NEXT_PUBLIC_SUPABASE_URL·SUPABASE_SERVICE_ROLE_KEY 로 service role 클라이언트를 만든다 — 본사 컴퓨터에서만 돌린다.
 */
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { validateRedUpload } from '../lib/red/upload-rules'
import { redStoragePath } from '../lib/red/reports'
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
  const dateIx = args.indexOf('--date')
  const date = dateIx >= 0 && /^\d{4}-\d{2}-\d{2}$/.test(args[dateIx + 1] ?? '') ? args[dateIx + 1] : todayKst()
  const dir = resolve(args.find((a, i) => !a.startsWith('--') && (dateIx < 0 || i !== dateIx + 1)) ?? join('다빈치스쿨 홈페이지 구축', 'RED 보고서'))
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 없습니다(.env.local)')
  const admin = createClient(url, key, { auth: { persistSession: false } })

  const names = readdirSync(dir).filter((n) => /\.docx$/i.test(n) && statSync(join(dir, n)).isFile())
  let uploaded = 0, skipped = 0, failed = 0
  for (const name of names) {
    const buf = readFileSync(join(dir, name))
    const check = validateRedUpload({ name, size: buf.length, type: '' })
    if (!check.ok) { failed += 1; console.log(`실패: ${name} — ${check.error}`); continue }
    const { data: dup } = await admin.from('resources').select('id').eq('filename', name).maybeSingle()
    if (dup) { skipped += 1; console.log(`이미 있음: ${name}`); continue }
    const path = redStoragePath(check.parsed.category, date, name)
    const { error: upErr } = await admin.storage.from('resources').upload(path, buf, { contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', upsert: true })
    if (upErr) { failed += 1; console.log(`실패: ${name} — 저장소 ${upErr.message}`); continue }
    const { error: dbErr } = await admin.from('resources').insert({
      filename: name, description: check.parsed.title, audience: 'teacher', storage_path: path,
      category: check.parsed.category, kind: check.parsed.kind, series: check.parsed.series, subject: check.parsed.subject, title: check.parsed.title,
      report_date: date, hidden: false, size_bytes: buf.length,
    })
    if (dbErr) { await admin.storage.from('resources').remove([path]); failed += 1; console.log(`실패: ${name} — 목록 ${dbErr.message}`); continue }
    uploaded += 1; console.log(`올림: ${name} (${check.parsed.category}, ${check.parsed.kind}, ${date})`)
  }
  console.log(`끝 — 올림 ${uploaded} · 이미 있음 ${skipped} · 실패 ${failed} (폴더 ${dir})`)
  if (failed > 0) process.exitCode = 1
}

main().catch((e) => { console.error(e); process.exit(1) })
