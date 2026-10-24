/**
 * 처음 40곳 등록(대표 2026-10-25, 설계 §6).
 *   npx tsx scripts/import-academies-map.ts <표.csv> [--apply]
 * 기본은 미리 보기(무엇을 넣고 고칠지 표로만). --apply 를 붙여야 쓴다. CSV 는 UTF-8(엑셀: "CSV UTF-8" 로 저장), 머리 줄 이름,시도,홈페이지[,시/군/구][,코드].
 * 이름이 같은 원이 이미 있으면 sido 와 비어 있지 않은 website·region 만 채운다(코드·계정·plan·지도 표시 여부는 그대로). 없으면 새 줄(코드는 표의 것, 없으면 g001 부터). 계정은 만들지 않는다.
 * .env.local 의 NEXT_PUBLIC_SUPABASE_URL·SUPABASE_SERVICE_ROLE_KEY 로 service role — 본사 컴퓨터에서만.
 */
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { parseImportCsv, nextCodes } from '../lib/academies/import-rows'

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
  const apply = args.includes('--apply')
  const file = args.find((a) => !a.startsWith('--'))
  if (!file) throw new Error('CSV 파일 경로를 주세요')
  const { rows, problems } = parseImportCsv(readFileSync(file, 'utf8'))
  for (const p of problems) console.log(`문제: ${p}`)
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 없습니다(.env.local)')
  const admin = createClient(url, key, { auth: { persistSession: false } })
  const { data: existing, error } = await admin.from('academies').select('id, code, name')
  if (error) throw new Error(`academies 읽기 실패: ${error.message}`)
  const byName = new Map((existing ?? []).map((a) => [a.name, a]))
  const codes = (existing ?? []).map((a) => a.code)
  const fresh = nextCodes(codes.concat(rows.map((r) => r.code ?? '')), rows.filter((r) => !r.code && !byName.has(r.name)).length)
  let k = 0
  const plan = rows.map((r) => {
    const hit = byName.get(r.name)
    if (hit) return { kind: '갱신' as const, id: hit.id, code: hit.code, r }
    const code = r.code ?? fresh[k++]
    return { kind: '새로' as const, id: null, code, r }
  })
  for (const p of plan) console.log(`${p.kind} · ${p.r.name} · ${p.r.sido} · ${p.code} · ${p.r.website || '(홈페이지 없음)'}`)
  console.log(`새로 ${plan.filter((p) => p.kind === '새로').length} · 갱신 ${plan.filter((p) => p.kind === '갱신').length} · 문제 ${problems.length}`)
  if (!apply) { console.log('미리 보기만 했습니다. 실제로 넣으려면 --apply 를 붙이세요.'); return }
  for (const p of plan) {
    // 갱신은 sido 와 '비어 있지 않은' website·region 만(기존 값·지도 표시 여부는 건드리지 않음). 새 줄의 show_on_map 은 열 기본값(true).
    const q = p.kind === '갱신'
      ? admin.from('academies').update({ sido: p.r.sido, ...(p.r.website ? { website: p.r.website } : {}), ...(p.r.region ? { region: p.r.region } : {}) }).eq('id', p.id!)
      : admin.from('academies').insert({ code: p.code, name: p.r.name, sido: p.r.sido, website: p.r.website, region: p.r.region || null })
    const { error: e } = await q
    console.log(e ? `실패 · ${p.r.name}: ${e.message}` : `됨 · ${p.kind} · ${p.r.name}`)
  }
}
main().catch((e) => { console.error(e); process.exit(1) })
