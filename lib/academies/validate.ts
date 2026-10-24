import { z } from 'zod'
import { app } from '@/content/site'
import { PLANS, DEFAULT_PLAN } from '@/lib/academies/plan'
import { isSido, type Sido } from '@/lib/academies/sido'
import { normalizeWebsite } from '@/lib/academies/website'

const errors = app.adminAcademies.errors

const schema = z.object({
  code: z.string().trim().toLowerCase().regex(/^[a-z0-9]{3,12}$/, errors.codeInvalid),
  name: z.string().trim().min(1, errors.nameRequired),
  region: z.string().trim().optional().default(''),
  director_phone: z.string().trim().optional().default(''),
  // 가맹 상품(PRD 2026-10-20): 본사가 계정을 만들 때 고른다. 비어 있으면 서논술 전용.
  plan: z.enum(PLANS).default(DEFAULT_PLAN),
})
export type AcademyInput = z.infer<typeof schema> & MapInput

/** 지도 정보(설계 2026-10-25 §5): 시·도(없으면 null)·홈페이지(정리된 주소 또는 '')·지도 표시. */
export type MapInput = { sido: Sido | null; website: string; show_on_map: boolean }

/**
 * defaultShow: 체크박스 키가 아예 없을 때의 값 — 새 가맹원 폼은 기본 켬(true), 지도 정보 폼은 체크박스가 항상 있으므로 없음 = 껐음(false).
 * 브라우저는 체크 안 된 체크박스를 보내지 않으므로 두 폼 모두 체크박스 앞에 `<input type="hidden" name="show_on_map" value="">` 를 둔다.
 * 그러면 껐을 땐 [''], 켰을 땐 ['', 'on'] 이 오고, 'on' 이 하나라도 있으면 켬이다.
 */
function parseMapFields(formData: FormData, defaultShow: boolean): { ok: true; data: MapInput } | { ok: false; error: string } {
  const sidoRaw = String(formData.get('sido') ?? '').trim()
  if (sidoRaw && !isSido(sidoRaw)) return { ok: false, error: errors.sidoInvalid }
  const website = normalizeWebsite(String(formData.get('website') ?? ''))
  if (website === null) return { ok: false, error: errors.websiteInvalid }
  const show = formData.has('show_on_map') ? formData.getAll('show_on_map').includes('on') : defaultShow
  return { ok: true, data: { sido: sidoRaw ? (sidoRaw as Sido) : null, website, show_on_map: show } }
}

export function parseAcademy(formData: FormData): { ok: true; data: AcademyInput } | { ok: false; error: string } {
  const raw = Object.fromEntries(['code', 'name', 'region', 'director_phone', 'plan'].map(k => [k, formData.get(k) ?? '']))
  if (raw.plan === '') delete (raw as Record<string, unknown>).plan
  const r = schema.safeParse(raw)
  if (!r.success) return { ok: false, error: r.error.issues[0]?.message ?? errors.invalidInput }
  const m = parseMapFields(formData, true)
  if (!m.ok) return m
  return { ok: true, data: { ...r.data, ...m.data } }
}

export function parseAcademyMap(formData: FormData): { ok: true; data: MapInput } | { ok: false; error: string } {
  return parseMapFields(formData, false)
}
