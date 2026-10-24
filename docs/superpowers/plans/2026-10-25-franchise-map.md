# 전국 가맹원 지도 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 홈·가맹 안내 페이지에 시·도 경계 지도 + 가맹원 목록 칸을 붙이고, 가맹원 관리에 시·도·홈페이지·지도 표시 칸을 더하고, 처음 40곳을 표로 한 번에 넣는다.

**Architecture:** `academies` 에 칸 셋(`sido`·`website`·`show_on_map`)을 더하고 비로그인에게는 security definer 함수 `public_map_academies()`(이름·시도·홈페이지만)만 연다. 지도 경계는 Natural Earth(공개 도메인) GeoJSON 을 스크립트로 한 번 변환해 `data/map/korea-sido.json`(17개 SVG 경로)으로 커밋한다. 공개 화면은 서버 칸(자료 읽기 → 시·도별 묶기) → 클라이언트 칸(SVG 그리기·누르기·목록) 둘로 나눈다.

**Tech Stack:** Next.js 16 App Router(서버/클라이언트 컴포넌트, `useActionState`), Supabase(PostgREST rpc, RLS 유지), zod 4, Vitest(`renderToStaticMarkup` 화면 시험), tsx 스크립트.

**Spec:** `docs/superpowers/specs/2026-10-25-franchise-map-design.md`

## Global Constraints

- 화면 문구는 전부 `content/site.ts` 에만 둔다(컴포넌트에 한글 글자 없음).
- 비로그인에게 나가는 가맹원 자료는 **이름·시도·홈페이지** 세 칸뿐. 코드·연락처·학생 수·가맹 상품은 나가지 않는다.
- 지도 경계는 손으로 그리지 않는다 — Natural Earth 자료를 변환한 것만 쓰고 출처를 화면에 적는다.
- 마이그레이션은 **파일만** 만든다(`supabase/migrations/20261025000021_academy_map.sql`). 적용은 대표. 다시 실행해도 안전해야 한다(`add column if not exists`, `create or replace`).
- 0021 적용 전에 코드가 배포돼도 공개 페이지는 깨지지 않는다(함수 없음 → 지도 칸을 그리지 않음).
- 커밋은 `git add <정확한 파일들>` 뒤 `git commit` — `git add -A` 금지. 커밋 메시지 끝에 `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- 작업 폴더에 다른 대화의 미커밋 수정(가맹 상품 PRD 2026-10-20: `content/site.ts`·`app/admin/academies/**`·`lib/academies/validate.ts` 등)이 있다. **시작 전에 그 수정을 먼저 커밋한다**(대표 확인 뒤) — 그래야 아래 태스크의 `git add content/site.ts` 가 남의 수정을 끌어오지 않는다.
- Next.js 코드를 쓰기 전에 `node_modules/next/dist/docs/` 의 해당 안내를 읽는다(AGENTS.md).
- 시험 실행: `npx vitest run <파일>`; 전체는 `npm test`. 형 검사: `npx tsc --noEmit -p .`.

## 파일 구조

| 파일 | 책임 |
|---|---|
| `lib/academies/sido.ts` | 시·도 17개 상수·형·판별·긴 이름 → 짧은 이름 대응 |
| `lib/academies/website.ts` | 홈페이지 주소 정리(`normalizeWebsite`) |
| `lib/academies/validate.ts` (수정) | 새 가맹원 폼 + 지도 정보 폼 검증 |
| `lib/academies/map-group.ts` | 공개 지도용 순수 함수 `groupBySido` |
| `lib/academies/public-map.ts` | `public_map_academies` rpc 읽기(없으면 `[]`) |
| `lib/academies/import-rows.ts` | CSV 글자 → 등록 줄(순수, 시험 가능) |
| `lib/map/korea.ts` | `data/map/korea-sido.json` 형·불러오기 |
| `scripts/build-korea-map.ts` | Natural Earth GeoJSON → `korea-sido.json` |
| `scripts/import-academies-map.ts` | CSV → `academies` upsert(기본 미리 보기) |
| `supabase/migrations/20261025000021_academy_map.sql` | 칸 셋 + 공개 읽기 함수 |
| `components/site/FranchiseMap.tsx` | 클라이언트: SVG·칩·목록·고르기 상태 |
| `components/site/FranchiseMapSection.tsx` | 서버: 읽기 → 묶기 → 칸(0곳이면 null) |
| `app/(public)/page.tsx`·`app/(public)/franchise/page.tsx` (수정) | 칸 배치 |
| `app/admin/academies/new/AcademyForm.tsx`·`[id]/MapInfoForm.tsx`·`[id]/page.tsx`·`page.tsx`·`actions.ts` (수정/추가) | 관리 화면 |
| `content/site.ts` (수정) | `pages.franchiseMap`, `app.adminAcademies.*` 문구 |
| `tests/academy-sido.test.ts`·`academy-website.test.ts`·`academy-validate-map.test.ts`·`academy-map-group.test.ts`·`academy-map-migration.test.ts`·`korea-map-data.test.ts`·`franchise-map-view.test.ts`·`academy-import-rows.test.ts` | 시험 |

---

### Task 1: 시·도 목록과 홈페이지 주소 정리

**Files:**
- Create: `lib/academies/sido.ts`
- Create: `lib/academies/website.ts`
- Test: `tests/academy-sido.test.ts`, `tests/academy-website.test.ts`

**Interfaces:**
- Produces: `SIDOS: readonly Sido[]`(17개, 이 순서: 서울·부산·대구·인천·광주·대전·울산·세종·경기·강원·충북·충남·전북·전남·경북·경남·제주), `type Sido`, `isSido(v: unknown): v is Sido`, `toSido(input: string): Sido | null`, `normalizeWebsite(raw: string): string | null`(빈 입력 → `''`, 틀림 → `null`).

- [ ] **Step 1: 실패하는 시험 쓰기**

`tests/academy-sido.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { SIDOS, isSido, toSido } from '@/lib/academies/sido'

// 설계 2026-10-25 §2.1 — 시·도 값은 짧은 이름 17개
describe('시·도', () => {
  it('17개, 겹침 없음, 정해진 순서', () => {
    expect(SIDOS).toEqual(['서울', '부산', '대구', '인천', '광주', '대전', '울산', '세종', '경기', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주'])
    expect(new Set(SIDOS).size).toBe(17)
  })
  it('isSido 는 짧은 이름만 받는다', () => {
    expect(isSido('서울')).toBe(true)
    expect(isSido('서울특별시')).toBe(false)
    expect(isSido('')).toBe(false)
    expect(isSido(null)).toBe(false)
  })
  it('toSido 는 긴 이름·옛 이름·공백을 짧은 이름으로 맞춘다', () => {
    expect(toSido('서울특별시')).toBe('서울')
    expect(toSido(' 경기도 ')).toBe('경기')
    expect(toSido('전라북도')).toBe('전북')
    expect(toSido('전북특별자치도')).toBe('전북')
    expect(toSido('강원특별자치도')).toBe('강원')
    expect(toSido('강원도')).toBe('강원')
    expect(toSido('충청북도')).toBe('충북')
    expect(toSido('충청남도')).toBe('충남')
    expect(toSido('전라남도')).toBe('전남')
    expect(toSido('경상북도')).toBe('경북')
    expect(toSido('경상남도')).toBe('경남')
    expect(toSido('제주특별자치도')).toBe('제주')
    expect(toSido('세종특별자치시')).toBe('세종')
    expect(toSido('부산광역시')).toBe('부산')
    expect(toSido('대구')).toBe('대구')
  })
  it('모르는 이름은 null — 지어내지 않는다', () => {
    expect(toSido('평양')).toBeNull()
    expect(toSido('')).toBeNull()
    expect(toSido('경')).toBeNull()
  })
})
```

`tests/academy-website.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { normalizeWebsite } from '@/lib/academies/website'

// 설계 2026-10-25 §5 — 홈페이지 주소: 비었거나 http(s) 주소. 스킴이 없으면 https:// 를 붙인다.
describe('normalizeWebsite', () => {
  it('빈 입력은 빈 글자(홈페이지 없음)', () => {
    expect(normalizeWebsite('')).toBe('')
    expect(normalizeWebsite('   ')).toBe('')
  })
  it('스킴 없는 주소에 https:// 를 붙이고 앞뒤 공백을 지운다', () => {
    expect(normalizeWebsite(' www.davinci-lab.co.kr ')).toBe('https://www.davinci-lab.co.kr/')
    expect(normalizeWebsite('example.com/about')).toBe('https://example.com/about')
  })
  it('http·https 는 그대로(호스트는 소문자로)', () => {
    expect(normalizeWebsite('http://Example.com/A')).toBe('http://example.com/A')
    expect(normalizeWebsite('https://blog.naver.com/abc')).toBe('https://blog.naver.com/abc')
  })
  it('틀린 주소는 null', () => {
    expect(normalizeWebsite('javascript:alert(1)')).toBeNull()
    expect(normalizeWebsite('ftp://example.com')).toBeNull()
    expect(normalizeWebsite('localhost')).toBeNull()          // 점 없는 호스트
    expect(normalizeWebsite('not a url')).toBeNull()
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run tests/academy-sido.test.ts tests/academy-website.test.ts`
Expected: FAIL — `Cannot find module '@/lib/academies/sido'`

- [ ] **Step 3: 구현**

`lib/academies/sido.ts`:
```ts
/**
 * 시·도(설계 2026-10-25 §2.1). DB `academies.sido` 와 지도 자료(`data/map/korea-sido.json`)가 같은 짧은 이름을 쓴다.
 * 순서는 화면의 칩·목록 순서다(수도권 → 광역시 → 도).
 */
