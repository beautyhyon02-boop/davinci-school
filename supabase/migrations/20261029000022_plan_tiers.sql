-- 가맹 상품 두 단계(대표 2026-10-29, docs/superpowers/specs/2026-10-29-plan-tiers-password-design.md §1.2):
--   davinci 다빈치올(RED 자료실 + 서논술 수업) / davinci_basic 다빈치 베이직(RED 자료실만).
-- 파일만 만든다 — 적용(supabase db push 또는 SQL Editor)은 본사. 0020 뒤에 실행된다. 다시 실행해도 안전하다(update 는 0건, drop/add 는 멱등).

update academies set plan = 'davinci' where plan = 'essay_only';          -- 기존 원(001 등)은 다빈치올로
-- plan 을 다루는 옛 check 제약은 이름과 관계없이 모두 없앤다(0020 의 자동 이름 포함). 아래에서 하나만 다시 단다.
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'academies'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%plan%'
  loop
    execute format('alter table academies drop constraint %I', c.conname);
  end loop;
end $$;
alter table academies add constraint academies_plan_check check (plan in ('davinci', 'davinci_basic'));
alter table academies alter column plan set default 'davinci_basic';
comment on column academies.plan is '가맹 상품: davinci 다빈치올(RED·서논술) / davinci_basic 다빈치 베이직(RED 만). 본사만 바꾼다.';

-- 원장이 RED 자료(게시된 줄)를 읽는 정책: 두 상품 모두.
drop policy if exists teacher_read_resources on resources;
create policy teacher_read_resources on resources for select
  using (current_user_role() = 'teacher' and status = 'published' and current_academy_plan() in ('davinci', 'davinci_basic'));
