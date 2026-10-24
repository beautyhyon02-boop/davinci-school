# 전국 가맹원 지도 설계

- 결정일: 2026-10-25 (대표)
- 결정: 자료는 「가맹원 관리」 한 곳(3안) · 지도는 시·도 경계 + 목록(1안, 핀 없음) · 처음 40곳은 대표가 주는 표로 한 번에 등록
- 범위 밖: 핀(주소 → 좌표), 시/군/구 단위 지도, 검색, 가맹원 사진·소개

## 1. 목적

홈페이지를 보는 학부모·예비 가맹주에게 "다빈치스쿨이 전국 어디에 몇 곳 있는지"를 한눈에 보이고, 가맹원 이름을 누르면 그 학원 홈페이지로 바로 가게 한다. 주소·연락처는 공개하지 않는다.

## 2. 자료

### 2.1 `academies` 칸 셋 추가 — 마이그레이션 0021 (`20261025000021_academy_map.sql`, 파일만; 적용은 대표 `supabase db push`)

| 칸 | 형 | 뜻 |
|---|---|---|
| `sido` | text, null 허용, check 17개 값 | 시·도. 값은 짧은 이름 글자 그대로: 서울·부산·대구·인천·광주·대전·울산·세종·경기·강원·충북·충남·전북·전남·경북·경남·제주 |
| `website` | text not null default '' | 홈페이지 주소(정리된 `https://…`). 빈칸이면 지도에서 이름만 보이고 링크가 없다 |
| `show_on_map` | boolean not null default true | 지도에 보일지. 꺼진 원·`active = false`인 원은 지도에 나오지 않는다 |

기존 `region`(자유 글)은 그대로 두고 화면 이름만 「시/군/구」로 바꾼다. 0020(가맹 상품)과 독립이라 어느 쪽이 먼저 적용돼도 된다. 다시 실행해도 안전하게 `add column if not exists`.

### 2.2 공개 읽기 — RLS 는 바꾸지 않는다

비로그인(anon)에게 `academies` 표를 열지 않는다. 대신 security definer 함수 하나만 연다:

```sql
create or replace function public.public_map_academies()
returns table (name text, sido text, website text)
language sql stable security definer set search_path = public as
$$ select name, sido, website from academies
   where active and show_on_map and sido is not null order by sido, name $$;
grant execute on function public.public_map_academies() to anon, authenticated;
```

나가는 것은 **이름·시도·홈페이지** 세 칸뿐 — 코드·연락처·학생 수·가맹 상품은 나가지 않는다(시험이 함수 정의 글자를 대조한다).

### 2.3 0021 전에 코드가 배포돼도 화면은 깨지지 않는다

함수가 없으면(PostgREST `PGRST202`) 지도 칸을 그리지 않고 홈·가맹 안내는 종전 그대로. 관리자 화면의 새 칸은 열이 없을 때 저장 실패 문구만 보인다(`isMissingColumn`, 42703).

## 3. 지도 그림 (`data/map/korea-sido.json`)

- 출처: **Natural Earth 1:10m Admin 1 – States, Provinces**(공개 도메인, naturalearthdata.com). 대한민국 17개 시·도 polygon 을 한 번 변환해 SVG 경로 글자로 저장한다. 손으로 그리지 않는다.
- 변환 스크립트 `scripts/build-korea-map.ts`: GeoJSON(내려받은 파일 경로를 인자로) → 메르카토르 비슷한 단순 투영(위도·경도 → 너비 600 고정, 높이는 비율대로(viewBox `0 0 600 H`)) → 좌표를 소수 1자리로 → 작은 섬(면적 하한)을 쳐 내 글자 수를 줄임(목표 200KB 이하) → `{ viewBox, sidos: [{ code, name, d, label: [x, y] }] }`. Natural Earth 의 이름(영문 `name`/`name_ko`)을 17개 짧은 이름으로 맞추는 대응표는 스크립트 안에 둔다. 대응이 안 되는 polygon 이 있으면 스크립트가 멈춘다(지어내지 않음).
- 숫자(가맹원 수)를 찍는 자리 `label` 은 polygon 중심(centroid)이고, 세종·인천·울산·부산처럼 작거나 치우친 곳은 스크립트 안의 보정표로 옮긴다(글자가 경계 밖으로 나가지 않게).
- 생성된 JSON 은 커밋한다(배포가 원본 파일에 기대지 않게). 페이지 아래 작은 글자로 "지도: Natural Earth".
- 시험: 17개 모두 있고 코드가 겹치지 않고 `d` 가 비어 있지 않다; viewBox 는 `0 0 600 <높이>`; 200KB 아래.

