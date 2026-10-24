-- RED 이용 권한 분리(본사 PRD 2026-10-20 개발/prd-red-plan.md): 가맹 상품(plan) — 'davinci' 다빈치스쿨 가맹 / 'essay_only' 서논술 전용.
-- 파일만 만든다 — 적용(supabase db push 또는 SQL Editor)은 본사. 다시 실행해도 안전하다("있으면 건너뜀").
-- 기존 원은 전원 essay_only 로 시작한다(2026-10-20 현재 다빈치스쿨 가맹 확정 원이 없다 — 설명회 10/21, 결정은 약 일주일 뒤).

alter table academies add column if not exists plan text not null default 'essay_only' check (plan in ('davinci', 'essay_only'));
alter table academies add column if not exists plan_changed_at timestamptz;
alter table academies add column if not exists plan_changed_by uuid;
alter table academies add column if not exists plan_note text not null default '';

comment on column academies.plan is '가맹 상품: davinci 다빈치스쿨 가맹(RED 자료실 열림) / essay_only 서논술 전용(RED 는 소개까지만). 본사만 바꾼다.';

-- 로그인한 원장의 원 plan (RLS 에서 쓴다). 관리자·학생·비로그인은 null.
create or replace function public.current_academy_plan() returns text
language sql stable security definer set search_path = public as
$$ select a.plan from profiles p join academies a on a.id = p.academy_id where p.id = auth.uid() $$;

-- 원장이 RED 자료(게시된 줄)를 읽는 정책: 다빈치스쿨 가맹 원만. 서논술 전용 원장은 0건(파일 이름도 PostgREST 로 보이지 않는다).
drop policy if exists teacher_read_resources on resources;
create policy teacher_read_resources on resources for select
  using (current_user_role() = 'teacher' and status = 'published' and current_academy_plan() = 'davinci');

-- RED 소개용 건수(갈래·수준별 게시 건수와 최근 게시일). 서논술 전용 원장·비로그인에게도 건수와 날짜만 보여 준다 — 제목은 나가지 않는다.
create or replace function public.red_published_stats()
returns table (red_type text, category text, n bigint, latest timestamptz)
language sql stable security definer set search_path = public as
$$ select red_type, category, count(*)::bigint, max(published_at) from resources
   where status = 'published' and category is not null group by red_type, category $$;
grant execute on function public.red_published_stats() to anon, authenticated;
