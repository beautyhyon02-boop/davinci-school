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
