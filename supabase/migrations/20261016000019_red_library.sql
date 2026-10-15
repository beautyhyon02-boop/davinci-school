-- RED 자료실(본사 PRD 2026-10-16): 종류 R/E/D, 검수 상태(검수대기→게시/보류), 요약·참고 링크, 올린 사람. 0018 의 hidden 을 status 로 바꾼다.
-- 파일만 만든다 — 적용(supabase db push)은 본사. 다시 실행해도 안전하다("있으면 건너뜀").
-- 원장 읽기 정책은 status = 'published' 로(검수대기·보류 줄의 파일 이름이 PostgREST 로 보이지 않게). 학생 정책은 없다(안 보임).

alter table resources add column if not exists red_type text not null default 'E' check (red_type in ('R', 'E', 'D'));
alter table resources add column if not exists status text not null default 'pending' check (status in ('pending', 'published', 'hold'));
alter table resources add column if not exists hold_note text not null default '';
alter table resources add column if not exists published_at timestamptz;
alter table resources add column if not exists summary text not null default '';
alter table resources add column if not exists source_links jsonb not null default '[]'::jsonb;
alter table resources add column if not exists created_by text not null default 'admin';

-- 0018 때 올린 줄: 보이던 것은 게시됨, 숨긴 것은 보류. (hidden 열이 아직 있을 때만 — 두 번째 실행에서는 열이 없어 건너뛴다)
do $$
begin
  if exists (select 1 from information_schema.columns where table_name = 'resources' and column_name = 'hidden') then
    update resources set status = case when hidden then 'hold' else 'published' end,
      published_at = case when hidden then null else coalesce(published_at, uploaded_at) end
      where category is not null;
    drop policy if exists teacher_read_resources on resources;
    alter table resources drop column hidden;
  end if;
end $$;

drop policy if exists teacher_read_resources on resources;
create policy teacher_read_resources on resources for select using (current_user_role() = 'teacher' and status = 'published');

create index if not exists resources_red_status_idx on resources(status, category, red_type, report_date desc);

comment on column resources.red_type is 'RED 종류: R 독서연계보고서 / E 소논문 / D 디베이트. 새 파일 이름 틀 "RED E Advanced_…"의 글자에서, 옛 틀은 E.';
comment on column resources.status is '검수 상태: pending 검수대기(올리면 기본) / published 게시(원장에게 보임) / hold 보류(hold_note 에 사유).';
comment on column resources.created_by is '올린 사람의 profile id, 또는 ''auto''(생성기 intake API).';