## 4. 화면

### 4.1 어디에

- 홈(`/`): 첫 화면(숫자 칸) 바로 아래, 「네 가지 수업」 위에 새 `Section`.
- 가맹 안내(`/franchise`): 제목 칸 아래, 문의 폼 위.
- 두 곳 모두 같은 서버 칸 `components/site/FranchiseMapSection.tsx`(자료 읽기) → 클라이언트 칸 `components/site/FranchiseMap.tsx`(그리기·누르기).

### 4.2 모습

- 왼쪽 지도(SVG, `viewBox` 로 너비에 맞춰 줄어듦): 가맹원 있는 시·도는 `mint-200` 채움 + 가운데 숫자(굵게, `mint-700`), 없는 곳은 `ink-100` 채움·`ink-300` 선. 손을 올리거나 고르면 `mint-300`. 고른 시·도는 선이 진해진다.
- 오른쪽(모바일 `md` 아래에서는 지도 아래) 목록:
  - 머리: "전국 가맹원 N곳" (N = 지도에 보이는 원 수).
  - 시·도 칩 한 줄(여러 줄로 접힘): 가맹원이 있는 시·도만 "서울 3" 꼴, 누르면 그 시·도를 고름(지도와 같은 상태). 「전체」 칩으로 되돌림. 칩은 `<button>` 이라 키보드로도 된다.
  - 고른 시·도의 가맹원 이름을 **한 줄에 하나씩** 이름 순. 홈페이지가 있으면 이름이 링크(`target=_blank rel=noopener noreferrer`, 끝에 ↗), 없으면 글자만.
  - 고르지 않았을 때(전체): 시·도마다 작은 제목 아래 이름 줄(같은 꼴). 40곳이면 한 화면에 들어간다.
- SVG 안의 시·도 `<path>` 도 누를 수 있다(`role="button"`, `aria-label="서울 3곳"`, `tabIndex=0`, Enter/Space). 가맹원 없는 시·도를 누르면 목록에 "아직 가맹원이 없습니다" 한 줄.
- 가맹원이 0곳이면(함수는 있는데 비었을 때) 칸 전체를 그리지 않는다.
- 문구는 모두 `content/site.ts` `pages.franchiseMap`: 제목·눈썹·"전국 가맹원 N곳"·전체 칩·"아직 가맹원이 없습니다"·"지도: Natural Earth"·링크 새 창 안내.

### 4.3 자료 흐름

`FranchiseMapSection`(서버) → `supabase.rpc('public_map_academies')`(anon 클라이언트, `lib/academies/public-map.ts` `loadMapAcademies` — 함수 없음·오류는 `[]` 로) → 순수 함수 `groupBySido(rows)`(`lib/academies/map-group.ts`: 시·도별 수·이름 순 목록·전체 수) → `FranchiseMap`(클라이언트, `useState<sido | null>`). AI 호출 없음. 공개 페이지는 이미 요청마다 그려진다(머리말이 세션을 읽음).

## 5. 관리 화면 (`/admin/academies`)