export const SIDOS = ['서울', '부산', '대구', '인천', '광주', '대전', '울산', '세종', '경기', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주'] as const
export type Sido = (typeof SIDOS)[number]

export function isSido(v: unknown): v is Sido {
  return typeof v === 'string' && (SIDOS as readonly string[]).includes(v)
}

/** 긴 이름·옛 이름 → 짧은 이름. 대표가 주는 표(「전라북도」·「전북특별자치도」 …)를 맞추는 데 쓴다. 모르면 null(지어내지 않음). */
const LONG: Record<string, Sido> = {
  서울특별시: '서울', 부산광역시: '부산', 대구광역시: '대구', 인천광역시: '인천', 광주광역시: '광주', 대전광역시: '대전', 울산광역시: '울산',
  세종특별자치시: '세종', 세종시: '세종', 경기도: '경기', 강원도: '강원', 강원특별자치도: '강원', 충청북도: '충북', 충청남도: '충남',
  전라북도: '전북', 전북특별자치도: '전북', 전라남도: '전남', 경상북도: '경북', 경상남도: '경남', 제주특별자치도: '제주', 제주도: '제주',
}
export function toSido(input: string): Sido | null {
  const s = input.replace(/\s+/g, '')
  if (isSido(s)) return s
  return LONG[s] ?? null
}
```

`lib/academies/website.ts`:
```ts
/**
 * 홈페이지 주소 정리(설계 2026-10-25 §5). '' = 홈페이지 없음(지도에서 이름만), null = 틀린 주소(거절).
 * 스킴이 없으면 https:// 를 붙이고, http/https 만 받고, 호스트에 점이 있어야 한다.
 */
export function normalizeWebsite(raw: string): string | null {
  const s = raw.trim()
  if (!s) return ''
  if (/\s/.test(s)) return null
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(s) ? s : `https://${s}`
  let u: URL
  try { u = new URL(withScheme) } catch { return null }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
  if (!u.hostname.includes('.')) return null
  return u.toString()
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run tests/academy-sido.test.ts tests/academy-website.test.ts`
Expected: PASS (두 파일)

- [ ] **Step 5: 커밋**

```bash
git add lib/academies/sido.ts lib/academies/website.ts tests/academy-sido.test.ts tests/academy-website.test.ts
git commit -m "feat(academies): 시·도 17개 상수·긴 이름 대응, 홈페이지 주소 정리(가맹원 지도 설계 §2.1·§5)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: 마이그레이션 0021 + 글자 시험

**Files:**
- Create: `supabase/migrations/20261025000021_academy_map.sql`
- Test: `tests/academy-map-migration.test.ts`

**Interfaces:**
- Produces: DB 칸 `academies.sido text`, `academies.website text not null default ''`, `academies.show_on_map boolean not null default true`; 함수 `public.public_map_academies() returns table (name text, sido text, website text)` — anon·authenticated 실행 허용.

- [ ] **Step 1: 실패하는 시험 쓰기**

`tests/academy-map-migration.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { SIDOS } from '@/lib/academies/sido'

// 설계 2026-10-25 §2 — 공개 함수는 이름·시도·홈페이지만 돌려준다. RLS 는 바꾸지 않는다.
const sql = readFileSync('supabase/migrations/20261025000021_academy_map.sql', 'utf8')

describe('마이그레이션 0021', () => {
  it('칸 셋을 "있으면 건너뜀"으로 더한다', () => {
    expect(sql).toMatch(/alter table academies add column if not exists sido text/)
    expect(sql).toMatch(/alter table academies add column if not exists website text not null default ''/)
    expect(sql).toMatch(/alter table academies add column if not exists show_on_map boolean not null default true/)
  })
  it('sido 의 check 는 코드의 17개와 같다', () => {
    for (const s of SIDOS) expect(sql).toContain(`'${s}'`)
  })
  it('공개 함수는 이름·시도·홈페이지만, anon 에게 실행 허용, RLS 정책은 건드리지 않는다', () => {
    expect(sql).toMatch(/create or replace function public\.public_map_academies\(\)\s*returns table \(name text, sido text, website text\)/)
    expect(sql).toMatch(/select name, sido, website from academies\s+where active and show_on_map and sido is not null/)
    expect(sql).toMatch(/grant execute on function public\.public_map_academies\(\) to anon, authenticated/)
    expect(sql).not.toMatch(/create policy|drop policy/)
    expect(sql).not.toMatch(/director_phone|code|plan/)
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run tests/academy-map-migration.test.ts`
Expected: FAIL — `ENOENT … 20261025000021_academy_map.sql`

- [ ] **Step 3: 마이그레이션 파일 쓰기**

`supabase/migrations/20261025000021_academy_map.sql`:
```sql
-- 전국 가맹원 지도(대표 2026-10-25, 설계 docs/superpowers/specs/2026-10-25-franchise-map-design.md §2).
-- 파일만 만든다 — 적용(supabase db push 또는 SQL Editor)은 본사. 다시 실행해도 안전하다("있으면 건너뜀"). 0020(가맹 상품)과 독립.

alter table academies add column if not exists sido text
  check (sido is null or sido in ('서울','부산','대구','인천','광주','대전','울산','세종','경기','강원','충북','충남','전북','전남','경북','경남','제주'));
alter table academies add column if not exists website text not null default '';
alter table academies add column if not exists show_on_map boolean not null default true;

comment on column academies.sido is '시·도 짧은 이름 17개(lib/academies/sido.ts 와 같다). 비어 있으면 지도에 나오지 않는다.';
comment on column academies.website is '홈페이지 주소(https://…). 비어 있으면 지도에서 이름만.';
comment on column academies.show_on_map is '홈페이지 지도에 보일지. 본사만 바꾼다.';

-- 비로그인 지도용 읽기: 이름·시도·홈페이지 세 칸만. academies 의 RLS(관리자 전체·원장 자기 원)는 그대로 — anon 에게 표를 열지 않는다.
create or replace function public.public_map_academies()
returns table (name text, sido text, website text)
language sql stable security definer set search_path = public as
$$ select name, sido, website from academies
   where active and show_on_map and sido is not null order by sido, name $$;
grant execute on function public.public_map_academies() to anon, authenticated;
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run tests/academy-map-migration.test.ts`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add supabase/migrations/20261025000021_academy_map.sql tests/academy-map-migration.test.ts
git commit -m "feat(db): 마이그레이션 0021 — academies.sido·website·show_on_map, 공개 지도용 함수 public_map_academies(이름·시도·홈페이지만)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: 지도 자료 — Natural Earth → `data/map/korea-sido.json`

**Files:**
- Create: `scripts/build-korea-map.ts`
- Create: `lib/map/korea.ts`
- Create: `data/map/korea-sido.json` (스크립트가 만든다)
- Test: `tests/korea-map-data.test.ts`

**Interfaces:**
- Produces: `KOREA_MAP: KoreaMapData` with `type KoreaMapData = { viewBox: string; source: string; sidos: { code: Sido; d: string; label: [number, number] }[]; markers: { name: string; x: number; y: number }[] }`.

- [ ] **Step 1: 실패하는 시험 쓰기**

`tests/korea-map-data.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { KOREA_MAP } from '@/lib/map/korea'
import { SIDOS } from '@/lib/academies/sido'

// 설계 2026-10-25 §3 — Natural Earth 변환 결과. 17개 모두, 경로 비지 않음, 숫자 자리 두 수.
describe('korea-sido.json', () => {
  it('17개 시·도가 한 번씩, 코드는 SIDOS 와 같다', () => {
    expect(KOREA_MAP.sidos.map((s) => s.code).sort()).toEqual([...SIDOS].sort())
    expect(new Set(KOREA_MAP.sidos.map((s) => s.code)).size).toBe(17)
  })
  it('경로는 비지 않고 M 으로 시작, 숫자 자리는 viewBox 안', () => {
    const [, , w, h] = KOREA_MAP.viewBox.split(' ').map(Number)
    for (const s of KOREA_MAP.sidos) {
      expect(s.d.length).toBeGreaterThan(20)
      expect(s.d.startsWith('M')).toBe(true)
      const [x, y] = s.label
      expect(x).toBeGreaterThan(0); expect(x).toBeLessThan(w)
      expect(y).toBeGreaterThan(0); expect(y).toBeLessThan(h)
    }
  })
  it('viewBox 는 너비 600, 출처는 Natural Earth, 독도 표식이 있다', () => {
    expect(KOREA_MAP.viewBox).toMatch(/^0 0 600 \d+$/)
    expect(KOREA_MAP.source).toContain('Natural Earth')
    expect(KOREA_MAP.markers.map((m) => m.name)).toContain('독도')
  })
  it('파일 크기가 200KB 아래(공개 페이지 무게)', () => {
    expect(JSON.stringify(KOREA_MAP).length).toBeLessThan(200_000)
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run tests/korea-map-data.test.ts`
Expected: FAIL — `Cannot find module '@/lib/map/korea'`

- [ ] **Step 3: 원본 내려받기(커밋하지 않음)**

Natural Earth 1:10m Admin 1(공개 도메인)의 GeoJSON. 스크래치 폴더에 둔다(`.gitignore` 밖, 커밋 금지):

```bash
curl -L -o "$TMP/ne_10m_admin_1_states_provinces.geojson" https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_1_states_provinces.geojson
```
(PowerShell 이면 `Invoke-WebRequest -OutFile`.) 파일이 20MB 넘으면 정상. 받은 파일에서 `adm0_a3 == "KOR"` 인 feature 가 17개인지 스크립트가 확인한다.

- [ ] **Step 4: 형·불러오기 쓰기**

`lib/map/korea.ts`:
```ts
import data from '@/data/map/korea-sido.json'
import type { Sido } from '@/lib/academies/sido'

/** 시·도 경계 SVG 자료(설계 2026-10-25 §3). scripts/build-korea-map.ts 가 Natural Earth 에서 만든다 — 손으로 고치지 않는다. */
export type KoreaMapData = {
  viewBox: string
  source: string
  sidos: { code: Sido; d: string; label: [number, number] }[]
  markers: { name: string; x: number; y: number }[]
}
export const KOREA_MAP = data as KoreaMapData
```
`tsconfig.json` 에 `resolveJsonModule: true` 가 없으면 더한다(있는지 `grep resolveJsonModule tsconfig.json` 으로 확인).

- [ ] **Step 5: 변환 스크립트 쓰기**

`scripts/build-korea-map.ts`:
```ts
/**
 * Natural Earth 1:10m Admin 1 GeoJSON → data/map/korea-sido.json (설계 2026-10-25 §3).
 *   npx tsx scripts/build-korea-map.ts <ne_10m_admin_1_states_provinces.geojson>
 * 대한민국(adm0_a3 KOR) 17개 시·도만 골라 단순 투영(경도·위도 → 픽셀, 위도 36° 기준 가로 축소)으로 SVG 경로를 만든다.
 * 이름 대응이 안 되는 feature 가 있거나 17개가 아니면 멈춘다 — 지어내지 않는다.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { SIDOS, type Sido } from '../lib/academies/sido'

type Ring = [number, number][]
type Feature = { properties: Record<string, unknown>; geometry: { type: 'Polygon' | 'MultiPolygon'; coordinates: number[][][] | number[][][][] } }

/** Natural Earth 영문 이름(소문자, -do/-si/공백 제거) 앞머리 → 시·도 */
const NAME_PREFIX: [string, Sido][] = [
  ['seoul', '서울'], ['busan', '부산'], ['daegu', '대구'], ['incheon', '인천'], ['gwangju', '광주'], ['daejeon', '대전'], ['ulsan', '울산'], ['sejong', '세종'],
  ['gyeonggi', '경기'], ['gangwon', '강원'], ['chungcheongbuk', '충북'], ['northchungcheong', '충북'], ['chungcheongnam', '충남'], ['southchungcheong', '충남'],
  ['jeollabuk', '전북'], ['northjeolla', '전북'], ['jeonbuk', '전북'], ['jeollanam', '전남'], ['southjeolla', '전남'], ['jeonnam', '전남'],
  ['gyeongsangbuk', '경북'], ['northgyeongsang', '경북'], ['gyeongbuk', '경북'], ['gyeongsangnam', '경남'], ['southgyeongsang', '경남'], ['gyeongnam', '경남'], ['jeju', '제주'],
]
function sidoOf(p: Record<string, unknown>): Sido | null {
  const ko = typeof p.name_ko === 'string' ? p.name_ko.replace(/\s+/g, '') : ''
  for (const s of SIDOS) if (ko.startsWith(s)) return s
  for (const key of ['name', 'name_en', 'gn_name', 'woe_name']) {
    const v = typeof p[key] === 'string' ? (p[key] as string).toLowerCase().replace(/-do$|-si$|-teukbyeolsi$|-gwangyeoksi$/g, '').replace(/[\s-]/g, '') : ''
    for (const [prefix, s] of NAME_PREFIX) if (v.startsWith(prefix)) return s
  }
  return null
}

// 투영: 경도 124.5~132.0, 위도 33.0~38.7. 가로는 cos(36°) 로 줄여 실제 모양에 가깝게. 너비 600 고정, 높이는 비율대로.
const LON0 = 124.5, LON1 = 132.0, LAT0 = 33.0, LAT1 = 38.7, W = 600, PAD = 10
const K = Math.cos((36 * Math.PI) / 180)
const SCALE = (W - PAD * 2) / ((LON1 - LON0) * K)
const H = Math.round((LAT1 - LAT0) * SCALE + PAD * 2)
const px = (lon: number) => +(PAD + (lon - LON0) * K * SCALE).toFixed(1)
const py = (lat: number) => +(PAD + (LAT1 - lat) * SCALE).toFixed(1)
const project = (ring: number[][]): Ring => ring.map(([lon, lat]) => [px(lon), py(lat)])

function area(r: Ring): number { let a = 0; for (let i = 0; i < r.length; i++) { const [x1, y1] = r[i], [x2, y2] = r[(i + 1) % r.length]; a += x1 * y2 - x2 * y1 } return Math.abs(a) / 2 }
function centroid(r: Ring): [number, number] {
  let a = 0, cx = 0, cy = 0
  for (let i = 0; i < r.length; i++) { const [x1, y1] = r[i], [x2, y2] = r[(i + 1) % r.length]; const f = x1 * y2 - x2 * y1; a += f; cx += (x1 + x2) * f; cy += (y1 + y2) * f }
  a /= 2; return [+(cx / (6 * a)).toFixed(1), +(cy / (6 * a)).toFixed(1)]
}
const MIN_AREA = 4 // px² — 이보다 작은 섬(약 2~3km²)은 뺀다. 울릉도는 남고 독도는 표식으로 따로 찍는다.
/** 숫자 자리 보정(작거나 치우친 곳). 경기의 중심은 서울 쪽으로 쏠리므로 바깥으로 민다. 화면을 보고 맞춘 값. */
const LABEL_OFFSET: Partial<Record<Sido, [number, number]>> = {}

function main() {
  const src = process.argv[2]
  if (!src) throw new Error('GeoJSON 파일 경로를 주세요')
  const fc = JSON.parse(readFileSync(src, 'utf8')) as { features: Feature[] }
  const kr = fc.features.filter((f) => f.properties.adm0_a3 === 'KOR' || f.properties.iso_a2 === 'KR')
  const out: { code: Sido; d: string; label: [number, number] }[] = []
  const seen = new Set<Sido>()
  for (const f of kr) {
    const code = sidoOf(f.properties)
    if (!code) throw new Error(`이름 대응 실패: ${JSON.stringify({ name: f.properties.name, name_ko: f.properties.name_ko })}`)
    if (seen.has(code)) throw new Error(`시·도 겹침: ${code}`)
    seen.add(code)
    const polys: number[][][][] = f.geometry.type === 'Polygon' ? [f.geometry.coordinates as number[][][]] : (f.geometry.coordinates as number[][][][])
    const rings = polys.map((poly) => project(poly[0])) // 바깥 고리만(구멍 없음)
    const largest = rings.reduce((a, b) => (area(a) >= area(b) ? a : b))
    const kept = rings.filter((r) => r === largest || area(r) >= MIN_AREA)
    const d = kept.map((r) => 'M' + r.map(([x, y]) => `${x},${y}`).join('L') + 'Z').join('')
    const [cx, cy] = centroid(largest)
    const [dx, dy] = LABEL_OFFSET[code] ?? [0, 0]
    out.push({ code, d, label: [+(cx + dx).toFixed(1), +(cy + dy).toFixed(1)] })
  }
  if (out.length !== 17) throw new Error(`시·도가 17개가 아님: ${out.length} (${[...seen].join(', ')})`)
  out.sort((a, b) => SIDOS.indexOf(a.code) - SIDOS.indexOf(b.code))
  const data = {
    viewBox: `0 0 ${W} ${H}`,
    source: 'Natural Earth 1:10m Admin 1 – States, Provinces (public domain), naturalearthdata.com',
    sidos: out,
    markers: [{ name: '독도', x: px(131.87), y: py(37.24) }],
  }
  mkdirSync('data/map', { recursive: true })
  writeFileSync('data/map/korea-sido.json', JSON.stringify(data))
  console.log(`썼음: data/map/korea-sido.json (${JSON.stringify(data).length} bytes, viewBox ${data.viewBox})`)
}
main()
```

- [ ] **Step 6: 실행·시험**

```bash
npx tsx scripts/build-korea-map.ts "$TMP/ne_10m_admin_1_states_provinces.geojson"
npx vitest run tests/korea-map-data.test.ts
```
Expected: "썼음 …", PASS. 이름 대응 실패로 멈추면 오류에 찍힌 `name`/`name_ko` 를 보고 `NAME_PREFIX` 에 **그 자료의 실제 이름**을 더한다(17개 외의 이름을 만들어 넣지 않는다). 세종이 자료에 없으면(옛 판) 멈춘 채로 보고한다 — 다른 판(natural-earth-vector master 는 5.x, 세종 있음)을 받는다.

- [ ] **Step 7: 커밋**

```bash
git add scripts/build-korea-map.ts lib/map/korea.ts data/map/korea-sido.json tests/korea-map-data.test.ts
git commit -m "feat(map): Natural Earth 시·도 경계 → data/map/korea-sido.json(17개 SVG 경로·숫자 자리·독도 표식), 변환 스크립트

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```
(`tsconfig.json` 을 고쳤으면 같이 add.)

---

### Task 4: 시·도별 묶기 + 공개 읽기

**Files:**
- Create: `lib/academies/map-group.ts`
- Create: `lib/academies/public-map.ts`
- Test: `tests/academy-map-group.test.ts`

**Interfaces:**
- Produces: `type MapAcademy = { name: string; sido: Sido; website: string }`, `type SidoGroup = { count: number; items: MapAcademy[] }`, `type MapGroups = { total: number; bySido: Partial<Record<Sido, SidoGroup>> }`, `groupBySido(rows: MapAcademy[]): MapGroups`, `loadMapAcademies(db: SupabaseClient): Promise<MapAcademy[]>`.

- [ ] **Step 1: 실패하는 시험 쓰기**

`tests/academy-map-group.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest'
import { groupBySido } from '@/lib/academies/map-group'
import { loadMapAcademies } from '@/lib/academies/public-map'

// 설계 2026-10-25 §4.3
const rows = [
  { name: '하늘원', sido: '경기' as const, website: 'https://a.example.com/' },
  { name: '가온원', sido: '경기' as const, website: '' },
  { name: '바다원', sido: '부산' as const, website: 'https://b.example.com/' },
]
describe('groupBySido', () => {
  it('시·도별 수와 이름 순 목록, 전체 수', () => {
    const g = groupBySido(rows)
    expect(g.total).toBe(3)
    expect(g.bySido.경기?.count).toBe(2)
    expect(g.bySido.경기?.items.map((a) => a.name)).toEqual(['가온원', '하늘원'])
    expect(g.bySido.부산?.count).toBe(1)
    expect(g.bySido.서울).toBeUndefined()
  })
  it('비어 있으면 total 0', () => {
    expect(groupBySido([])).toEqual({ total: 0, bySido: {} })
  })
  it('모르는 시·도 값은 버린다(지도에 자리가 없다)', () => {
    const g = groupBySido([{ name: 'x', sido: '평양' as never, website: '' }])
    expect(g.total).toBe(0)
  })
})

describe('loadMapAcademies', () => {
  const db = (rpc: () => Promise<{ data: unknown; error: unknown }>) => ({ rpc } as never)
  it('rpc 결과를 돌려주고 시·도가 틀린 줄은 버린다', async () => {
    const got = await loadMapAcademies(db(async () => ({ data: [{ name: 'a', sido: '서울', website: '' }, { name: 'b', sido: '없음', website: '' }], error: null })))
    expect(got).toEqual([{ name: 'a', sido: '서울', website: '' }])
  })
  it('함수가 없으면(0021 전, PGRST202) 빈 목록 — 기록 없이', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const got = await loadMapAcademies(db(async () => ({ data: null, error: { code: 'PGRST202', message: 'Could not find the function public.public_map_academies' } })))
    expect(got).toEqual([])
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })
  it('다른 오류도 빈 목록이지만 기록을 남긴다', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await loadMapAcademies(db(async () => ({ data: null, error: { code: '42501', message: 'permission denied' } })))).toEqual([])
    expect(spy).toHaveBeenCalledTimes(1)
    spy.mockRestore()
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run tests/academy-map-group.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현**

`lib/academies/map-group.ts`:
```ts
import { isSido, type Sido } from './sido'

/** 공개 지도에 나가는 가맹원 한 줄 — 이름·시도·홈페이지뿐(설계 2026-10-25 §2.2). */
export type MapAcademy = { name: string; sido: Sido; website: string }
export type SidoGroup = { count: number; items: MapAcademy[] }
export type MapGroups = { total: number; bySido: Partial<Record<Sido, SidoGroup>> }

/** 시·도별로 묶고 이름 순으로. 시·도가 17개 밖이면 버린다(지도에 자리가 없다). */
export function groupBySido(rows: MapAcademy[]): MapGroups {
  const bySido: Partial<Record<Sido, SidoGroup>> = {}
  let total = 0
  for (const r of rows) {
    if (!isSido(r.sido)) continue
    const g = (bySido[r.sido] ??= { count: 0, items: [] })
    g.items.push(r); g.count += 1; total += 1
  }
  for (const g of Object.values(bySido)) g!.items.sort((a, b) => a.name.localeCompare(b.name, 'ko'))
  return { total, bySido }
}
```

`lib/academies/public-map.ts`:
```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import { isSido } from './sido'
import type { MapAcademy } from './map-group'

/** 함수가 없어서 난 오류인가(마이그레이션 0021 전). PostgREST PGRST202. */
function isMissingFunction(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const e = error as { code?: unknown; message?: unknown }
  if (e.code === 'PGRST202') return true
  return typeof e.message === 'string' && /could not find the function/i.test(e.message)
}

/** 비로그인 지도용 읽기(설계 2026-10-25 §4.3). 함수 없음·오류는 빈 목록 — 화면은 지도 칸을 그리지 않는다. */
export async function loadMapAcademies(db: SupabaseClient): Promise<MapAcademy[]> {
  const { data, error } = await db.rpc('public_map_academies')
  if (error) {
    if (!isMissingFunction(error)) console.error('[public_map_academies] read failed', error)
    return []
  }
  const rows = (data ?? []) as { name: string; sido: string; website: string }[]
  return rows.filter((r): r is MapAcademy => isSido(r.sido)).map((r) => ({ name: r.name, sido: r.sido, website: r.website ?? '' }))
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run tests/academy-map-group.test.ts`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add lib/academies/map-group.ts lib/academies/public-map.ts tests/academy-map-group.test.ts
git commit -m "feat(academies): 공개 지도용 읽기(public_map_academies, 없으면 빈 목록)와 시·도별 묶기

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: 지도 화면 칸(클라이언트) + 문구 + 화면 시험

**Files:**
- Create: `components/site/FranchiseMap.tsx`
- Modify: `content/site.ts` — `pages` 에 `franchiseMap` 블록 추가(`franchise:` 블록 바로 위)
- Test: `tests/franchise-map-view.test.ts`, `tests/site-content.test.ts`(문구 한 줄)

**Interfaces:**
- Consumes: `KOREA_MAP`(Task 3), `MapGroups`·`SidoGroup`(Task 4), `SIDOS`(Task 1).
- Produces: `FranchiseMap({ groups }: { groups: MapGroups })` 클라이언트 컴포넌트.

- [ ] **Step 1: 문구 추가**

`content/site.ts` 의 `export const pages = {` 안, `franchise: {` 바로 위에:
```ts
  // 전국 가맹원 지도(대표 2026-10-25, 설계 2026-10-25-franchise-map-design.md §4). 나가는 자료는 이름·시도·홈페이지뿐.
  franchiseMap: {
    eyebrow: 'NATIONWIDE',
    title: '전국 가맹원',
    total: (n: number) => `전국 가맹원 ${n}곳`,
    allChip: '전체',
    chip: (sido: string, n: number) => `${sido} ${n}`,
    regionAria: (sido: string, n: number) => `${sido} ${n}곳`,
    none: (sido: string) => `${sido}에는 아직 가맹원이 없습니다.`,
    newWindow: '새 창에서 열림',
    credit: '지도: Natural Earth',
    dokdo: '독도',
  },
```

`tests/site-content.test.ts` 의 `pages` 문구 절(`pages.franchise` 를 보는 `it`)에 더한다:
```ts
  it('exposes franchise map copy', () => {
    expect(pages.franchiseMap.title).toBeTruthy()
    expect(pages.franchiseMap.total(3)).toContain('3')
    expect(pages.franchiseMap.chip('서울', 2)).toBe('서울 2')
    expect(pages.franchiseMap.none('세종')).toContain('세종')
    expect(pages.franchiseMap.credit).toContain('Natural Earth')
  })
```
(`pages` 가 그 파일에 import 돼 있지 않으면 `import { site, app, pages } from '@/content/site'` 로.)

- [ ] **Step 2: 실패하는 화면 시험 쓰기**

`tests/franchise-map-view.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { FranchiseMap } from '@/components/site/FranchiseMap'
import { groupBySido } from '@/lib/academies/map-group'
import { pages } from '@/content/site'

// 설계 2026-10-25 §4.2 — 서버 렌더(고르기 전 = 전체 보기)
const copy = pages.franchiseMap
const rows = [
  { name: '하늘원', sido: '경기' as const, website: 'https://a.example.com/' },
  { name: '가온원', sido: '경기' as const, website: '' },
  { name: '바다원', sido: '부산' as const, website: 'https://b.example.com/' },
]
const html = renderToStaticMarkup(createElement(FranchiseMap, { groups: groupBySido(rows) }))

describe('FranchiseMap', () => {
  it('17개 시·도 경로를 그리고 가맹원 있는 곳에 숫자를 찍는다', () => {
    expect(html.split('<path').length - 1).toBe(17)
    expect(html).toContain(`aria-label="${copy.regionAria('경기', 2)}"`)
    expect(html).toContain(`aria-label="${copy.regionAria('부산', 1)}"`)
    expect(html).toContain(`aria-label="${copy.regionAria('서울', 0)}"`)
    expect(html).toMatch(/<text[^>]*>2<\/text>/)
  })
  it('전체 수·시·도 칩(있는 곳만)·이름 한 줄에 하나', () => {
    expect(html).toContain(copy.total(3))
    expect(html).toContain(copy.chip('경기', 2))
    expect(html).toContain(copy.chip('부산', 1))
    expect(html).not.toContain(copy.chip('서울', 0))
    expect(html.indexOf('가온원')).toBeLessThan(html.indexOf('하늘원'))
  })
  it('홈페이지 있는 원만 새 창 링크', () => {
    expect(html).toContain('href="https://a.example.com/" target="_blank" rel="noopener noreferrer"')
    expect(html).not.toContain('href="https://b.example.com/x')
    expect(html).toMatch(/<li[^>]*>\s*<span[^>]*>가온원<\/span>/)
  })
  it('출처와 독도 표식', () => {
    expect(html).toContain(copy.credit)
    expect(html).toContain(copy.dokdo)
  })
  it('연락처·코드 같은 칸은 애초에 받지 않는다', () => {
    expect(html).not.toMatch(/010-|director|code/)
  })
})
```

- [ ] **Step 3: 실패 확인**

Run: `npx vitest run tests/franchise-map-view.test.ts tests/site-content.test.ts`
Expected: FAIL — `FranchiseMap` 모듈 없음(문구 시험은 PASS)

- [ ] **Step 4: 컴포넌트 쓰기**

`node_modules/next/dist/docs/` 에서 클라이언트 컴포넌트 안내를 먼저 읽는다. 그다음 `components/site/FranchiseMap.tsx`:
```tsx
'use client'
import { useState } from 'react'
import { KOREA_MAP } from '@/lib/map/korea'
import { SIDOS, type Sido } from '@/lib/academies/sido'
import type { MapGroups, MapAcademy } from '@/lib/academies/map-group'
import { pages } from '@/content/site'

const copy = pages.franchiseMap

/**
 * 전국 가맹원 지도(설계 2026-10-25 §4.2): 왼쪽 SVG(가맹원 있는 시·도 민트 + 숫자), 오른쪽 전체 수·시·도 칩·이름 목록.
 * 시·도를 고르면(경로 또는 칩) 그 지역만; 고르지 않으면 전체를 시·도별 작은 제목 아래에. 홈페이지 있는 원만 새 창 링크.
 */
export function FranchiseMap({ groups }: { groups: MapGroups }) {
  const [picked, setPicked] = useState<Sido | null>(null)
  const count = (s: Sido) => groups.bySido[s]?.count ?? 0
  const toggle = (s: Sido) => setPicked((p) => (p === s ? null : s))
  const present = SIDOS.filter((s) => count(s) > 0)
  const shown: Sido[] = picked ? [picked] : present

  return (
    <div className="grid gap-8 md:grid-cols-[1.1fr_1fr]">
      <svg viewBox={KOREA_MAP.viewBox} role="group" className="w-full max-w-xl" aria-label={copy.title}>
        {KOREA_MAP.sidos.map((s) => {
          const n = count(s.code)
          const fill = picked === s.code ? 'fill-mint-300' : n > 0 ? 'fill-mint-200 hover:fill-mint-300' : 'fill-ink-100 hover:fill-ink-300/60'
          return (
            <path
              key={s.code}
              d={s.d}
              role="button"
              tabIndex={0}
              aria-label={copy.regionAria(s.code, n)}
              aria-pressed={picked === s.code}
              className={`cursor-pointer stroke-white stroke-[1.5] transition ${fill} ${picked === s.code ? 'stroke-mint-700' : ''}`}
              onClick={() => toggle(s.code)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(s.code) } }}
            />
          )
        })}
        {KOREA_MAP.sidos.filter((s) => count(s.code) > 0).map((s) => (
          <text key={s.code} x={s.label[0]} y={s.label[1]} textAnchor="middle" dominantBaseline="central" className="pointer-events-none fill-mint-700 text-[22px] font-extrabold">{count(s.code)}</text>
        ))}
        {KOREA_MAP.markers.map((m) => (
          <g key={m.name}>
            <circle cx={m.x} cy={m.y} r={2.5} className="fill-ink-300" />
            <text x={m.x + 5} y={m.y} dominantBaseline="central" className="fill-ink-500 text-[11px]">{m.name === '독도' ? copy.dokdo : m.name}</text>
          </g>
        ))}
      </svg>
      <div>
        <p className="text-xl font-extrabold">{copy.total(groups.total)}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={() => setPicked(null)} aria-pressed={picked === null} className={`rounded-full px-3 py-1 text-sm ${picked === null ? 'bg-mint-700 text-white' : 'bg-ink-100 text-ink-700'}`}>{copy.allChip}</button>
          {present.map((s) => (
            <button key={s} type="button" onClick={() => toggle(s)} aria-pressed={picked === s} className={`rounded-full px-3 py-1 text-sm ${picked === s ? 'bg-mint-700 text-white' : 'bg-ink-100 text-ink-700'}`}>{copy.chip(s, count(s))}</button>
          ))}
        </div>
        <div className="mt-5 space-y-5">
          {picked && count(picked) === 0 && <p className="text-ink-500">{copy.none(picked)}</p>}
          {shown.map((s) => (
            <div key={s}>
              <h3 className="text-sm font-semibold text-ink-500">{copy.chip(s, count(s))}</h3>
              <ul className="mt-1 space-y-1">
                {(groups.bySido[s]?.items ?? []).map((a) => <li key={a.name}><AcademyName a={a} /></li>)}
              </ul>
            </div>
          ))}
        </div>
        <p className="mt-6 text-xs text-ink-500">{copy.credit}</p>
      </div>
    </div>
  )
}

function AcademyName({ a }: { a: MapAcademy }) {
  if (!a.website) return <span className="text-ink-700">{a.name}</span>
  return (
    <a href={a.website} target="_blank" rel="noopener noreferrer" className="font-semibold text-mint-700 underline-offset-2 hover:underline" title={copy.newWindow}>
      {a.name} <span aria-hidden="true">↗</span>
    </a>
  )
}
```

- [ ] **Step 5: 통과 확인**

Run: `npx vitest run tests/franchise-map-view.test.ts tests/site-content.test.ts`
Expected: PASS. `<path` 가 17개보다 많으면 독도 표식을 `<circle>` 로 둔 게 맞는지 확인(경로로 그리지 않는다).

- [ ] **Step 6: 커밋**

```bash
git add components/site/FranchiseMap.tsx content/site.ts tests/franchise-map-view.test.ts tests/site-content.test.ts
git commit -m "feat(site): 전국 가맹원 지도 칸 — 시·도 SVG(숫자·고르기)·칩·이름 목록(홈페이지는 새 창), 문구

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: 서버 칸 + 홈·가맹 안내 배치 + 브라우저 확인

**Files:**
- Create: `components/site/FranchiseMapSection.tsx`
- Modify: `app/(public)/page.tsx`(첫 화면 `</section>` 다음, PROGRAMS `Section` 앞), `app/(public)/franchise/page.tsx`(제목 칸 다음, 문의 폼 앞)

**Interfaces:**
- Consumes: `loadMapAcademies`·`groupBySido`(Task 4), `FranchiseMap`(Task 5), `createClient`(`@/lib/supabase/server`), `Section`(`@/components/site/Section`).
- Produces: `FranchiseMapSection()` 서버 컴포넌트 — 0곳이면 `null`.

- [ ] **Step 1: 서버 칸 쓰기**

`components/site/FranchiseMapSection.tsx`:
```tsx
import { createClient } from '@/lib/supabase/server'
import { loadMapAcademies } from '@/lib/academies/public-map'
import { groupBySido } from '@/lib/academies/map-group'
import { Section } from '@/components/site/Section'
import { FranchiseMap } from '@/components/site/FranchiseMap'
import { pages } from '@/content/site'

/** 홈·가맹 안내의 「전국 가맹원」 칸(설계 2026-10-25 §4.1). 가맹원이 0곳이거나 0021 전(함수 없음)이면 그리지 않는다. */
export async function FranchiseMapSection() {
  const supabase = await createClient()
  const groups = groupBySido(await loadMapAcademies(supabase))
  if (groups.total === 0) return null
  return (
    <Section eyebrow={pages.franchiseMap.eyebrow} title={pages.franchiseMap.title}>
      <FranchiseMap groups={groups} />
    </Section>
  )
}
```

- [ ] **Step 2: 배치**

`app/(public)/page.tsx`: `import { FranchiseMapSection } from '@/components/site/FranchiseMapSection'` 를 더하고, 첫 화면 `</section>` 바로 다음 줄에 `<FranchiseMapSection />`.

`app/(public)/franchise/page.tsx`: 같은 import, 제목 `</div>`(lavender 칸) 다음·`<Section title={f.formTitle}>` 앞에 `<FranchiseMapSection />`.

- [ ] **Step 3: 형 검사·전체 시험**

```bash
npx tsc --noEmit -p .
npm test
```
Expected: 오류 0, 전체 PASS.

- [ ] **Step 4: 브라우저 확인(로컬, 0021 전이므로 지도 칸은 안 보여야 함 — 깨지지 않는 것 확인)**

`preview_start {name: "dev"}` → `/` 와 `/franchise` 를 열어 콘솔 오류 없음, 페이지가 종전처럼 보임. 지도 모양은 Task 3 의 JSON 을 임시 fixture 로 넣어 본다: `FranchiseMapSection` 대신 시험 fixture 세 줄을 `FranchiseMap` 에 직접 넘기는 **임시 페이지는 만들지 않는다** — 대신 `tests/franchise-map-view.test.ts` 가 만든 HTML 을 스크래치 폴더에 `.html` 로 써서 아티팩트/브라우저로 모양을 본다:
```bash
npx tsx -e "import('react-dom/server').then(async r=>{const {createElement}=await import('react');const {FranchiseMap}=await import('./components/site/FranchiseMap');const {groupBySido}=await import('./lib/academies/map-group');const html=r.renderToStaticMarkup(createElement(FranchiseMap,{groups:groupBySido([{name:'하늘원',sido:'경기',website:'https://a.example.com/'},{name:'바다원',sido:'부산',website:''},{name:'한라원',sido:'제주',website:''},{name:'세종원',sido:'세종',website:''}])}));require('fs').writeFileSync(process.env.TMP+'/map-preview.html','<script src=\"https://cdn.tailwindcss.com\"></script><div style=\"max-width:960px;margin:40px auto\">'+html+'</div>')})"
```
(tailwind 색 이름 `mint-*`·`ink-*` 는 CDN 에 없으니 모양만 본다 — 회색으로 보여도 됨.) 숫자가 경계 밖에 찍히거나 경기 숫자가 서울 위에 겹치면 `scripts/build-korea-map.ts` 의 `LABEL_OFFSET` 에 그 시·도 보정값(px)을 넣고 Step 6(Task 3) 명령으로 JSON 을 다시 만든다 — 손으로 JSON 을 고치지 않는다.

- [ ] **Step 5: 커밋**

```bash
git add components/site/FranchiseMapSection.tsx "app/(public)/page.tsx" "app/(public)/franchise/page.tsx"
git commit -m "feat(site): 홈·가맹 안내에 「전국 가맹원」 지도 칸(0곳·0021 전이면 그리지 않음)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```
(`LABEL_OFFSET` 을 고쳤으면 `scripts/build-korea-map.ts data/map/korea-sido.json` 도 같이 add 하고 메시지에 적는다.)

---

### Task 7: 관리 화면 — 검증·새 가맹원 폼·지도 정보 폼·목록 열

**Files:**
- Modify: `lib/academies/validate.ts`
- Modify: `content/site.ts` — `app.adminAcademies`(columns·form.labels·errors·새 `map` 블록)
- Modify: `app/admin/academies/new/AcademyForm.tsx`
- Create: `app/admin/academies/[id]/MapInfoForm.tsx`
- Modify: `app/admin/academies/[id]/page.tsx`, `app/admin/academies/page.tsx`, `app/admin/academies/actions.ts`
- Test: `tests/academy-validate-map.test.ts`

**Interfaces:**
- Consumes: `isSido`·`SIDOS`(Task 1), `normalizeWebsite`(Task 1).
- Produces: `parseAcademy` 결과에 `sido: Sido | null`, `website: string`, `show_on_map: boolean`; `parseAcademyMap(formData): { ok: true; data: { sido: Sido | null; website: string; show_on_map: boolean } } | { ok: false; error: string }`; 서버 동작 `setAcademyMapInfo(academyId, prev, formData)`.

- [ ] **Step 1: 문구 추가**

`content/site.ts` `app.adminAcademies`:
- `columns`: `region: '지역'` → `region: '시/군/구'`, 그 앞에 `sido: '시·도'` 추가.
- `form.labels`: `region: '지역'` → `region: '시/군/구 (선택)'`, 뒤에 `sido: '시·도'`, `website: '홈페이지 주소 (선택)'`, `showOnMap: '홈페이지 지도에 표시'` 추가.
- `form` 에 `sidoNone: '선택 안 함'`, `websitePlaceholder: '예: www.example.com'` 추가.
- 새 블록(`plan:` 블록 다음):
```ts
    // 지도 정보(대표 2026-10-25): 시·도·홈페이지·지도 표시 — 홈페이지 「전국 가맹원」 지도가 읽는다.
    map: { heading: '지도 정보', submit: '저장', saved: '저장했습니다.', columnsMissing: '지도 칸이 아직 준비되지 않았습니다. 마이그레이션 0021 을 적용하면 열립니다.' },
```
- `errors` 에 `sidoInvalid: '시·도 값이 올바르지 않습니다.'`, `websiteInvalid: '홈페이지 주소를 확인하세요(예: www.example.com).'` 추가.

- [ ] **Step 2: 실패하는 시험 쓰기**

`tests/academy-validate-map.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { parseAcademy, parseAcademyMap } from '@/lib/academies/validate'
import { app } from '@/content/site'

// 설계 2026-10-25 §5
const errors = app.adminAcademies.errors
const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f }

describe('parseAcademy 의 지도 칸', () => {
  it('비어 있으면 sido null·website ""·show_on_map true', () => {
    const r = parseAcademy(fd({ code: 'abc', name: '원' }))
    expect(r.ok && r.data).toMatchObject({ sido: null, website: '', show_on_map: true })
  })
  it('시·도·홈페이지를 정리해 받고 체크를 끄면 false', () => {
    const r = parseAcademy(fd({ code: 'abc', name: '원', sido: '경기', website: 'www.example.com', show_on_map: '' }))
    expect(r.ok && r.data).toMatchObject({ sido: '경기', website: 'https://www.example.com/', show_on_map: false })
    const on = parseAcademy(fd({ code: 'abc', name: '원', show_on_map: 'on' }))
    expect(on.ok && on.data.show_on_map).toBe(true)
  })
  it('틀린 시·도·주소는 거절', () => {
    expect(parseAcademy(fd({ code: 'abc', name: '원', sido: '평양' }))).toEqual({ ok: false, error: errors.sidoInvalid })
    expect(parseAcademy(fd({ code: 'abc', name: '원', website: 'javascript:x' }))).toEqual({ ok: false, error: errors.websiteInvalid })
  })
})

describe('parseAcademyMap(상세 화면 지도 정보 폼)', () => {
  it('세 칸만 받는다', () => {
    const r = parseAcademyMap(fd({ sido: '서울', website: 'blog.naver.com/x', show_on_map: 'on', code: 'zzz' }))
    expect(r).toEqual({ ok: true, data: { sido: '서울', website: 'https://blog.naver.com/x', show_on_map: true } })
  })
  it('빈 시·도는 null, 체크 없으면 false', () => {
    expect(parseAcademyMap(fd({}))).toEqual({ ok: true, data: { sido: null, website: '', show_on_map: false } })
  })
  it('틀린 주소는 거절', () => {
    expect(parseAcademyMap(fd({ website: 'not a url' }))).toEqual({ ok: false, error: errors.websiteInvalid })
  })
})
```
주의: 새 가맹원 폼은 체크박스가 **기본 켬**이라 `show_on_map` 키가 없으면 true, 지도 정보 폼은 키가 없으면 false(폼에 항상 체크박스가 있다). 두 파서가 다른 까닭을 코드 주석에 적는다.

- [ ] **Step 3: 실패 확인**

Run: `npx vitest run tests/academy-validate-map.test.ts`
Expected: FAIL — `parseAcademyMap` 없음 / `sido` 없음

- [ ] **Step 4: 검증 구현**

`lib/academies/validate.ts` 를 이렇게 바꾼다(기존 `plan` 처리는 그대로):
```ts
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

/** defaultShow: 체크박스 키가 아예 없을 때의 값 — 새 가맹원 폼은 기본 켬(true), 지도 정보 폼은 체크박스가 항상 있으므로 없음 = 껐음(false). */
function parseMapFields(formData: FormData, defaultShow: boolean): { ok: true; data: MapInput } | { ok: false; error: string } {
  const sidoRaw = String(formData.get('sido') ?? '').trim()
  if (sidoRaw && !isSido(sidoRaw)) return { ok: false, error: errors.sidoInvalid }
  const website = normalizeWebsite(String(formData.get('website') ?? ''))
  if (website === null) return { ok: false, error: errors.websiteInvalid }
  const show = formData.has('show_on_map') ? formData.get('show_on_map') !== '' : defaultShow
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
```

- [ ] **Step 5: 통과 확인**

Run: `npx vitest run tests/academy-validate-map.test.ts tests/academy-plan.test.ts tests/academy-validate.test.ts`
Expected: PASS (옛 시험도 그대로)

- [ ] **Step 6: 서버 동작**

`app/admin/academies/actions.ts`:
- import 에 `parseAcademyMap` 추가, `import { isMissingColumn } from '@/lib/classroom/quiz-entry'` 추가.
- `createAcademy` 의 insert 오류 처리에 0021 전 안내: `if (error) return { error: error.code === '23505' ? copy.errors.codeTaken : isMissingColumn(error) ? copy.map.columnsMissing : error.message }`.
- 끝에 추가:
```ts
/** 지도 정보 바꾸기(대표 2026-10-25): 시·도·홈페이지·지도 표시. 본사만. 홈·가맹 안내의 지도가 다음 요청부터 바뀐다. */
export async function setAcademyMapInfo(
  academyId: string,
  _prev: { error?: string; saved?: boolean } | undefined,
  formData: FormData,
) {
  await assertAdmin()
  const r = parseAcademyMap(formData)
  if (!r.ok) return { error: r.error }
  const supabase = await createClient()
  const { error } = await supabase.from('academies').update(r.data).eq('id', academyId)
  if (error) return { error: isMissingColumn(error) ? copy.map.columnsMissing : error.message }
  revalidatePath(`/admin/academies/${academyId}`)
  revalidatePath('/admin/academies')
  revalidatePath('/')
  revalidatePath('/franchise')
  return { saved: true }
}
```

- [ ] **Step 7: 새 가맹원 폼에 칸 셋**

`app/admin/academies/new/AcademyForm.tsx`: `import { SIDOS } from '@/lib/academies/sido'` 추가. `region` 라벨 다음에:
```tsx
      <label className="grid gap-1 text-sm font-semibold">
        {copy.labels.sido}
        <select name="sido" defaultValue="" className={input}>
          <option value="">{copy.sidoNone}</option>
          {SIDOS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </label>
      <label className="grid gap-1 text-sm font-semibold">
        {copy.labels.website}
        <input name="website" placeholder={copy.websitePlaceholder} className={input} />
      </label>
      <label className="flex items-center gap-2 text-sm font-semibold">
        <input type="checkbox" name="show_on_map" defaultChecked />
        {copy.labels.showOnMap}
      </label>
```

- [ ] **Step 8: 상세 화면 지도 정보 폼**

`app/admin/academies/[id]/MapInfoForm.tsx`:
```tsx
'use client'
import { useActionState } from 'react'
import { setAcademyMapInfo } from '../actions'
import { Button } from '@/components/ui/Button'
import { SIDOS, type Sido } from '@/lib/academies/sido'
import { app } from '@/content/site'

const copy = app.adminAcademies
const input = 'rounded-xl border border-ink-300 px-3 py-2'

/** 지도 정보(대표 2026-10-25): 시·도·홈페이지·지도 표시. 체크박스는 항상 있으므로 키가 없으면 껐음이다(parseAcademyMap). */
export function MapInfoForm({ academyId, sido, website, showOnMap }: { academyId: string; sido: Sido | null; website: string; showOnMap: boolean }) {
  const [state, action, pending] = useActionState(setAcademyMapInfo.bind(null, academyId), undefined)
  return (
    <form action={action} className="mt-2 grid max-w-md gap-3 rounded-2xl bg-white p-4">
      <label className="grid gap-1 text-sm">
        {copy.form.labels.sido}
        <select name="sido" defaultValue={sido ?? ''} className={input}>
          <option value="">{copy.form.sidoNone}</option>
          {SIDOS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </label>
      <label className="grid gap-1 text-sm">
        {copy.form.labels.website}
        <input name="website" defaultValue={website} placeholder={copy.form.websitePlaceholder} className={input} />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="show_on_map" defaultChecked={showOnMap} />
        {copy.form.labels.showOnMap}
      </label>
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state?.saved && <p className="text-sm text-mint-700">{copy.map.saved}</p>}
      <Button type="submit" disabled={pending}>{copy.map.submit}</Button>
    </form>
  )
}
```

`app/admin/academies/[id]/page.tsx`: `import { MapInfoForm } from './MapInfoForm'`, `import { isSido } from '@/lib/academies/sido'`. 가맹 상품 폼(`PlanForm`) 다음에:
```tsx
      <h2 className="mt-8 text-lg font-bold">{copy.map.heading}</h2>
      <MapInfoForm academyId={id} sido={isSido(a.sido) ? a.sido : null} website={a.website ?? ''} showOnMap={a.show_on_map ?? true} />
```

- [ ] **Step 9: 목록에 시·도 열**

`app/admin/academies/page.tsx`: `<th>` 줄의 `columns.region` 앞에 `<th className="p-3">{copy.columns.sido}</th>`, `<td>` 줄의 `{a.region}` 앞에 `<td className="p-3">{a.sido ?? ''}</td>`.

- [ ] **Step 10: 형 검사·시험·브라우저**

```bash
npx tsc --noEmit -p .
npx vitest run tests/academy-validate-map.test.ts tests/site-content.test.ts tests/academy-plan.test.ts
```
Expected: 오류 0, PASS. 로컬 `/admin/academies/new`(관리자 로그인은 대표가 직접) 에서 시·도 드롭다운·홈페이지·체크가 보이는지 `read_page` 로 확인. 저장은 0021 전이라 "지도 칸이 아직 준비되지 않았습니다" 가 떠야 한다.

- [ ] **Step 11: 커밋**

```bash
git add lib/academies/validate.ts content/site.ts app/admin/academies/actions.ts app/admin/academies/new/AcademyForm.tsx "app/admin/academies/[id]/MapInfoForm.tsx" "app/admin/academies/[id]/page.tsx" app/admin/academies/page.tsx tests/academy-validate-map.test.ts
git commit -m "feat(admin): 가맹원 관리에 시·도·홈페이지·지도 표시 칸(새 가맹원 폼·상세 「지도 정보」·목록 열), 0021 전 안내

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: 처음 40곳 넣기 — CSV 읽기(순수) + 스크립트

**Files:**
- Create: `lib/academies/import-rows.ts`
- Create: `scripts/import-academies-map.ts`
- Test: `tests/academy-import-rows.test.ts`

**Interfaces:**
- Consumes: `toSido`(Task 1), `normalizeWebsite`(Task 1).
- Produces: `parseImportCsv(text: string): { rows: ImportRow[]; problems: string[] }`, `type ImportRow = { name: string; sido: Sido; website: string; region: string; code: string | null }`, `nextCodes(existing: string[], n: number): string[]`(`g001`부터 비어 있는 것).

- [ ] **Step 1: 실패하는 시험 쓰기**

`tests/academy-import-rows.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { parseImportCsv, nextCodes } from '@/lib/academies/import-rows'

// 설계 2026-10-25 §6 — 대표가 주는 표(CSV UTF-8, 머리 줄: 이름,시도,홈페이지[,시/군/구][,코드])
describe('parseImportCsv', () => {
  it('머리 줄 이름으로 열을 찾고 시·도 긴 이름·주소를 정리한다', () => {
    const { rows, problems } = parseImportCsv('이름,시도,홈페이지,시/군/구\n하늘원,경기도,www.a.com,성남\n바다원,부산광역시,,해운대')
    expect(problems).toEqual([])
    expect(rows).toEqual([
      { name: '하늘원', sido: '경기', website: 'https://www.a.com/', region: '성남', code: null },
      { name: '바다원', sido: '부산', website: '', region: '해운대', code: null },
    ])
  })
  it('코드 열이 있으면 소문자로 받는다', () => {
    const { rows } = parseImportCsv('이름,시도,홈페이지,코드\n하늘원,경기,,ABC1')
    expect(rows[0].code).toBe('abc1')
  })
  it('문제 줄은 번호와 까닭을 보고하고 그 줄만 뺀다', () => {
    const { rows, problems } = parseImportCsv('이름,시도,홈페이지\n하늘원,평양,\n,경기,\n바다원,부산,javascript:x\n한라원,제주,')
    expect(rows.map((r) => r.name)).toEqual(['한라원'])
    expect(problems).toEqual(['2행: 시·도를 모름 "평양"', '3행: 이름이 비었음', '4행: 홈페이지 주소가 틀림 "javascript:x"'])
  })
  it('따옴표 안의 쉼표·BOM 을 처리한다', () => {
    const { rows } = parseImportCsv('﻿이름,시도,홈페이지\n"하늘, 원",서울,')
    expect(rows[0].name).toBe('하늘, 원')
  })
  it('필수 열이 없으면 problems 하나', () => {
    expect(parseImportCsv('name,sido\nx,y').problems).toEqual(['머리 줄에 이름·시도 열이 없음'])
  })
})

describe('nextCodes', () => {
  it('g001 부터 비어 있는 번호', () => {
    expect(nextCodes(['dgs', 'g001', 'g003'], 3)).toEqual(['g002', 'g004', 'g005'])
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run tests/academy-import-rows.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현**

`lib/academies/import-rows.ts`:
```ts
import { toSido, type Sido } from './sido'
import { normalizeWebsite } from './website'

/** 대표가 주는 표 한 줄(설계 2026-10-25 §6). code 가 null 이면 스크립트가 g001 부터 붙인다. */
export type ImportRow = { name: string; sido: Sido; website: string; region: string; code: string | null }

/** 쉼표 CSV 한 줄 → 칸들(큰따옴표 안의 쉼표·겹따옴표 처리). */
function splitCsvLine(line: string): string[] {
  const out: string[] = []; let cur = ''; let q = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (q) { if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++ } else q = false } else cur += c }
    else if (c === '"') q = true
    else if (c === ',') { out.push(cur); cur = '' }
    else cur += c
  }
  out.push(cur); return out.map((s) => s.trim())
}

const HEAD = { name: ['이름', '원 이름', '가맹원', '학원명', 'name'], sido: ['시도', '시·도', '시/도', 'sido'], website: ['홈페이지', '홈페이지 주소', 'url', 'website'], region: ['시/군/구', '시군구', '지역', 'region'], code: ['코드', '원 코드', 'code'] }

/** CSV 글자 → 줄들 + 문제 목록(줄 번호는 1부터, 머리 줄이 1행). 문제 줄은 뺀다 — 지어내지 않는다. */
export function parseImportCsv(text: string): { rows: ImportRow[]; problems: string[] } {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim() !== '')
  if (lines.length === 0) return { rows: [], problems: ['비어 있음'] }
  const head = splitCsvLine(lines[0]).map((h) => h.toLowerCase())
  const col = (keys: string[]) => head.findIndex((h) => keys.map((k) => k.toLowerCase()).includes(h))
  const ix = { name: col(HEAD.name), sido: col(HEAD.sido), website: col(HEAD.website), region: col(HEAD.region), code: col(HEAD.code) }
  if (ix.name < 0 || ix.sido < 0) return { rows: [], problems: ['머리 줄에 이름·시도 열이 없음'] }
  const rows: ImportRow[] = []; const problems: string[] = []
  lines.slice(1).forEach((line, i) => {
    const n = i + 2; const c = splitCsvLine(line); const get = (k: number) => (k >= 0 ? c[k] ?? '' : '')
    const name = get(ix.name)
    if (!name) { problems.push(`${n}행: 이름이 비었음`); return }
    const sido = toSido(get(ix.sido))
    if (!sido) { problems.push(`${n}행: 시·도를 모름 "${get(ix.sido)}"`); return }
    const website = normalizeWebsite(get(ix.website))
    if (website === null) { problems.push(`${n}행: 홈페이지 주소가 틀림 "${get(ix.website)}"`); return }
    const codeRaw = get(ix.code).toLowerCase()
    if (codeRaw && !/^[a-z0-9]{3,12}$/.test(codeRaw)) { problems.push(`${n}행: 코드가 틀림 "${codeRaw}"(영문 소문자·숫자 3~12자)`); return }
    rows.push({ name, sido, website, region: get(ix.region), code: codeRaw || null })
  })
  return { rows, problems }
}

/** g001 부터 쓰지 않은 코드 n 개. */
export function nextCodes(existing: string[], n: number): string[] {
  const used = new Set(existing); const out: string[] = []
  for (let i = 1; out.length < n; i++) { const c = `g${String(i).padStart(3, '0')}`; if (!used.has(c)) out.push(c) }
  return out
}
```

`scripts/import-academies-map.ts`:
```ts
/**
 * 처음 40곳 등록(대표 2026-10-25, 설계 §6).
 *   npx tsx scripts/import-academies-map.ts <표.csv> [--apply]
 * 기본은 미리 보기(무엇을 넣고 고칠지 표로만). --apply 를 붙여야 쓴다. CSV 는 UTF-8(엑셀: "CSV UTF-8" 로 저장), 머리 줄 이름,시도,홈페이지[,시/군/구][,코드].
 * 이름이 같은 원이 이미 있으면 sido·website·region 만 채운다(코드·계정·plan 은 그대로). 없으면 새 줄(코드는 표의 것, 없으면 g001 부터). 계정은 만들지 않는다.
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
    const fields = { sido: p.r.sido, website: p.r.website, region: p.r.region, show_on_map: true }
    const q = p.kind === '갱신'
      ? admin.from('academies').update(fields).eq('id', p.id!)
      : admin.from('academies').insert({ code: p.code, name: p.r.name, ...fields })
    const { error: e } = await q
    console.log(e ? `실패 · ${p.r.name}: ${e.message}` : `됨 · ${p.kind} · ${p.r.name}`)
  }
}
main().catch((e) => { console.error(e); process.exit(1) })
```

- [ ] **Step 4: 통과 확인·미리 보기 실행**

```bash
npx vitest run tests/academy-import-rows.test.ts
printf '이름,시도,홈페이지\n시험원,경기,www.example.com\n' > "$TMP/sample.csv"
npx tsx scripts/import-academies-map.ts "$TMP/sample.csv"
```
Expected: PASS; 미리 보기 두 줄("새로 · 시험원 · 경기 · g001 · https://www.example.com/", "미리 보기만 했습니다 …") — `--apply` 없이 DB 는 바뀌지 않는다. 0021 전이면 `--apply` 는 "실패 · … column sido" 가 나므로 적용 뒤에만 쓴다.

- [ ] **Step 5: 커밋**

```bash
git add lib/academies/import-rows.ts scripts/import-academies-map.ts tests/academy-import-rows.test.ts
git commit -m "feat(academies): 처음 40곳 등록 스크립트 — CSV(이름·시도·홈페이지) 읽기, 기본 미리 보기, --apply 로 upsert(계정 없음)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: 문서 — STATUS.md·순서서, 전체 시험

**Files:**
- Modify: `docs/STATUS.md`(맨 위 "갱신" 줄과 「대표님이 결정한 것」 절에 2026-10-25 줄), `docs/runbooks/2026-09-29-five-subjects.md`(A절에 1-6 「마이그레이션 0021 → git push → 표 넣기」)

- [ ] **Step 1: STATUS.md 에 줄 추가**

「대표님이 결정한 것」 절 맨 위에:
```
- 2026-10-25 대표: **전국 가맹원 지도**(설계 `docs/superpowers/specs/2026-10-25-franchise-map-design.md`) — 홈 첫 화면 아래·가맹 안내 위에 시·도 경계 지도(Natural Earth 공개 도메인 → `data/map/korea-sido.json`, `scripts/build-korea-map.ts`) + 시·도 칩·이름 목록(홈페이지 있는 원만 새 창). 자료는 `academies.sido·website·show_on_map`(**마이그레이션 0021 파일만 — 대표 적용 대기**), 비로그인은 함수 `public_map_academies()`(이름·시도·홈페이지만)로 읽고 RLS 는 그대로. 0021 전에는 지도 칸을 그리지 않는다. 가맹원 관리에 시·도 드롭다운·홈페이지·「지도에 표시」(새 가맹원 폼·상세 「지도 정보」·목록 열). 처음 40곳은 `scripts/import-academies-map.ts <표.csv> --apply`(기본 미리 보기, 이름 같으면 갱신, 코드 없으면 g001부터, 계정 없음). 머리말 메뉴·수업 이름 「탐구보고서」→「RED」, 메뉴 글자 16px(같은 날). 시험 `tests/academy-{sido,website,validate-map,map-group,map-migration,import-rows}.test.ts`·`korea-map-data.test.ts`·`franchise-map-view.test.ts`. **확인하지 못한 것**: 호스팅 DB 에서 anon 의 rpc(0021 뒤 비로그인 창으로), 실제 40곳이 들어간 지도 모양(숫자 자리 보정 `LABEL_OFFSET`).
```
맨 위 "갱신:" 줄 앞머리를 `갱신: 2026-10-25 (전국 가맹원 지도 — **마이그레이션 0021 적용 대기**, 처음 40곳 표 대기) — 이전: ` 로 바꾼다.

- [ ] **Step 2: 순서서 A절에 1-6**

`docs/runbooks/2026-09-29-five-subjects.md` 의 `### 1-5.` 절 다음에:
```
### 1-6. 전국 가맹원 지도: 마이그레이션 0021 → `git push` → 표 넣기 (2026-10-25)
1. `supabase db push`(0021 `academy_map`: academies 칸 셋 + 함수 `public_map_academies`).
2. `git push` → 배포 뒤 비로그인 창으로 홈을 연다 — 가맹원이 0곳이면 아직 지도 칸이 없다(정상).
3. 표(이름·시도·홈페이지[,시/군/구][,코드], CSV UTF-8) → `npx tsx scripts/import-academies-map.ts 표.csv`(미리 보기) → 문제 줄 고침 → `--apply`.
4. 홈·가맹 안내에서 지도·숫자·이름 링크 확인. 기존 001(대구)은 가맹원 관리 → 상세 → 「지도 정보」에서 시·도만 고른다.
```

- [ ] **Step 3: 전체 시험·형 검사**

```bash
npm test
npx tsc --noEmit -p .
```
Expected: 전체 PASS, 오류 0.

- [ ] **Step 4: 커밋**

```bash
git add docs/STATUS.md docs/runbooks/2026-09-29-five-subjects.md
git commit -m "docs: 전국 가맹원 지도 — STATUS·순서서 1-6(0021 적용 → 푸시 → 표 넣기)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## 자기 점검(작성자)

- 스펙 §2.1·§2.2·§2.3 → Task 2·4·7(0021 전 안내). §3 → Task 3(+ Task 6 Step 4 의 보정). §4.1~4.3 → Task 5·6. §5 → Task 7. §6 → Task 8. §7 시험 → 각 태스크. §8 → Task 9 STATUS "확인하지 못한 것".
- 이름 일치: `SIDOS`·`Sido`·`isSido`·`toSido`(T1) ↔ T2 시험·T3 스크립트·T4·T5·T7·T8; `normalizeWebsite`(T1) ↔ T7·T8; `MapAcademy`·`MapGroups`·`groupBySido`(T4) ↔ T5·T6; `loadMapAcademies`(T4) ↔ T6; `parseAcademyMap`(T7) ↔ actions; `KOREA_MAP`(T3) ↔ T5.
- 스펙과 다른 점 하나: viewBox 높이는 스크립트가 비율대로 계산한다(스펙의 "600 760" 은 예시 — 시험은 `0 0 600 \d+`).