- 새 가맹원 폼·상세 화면에 칸 셋: 시·도 `<select>`(17 + "선택 안 함"), 홈페이지 주소 `<input>`, 「홈페이지 지도에 표시」 체크(기본 켬). 상세 화면에는 「지도 정보」 작은 폼(PlanForm 과 같은 꼴)으로 저장.
- 검증(`lib/academies/validate.ts`): `sido` 는 17개 값 또는 빈칸; `website` 는 비었거나 `normalizeWebsite` 를 거친 `http(s)://` 주소 — 앞뒤 공백 제거, `://` 가 없으면 `https://` 를 붙임, `new URL` 로 확인, 호스트에 점이 있어야 함, `javascript:` 같은 것은 거절. 틀리면 `app.adminAcademies.errors.websiteInvalid`.
- 목록 표: 「시·도」 열 추가, 「지역」 열 이름을 「시/군/구」로. 홈페이지는 목록에 넣지 않는다(상세에서).
- 문구 키: `app.adminAcademies.form.labels.{sido, website, showOnMap}`, `sidoNone`, `map.heading`, `map.saved`, `errors.websiteInvalid`, `errors.sidoInvalid`.

## 6. 처음 40곳 넣기 (`scripts/import-academies-map.ts`)

- 입력: 대표가 주는 표(xlsx 또는 csv). 열: **이름 · 시도 · 홈페이지**(필수는 이름·시도), 선택 **시/군/구 · 코드**. 시도는 긴 이름(서울특별시·경기도·전라북도·전북특별자치도 …)도 짧은 이름으로 맞춘다(대응표, 못 맞추면 그 줄을 보고하고 멈춤).
- 동작: service role 로 `academies` upsert — 이름이 같은 원이 이미 있으면 `sido`·`website`·`region` 만 채우고(계정·코드·plan 은 건드리지 않음), 없으면 새 줄(코드는 표에 있으면 그것, 없으면 `g001`부터 비어 있는 번호; `plan` 은 기본값 그대로 — 가맹 상품은 대표가 관리 화면에서). 계정은 만들지 않는다.
- `--dry-run` 이 기본: 무엇을 넣고 무엇을 고칠지 표로 보여 주고, `--apply` 를 붙여야 쓴다. 결과를 한 줄씩 출력(이름 · 시도 · 코드 · 새로/갱신).
- 기존 001(대구)은 표에 있으면 갱신으로 `sido` 가 채워지고, 없으면 대표가 관리 화면에서 시·도만 고른다.

## 7. 시험

- `tests/academy-website.test.ts`: `normalizeWebsite`(공백·스킴 없음·대문자·`javascript:`·점 없는 호스트), `parseAcademy` 에 `sido`·`website`·`show_on_map`.
- `tests/academy-map-group.test.ts`: `groupBySido` — 수·이름 순·빈 시도·전체 수; 긴 시·도 이름 대응표(`toSidoCode`).
- `tests/korea-map-data.test.ts`: JSON 17개·고유 코드·`d` 비지 않음·`label` 두 수·viewBox.
- `tests/franchise-map-view.test.ts`: `renderToStaticMarkup` — 가맹원 있는 시·도 숫자, 링크에 `target=_blank rel=noopener noreferrer`, 홈페이지 없는 원은 링크 없음, 연락처·코드 글자가 HTML 에 없음, 0곳이면 비어 있음.
- `tests/site-content.test.ts`: 새 문구 키.
- 마이그레이션 글자 시험(`tests/academy-map-migration.test.ts`): 함수가 `name, sido, website` 만 돌려주고 `grant execute … to anon` 이 있다.
- 실제 브라우저: 로컬에서 홈·가맹 안내, 390px 과 1024px, 시·도 누르기·칩 누르기·새 창 링크.

## 8. 확인하지 못하는 것

- 호스팅 DB 에서 anon 의 `rpc` 호출(0021 적용 뒤 대표가 비로그인 창으로 확인).
- Natural Earth 경계의 정밀도 — 시·도 단위 색칠에는 충분하지만 해안선은 단순하다. 더 정밀한 지도가 필요하면 자료만 바꾸면 된다(스크립트 그대로).
